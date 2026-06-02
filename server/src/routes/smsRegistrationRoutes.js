import express from "express";
import asyncHandler from "express-async-handler";
import twilio from "twilio";
import { prisma } from "../prisma/client.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set.");
  return twilio(sid, token);
}

// Twilio's known A2P 10DLC policy SID — fetched dynamically as fallback
async function getA2pPolicySid(client) {
  try {
    const policies = await client.trusthub.v1.policies.list({ limit: 20 });
    const a2p = policies.find(
      (p) => p.friendlyName?.toLowerCase().includes("a2p") || p.friendlyName?.toLowerCase().includes("messaging")
    );
    if (a2p) return a2p.sid;
  } catch {}
  return "RN806dd6cd175f314e1f96a9727ee271f4"; // fallback known SID
}

// GET /api/sms-registration — current status and saved form data
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({ where: { id: req.business.id } });
    res.json({
      smsStatus: business.smsStatus || "not_started",
      twilioMsgServiceSid: business.twilioMsgServiceSid,
      twilioBrandSid: business.twilioBrandSid,
      twilioCampaignSid: business.twilioCampaignSid,
      smsFormData: business.smsFormData || null
    });
  })
);

// POST /api/sms-registration/submit — submit full A2P 10DLC registration to Twilio
router.post(
  "/submit",
  asyncHandler(async (req, res) => {
    const {
      businessLegalName, businessType, ein, businessAddress, businessCity,
      businessState, businessZip, businessWebsite, businessIndustry,
      contactFirstName, contactLastName, contactEmail, contactPhone,
      useCase, campaignDescription,
      sampleMessage1, sampleMessage2, sampleMessage3, sampleMessage4, sampleMessage5,
      optInDescription
    } = req.body;

    // Save form data regardless of API success
    await prisma.business.update({
      where: { id: req.business.id },
      data: { smsFormData: req.body, smsStatus: "submitting" }
    });

    const client = getClient();
    const baseUrl = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
    const business = await prisma.business.findUnique({ where: { id: req.business.id } });

    const steps = [];

    try {
      // Step 1: Create Messaging Service
      steps.push("Creating messaging service…");
      const service = await client.messaging.v1.services.create({
        friendlyName: `${businessLegalName} – LeadRescue`,
        inboundRequestUrl: baseUrl ? `${baseUrl}/webhooks/twilio/sms` : undefined,
        fallbackUrl: baseUrl ? `${baseUrl}/webhooks/twilio/sms` : undefined,
        useInboundWebhookOnNumber: false
      });

      await prisma.business.update({
        where: { id: req.business.id },
        data: { twilioMsgServiceSid: service.sid }
      });

      // Step 2: Add business phone number to messaging service (if one is set)
      if (business.twilioPhoneNumber) {
        try {
          const [phoneRecord] = await client.incomingPhoneNumbers.list({
            phoneNumber: business.twilioPhoneNumber,
            limit: 1
          });
          if (phoneRecord) {
            await client.messaging.v1.services(service.sid).phoneNumbers.create({
              phoneNumberSid: phoneRecord.sid
            });
            steps.push(`Added ${business.twilioPhoneNumber} to messaging service.`);
          }
        } catch (e) {
          steps.push(`Warning: could not add number to messaging service — ${e.message}`);
        }
      }

      // Step 3: Create End-User (business entity in Trust Hub)
      steps.push("Registering business entity…");
      const endUser = await client.trusthub.v1.endUsers.create({
        friendlyName: businessLegalName,
        type: "business",
        attributes: {
          business_name: businessLegalName,
          business_registration_identifier: ein ? "EIN" : "NONE",
          business_identity: "direct_customer",
          business_type: businessType,
          business_industry: businessIndustry,
          business_registration_number: ein || "",
          website_url: businessWebsite,
          social_media_profile_urls: businessWebsite,
          business_regions_of_operation: "USA_AND_CANADA",
          street: businessAddress,
          city: businessCity,
          state_province_region: businessState,
          postal_code: businessZip,
          country: "US"
        }
      });

      // Step 4: Create Customer Profile
      steps.push("Creating compliance profile…");
      const policySid = await getA2pPolicySid(client);
      const customerProfile = await client.trusthub.v1.customerProfiles.create({
        friendlyName: businessLegalName,
        email: contactEmail,
        policySid
      });

      // Step 5: Assign end user to profile
      await client.trusthub.v1
        .customerProfiles(customerProfile.sid)
        .customerProfilesEntityAssignments.create({ objectSid: endUser.sid });

      // Step 6: Submit profile for review
      steps.push("Submitting profile for carrier review…");
      await client.trusthub.v1.customerProfiles(customerProfile.sid).update({
        status: "pending-review"
      });

      // Step 7: Create Brand Registration
      steps.push("Registering brand with carriers…");
      const brand = await client.messaging.v1.a2pBrandRegistrations.create({
        customerProfileBundleSid: customerProfile.sid
      });

      await prisma.business.update({
        where: { id: req.business.id },
        data: { twilioBrandSid: brand.sid }
      });

      // Step 8: Create US A2P Campaign
      steps.push("Registering messaging campaign…");
      const campaign = await client.messaging.v1
        .services(service.sid)
        .usAppToPerson.create({
          brandRegistrationSid: brand.sid,
          description: campaignDescription,
          messageFlow: optInDescription,
          messageSamples: [sampleMessage1, sampleMessage2, sampleMessage3, sampleMessage4, sampleMessage5].filter(Boolean),
          usAppToPersonUsecase: useCase,
          hasEmbeddedLinks: false,
          hasEmbeddedPhone: true,
          subscriberOptIn: true,
          subscriberOptOut: true,
          subscriberHelp: true,
          numberPool: false,
          ageGated: false,
          directLending: false,
          embeddedLink: false,
          embeddedPhone: true
        });

      await prisma.business.update({
        where: { id: req.business.id },
        data: {
          twilioCampaignSid: campaign.sid,
          smsStatus: "pending"
        }
      });

      steps.push("Submitted! Carrier approval usually takes 1–3 business days.");
      console.log(`[sms-reg] A2P registration submitted for business ${req.business.id}`);

      res.json({ ok: true, status: "pending", steps });
    } catch (err) {
      console.error("[sms-reg] Registration error:", err.message);
      await prisma.business.update({
        where: { id: req.business.id },
        data: { smsStatus: "failed" }
      });
      res.status(500).json({ ok: false, error: err.message, steps });
    }
  })
);

