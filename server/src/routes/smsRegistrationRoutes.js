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

// Map free-text industryType to Twilio's A2P industry enum values
function mapIndustry(industryType) {
  const t = (industryType || "").toLowerCase();
  if (t.includes("hvac") || t.includes("plumb") || t.includes("util") || t.includes("electric")) return "UTILITIES";
  if (t.includes("real estate") || t.includes("property") || t.includes("realt")) return "REAL_ESTATE";
  if (t.includes("home") || t.includes("repair") || t.includes("handyman") || t.includes("landscape")) return "HOME_AND_GARDEN";
  if (t.includes("transport") || t.includes("moving") || t.includes("logistic")) return "TRANSPORTATION";
  if (t.includes("engineer")) return "ENGINEERING";
  return "CONSTRUCTION"; // default for contractor businesses
}

// GET /api/sms-registration — current status, saved form data, and prefill from business profile
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({
      where: { id: req.business.id },
      include: { owner: true }
    });

    const bName = business.name || "";
    const ownerEmail = business.ownerNotificationEmail || business.owner?.email || "";
    const ownerPhone = business.ownerNotificationPhone || business.businessPhoneNumber || "";
    const industry = mapIndustry(business.industryType);
    const ownerName = business.owner?.name || "";
    const nameParts = ownerName.trim().split(/\s+/);
    const contactFirstName = nameParts[0] || "";
    const contactLastName = nameParts.slice(1).join(" ") || "";

    // Pre-built message templates using the actual business name
    const prefill = {
      businessLegalName: bName,
      businessIndustry: industry,
      contactFirstName,
      contactLastName,
      contactEmail: ownerEmail,
      contactPhone: ownerPhone,
      campaignDescription: `This campaign provides conversational customer support and appointment coordination for ${bName || "local construction and home service businesses"}. Customers opt in by calling or texting the business phone number after finding it on the business website, Google Business Profile, advertising, vehicles, invoices, or business cards. When a customer calls and the business misses the call, the system sends a follow-up text to ask what service they need help with. The conversation may collect the customer's name, service type, urgency, job address or ZIP code, issue description, preferred appointment time, and whether photos are available. Messages are used only to respond to customer-initiated service requests, qualify the job, and schedule appointments.`,
      sampleMessage1: `LeadRescue: Sorry we missed your call to ${bName || "[Business Name]"}. What kind of service do you need help with? Reply STOP to opt out.`,
      sampleMessage2: `LeadRescue: Thanks [Customer Name]. What is the job address or ZIP code for your [Service Type] request? Reply STOP to unsubscribe.`,
      sampleMessage3: `LeadRescue: We have your request for [Issue Description]. Is this an emergency, needed today, this week, or flexible? Reply STOP to opt out.`,
      sampleMessage4: `LeadRescue: ${bName || "[Business Name]"} has openings on [Date] at [Time] or [Date] at [Time]. Which appointment works best? Reply STOP to opt out.`,
      sampleMessage5: `LeadRescue: You're booked with ${bName || "[Business Name]"} for [Service Type] on [Date] at [Time]. The team has your details and will follow up if needed. Reply STOP to opt out.`,
      optInMessage: `LeadRescue: You are subscribed to receive service-request and appointment-coordination text messages from ${bName || "[Business Name]"}. Message frequency varies, typically 1-6 messages per request. Msg & data rates may apply. Reply HELP for help or STOP to opt out.`,
      optOutMessage: `You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.`,
      helpMessage: ownerPhone || ownerEmail
        ? `LeadRescue Support: For assistance, contact ${bName || "[Business Name]"}${ownerPhone ? ` at ${ownerPhone}` : ""}${ownerEmail ? ` or ${ownerEmail}` : ""}. Msg & data rates may apply. Reply STOP to opt out.`
        : "",
      optInDescription: `Customers provide consent by initiating contact with the business through a phone call, text message, website contact form, online booking form, Google Business Profile, or other business-owned communication channels. SMS messages are sent only in response to a customer-initiated service request. If a customer calls the business and the call is missed, the system may send a single follow-up text directly related to the customer's inquiry so the business can respond promptly.`
    };

    res.json({
      smsStatus: business.smsStatus || "not_started",
      twilioMsgServiceSid: business.twilioMsgServiceSid,
      twilioBrandSid: business.twilioBrandSid,
      twilioCampaignSid: business.twilioCampaignSid,
      smsFormData: business.smsFormData || null,
      platformConfigured: Boolean(process.env.TWILIO_PLATFORM_MSG_SERVICE_SID),
      prefill
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

// POST /api/sms-registration/platform-setup
// Run this ONCE as the LeadRescue platform owner to register the shared brand + campaign.
// After running, copy the returned messagingServiceSid to TWILIO_PLATFORM_MSG_SERVICE_SID
// in Railway — all future client numbers route through it automatically, no per-client wizard needed.
// Protected by ADMIN_KEY env var (set a long random string in Railway).
router.post(
  "/platform-setup",
  asyncHandler(async (req, res) => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || req.headers["x-admin-key"] !== adminKey) {
      return res.status(401).json({ error: "Unauthorized. Set ADMIN_KEY in Railway and pass it as X-Admin-Key header." });
    }
    if (process.env.TWILIO_PLATFORM_MSG_SERVICE_SID) {
      return res.json({ ok: true, alreadyConfigured: true, messagingServiceSid: process.env.TWILIO_PLATFORM_MSG_SERVICE_SID, message: "Platform messaging service already configured. Add new client numbers to it via provisioning." });
    }

    const client = getClient();
    const baseUrl = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
    const steps = [];

    try {
      // Step 1: Platform messaging service
      steps.push("Creating platform messaging service…");
      const service = await client.messaging.v1.services.create({
        friendlyName: "LeadRescue Platform",
        inboundRequestUrl: baseUrl ? `${baseUrl}/webhooks/twilio/sms` : undefined,
        fallbackUrl: baseUrl ? `${baseUrl}/webhooks/twilio/sms` : undefined,
        useInboundWebhookOnNumber: true,
        stickyCount: 1 // sticky sender so replies go back to the same number
      });
      steps.push(`Messaging service created: ${service.sid}`);

      // Step 2: Platform brand (LeadRescue as ISV)
      steps.push("Registering LeadRescue brand…");
      const policySid = await getA2pPolicySid(client);
      const profile = await client.trusthub.v1.customerProfiles.create({
        friendlyName: "LeadRescue Platform",
        email: process.env.PLATFORM_CONTACT_EMAIL || "hello@leadrescue.com",
        policySid
      });

      const endUser = await client.trusthub.v1.endUsers.create({
        friendlyName: "LeadRescue Inc.",
        type: "business",
        attributes: {
          business_name: "LeadRescue Inc.",
          business_registration_identifier: "NONE",
          business_identity: "isv",
          business_type: "CORPORATION",
          business_industry: "TECHNOLOGY",
          website_url: process.env.APP_BASE_URL || "https://leadrescue.com",
          business_regions_of_operation: "USA_AND_CANADA",
          street: process.env.PLATFORM_ADDRESS_STREET || "123 Main St",
          city: process.env.PLATFORM_ADDRESS_CITY || "Indianapolis",
          state_province_region: process.env.PLATFORM_ADDRESS_STATE || "IN",
          postal_code: process.env.PLATFORM_ADDRESS_ZIP || "46201",
          country: "US"
        }
      });

      await client.trusthub.v1.customerProfiles(profile.sid).customerProfilesEntityAssignments.create({ objectSid: endUser.sid });
      await client.trusthub.v1.customerProfiles(profile.sid).update({ status: "pending-review" });

      steps.push("Registering brand with carriers…");
      const brand = await client.messaging.v1.a2pBrandRegistrations.create({ customerProfileBundleSid: profile.sid });
      steps.push(`Brand registered: ${brand.sid}`);

      // Step 3: Platform campaign
      steps.push("Registering platform campaign…");
      const campaign = await client.messaging.v1.services(service.sid).usAppToPerson.create({
        brandRegistrationSid: brand.sid,
        description: "LeadRescue is a SaaS platform providing AI-powered lead follow-up and appointment scheduling for local construction and home service contractors. When a customer calls or texts a contractor using LeadRescue, the AI responds to qualify the lead, collect job details, and book appointments. All messages are sent in response to customer-initiated contact only.",
        messageFlow: "Customers opt in by calling or texting the contractor's LeadRescue number after finding it on the business website, Google Business Profile, advertising, invoices, or business cards. SMS messages are sent only in response to a customer-initiated service request.",
        messageSamples: [
          "LeadRescue: Sorry we missed your call to [Business Name]. What kind of service do you need help with? Reply STOP to opt out.",
          "LeadRescue: Thanks [Customer Name]. What is the job address or ZIP code for your [Service Type] request? Reply STOP to opt out.",
          "LeadRescue: We have your request for [Issue Description]. Is this an emergency, today, this week, or flexible? Reply STOP to opt out.",
          "LeadRescue: [Business Name] has openings on [Date] at [Time]. Which works best? Reply STOP to opt out.",
          "LeadRescue: You're booked with [Business Name] for [Service Type] on [Date] at [Time]. Reply STOP to opt out."
        ],
        usAppToPersonUsecase: "CUSTOMER_CARE",
        hasEmbeddedLinks: false,
        hasEmbeddedPhone: true,
        subscriberOptIn: true,
        subscriberOptOut: true,
        subscriberHelp: true,
        numberPool: true,
        ageGated: false,
        directLending: false,
        embeddedLink: false,
        embeddedPhone: true
      });
      steps.push(`Campaign submitted: ${campaign.sid}`);

      steps.push("Done! Add TWILIO_PLATFORM_MSG_SERVICE_SID to Railway environment variables.");
      res.json({
        ok: true,
        messagingServiceSid: service.sid,
        brandSid: brand.sid,
        campaignSid: campaign.sid,
        steps,
        nextStep: `Add this to Railway env vars: TWILIO_PLATFORM_MSG_SERVICE_SID=${service.sid}`
      });
    } catch (err) {
      console.error("[platform-setup] Error:", err.message);
      res.status(500).json({ ok: false, error: err.message, steps });
    }
  })
);

export default router;
