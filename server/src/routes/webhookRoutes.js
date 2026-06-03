import express from "express";
import asyncHandler from "express-async-handler";
import crypto from "crypto";
import OpenAI from "openai";
import { prisma } from "../prisma/client.js";
import { runAiLeadAgent, runVoiceAiTurn, analyzeCallTranscript } from "../services/aiLeadAgent.js";
import { bookAppointment, getAvailableSlots } from "../services/schedulingService.js";
import { notifyContractor } from "../services/notificationService.js";
import { sendSms } from "../services/twilioService.js";
import { aiVoiceEnabled, createAiVoiceTwiML } from "../services/realtimeVoiceService.js";
import { PLAN_LIMITS } from "./paymentRoutes.js";

// In-memory TTS audio cache: id -> { buffer, createdAt }
const ttsCache = new Map();
// Dedup map so identical phrases share one cached buffer: text -> id
const ttsByText = new Map();

// SMS Choice Mode: tracks which lead the owner was last notified about per business.
// businessId -> { leadId, customerPhone, notifiedAt }
const ownerControlMap = new Map();
setInterval(() => {
  const dynamicCutoff = Date.now() - 5 * 60 * 1000;
  const staticCutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, entry] of ttsCache) {
    const cutoff = entry.static ? staticCutoff : dynamicCutoff;
    if (entry.createdAt < cutoff) {
      ttsCache.delete(id);
    }
  }
  // Clean ttsByText of any stale ids
  for (const [text, id] of ttsByText) {
    if (!ttsCache.has(id)) ttsByText.delete(text);
  }
}, 60_000).unref();

// Static phrases that repeat across every call — cache them permanently (30 min TTL).
const STATIC_TTS_PHRASES = new Set([
  "Sorry, I didn't catch that. Please call us back and we will be happy to help.",
  "Sorry, I didn't catch that. Feel free to call us back anytime.",
]);

async function generateTtsAudio(text, { reusable = false } = {}) {
  const isStatic = reusable || STATIC_TTS_PHRASES.has(text);

  if (isStatic) {
    const existing = ttsByText.get(text);
    if (existing && ttsCache.has(existing)) return existing;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input: text,
    response_format: "mp3"
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const id = crypto.randomUUID();
  ttsCache.set(id, { buffer, createdAt: Date.now(), static: isStatic });
  if (isStatic) ttsByText.set(text, id);
  return id;
}

function ttsPlayUrl(id) {
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${base}/webhooks/twilio/tts/${id}`;
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function saveExtractedFields(leadId, extracted = {}) {
  const update = {};
  if (extracted.customerName) update.customerName = extracted.customerName;
  if (extracted.jobType) update.jobType = extracted.jobType;
  if (extracted.issueDescription) update.issueDescription = extracted.issueDescription;
  if (extracted.urgency) update.urgency = extracted.urgency;
  if (extracted.address) update.address = extracted.address;
  if (extracted.zipCode) update.zipCode = extracted.zipCode;
  if (extracted.preferredAppointmentTime) update.preferredAppointmentTime = extracted.preferredAppointmentTime;
  if (Object.keys(update).length > 0) {
    await prisma.lead.update({ where: { id: leadId }, data: update });
  }
}

const router = express.Router();

async function findBusinessByTwilioNumber(number) {
  const business =
    (number &&
      (await prisma.business.findFirst({
        where: { twilioPhoneNumber: number },
        include: { serviceTypes: true, owner: true }
      }))) ||
    (await prisma.business.findFirst({ include: { serviceTypes: true, owner: true } }));

  if (!business) {
    throw new Error("No business configured for incoming webhook");
  }

  return business;
}

async function findOrCreateLead({ business, from, source }) {
  const existing = await prisma.lead.findFirst({
    where: {
      businessId: business.id,
      customerPhone: from,
      status: { notIn: ["closed", "spam"] }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (existing) return existing;

  // Check monthly lead limit based on owner's subscription plan
  const owner = await prisma.user.findUnique({ where: { id: business.ownerId } });
  const plan = (owner?.subscriptionPlan || "starter").toLowerCase();
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;

  if (limits.leadsPerMonth !== Infinity) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const leadsThisMonth = await prisma.lead.count({
      where: { businessId: business.id, createdAt: { gte: startOfMonth } }
    });
    if (leadsThisMonth >= limits.leadsPerMonth) {
      console.log(`[lead] Monthly limit reached (${leadsThisMonth}/${limits.leadsPerMonth}) for business ${business.id} on plan ${plan}`);
      return null;
    }
  }

  return prisma.lead.create({
    data: {
      businessId: business.id,
      customerPhone: from,
      source,
      status: "new",
      priority: "normal",
      lastMessage: source === "missed_call" ? "Missed call" : null
    }
  });
}

async function saveWebhook({ businessId, eventType, payload }) {
  await prisma.webhookLog.create({
    data: { businessId, provider: "twilio", eventType, payload }
  });
}

async function handleAppointmentChoice({ business, lead, body }) {
  const normalized = body.trim().toLowerCase();
  const choice = Number(normalized);

  if (!Number.isInteger(choice) || choice < 1 || choice > 3 || lead.status !== "qualified") {
    return null;
  }

  const slots = await getAvailableSlots(business.id);
  const selected = slots[choice - 1];
  if (!selected) return null;

  let appointment;
  try {
    appointment = await bookAppointment({
      businessId: business.id,
      leadId: lead.id,
      startAt: selected.startAt,
      notes: "Booked from SMS appointment choice."
    });
  } catch {
    // Slot was just taken — re-fetch remaining slots and offer them
    const remaining = await getAvailableSlots(business.id);
    const tz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
    if (!remaining.length) {
      const noSlotMsg = "Sorry, that time just got booked. We don't have any other openings right now — we'll reach out soon to find a time that works.";
      await sendSms({ to: lead.customerPhone, from: business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER, body: noSlotMsg });
      await prisma.message.create({ data: { leadId: lead.id, direction: "outbound", channel: "sms", body: noSlotMsg } });
      await prisma.lead.update({ where: { id: lead.id }, data: { lastMessage: noSlotMsg } });
    } else {
      const slotList = remaining.slice(0, 3).map((s, i) =>
        `${i + 1}. ${new Date(s.startAt).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}`
      ).join("\n");
      const retryMsg = `Sorry, that time just got booked. Here are the next available times:\n\n${slotList}\n\nReply 1, 2, or 3 to pick one.`;
      await sendSms({ to: lead.customerPhone, from: business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER, body: retryMsg });
      await prisma.message.create({ data: { leadId: lead.id, direction: "outbound", channel: "sms", body: retryMsg } });
      await prisma.lead.update({ where: { id: lead.id }, data: { lastMessage: retryMsg } });
    }
    return null;
  }

  const responseBody = `You're booked for ${new Date(appointment.startAt).toLocaleString("en-US", { timeZone: process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}. The team has your details and will follow up if anything else is needed.`;
  const result = await sendSms({
    to: lead.customerPhone,
    from: business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER,
    body: responseBody
  });

  await prisma.message.create({
    data: { leadId: lead.id, direction: "outbound", channel: "sms", body: responseBody, twilioSid: result?.sid }
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "appointment_booked", lastMessage: responseBody, aiSummary: `Appointment booked for ${appointment.startAt.toLocaleString()}.` }
  });
  await notifyContractor({ business, lead: { ...lead, status: "appointment_booked" }, summary: responseBody });

  return responseBody;
}

