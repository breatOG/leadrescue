import express from "express";
import asyncHandler from "express-async-handler";
import twilio from "twilio";
import { prisma } from "../prisma/client.js";
import { requireAuth } from "../middleware/auth.js";
import { sendSms } from "../services/twilioService.js";
import { runAiLeadAgent } from "../services/aiLeadAgent.js";

const router = express.Router();
router.use(requireAuth);

function requireBusiness(req, res, next) {
  if (!req.business) return res.status(400).json({ error: "No business configured. Please complete your profile in Settings." });
  next();
}

router.get(
  "/",
  requireBusiness,
  asyncHandler(async (req, res) => {
    const leads = await prisma.lead.findMany({
      where: { businessId: req.business.id },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, appointments: true },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ leads });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, businessId: req.business.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        appointments: { orderBy: { startAt: "asc" } }
      }
    });

    if (!lead) return res.status(404).json({ error: "Lead not found" });
    return res.json({ lead });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    // Whitelist updatable fields so clients can't mutate businessId or other sensitive columns
    const { status, priority, customerName, jobType, issueDescription, address, zipCode, urgency, manualNotes } = req.body;
    const lead = await prisma.lead.update({
      where: { id: req.params.id, businessId: req.business.id },
      data: { status, priority, customerName, jobType, issueDescription, address, zipCode, urgency, manualNotes }
    });
    res.json({ lead });
  })
);

router.post(
  "/:id/manual-message",
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, businessId: req.business.id } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const body = String(req.body.body || "").trim();
    const result = await sendSms({
      to: lead.customerPhone,
      from: req.business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER,
      body
    });

    const message = await prisma.message.create({
      data: { leadId: lead.id, direction: "outbound", channel: "sms", body, twilioSid: result.sid }
    });
    // Sending a manual reply means the contractor is handling this thread — pause the AI.
    await prisma.lead.update({ where: { id: lead.id }, data: { lastMessage: body, status: "texting", handoffMode: "human" } });

    return res.json({ message });
  })
);

// Toggle who controls the SMS thread: "ai" (auto-replies) or "human" (contractor handles it).
router.post(
  "/:id/handoff",
  asyncHandler(async (req, res) => {
    const mode = req.body.mode === "human" ? "human" : "ai";
    const lead = await prisma.lead.update({
      where: { id: req.params.id, businessId: req.business.id },
      data: { handoffMode: mode }
    });
    res.json({ lead });
  })
);

// POST /api/leads/:id/call — click-to-call: Twilio calls the owner first, then bridges to customer.
// The customer always sees the business Twilio number as caller ID.
router.post(
  "/:id/call",
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, businessId: req.business.id } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const ownerPhone = (
      req.business.ownerNotificationPhone ||
      req.business.businessPhoneNumber ||
      ""
    ).trim();
    if (!ownerPhone) {
      return res.status(400).json({ error: "Add your mobile number under Call handling in Settings so we know where to ring you." });
    }

    const twilioFrom = req.business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;
    if (!twilioFrom) {
      return res.status(400).json({ error: "No Twilio number configured for this business." });
    }

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      return res.status(503).json({ error: "Twilio credentials not configured." });
    }

    const baseUrl = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
    const client = twilio(sid, token);

    // Step 1: Twilio calls the owner's phone.
    // Step 2: When owner picks up, TwiML dials the customer — customer sees Twilio number.
    const connectUrl = `${baseUrl}/webhooks/twilio/outbound-connect?to=${encodeURIComponent(lead.customerPhone)}&from=${encodeURIComponent(twilioFrom)}&leadId=${lead.id}`;

    const call = await client.calls.create({
      to: ownerPhone,
      from: twilioFrom,
      url: connectUrl,
      method: "POST",
      statusCallback: `${baseUrl}/webhooks/twilio/call-status`,
      statusCallbackMethod: "POST"
    });

    await prisma.message.create({
      data: { leadId: lead.id, direction: "outbound", channel: "voice", body: `[Outbound call initiated to ${lead.customerPhone}]` }
    });

    console.log(`[click-to-call] sid=${call.sid} owner=${ownerPhone} customer=${lead.customerPhone}`);
    res.json({ ok: true, callSid: call.sid });
  })
);

// Copilot: generate a suggested next reply to the customer. Does NOT send it.
router.post(
  "/:id/suggest-reply",
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, businessId: req.business.id } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const messages = await prisma.message.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } });
    const ai = await runAiLeadAgent({ business: req.business, lead, messages });
    res.json({ suggestion: (ai.nextMessageToCustomer || "").trim() });
  })
);

export default router;
