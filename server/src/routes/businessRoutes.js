import express from "express";
import asyncHandler from "express-async-handler";
import twilio from "twilio";
import { prisma } from "../prisma/client.js";
import { requireAuth } from "../middleware/auth.js";

function getTwilioAdminClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set to provision phone numbers.");
  }
  return twilio(sid, token);
}

const router = express.Router();
router.use(requireAuth);

router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({
      where: { id: req.business.id },
      include: { serviceTypes: true, availability: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }, subscriptionPlan: true }
    });
    res.json({ business });
  })
);

router.put(
  "/settings",
  asyncHandler(async (req, res) => {
    const {
      name,
      industryType,
      serviceAreas,
      serviceTypes,
      businessHours,
      twilioPhoneNumber,
      businessPhoneNumber,
      ownerNotificationPhone,
      ownerNotificationEmail,
      availability
    } = req.body;

    await prisma.serviceType.deleteMany({ where: { businessId: req.business.id } });
    await prisma.businessAvailability.deleteMany({ where: { businessId: req.business.id } });

    const business = await prisma.business.update({
      where: { id: req.business.id },
      data: {
        name,
        industryType,
        serviceAreas: serviceAreas || [],
        businessHours: businessHours || {},
        twilioPhoneNumber,
        businessPhoneNumber,
        ownerNotificationPhone,
        ownerNotificationEmail,
        serviceTypes: {
          create: (serviceTypes || []).filter(Boolean).map((type) => ({ name: type }))
        },
        availability: {
          create: (availability || []).map((slot) => ({
            dayOfWeek: Number(slot.dayOfWeek),
            startTime: slot.startTime,
            endTime: slot.endTime,
            slotMinutes: Number(slot.slotMinutes || 60)
          }))
        }
      },
      include: { serviceTypes: true, availability: true, subscriptionPlan: true }
    });

    res.json({ business });
  })
);

// GET /api/business/available-numbers?areaCode=317 — search Twilio for purchasable numbers
router.get(
  "/available-numbers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { areaCode } = req.query;
    if (!areaCode || !/^\d{3}$/.test(String(areaCode))) {
      return res.status(400).json({ error: "Provide a valid 3-digit US area code." });
    }

    const client = getTwilioAdminClient();
    const results = await client.availablePhoneNumbers("US").local.list({
      areaCode: String(areaCode),
      smsEnabled: true,
      voiceEnabled: true,
      limit: 5
    });

    res.json({
      numbers: results.map((n) => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality,
        region: n.region
      }))
    });
  })
);

// POST /api/business/provision-phone — purchase a Twilio number and wire up webhooks
router.post(
  "/provision-phone",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "phoneNumber is required." });

    const baseUrl = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
    if (!baseUrl) {
      return res.status(503).json({ error: "APP_BASE_URL is not set on the server. Add it to your Railway environment variables." });
    }

    const client = getTwilioAdminClient();
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber,
      smsUrl: `${baseUrl}/webhooks/twilio/sms`,
      smsMethod: "POST",
      voiceUrl: `${baseUrl}/webhooks/twilio/voice`,
      voiceMethod: "POST",
      statusCallback: `${baseUrl}/webhooks/twilio/call-status`,
      statusCallbackMethod: "POST"
    });

    await prisma.business.update({
      where: { id: req.business.id },
      data: { twilioPhoneNumber: purchased.phoneNumber }
    });

    console.log(`[twilio] Provisioned ${purchased.phoneNumber} for business ${req.business.id}`);
    res.json({ phoneNumber: purchased.phoneNumber, sid: purchased.sid });
  })
);

// POST /api/business/reconfigure-webhooks — re-point an existing number's webhooks to this server
router.post(
  "/reconfigure-webhooks",
  requireAuth,
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({ where: { id: req.business.id } });
    if (!business.twilioPhoneNumber) {
      return res.status(400).json({ error: "No Twilio number configured for this business." });
    }

    const baseUrl = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
    if (!baseUrl) return res.status(503).json({ error: "APP_BASE_URL is not set." });

    const client = getTwilioAdminClient();
    const [number] = await client.incomingPhoneNumbers.list({ phoneNumber: business.twilioPhoneNumber, limit: 1 });
    if (!number) return res.status(404).json({ error: "Number not found in this Twilio account." });

    await client.incomingPhoneNumbers(number.sid).update({
      smsUrl: `${baseUrl}/webhooks/twilio/sms`,
      smsMethod: "POST",
      voiceUrl: `${baseUrl}/webhooks/twilio/voice`,
      voiceMethod: "POST",
      statusCallback: `${baseUrl}/webhooks/twilio/call-status`,
      statusCallbackMethod: "POST"
    });

    res.json({ ok: true, phoneNumber: business.twilioPhoneNumber });
  })
);

export default router;