router.post(
  "/twilio/sms",
  asyncHandler(async (req, res) => {
    console.log(`[sms] Incoming: From=${req.body.From} To=${req.body.To} Body="${req.body.Body}"`);
    const business = await findBusinessByTwilioNumber(req.body.To);
    await saveWebhook({ businessId: business.id, eventType: "sms", payload: req.body });

    let lead = await findOrCreateLead({ business, from: req.body.From, source: "sms" });
    const twilioFrom = business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;

    if (!lead) {
      try {
        await sendSms({
          to: req.body.From,
          from: twilioFrom,
          body: `Thanks for reaching out to ${business.name}! We're currently at capacity for new inquiries this month. Please call us directly or reach out again next month.`
        });
      } catch (err) {
        console.error("[sms] Failed to send capacity reply:", err.message);
      }
      return res.type("text/xml").send("<Response></Response>");
    }

    const inboundBody = String(req.body.Body || "").trim();
    const fromPhone = req.body.From;
    const ownerPhone = (business.ownerNotificationPhone || business.businessPhoneNumber || "").trim();

    // SMS Choice Mode: if the incoming message is FROM the owner, treat it as a control command.
    // Owner can reply "AI" to hand back to the AI, or reply with their own message to forward it.
    if (business.smsChoiceMode && ownerPhone && fromPhone === ownerPhone) {
      const pending = ownerControlMap.get(business.id);
      if (pending) {
        const pendingLead = await prisma.lead.findUnique({ where: { id: pending.leadId } });
        if (pendingLead) {
          const cmd = inboundBody.toUpperCase();
          if (cmd === "AI" || cmd === "YES") {
            // Hand back to AI — it will respond on the next tick
            await prisma.lead.update({ where: { id: pending.leadId }, data: { handoffMode: "ai" } });
            // Trigger AI response now
            const messages = await prisma.message.findMany({ where: { leadId: pending.leadId }, orderBy: { createdAt: "asc" } });
            const aiResult = await runAiLeadAgent({ business, lead: pendingLead, messages }).catch(() => null);
            if (aiResult?.nextMessageToCustomer) {
              const sent = await sendSms({ to: pending.customerPhone, from: business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER, body: aiResult.nextMessageToCustomer });
              await prisma.message.create({ data: { leadId: pending.leadId, direction: "outbound", channel: "sms", body: aiResult.nextMessageToCustomer, twilioSid: sent?.sid } });
              await prisma.lead.update({ where: { id: pending.leadId }, data: { lastMessage: aiResult.nextMessageToCustomer } });
            }
          } else {
            // Forward owner's message directly to customer
            const sent = await sendSms({ to: pending.customerPhone, from: business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER, body: inboundBody });
            await prisma.message.create({ data: { leadId: pending.leadId, direction: "outbound", channel: "sms", body: inboundBody, twilioSid: sent?.sid } });
            await prisma.lead.update({ where: { id: pending.leadId }, data: { handoffMode: "human", lastMessage: inboundBody } });
          }
          ownerControlMap.delete(business.id);
        }
      }
      return res.type("text/xml").send("<Response></Response>");
    }

    await prisma.message.create({
      data: { leadId: lead.id, direction: "inbound", channel: "sms", body: inboundBody, twilioSid: req.body.MessageSid }
    });
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: { lastMessage: inboundBody, status: lead.status === "new" ? "texting" : lead.status }
    });

    // If a human has taken over this thread, the AI stays silent — just alert the team.
    if (lead.handoffMode === "human") {
      notifyContractor({ business, lead, summary: `New customer text: "${inboundBody.slice(0, 140)}"` })
        .catch((e) => console.error("[sms] human-mode notify failed:", e.message));
      return res.type("text/xml").send("<Response></Response>");
    }

    // SMS Choice Mode: notify the owner and pause AI until they decide
    if (business.smsChoiceMode && ownerPhone && lead.handoffMode !== "human") {
      ownerControlMap.set(business.id, { leadId: lead.id, customerPhone: lead.customerPhone, notifiedAt: Date.now() });
      await prisma.lead.update({ where: { id: lead.id }, data: { handoffMode: "human" } });
      const preview = inboundBody.length > 100 ? inboundBody.slice(0, 100) + "…" : inboundBody;
      const name = lead.customerName || lead.customerPhone;
      await sendSms({
        to: ownerPhone,
        from: business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER,
        body: `LeadRescue: ${name} texted: "${preview}"\n\nReply AI to let the assistant respond, or reply with your own message to send it directly.`
      }).catch((e) => console.error("[sms] choice-mode notify failed:", e.message));
      return res.type("text/xml").send("<Response></Response>");
    }

    // Load any booked appointment for this lead — used for cancel/reschedule and AI context
    const leadAppointments = await prisma.appointment.findMany({
      where: { leadId: lead.id, status: "booked" },
      orderBy: { startAt: "asc" }
    });

    // Cancel / reschedule keywords
    const lcBody = inboundBody.toLowerCase();
    if (/\bcancel\b/.test(lcBody) && leadAppointments.length) {
      const apt = leadAppointments[0];
      await prisma.appointment.update({ where: { id: apt.id }, data: { status: "cancelled" } });
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "qualified" } });
      const tz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
      const aptStr = new Date(apt.startAt).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
      const cancelMsg = `Your appointment on ${aptStr} has been cancelled. Reply RESCHEDULE if you'd like to pick a new time, or we'll follow up with you shortly.`;
      const sent = await sendSms({ to: lead.customerPhone, from: twilioFrom, body: cancelMsg }).catch(() => null);
      await prisma.message.create({ data: { leadId: lead.id, direction: "outbound", channel: "sms", body: cancelMsg, twilioSid: sent?.sid } });
      await prisma.lead.update({ where: { id: lead.id }, data: { lastMessage: cancelMsg } });
      notifyContractor({ business, lead, summary: `Customer cancelled appointment for ${aptStr}.` }).catch(() => {});
      return res.type("text/xml").send("<Response></Response>");
    }

    if (/\breschedule\b/.test(lcBody) || (/\bschedule\b/.test(lcBody) && leadAppointments.length)) {
      if (leadAppointments.length) {
        await prisma.appointment.update({ where: { id: leadAppointments[0].id }, data: { status: "cancelled" } });
      }
      const newSlots = await getAvailableSlots(business.id);
      if (!newSlots.length) {
        const noSlotsMsg = `We don't have any open slots right now — our team will reach out shortly to find a time that works.`;
        const sent = await sendSms({ to: lead.customerPhone, from: twilioFrom, body: noSlotsMsg }).catch(() => null);
        await prisma.message.create({ data: { leadId: lead.id, direction: "outbound", channel: "sms", body: noSlotsMsg, twilioSid: sent?.sid } });
        await prisma.lead.update({ where: { id: lead.id }, data: { status: "qualified", lastMessage: noSlotsMsg } });
        return res.type("text/xml").send("<Response></Response>");
      }
      const tz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
      const slotList = newSlots.slice(0, 3).map((s, i) =>
        `${i + 1}. ${new Date(s.startAt).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}`
      ).join("\n");
      const reschedMsg = `Here are the next available times:\n\n${slotList}\n\nReply 1, 2, or 3 to pick a slot.`;
      const sent = await sendSms({ to: lead.customerPhone, from: twilioFrom, body: reschedMsg }).catch(() => null);
      await prisma.message.create({ data: { leadId: lead.id, direction: "outbound", channel: "sms", body: reschedMsg, twilioSid: sent?.sid } });
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "qualified", lastMessage: reschedMsg } });
      return res.type("text/xml").send("<Response></Response>");
    }

    // Appointment slot selection (if they texted 1/2/3 after being qualified)
    const bookedResponse = await handleAppointmentChoice({ business, lead, body: inboundBody });
    if (bookedResponse) return res.type("text/xml").send("<Response></Response>");

    const inboundCount = await prisma.message.count({
      where: { leadId: lead.id, direction: "inbound", channel: "sms" }
    });

    let replyBody;

    if (inboundCount === 1) {
      // First ever text — send one simple intake message, no AI needed
      replyBody = `Hi! Thanks for reaching out to ${business.name}. Please reply with your name, what service you need, and your address or ZIP — we'll get back to you shortly.`;
    } else {
      // They replied with info — run AI once to extract fields, then confirm and close the loop
      try {
        const messages = await prisma.message.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } });
        const aiResult = await runAiLeadAgent({ business, lead, messages, appointments: leadAppointments });

        const name = aiResult.extractedFields?.customerName || lead.customerName;
        const jobType = aiResult.extractedFields?.jobType || lead.jobType;

        replyBody = `Thanks${name ? `, ${name}` : ""}! We've received your request${jobType ? ` for ${jobType}` : ""} and someone will call you back at ${lead.customerPhone} shortly.`;

        const updatedLead = await prisma.lead.update({
          where: { id: lead.id },
          data: {
            ...aiResult.extractedFields,
            priority: aiResult.leadPriority,
            status: "qualified",
            aiSummary: aiResult.contractorSummary,
            lastMessage: replyBody
          }
        });

        notifyContractor({ business, lead: updatedLead, summary: aiResult.contractorSummary })
          .catch((e) => console.error("SMS notify failed:", e.message));
      } catch (err) {
        console.error("[sms] AI extraction failed:", err.message);
        replyBody = `Thanks! We've got your message and will call you back at ${lead.customerPhone} shortly.`;
      }
    }

    try {
      const result = await sendSms({ to: lead.customerPhone, from: twilioFrom, body: replyBody });
      await prisma.message.create({
        data: { leadId: lead.id, direction: "outbound", channel: "sms", body: replyBody, twilioSid: result?.sid }
      });
      await prisma.lead.update({ where: { id: lead.id }, data: { lastMessage: replyBody } });
    } catch (err) {
      console.error("[sms] Failed to send reply:", err.message);
    }

    return res.type("text/xml").send("<Response></Response>");
  })
);

