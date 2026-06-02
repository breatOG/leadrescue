import express from "express";
import asyncHandler from "express-async-handler";
import crypto from "crypto";
import OpenAI from "openai";
import { prisma } from "../prisma/client.js";
import { runAiLeadAgent, runVoiceAiTurn } from "../services/aiLeadAgent.js";
import { bookAppointment, getAvailableSlots } from "../services/schedulingService.js";
import { notifyContractor } from "../services/notificationService.js";
import { sendSms } from "../services/twilioService.js";
import { aiVoiceEnabled, createAiVoiceTwiML } from "../services/realtimeVoiceService.js";
import { PLAN_LIMITS } from "./paymentRoutes.js";

// In-memory TTS audio cache: id -> { buffer, createdAt }
const ttsCache = new Map();
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, entry] of ttsCache) {
    if (entry.createdAt < cutoff) ttsCache.delete(id);
  }
}, 60_000).unref();

async function generateTtsAudio(text) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input: text,
    response_format: "mp3"
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const id = crypto.randomUUID();
  ttsCache.set(id, { buffer, createdAt: Date.now() });
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

  const appointment = await bookAppointment({
    businessId: business.id,
    leadId: lead.id,
    startAt: selected.startAt,
    notes: "Booked from SMS appointment choice."
  });

  const responseBody = `You're booked for ${new Date(appointment.startAt).toLocaleString()}. The team has your details and will follow up if anything else is needed.`;
  const result = await sendSms({
    to: lead.customerPhone,
    from: business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER,
    body: responseBody
  });

  await prisma.message.create({
    data: { leadId: lead.id, direction: "outbound", channel: "sms", body: responseBody, twilioSid: result.sid }
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
    const fromPhone = business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;

    if (!lead) {
      try {
        await sendSms({
          to: req.body.From,
          from: fromPhone,
          body: `Thanks for reaching out to ${business.name}! We're currently at capacity for new inquiries this month. Please call us directly or reach out again next month.`
        });
      } catch (err) {
        console.error("[sms] Failed to send capacity reply:", err.message);
      }
      return res.type("text/xml").send("<Response></Response>");
    }

    const inboundBody = String(req.body.Body || "").trim();

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
        const aiResult = await runAiLeadAgent({ business, lead, messages });

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
      const result = await sendSms({ to: lead.customerPhone, from: fromPhone, body: replyBody });
      await prisma.message.create({
        data: { leadId: lead.id, direction: "outbound", channel: "sms", body: replyBody, twilioSid: result.sid }
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
    ttsCache.delete(req.params.id);
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

  const [initMessages, slots] = await Promise.all([
    prisma.message.findMany({ where: { leadId: updatedLead.id }, orderBy: { createdAt: "asc" } }),
    getAvailableSlots(business.id)
  ]);
  const { text: greeting, extracted } = await runVoiceAiTurn({ business, lead: updatedLead, messages: initMessages, slots });
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
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-F">Thanks for calling ${esc(business.name)}. Connecting you now.</Say>
  <Dial timeout="${ringSeconds}" answerOnBridge="true" action="/webhooks/twilio/after-dial?${q}" method="POST">
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

    let aiReply, done, extracted;
    try {
      const [messages, slots] = await Promise.all([
        prisma.message.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } }),
        getAvailableSlots(business.id)
      ]);
      ({ text: aiReply, done, extracted } = await runVoiceAiTurn({ business, lead, messages, slots }));
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

    if (done) {
      try {
        const [finalMessages, finalLead] = await Promise.all([
          prisma.message.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } }),
          prisma.lead.findUnique({ where: { id: lead.id } })
        ]);
        const summary = await runAiLeadAgent({ business, lead: finalLead, messages: finalMessages });
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: "qualified", priority: summary.leadPriority, aiSummary: summary.contractorSummary, ...summary.extractedFields }
        });
        notifyContractor({ business, lead: { ...finalLead, status: "qualified" }, summary: summary.contractorSummary })
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

router.post(
  "/twilio/call-status",
  asyncHandler(async (req, res) => {
    const business = await findBusinessByTwilioNumber(req.body.To);
    await saveWebhook({ businessId: business.id, eventType: "call-status", payload: req.body });
    res.type("text/xml").send("<Response></Response>");
  })
);

export default router;
