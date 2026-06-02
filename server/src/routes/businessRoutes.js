import express from "express";
import asyncHandler from "express-async-handler";
import twilio from "twilio";
import { prisma } from "../prisma/client.js";
import { requireAuth, invalidateAuthCache } from "../middleware/auth.js";

function tokenFrom(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

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
    // requireAuth already loads the business with its relations, so reuse it and skip
    // a redundant DB round-trip. Fall back to a query only if relations are missing.
    let business = req.business;
    if (!business || business.serviceTypes === undefined || business.availability === undefined) {
      business = await prisma.business.findUnique({
        where: { id: req.business.id },
        include: { serviceTypes: true, availability: true, subscriptionPlan: true }
      });
    }

    const availability = [...(business.availability || [])].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)
    );

    res.json({ business: { ...business, availability } });
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
      callHandlingMode,
      ringSeconds,
      afterHoursRing,
      ringNumbers,
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
        ...(callHandlingMode !== undefined ? { callHandlingMode } : {}),
        ...(ringSeconds !== undefined ? { ringSeconds: Number(ringSeconds) || 15 } : {}),
        ...(afterHoursRing !== undefined ? { afterHoursRing: Boolean(afterHoursRing) } : {}),
        ...(ringNumbers !== undefined
          ? { ringNumbers: (Array.isArray(ringNumbers) ? ringNumbers : []).map((n) => String(n).trim()).filter(Boolean) }
          : {}),
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

    // Business changed — drop the cached auth so the next request reloads fresh data.
    invalidateAuthCache(tokenFrom(req));

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
    invalidateAuthCache(tokenFrom(req));

    console.log(`[twilio] Provisioned ${purchased.phoneNumber} for business ${req.business.id}`);
    res.json({ phoneNumber: purchased.phoneNumber, sid: purchased.sid });
  })
);

// POST /api/business/connect-existing-number — wire up a number already in the Twilio account
router.post(
  "/connect-existing-number",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "phoneNumber is required." });

    const baseUrl = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
    if (!baseUrl) return res.status(503).json({ error: "APP_BASE_URL is not set on the server." });

    const client = getTwilioAdminClient();

    // Find the number in the Twilio account
    const normalized = phoneNumber.replace(/\s/g, "");
    const [number] = await client.incomingPhoneNumbers.list({ phoneNumber: normalized, limit: 1 });
    if (!number) {
      return res.status(404).json({
        error: `${phoneNumber} was not found in your Twilio account. Make sure it's already added there before connecting it here.`
      });
    }

    // Configure webhooks
    await client.incomingPhoneNumbers(number.sid).update({
      smsUrl: `${baseUrl}/webhooks/twilio/sms`,
      smsMethod: "POST",
      voiceUrl: `${baseUrl}/webhooks/twilio/voice`,
      voiceMethod: "POST",
      statusCallback: `${baseUrl}/webhooks/twilio/call-status`,
      statusCallbackMethod: "POST"
    });

    // Save to business
    await prisma.business.update({
      where: { id: req.business.id },
      data: { twilioPhoneNumber: number.phoneNumber }
    });
    invalidateAuthCache(tokenFrom(req));

    console.log(`[twilio] Connected existing number ${number.phoneNumber} to business ${req.business.id}`);
    res.json({ phoneNumber: number.phoneNumber });
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