router.get(
  "/twilio/tts/:id",
  asyncHandler(async (req, res) => {
    const entry = ttsCache.get(req.params.id);
    if (!entry) return res.status(404).send("Not found");
    // Static phrases stay cached for reuse; dynamic AI responses evict on first play.
    if (!entry.static) ttsCache.delete(req.params.id);
    res.set("Content-Type", "audio/mpeg").send(entry.buffer);
  })
);

// --- Business hours ----------------------------------------------------------
function parseTimeToMinutes(str) {
  const m = String(str).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = (m[3] || "").toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

// True if "now" (in the business timezone) falls within the configured hours.
// Unknown or unparseable hours are treated as open, so we never accidentally stop ringing.
function isWithinBusinessHours(businessHours) {
  if (!businessHours || typeof businessHours !== "object" || !Object.keys(businessHours).length) return true;
  const tz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = (get("weekday") || "").toLowerCase();
  const nowMin = Number(get("hour")) * 60 + Number(get("minute"));
  const range = businessHours[day];
  if (!range || /closed/i.test(range)) return false;
  const [a, b] = String(range).split(/\s*[-–—]\s*/);
  const start = parseTimeToMinutes(a);
  const end = parseTimeToMinutes(b);
  if (start == null || end == null) return true;
  return nowMin >= start && nowMin < end;
}

// --- Ring-first call routing -------------------------------------------------
// Caller CallSids whose owner accepted the screened call (pressed 1). Short TTL.
const acceptedCalls = new Map(); // callSid -> expiresAt
function markCallAccepted(sid) {
  if (sid) acceptedCalls.set(sid, Date.now() + 60 * 60 * 1000);
}
function consumeCallAccepted(sid) {
  const exp = acceptedCalls.get(sid);
  if (exp) acceptedCalls.delete(sid);
  return Boolean(exp && exp > Date.now());
}
setInterval(() => {
  const now = Date.now();
  for (const [sid, exp] of acceptedCalls) if (exp <= now) acceptedCalls.delete(sid);
}, 5 * 60 * 1000).unref();

// Renders the AI receptionist answer (realtime stream, or TTS fallback) to the caller.
async function respondWithAi(req, res, { business, lead }) {
  const updatedLead = await prisma.lead.update({
    where: { id: lead.id },
    data: { status: lead.status === "new" ? "texting" : lead.status, lastMessage: "AI voice call started" }
  });

  await prisma.message.create({
    data: { leadId: updatedLead.id, direction: "inbound", channel: "voice", body: "[call started]" }
  });

  if (aiVoiceEnabled()) {
    return res.type("text/xml").send(
      createAiVoiceTwiML(req, {
        businessName: business.name,
        leadId: updatedLead.id,
        businessId: business.id,
        customerPhone: req.body.From
      })
    );
  }

  const [initMessages, slots, appointments] = await Promise.all([
    prisma.message.findMany({ where: { leadId: updatedLead.id }, orderBy: { createdAt: "asc" } }),
    getAvailableSlots(business.id),
    prisma.appointment.findMany({ where: { leadId: updatedLead.id, status: "booked" }, orderBy: { startAt: "asc" } })
  ]);
  const { text: greeting, extracted } = await runVoiceAiTurn({ business, lead: updatedLead, messages: initMessages, slots, appointments });
  await prisma.message.create({
    data: { leadId: updatedLead.id, direction: "outbound", channel: "voice", body: greeting }
  });
  await saveExtractedFields(updatedLead.id, extracted);

  const [ttsId, timeoutTtsId] = await Promise.all([
    generateTtsAudio(greeting).catch(() => null),
    generateTtsAudio("Sorry, I didn't catch that. Please call us back and we will be happy to help.").catch(() => null)
  ]);
  const gatherUrl = `/webhooks/twilio/voice-gather?leadId=${updatedLead.id}&amp;businessId=${business.id}`;
  const greetingXml = ttsId
    ? `<Play>${esc(ttsPlayUrl(ttsId))}</Play>`
    : `<Say voice="Google.en-US-Neural2-F">${esc(greeting)}</Say>`;
  const timeoutXml = timeoutTtsId
    ? `<Play>${esc(ttsPlayUrl(timeoutTtsId))}</Play>`
    : `<Say voice="Google.en-US-Neural2-F">Sorry, I didn't catch that. Please call us back and we will be happy to help.</Say>`;
  return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${gatherUrl}" method="POST" speechTimeout="auto" timeout="10" language="en-US" enhanced="true">
    ${greetingXml}
  </Gather>
  ${timeoutXml}
</Response>`);
}

router.post(
  "/twilio/voice",
  asyncHandler(async (req, res) => {
    const business = await findBusinessByTwilioNumber(req.body.To);
    await saveWebhook({ businessId: business.id, eventType: "voice", payload: req.body });

    const lead = await findOrCreateLead({ business, from: req.body.From, source: "missed_call" });

    if (!lead) {
      const capMsg = `Thank you for calling ${business.name}. We're currently at capacity for new inquiries this month. Please try calling back next month or visit our website for more information. Thank you!`;
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-F">${esc(capMsg)}</Say>
  <Hangup/>
</Response>`);
    }

    // Ring the owner's phone first; the AI takes over only on miss / decline / voicemail.
    // Outside business hours we skip the ring (AI answers directly) unless the owner opted
    // into after-hours ringing. Emergencies still alert the owner via the AI's notification.
    const mode = business.callHandlingMode || "ring_first";
    let ownerPhone = (business.ownerNotificationPhone || business.businessPhoneNumber || "").trim();
    // Fall back to the owner's login phone if no alert phone is set — but never ring the
    // same number the call came in on (that would loop).
    if (!ownerPhone && business.owner?.phoneNumber && business.owner.phoneNumber !== business.twilioPhoneNumber) {
      ownerPhone = business.owner.phoneNumber.trim();
    }
    const openNow = isWithinBusinessHours(business.businessHours);

    // Ring the owner plus any additional team numbers simultaneously; whoever answers
    // and presses 1 first gets the call (Twilio cancels the other legs on bridge).
    const ringTargets = [...new Set(
      [ownerPhone, ...(business.ringNumbers || [])].map((n) => String(n || "").trim()).filter(Boolean)
    )];

    if (mode === "ring_first" && ringTargets.length && (openNow || business.afterHoursRing)) {
      const ringSeconds = Number(business.ringSeconds) || 15;
      const q = `leadId=${lead.id}&amp;businessId=${business.id}`;
      const numbersXml = ringTargets
        .map((n) => `<Number url="/webhooks/twilio/screen?${q}" method="POST">${esc(n)}</Number>`)
        .join("\n    ");
      await prisma.lead
        .update({ where: { id: lead.id }, data: { lastMessage: "Incoming call — ringing the team" } })
        .catch(() => {});
      const recordAttr = business.watchMode
        ? `record="record-from-answer-dual-channel" recordingStatusCallback="/webhooks/twilio/recording-complete?leadId=${lead.id}&amp;businessId=${business.id}" recordingStatusCallbackMethod="POST"`
        : "";
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-F">Thanks for calling ${esc(business.name)}. Connecting you now.</Say>
  <Dial timeout="${ringSeconds}" answerOnBridge="true" action="/webhooks/twilio/after-dial?${q}" method="POST" ${recordAttr}>
    ${numbersXml}
  </Dial>
</Response>`);
    }

    // AI answers immediately (mode = ai_immediately, or no owner phone configured).
    return respondWithAi(req, res, { business, lead });
  })
);