// POST /api/sms-registration/refresh — poll Twilio for latest status
router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({ where: { id: req.business.id } });
    if (!business.twilioBrandSid && !business.twilioCampaignSid) {
      return res.json({ smsStatus: business.smsStatus });
    }

    const client = getClient();
    let newStatus = business.smsStatus;

    try {
      if (business.twilioBrandSid) {
        const brand = await client.messaging.v1.a2pBrandRegistrations(business.twilioBrandSid).fetch();
        if (brand.status === "APPROVED") newStatus = "approved";
        else if (brand.status === "FAILED") newStatus = "failed";
        else newStatus = "pending";
      }

      if (business.twilioCampaignSid && business.twilioMsgServiceSid && newStatus !== "failed") {
        try {
          const campaign = await client.messaging.v1
            .services(business.twilioMsgServiceSid)
            .usAppToPerson(business.twilioCampaignSid)
            .fetch();
          if (campaign.campaignStatus === "VERIFIED") newStatus = "approved";
          else if (campaign.campaignStatus === "FAILED") newStatus = "failed";
        } catch {}
      }

      await prisma.business.update({ where: { id: req.business.id }, data: { smsStatus: newStatus } });
      res.json({ smsStatus: newStatus });
    } catch (err) {
      res.json({ smsStatus: business.smsStatus, error: err.message });
    }
  })
);

export default router;
