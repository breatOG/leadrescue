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
        include: { serviceTypes: true }
      }))) ||
    (await prisma.business.findFirst({ include: { serviceTypes: true } }));

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
    const business = await findBusinessByTwilioNumber(req.body.To);
    await saveWebhook({ businessId: business.id, eventType: "sms", payload: req.body });

    let lead = await findOrCreateLead({ business, from: req.body.From, source: "sms" });
    const inboundBody = String(req.body.Body || "").trim();

    await prisma.message.create({
      data: { leadId: lead.id, direction: "inbound", channel: "sms", body: inboundBody, twilioSid: req.body.MessageSid }
    });
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: { lastMessage: inboundBody, status: lead.status === "new" ? "texting" : lead.status }
    });

    const bookedResponse = await handleAppointmentChoice({ business, lead, body: inboundBody });
    if (bookedResponse) return res.type("text/xml").send("<Response></Response>");

    const messages = await prisma.message.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } });
    const aiResult = await runAiLeadAgent({ business, lead, messages });
    const result = await sendSms({
      to: lead.customerPhone,
      from: business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER,
      body: aiResult.nextMessageToCustomer
    });

    await prisma.message.create({
      data: {
        leadId: lead.id,
        direction: "outbound",
        channel: "sms",
        body: aiResult.nextMessageToCustomer,
        twilioSid: result.sid
      }
    });

    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        ...aiResult.extractedFields,
        priority: aiResult.leadPriority,
        status: aiResult.leadStatus,
        aiSummary: aiResult.contractorSummary,
        lastMessage: aiResult.nextMessageToCustomer
      }
    });

    if (["emergency", "high"].includes(updatedLead.priority) || updatedLead.status === "qualified") {
      await notifyContractor({ business, lead: updatedLead, summary: aiResult.contractorSummary });
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

router.post(
  "/twilio/voice",
  asyncHandler(async (req, res) => {
    const business = await findBusinessByTwilioNumber(req.body.To);
    await saveWebhook({ businessId: business.id, eventType: "voice", payload: req.body });

    const lead = await findOrCreateLead({ business, from: req.body.From, source: "missed_call" });
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