// Whisper played to the owner when they answer — requires pressing 1 to take the call.
// This also defeats the voicemail-answers-the-call problem: voicemail won't press 1.
router.post(
  "/twilio/screen",
  asyncHandler(async (req, res) => {
    const { leadId, businessId } = req.query;
    const q = `leadId=${leadId}&amp;businessId=${businessId}`;
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/webhooks/twilio/screen-accept?${q}" method="POST" timeout="6">
    <Say voice="Google.en-US-Neural2-F">You have a new lead calling. Press 1 to take the call, or hang up to send them to your assistant.</Say>
  </Gather>
  <Hangup/>
</Response>`);
  })
);

// Owner pressed a key on the screen prompt. "1" accepts (bridges); anything else drops the owner leg.
router.post(
  "/twilio/screen-accept",
  asyncHandler(async (req, res) => {
    if (req.body.Digits === "1") {
      markCallAccepted(req.body.ParentCallSid);
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-F">Connecting you now.</Say>
</Response>`);
    }
    return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`);
  })
);

// Fires when the Dial to the owner ends. If the owner accepted (pressed 1), we're done;
// otherwise (no answer, busy, declined, or voicemail) the AI receptionist takes over.
router.post(
  "/twilio/after-dial",
  asyncHandler(async (req, res) => {
    const { leadId, businessId } = req.query;
    const accepted = consumeCallAccepted(req.body.CallSid);
    console.log(`[voice] after-dial status=${req.body.DialCallStatus} accepted=${accepted} call=${req.body.CallSid}`);

    if (accepted) {
      await prisma.lead
        .update({ where: { id: leadId }, data: { status: "qualified", lastMessage: "Call answered by the team" } })
        .catch(() => {});
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    }

    const [business, lead] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId }, include: { serviceTypes: true } }),
      prisma.lead.findUnique({ where: { id: leadId } })
    ]);

    if (!business || !lead) {
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-F">Sorry, something went wrong on our end. Please call back.</Say>
  <Hangup/>
</Response>`);
    }

    return respondWithAi(req, res, { business, lead });
  })
);

