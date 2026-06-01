import express from "express";
import asyncHandler from "express-async-handler";
import { prisma } from "../prisma/client.js";
import { runAiLeadAgent } from "../services/aiLeadAgent.js";
import { bookAppointment, getAvailableSlots } from "../services/schedulingService.js";
import { notifyContractor } from "../services/notificationService.js";
import { sendSms } from "../services/twilioService.js";
import { createAiVoiceTwiML } from "../services/realtimeVoiceService.js";

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

    notifyContractor({
      business,
      lead: updatedLead,
      summary: "An AI voice call started and will be attached to this lead."
    }).catch((error) => console.error("Voice notification failed:", error.message));

    return res.type("text/xml").send(
      createAiVoiceTwiML(req, {
        businessName: business.name,
        businessId: business.id,
        leadId: updatedLead.id,
        customerPhone: updatedLead.customerPhone
      })
    );
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