router.post(
  "/twilio/voice-gather",
  asyncHandler(async (req, res) => {
    const { leadId, businessId } = req.query;
    const speechResult = String(req.body.SpeechResult || "").trim();

    const [lead, business] = await Promise.all([
      prisma.lead.findUnique({ where: { id: leadId }, include: { messages: { orderBy: { createdAt: "asc" } } } }),
      prisma.business.findUnique({ where: { id: businessId }, include: { serviceTypes: true } })
    ]);

    if (!lead || !business) {
      const errMsg = "Sorry about that — something went wrong on our end. Please give us a call back and we'll get you sorted out.";
      const errTtsId = await generateTtsAudio(errMsg).catch(() => null);
      const errXml = errTtsId
        ? `<Play>${esc(ttsPlayUrl(errTtsId))}</Play>`
        : `<Say voice="Google.en-US-Neural2-F">${esc(errMsg)}</Say>`;
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response>${errXml}</Response>`);
    }

    if (speechResult) {
      await prisma.message.create({
        data: { leadId: lead.id, direction: "inbound", channel: "voice", body: speechResult }
      });
    }

    let aiReply, done, extracted, bookedSlotIndex, voiceSlots;
    try {
      const [messages, slots, appointments] = await Promise.all([
        prisma.message.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } }),
        getAvailableSlots(business.id),
        prisma.appointment.findMany({ where: { leadId: lead.id, status: "booked" }, orderBy: { startAt: "asc" } })
      ]);
      voiceSlots = slots;
      ({ text: aiReply, done, extracted, bookedSlotIndex } = await runVoiceAiTurn({ business, lead, messages, slots, appointments }));
    } catch (err) {
      console.error("[voice-gather] AI error:", err.message);
      const retryMsg = "Sorry, I didn't quite catch that — could you say that again?";
      const retryTtsId = await generateTtsAudio(retryMsg).catch(() => null);
      const retryXml = retryTtsId
        ? `<Play>${esc(ttsPlayUrl(retryTtsId))}</Play>`
        : `<Say voice="Google.en-US-Neural2-F">${esc(retryMsg)}</Say>`;
      const gatherUrl = `/webhooks/twilio/voice-gather?leadId=${lead.id}&amp;businessId=${business.id}`;
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${gatherUrl}" method="POST" speechTimeout="auto" timeout="10" language="en-US" enhanced="true">
    ${retryXml}
  </Gather>
</Response>`);
    }

    await prisma.message.create({
      data: { leadId: lead.id, direction: "outbound", channel: "voice", body: aiReply }
    });
    await saveExtractedFields(lead.id, extracted);
    await prisma.lead.update({ where: { id: lead.id }, data: { lastMessage: aiReply } });

    // Book the appointment the AI confirmed during the call
    if (bookedSlotIndex != null && voiceSlots?.[bookedSlotIndex]) {
      try {
        const apt = await bookAppointment({
          businessId: business.id,
          leadId: lead.id,
          startAt: voiceSlots[bookedSlotIndex].startAt,
          notes: "Booked during AI voice call."
        });
        console.log(`[voice] Appointment booked at slot ${bookedSlotIndex} for lead ${lead.id}`);
        // Send SMS confirmation so the customer has the date/time in writing
        const aptTz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
        const aptTimeStr = new Date(apt.startAt).toLocaleString("en-US", { timeZone: aptTz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
        const confirmMsg = `Your appointment with ${business.name} is confirmed for ${aptTimeStr}. See you then!`;
        const twilioNum = business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;
        const sent = await sendSms({ to: lead.customerPhone, from: twilioNum, body: confirmMsg }).catch(() => null);
        if (sent) {
          await prisma.message.create({ data: { leadId: lead.id, direction: "outbound", channel: "sms", body: confirmMsg, twilioSid: sent?.sid } });
        }
      } catch (e) {
        console.error("[voice] Appointment booking failed:", e.message);
        const remaining = await getAvailableSlots(business.id);
        const tz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
        const alternatives = remaining.slice(0, 3).map((slot) =>
          new Date(slot.startAt).toLocaleString("en-US", {
            timeZone: tz,
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true
          })
        );
        aiReply = alternatives.length
          ? `Shoot, that time is not available anymore. I can do ${alternatives.join(", or ")}. Which one works best?`
          : "Shoot, that time is not available anymore, and I am not seeing another opening right now. The team will call you back to find a time that works.";
        done = false;
        await prisma.message.create({
          data: { leadId: lead.id, direction: "outbound", channel: "voice", body: aiReply }
        });
        await prisma.lead.update({ where: { id: lead.id }, data: { lastMessage: aiReply, status: "qualified" } });
      }
    } else if (bookedSlotIndex != null) {
      const alternatives = (voiceSlots || []).slice(0, 3).map((slot) =>
        new Date(slot.startAt).toLocaleString("en-US", {
          timeZone: process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis",
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true
        })
      );
      aiReply = alternatives.length
        ? `That time is not available. I can do ${alternatives.join(", or ")}. Which one works best?`
        : "That time is not available, and I am not seeing another opening right now. The team will call you back to find a time that works.";
      done = false;
      await prisma.message.create({
        data: { leadId: lead.id, direction: "outbound", channel: "voice", body: aiReply }
      });
      await prisma.lead.update({ where: { id: lead.id }, data: { lastMessage: aiReply, status: "qualified" } });
    }

    if (done) {
      try {
        const [finalMessages, finalLead] = await Promise.all([
          prisma.message.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } }),
          prisma.lead.findUnique({ where: { id: lead.id } })
        ]);
        const summary = await runAiLeadAgent({ business, lead: finalLead, messages: finalMessages });
        const finalStatus = finalLead.status === "appointment_booked" ? "appointment_booked" : "qualified";
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: finalStatus, priority: summary.leadPriority, aiSummary: summary.contractorSummary, ...summary.extractedFields }
        });
        notifyContractor({ business, lead: { ...finalLead, status: finalStatus }, summary: summary.contractorSummary })
          .catch((e) => console.error("Notify failed:", e.message));
      } catch (err) {
        console.error("[voice-gather] Summary error:", err.message);
        await prisma.lead.update({ where: { id: lead.id }, data: { status: "qualified" } });
      }
      const doneTtsId = await generateTtsAudio(aiReply).catch(() => null);
      const doneXml = doneTtsId
        ? `<Play>${esc(ttsPlayUrl(doneTtsId))}</Play>`
        : `<Say voice="Google.en-US-Neural2-F">${esc(aiReply)}</Say>`;
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${doneXml}
  <Hangup/>
</Response>`);
    }

    const [replyTtsId, noInputTtsId] = await Promise.all([
      generateTtsAudio(aiReply).catch(() => null),
      generateTtsAudio("Sorry, I didn't catch that. Feel free to call us back anytime.").catch(() => null)
    ]);
    const replyXml = replyTtsId
      ? `<Play>${esc(ttsPlayUrl(replyTtsId))}</Play>`
      : `<Say voice="Google.en-US-Neural2-F">${esc(aiReply)}</Say>`;
    const noInputXml = noInputTtsId
      ? `<Play>${esc(ttsPlayUrl(noInputTtsId))}</Play>`
      : `<Say voice="Google.en-US-Neural2-F">Sorry, I didn't catch that. Feel free to call us back anytime.</Say>`;
    const gatherUrl = `/webhooks/twilio/voice-gather?leadId=${lead.id}&amp;businessId=${business.id}`;
    return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${gatherUrl}" method="POST" speechTimeout="auto" timeout="10" language="en-US" enhanced="true">
    ${replyXml}
  </Gather>
  ${noInputXml}
</Response>`);
  })
);

// Fires when the owner picks up a click-to-call — bridges them to the customer.
// The customer's caller ID shows the Twilio number (from= param).
router.post(
  "/twilio/outbound-connect",
  asyncHandler(async (req, res) => {
    const { to, from, leadId } = req.query;
    if (!to || !from) {
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-F">Sorry, we could not connect your call. Please try again.</Say>
  <Hangup/>
</Response>`);
    }

    // Update lead so team knows a call is in progress
    if (leadId) {
      await prisma.lead.update({ where: { id: leadId }, data: { lastMessage: "[Outbound call in progress]" } }).catch(() => {});
    }

    return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-F">Connecting you now.</Say>
  <Dial callerId="${esc(from)}" timeout="30">
    <Number>${esc(to)}</Number>
  </Dial>
</Response>`);
  })
);

// Watch Mode: fired by Twilio when a dual-channel recording is ready.
// Transcribes the call with Whisper, runs AI analysis, updates the lead.
router.post(
  "/twilio/recording-complete",
  asyncHandler(async (req, res) => {
    res.sendStatus(200); // respond immediately so Twilio doesn't retry

    const { leadId, businessId } = req.query;
    const recordingUrl = req.body.RecordingUrl;
    const status = req.body.RecordingStatus;

    if (status !== "completed" || !recordingUrl || !leadId || !businessId) return;
    if (!process.env.OPENAI_API_KEY) return;

    try {
      const [lead, business] = await Promise.all([
        prisma.lead.findUnique({ where: { id: leadId } }),
        prisma.business.findUnique({ where: { id: businessId }, include: { serviceTypes: true } })
      ]);
      if (!lead || !business) return;

      // Fetch recording audio from Twilio (requires Basic Auth)
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const audioRes = await fetch(`${recordingUrl}.mp3`, { headers: { Authorization: `Basic ${auth}` } });
      if (!audioRes.ok) { console.error("[watch] Could not fetch recording:", audioRes.status); return; }
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

      // Transcribe with OpenAI Whisper
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const audioFile = new File([audioBuffer], "call.mp3", { type: "audio/mpeg" });
      const transcription = await openai.audio.transcriptions.create({ file: audioFile, model: "whisper-1" });
      const transcript = transcription.text;

      if (!transcript?.trim()) return;

      // Save transcript as a message
      await prisma.message.create({
        data: { leadId, direction: "inbound", channel: "voice", body: `[Call transcript — Watch Mode]\n\n${transcript}` }
      });

      // AI analysis to extract lead fields + detect appointment
      const slots = await getAvailableSlots(businessId);
      const analysis = await analyzeCallTranscript({ business, lead, transcript, availableSlots: slots });
      if (!analysis) return;

      const update = {};
      if (analysis.customerName && !lead.customerName) update.customerName = analysis.customerName;
      if (analysis.jobType && !lead.jobType) update.jobType = analysis.jobType;
      if (analysis.issueDescription && !lead.issueDescription) update.issueDescription = analysis.issueDescription;
      if (analysis.urgency && !lead.urgency) update.urgency = analysis.urgency;
      if (analysis.address && !lead.address) update.address = analysis.address;
      if (analysis.zipCode && !lead.zipCode) update.zipCode = analysis.zipCode;
      if (analysis.contractorSummary) update.aiSummary = analysis.contractorSummary;
      if (analysis.leadPriority) update.priority = analysis.leadPriority;
      update.status = "qualified";

      await prisma.lead.update({ where: { id: leadId }, data: update });

      // Auto-book appointment if the call analysis matched a slot
      if (analysis.appointmentSlotIndex != null && slots[analysis.appointmentSlotIndex]) {
        const slot = slots[analysis.appointmentSlotIndex];
        const existing = await prisma.appointment.findFirst({ where: { leadId, status: "booked" } });
        if (!existing) {
          const apt = await bookAppointment({ businessId, leadId, startAt: slot.startAt, notes: "Auto-booked from Watch Mode call recording." });
          console.log(`[watch] Appointment booked from recorded call for lead ${leadId}`);
          const aptTz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
          const aptTimeStr = new Date(apt.startAt).toLocaleString("en-US", { timeZone: aptTz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
          const confirmMsg = `Your appointment with ${business.name} is confirmed for ${aptTimeStr}. See you then!`;
          const twilioNum = business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;
          const sent = await sendSms({ to: lead.customerPhone, from: twilioNum, body: confirmMsg }).catch(() => null);
          if (sent) {
            await prisma.message.create({ data: { leadId, direction: "outbound", channel: "sms", body: confirmMsg, twilioSid: sent?.sid } });
          }
        }
      }

      console.log(`[watch] Recording analyzed for lead ${leadId}`);
    } catch (err) {
      console.error("[watch] Recording processing error:", err.message);
    }
  })
);

router.post(
  "/twilio/call-status",
  asyncHandler(async (req, res) => {
    const business = await findBusinessByTwilioNumber(req.body.To);
    await saveWebhook({ businessId: business.id, eventType: "call-status", payload: req.body });
    res.type("text/xml").send("<Response></Response>");
  })
);

export default router;
