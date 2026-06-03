import WebSocket from "ws";
import twilio from "twilio";
import { prisma } from "../prisma/client.js";
import { analyzeCallTranscript, runAiLeadAgent } from "./aiLeadAgent.js";
import { notifyContractor } from "./notificationService.js";
import { bookAppointment, getAvailableSlots } from "./schedulingService.js";
import { sendSms } from "./twilioService.js";

const DEFAULT_INSTRUCTIONS = `# Role
You are the front-desk receptionist for the contractor. You sound like a calm, friendly human office coordinator, not a bot.

# Goal
Qualify the caller and help them get scheduled. Collect only what is needed:
- name
- job type
- urgency
- address or ZIP code
- short issue description
- preferred appointment time
- whether photos are available
- If enough information is collected, schedule only from the exact open appointment slots listed in context.
- If the caller asks for a time that is not in the open slots, or is listed as unavailable/booked, say that time is not available and offer two or three different open slots.
- Do not say the team will finalize, confirm later, or reach out to confirm if you have open slots to offer.
- Do not tell the caller they are scheduled unless they clearly choose one of the listed open slots.
- If the caller already has an upcoming appointment, acknowledge it by service type and date/time, ask if they are calling to update details, reschedule, or add information. Do not re-qualify from scratch.
- If the caller is calling after a past appointment, ask how the appointment went and whether they need follow-up help, maintenance, or another visit. Do not say they have an upcoming appointment if the appointment date has passed.

# Style
- Sound warm, calm, casual, and human. Use natural phrases like "Got it", "No problem", "Let me make sure I have that right", and "Thanks".
- Keep each turn very short: usually one question at a time.
- Do not mention that you are an AI unless asked.
- Do not quote exact pricing.
- Do not diagnose dangerous issues.
- If the caller mentions gas leak, flooding, electrical sparks, fire, roof collapse, or immediate danger, tell them the team will be alerted and they should contact emergency services or the utility provider if there is immediate danger.
- Stay focused on booking the job.
- Do not invent caller answers. If you did not clearly hear the caller, ask them to repeat.
- Never treat a name, address, ZIP, service type, urgency, or appointment preference as collected unless the caller clearly and explicitly says it.
- If you asked for the caller's name and did not clearly hear a name, ask for the name again instead of moving to the next question.
- Do not continue talking to yourself. Ask one short question, then stop speaking and wait for the caller.
- If there is silence or background noise, wait. Do not answer for the caller.
- If the audio is unclear, say something natural like: "Sorry, I didn't quite catch that. Could you say that one more time?"
- Ignore non-speech sounds such as TV, music, car noise, rustling, beeps, or voices far away from the phone.
- In your first response to the caller, include the business name.
- When you have collected all the key details, give a brief recap and move toward one of the listed open appointment slots.
- After the recap, ask if there is anything else you can help with and wait for the caller's response. Never assume the conversation is over.
- If the caller wants to discuss specific times or scheduling details, stay fully engaged — do not rush to close.
- Only end the call when the caller explicitly signals they are done — phrases like "that's all", "thanks, bye", "sounds good, goodbye", "I'm good", or "have a good one". Do not end the call if they are still asking questions or discussing details.
- When the caller is clearly done: say a warm, brief goodbye out loud (e.g. "Perfect, we've got everything we need. We'll be in touch soon — have a great day!"), then immediately call the end_call function. Do not call end_call before finishing your goodbye speech.`;

function getPublicWsUrl(req) {
  let base = process.env.APP_BASE_URL;
  if (base) {
    if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
    return base.replace(/^https/i, "wss").replace(/^http/i, "ws");
  }
  const proto = (req.headers["x-forwarded-proto"] || req.protocol).split(",")[0].trim();
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`.replace(/^http/i, "ws");
}

export function aiVoiceEnabled() {
  return process.env.ENABLE_AI_VOICE === "true" && Boolean(process.env.OPENAI_API_KEY);
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function createAiVoiceTwiML(req, { businessName, leadId, businessId, customerPhone } = {}) {
  const streamUrl = `${getPublicWsUrl(req)}/webhooks/twilio/voice-stream`;
  console.log(`[voice-ai] TwiML stream URL: ${streamUrl}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="businessName" value="${escapeXml(businessName || "LeadRescue")}" />
      <Parameter name="businessId" value="${escapeXml(businessId || "")}" />
      <Parameter name="leadId" value="${escapeXml(leadId || "")}" />
      <Parameter name="customerPhone" value="${escapeXml(customerPhone || "")}" />
    </Stream>
  </Connect>
</Response>`;
}

// Encode a 16-bit linear PCM sample to µ-law
function encodeMulaw(sample) {
  const BIAS = 0x84;
  const CLIP = 32635;
  let s = Math.max(-CLIP, Math.min(CLIP, sample));
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  s += BIAS;
  let exp = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exp > 0; exp--, mask >>= 1) {}
  const mantissa = (s >> (exp + 3)) & 0x0f;
  return (~(sign | (exp << 4) | mantissa)) & 0xff;
}

// Convert base64 PCM16-LE 24kHz chunk to base64 µ-law 8kHz, with carry buffer for partial frames
function makePcmConverter() {
  let remainder = Buffer.alloc(0);
  return function convert(base64Chunk) {
    const chunk = Buffer.from(base64Chunk, "base64");
    const buf = Buffer.concat([remainder, chunk]);
    const bytesPerOut = 6; // 3 input samples × 2 bytes each (downsample 24k→8k)
    const outCount = Math.floor(buf.length / bytesPerOut);
    remainder = buf.subarray(outCount * bytesPerOut);
    if (outCount === 0) return null;
    const out = Buffer.alloc(outCount);
    for (let i = 0; i < outCount; i++) {
      out[i] = encodeMulaw(buf.readInt16LE(i * bytesPerOut));
    }
    return out.toString("base64");
  };
}

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getAudioDelta(event) {
  if (typeof event.delta === "string") return event.delta;
  if (typeof event.audio?.delta === "string") return event.audio.delta;
  if (typeof event.output_audio?.delta === "string") return event.output_audio.delta;
  return null;
}

function isAudioDeltaEvent(event) {
  return (
    event.type === "response.audio.delta" ||
    event.type === "response.output_audio.delta" ||
    event.type === "response.audio_delta" ||
    event.type === "response.output_audio_delta"
  );
}

async function buildCallerMemory({ leadId, businessId }) {
  if (!leadId || !businessId) return "";

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { messages: { orderBy: { createdAt: "asc" } }, appointments: { orderBy: { startAt: "asc" } } }
  });
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { serviceTypes: true, availability: true }
  });
  const [openSlots, bookedBusinessAppointments] = await Promise.all([
    getAvailableSlots(businessId).catch(() => []),
    prisma.appointment.findMany({
      where: { businessId, status: "booked", startAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      take: 12
    }).catch(() => [])
  ]);

  if (!lead || !business) return "";

  const knownFields = [
    lead.customerName && `Name: ${lead.customerName}`,
    lead.jobType && `Job type: ${lead.jobType}`,
    lead.urgency && `Urgency: ${lead.urgency}`,
    lead.address && `Address: ${lead.address}`,
    lead.zipCode && `ZIP: ${lead.zipCode}`,
    lead.issueDescription && `Issue: ${lead.issueDescription}`,
    lead.preferredAppointmentTime && `Preferred appointment: ${lead.preferredAppointmentTime}`,
    lead.photosAvailable !== null && lead.photosAvailable !== undefined && `Photos available: ${lead.photosAvailable ? "yes" : "no"}`,
    lead.aiSummary && `Previous summary: ${lead.aiSummary}`
  ].filter(Boolean);

  const recentMessages = lead.messages
    .slice(-10)
    .map((message) => `${message.channel} ${message.direction}: ${message.body}`)
    .join("\n");

  const currentTime = new Date();
  const bookedAppointments = lead.appointments.filter((appointment) => appointment.status === "booked");
  const upcomingAppointments = bookedAppointments
    .filter((appointment) => appointment.startAt >= currentTime)
    .sort((a, b) => a.startAt - b.startAt);
  const pastAppointments = bookedAppointments
    .filter((appointment) => appointment.startAt < currentTime)
    .sort((a, b) => b.startAt - a.startAt);
  const nextAppointment = upcomingAppointments[0];
  const lastAppointment = pastAppointments[0];
  let eventGuidance = "No appointment is currently booked. Continue qualifying the service request and guide toward scheduling.";

  if (nextAppointment) {
    eventGuidance = `The caller has an upcoming ${lead.jobType || business.industryType} appointment on ${new Date(nextAppointment.startAt).toLocaleString()}. Greet them with awareness of the appointment. A natural version is: "I see you have an upcoming ${lead.jobType || "service"} appointment with ${business.name}. Are you calling to update details, reschedule, or add anything before the visit?"`;
  } else if (lastAppointment) {
    eventGuidance = `The caller's most recent ${lead.jobType || business.industryType} appointment was on ${new Date(lastAppointment.startAt).toLocaleString()}. Greet them as a follow-up caller. A natural version is: "I see you recently had your ${lead.jobType || "service"} appointment with ${business.name}. How did everything go, and do you need any follow-up help?"`;
  }

  const appointments = bookedAppointments
    .map((appointment) => {
      const timing = appointment.startAt >= currentTime ? "Upcoming" : "Past";
      return `${timing} appointment: ${new Date(appointment.startAt).toLocaleString()} (${appointment.status})`;
    })
    .join("\n");
  const tz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
  const openSlotText = openSlots.slice(0, 8)
    .map((slot, index) => `${index + 1}. ${new Date(slot.startAt).toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    })}`)
    .join("\n");
  const unavailableText = bookedBusinessAppointments
    .map((appointment) => new Date(appointment.startAt).toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }))
    .join("\n");

  return `# Business Context
Business name: ${business.name}
Industry: ${business.industryType}
Service areas: ${business.serviceAreas.join(", ") || "not listed"}
Service types: ${business.serviceTypes.map((type) => type.name).join(", ") || "not listed"}

# Returning Caller Memory
This caller may have contacted the business before. Use the known information below. Do not ask for details that are already known unless you need to confirm they are still accurate.
${knownFields.join("\n") || "No lead details collected yet."}

# Event Guidance
${eventGuidance}

# Recent Conversation History
${recentMessages || "No previous messages."}

# Scheduling
Open appointment slots you may offer:
${openSlotText || "No open slots are currently available."}

Unavailable/booked appointment times:
${unavailableText || "No upcoming booked appointments found."}

Scheduling rule: You may only offer and accept the exact open appointment slots above. If the caller requests a time not listed as open, tell them that time is not available and offer different open slots. Never say the team will finalize or confirm a requested time that is not open.

# Appointment History
${appointments || "No appointment booked yet."}`;
}

function updateRealtimeSession(openAiWs, callerMemory = "") {
  if (openAiWs.readyState !== WebSocket.OPEN) return;

  const voice = process.env.OPENAI_REALTIME_VOICE || "shimmer";

  sendJson(openAiWs, {
    type: "session.update",
    session: {
      type: "realtime",
      output_modalities: ["audio"],
      instructions: `${DEFAULT_INSTRUCTIONS}\n\n${callerMemory}`,
      tools: [
        {
          type: "function",
          name: "end_call",
          description: "Hang up the phone call. Only call this AFTER you have spoken your goodbye out loud and the caller has clearly indicated they are done.",
          parameters: { type: "object", properties: {}, required: [] }
        }
      ],
      tool_choice: "auto",
      audio: {
        input: {
          format: { type: "audio/pcmu" },
          turn_detection: { type: "semantic_vad" },
          transcription: { model: "gpt-realtime-whisper" }
        },
        output: {
          format: { type: "audio/pcm", rate: 24000 },
          voice
        }
      }
    }
  });
}

function addCallContext(openAiWs, { businessName }) {
  sendJson(openAiWs, {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: `The phone call has just connected. Greet the caller warmly, mention ${businessName}, and ask how you can help. Keep it brief.`
        }
      ]
    }
  });
  sendJson(openAiWs, { type: "response.create" });
}

function appendTranscriptLine(transcript, speaker, text) {
  const body = String(text || "").trim();
  if (!body) return;
  transcript.push({ speaker, body, at: new Date() });
  console.log(`[voice-ai] transcript ${speaker}: ${body}`);
}

function callerClearlyEnded(text) {
  return /\b(that'?s all|that is all|i'?m good|im good|no thanks|no thank you|nothing else|that'?s it|sounds good|thank you bye|thanks bye|bye|goodbye|have a good one|have a great day)\b/i.test(String(text || ""));
}

function assistantSaidGoodbye(text) {
  return /\b(goodbye|bye|have a great day|have a good day|have a good one|we'?ll be in touch|thanks for calling)\b/i.test(String(text || ""));
}

function getTwilioRestClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return twilio(accountSid, authToken);
}

function voiceMemoryEnabled() {
  return process.env.ENABLE_VOICE_MEMORY === "true";
}

function decodeMuLawByte(muLawByte) {
  const MULAW_BIAS = 0x84;
  let value = ~muLawByte & 0xff;
  const sign = value & 0x80;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
  sample -= MULAW_BIAS;
  return sign ? -sample : sample;
}

function getPcmuRms(payload) {
  const buffer = Buffer.from(payload, "base64");
  if (!buffer.length) return 0;

  let sumSquares = 0;
  for (const byte of buffer) {
    const sample = decodeMuLawByte(byte) / 32768;
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / buffer.length);
}

async function saveVoiceCall({ leadId, businessId, transcript }) {
  if (!leadId || !transcript.length) return;

  for (const line of transcript) {
    await prisma.message.create({
      data: {
        leadId,
        direction: line.speaker === "caller" ? "inbound" : "outbound",
        channel: "voice",
        body: line.body
      }
    });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { serviceTypes: true, availability: true }
  });

  if (!lead || !business) return;

  const messages = await prisma.message.findMany({ where: { leadId }, orderBy: { createdAt: "asc" } });
  const aiResult = await runAiLeadAgent({ business, lead, messages });

  const updatedLead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      ...aiResult.extractedFields,
      priority: aiResult.leadPriority,
      status: "qualified",
      aiSummary: aiResult.contractorSummary,
      lastMessage: transcript[transcript.length - 1]?.body || lead.lastMessage
    }
  });

  let notificationSummary = aiResult.contractorSummary;
  const transcriptText = transcript.map((line) => `${line.speaker}: ${line.body}`).join("\n");

  try {
    const slots = await getAvailableSlots(businessId);
    const analysis = await analyzeCallTranscript({ business, lead: updatedLead, transcript: transcriptText, availableSlots: slots });
    const slot = analysis?.appointmentSlotIndex != null ? slots[analysis.appointmentSlotIndex] : null;

    if (slot) {
      const existing = await prisma.appointment.findFirst({ where: { leadId, status: "booked" } });

      if (!existing) {
        const appointment = await bookAppointment({
          businessId,
          leadId,
          startAt: slot.startAt,
          notes: "Auto-booked from realtime voice call."
        });
        const aptTz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
        const aptTimeStr = new Date(appointment.startAt).toLocaleString("en-US", {
          timeZone: aptTz,
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true
        });
        const confirmMsg = `Your appointment with ${business.name} is confirmed for ${aptTimeStr}. See you then!`;
        const sent = await sendSms({
          to: updatedLead.customerPhone,
          from: business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER,
          body: confirmMsg
        }).catch(() => null);
        if (sent) {
          await prisma.message.create({
            data: { leadId, direction: "outbound", channel: "sms", body: confirmMsg, twilioSid: sent?.sid }
          });
        }
        notificationSummary = `Appointment booked for ${aptTimeStr}. ${analysis.contractorSummary || notificationSummary || ""}`.trim();
        console.log(`[voice-ai] Appointment booked from realtime call for lead ${leadId}`);
      }
    }
  } catch (error) {
    console.error("[voice-ai] Appointment analysis failed:", error.message);
  }

  const notifyLead = await prisma.lead.findUnique({ where: { id: leadId } });
  notifyContractor({ business, lead: notifyLead || updatedLead, summary: notificationSummary })
    .catch((e) => console.error("[voice-ai] Notify failed:", e.message));
}

export function handleTwilioVoiceStream(twilioWs) {
  if (!process.env.OPENAI_API_KEY) {
    twilioWs.close(1011, "Missing OpenAI API key");
    return;
  }

  const convertPcmToMulaw = makePcmConverter();
  let aiSpeaking = false;
  let callerAudioAllowedAt = 0;
  let streamSid = null;
  let callSid = null;
  let sessionReady = false;
  let leadId = null;
  let businessId = null;
  let businessName = "the business";
  let callerMemory = "";
  let currentAssistantTranscript = "";
  const seenEventTypes = new Set();
  const transcript = [];
  let saved = false;
  let twilioStartReceived = false;
  let openAiConnected = false;
  let sessionInitialized = false;
  let callerAskedToEnd = false;
  let goodbyePromptSent = false;
  let goodbyeSpoken = false;
  let endCallRequested = false;
  let endCallTimer = null;

  function maybeInitSession() {
    if (!twilioStartReceived || !openAiConnected || sessionInitialized) return;
    sessionInitialized = true;
    updateRealtimeSession(openAiWs, callerMemory);
    addCallContext(openAiWs, { businessName });
  }

  async function completeCall(reason = "requested") {
    if (endCallRequested) return;
    endCallRequested = true;
    if (endCallTimer) clearTimeout(endCallTimer);
    console.log(`[voice-ai] Ending call reason=${reason} callSid=${callSid || "(unknown)"}`);

    const client = getTwilioRestClient();
    if (client && callSid) {
      try {
        await client.calls(callSid).update({ status: "completed" });
      } catch (error) {
        console.error("[voice-ai] Twilio call completion failed:", error.message);
      }
    }

    if (twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.close();
    }
  }

  function requestModelGoodbye() {
    if (!callerAskedToEnd || goodbyePromptSent || endCallRequested || openAiWs.readyState !== WebSocket.OPEN) return;
    goodbyePromptSent = true;
    sendJson(openAiWs, {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "The caller clearly indicated they are done. Say one brief warm goodbye now, then call the end_call function immediately."
          }
        ]
      }
    });
    sendJson(openAiWs, { type: "response.create" });
  }

  function scheduleEndCall(reason = "model_end_call") {
    if (endCallRequested) return;
    if (endCallTimer) clearTimeout(endCallTimer);
    endCallTimer = setTimeout(() => completeCall(reason), aiSpeaking ? 2500 : 800);
  }
  const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";
  const openAiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    }
  });

  openAiWs.on("open", () => {
    console.log("[voice-ai] Connected to OpenAI Realtime.");
    openAiConnected = true;
    maybeInitSession();
  });

  openAiWs.on("message", (raw) => {
    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (event.type === "session.updated" && !sessionReady) {
      sessionReady = true;
      console.log("[voice-ai] OpenAI session updated. Waiting for caller speech.");
    }

    if (event.type && !seenEventTypes.has(event.type) && seenEventTypes.size < 25) {
      seenEventTypes.add(event.type);
      console.log(`[voice-ai] OpenAI event type: ${event.type}`);
    }

    if (event.type === "session.created") {
      console.log("[voice-ai] OpenAI session created.");
    }

    if (event.type === "input_audio_buffer.speech_started" && streamSid) {
      console.log("[voice-ai] Caller speech detected.");
    }

    if (event.type === "input_audio_buffer.speech_stopped" && streamSid) {
      console.log("[voice-ai] Caller speech stopped.");
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      appendTranscriptLine(transcript, "caller", event.transcript);
      if (callerClearlyEnded(event.transcript)) {
        callerAskedToEnd = true;
        requestModelGoodbye();
      }
    }

    if (event.type === "response.audio_transcript.delta" || event.type === "response.output_audio_transcript.delta") {
      currentAssistantTranscript += event.delta || "";
    }

    if (event.type === "response.audio_transcript.done" || event.type === "response.output_audio_transcript.done") {
      const finalText = event.transcript || currentAssistantTranscript;
      appendTranscriptLine(transcript, "assistant", finalText);
      currentAssistantTranscript = "";
      if (callerAskedToEnd && assistantSaidGoodbye(finalText)) {
        goodbyeSpoken = true;
        scheduleEndCall("goodbye_detected");
      }
    }

    if (isAudioDeltaEvent(event) && streamSid) {
      const delta = getAudioDelta(event);
      if (delta) {
        aiSpeaking = true;
        const mulaw = convertPcmToMulaw(delta);
        if (mulaw) {
          sendJson(twilioWs, {
            event: "media",
            streamSid,
            media: { payload: mulaw }
          });
        }
      }
    }

    if (event.type === "response.output_audio.done") {
      aiSpeaking = false;
      // Give 1.5s for audio to finish playing on caller's phone before re-opening mic
      callerAudioAllowedAt = Date.now() + 1500;
      if (goodbyeSpoken || endCallTimer) {
        scheduleEndCall("audio_done_after_goodbye");
      }
    }

    const outputFunctionName = event.response?.output?.find?.((item) => item?.name)?.name;
    const functionName = event.item?.name || event.name || outputFunctionName;
    const isEndCall =
      functionName === "end_call" ||
      (event.type?.includes("function_call") && event.name === "end_call") ||
      (event.type === "response.output_item.done" && event.item?.type === "function_call" && event.item?.name === "end_call");

    if (isEndCall) {
      console.log("[voice-ai] AI called end_call.");
      scheduleEndCall("model_end_call");
    }

    if (event.type === "error") {
      console.error("[voice-ai] OpenAI Realtime error:", JSON.stringify(event.error || event));
    }
  });

  openAiWs.on("error", (error) => {
    console.error("[voice-ai] OpenAI WebSocket error:", error.message, error.code || "");
  });

  openAiWs.on("close", (code, reason) => {
    const reasonStr = Buffer.isBuffer(reason) ? reason.toString() : String(reason || "");
    console.error(`[voice-ai] OpenAI WebSocket closed — code=${code} reason=${reasonStr || "(none)"}`);
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
  });

  twilioWs.on("message", (raw) => {
    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (event.event === "start") {
      streamSid = event.start?.streamSid || event.streamSid;
      callSid = event.start?.callSid || event.callSid || callSid;
      leadId = event.start?.customParameters?.leadId || null;
      businessId = event.start?.customParameters?.businessId || null;
      businessName = event.start?.customParameters?.businessName || businessName;
      console.log(`[voice-ai] Twilio stream started streamSid=${streamSid}`);
      if (!voiceMemoryEnabled()) {
        console.log("[voice-ai] Voice memory disabled; still loading scheduling context.");
      }
      buildCallerMemory({ leadId, businessId })
        .then((memory) => {
          callerMemory = memory;
          twilioStartReceived = true;
          maybeInitSession();
        })
        .catch((error) => {
          console.error("[voice-ai] Failed to build caller scheduling context:", error.message);
          twilioStartReceived = true;
          maybeInitSession();
        });
      if (!leadId || !businessId) {
        twilioStartReceived = true;
        maybeInitSession();
      }
      return;
    }

    if (event.event === "media" && event.media?.payload) {
      if (!aiSpeaking && Date.now() >= callerAudioAllowedAt && openAiWs.readyState === WebSocket.OPEN) {
        sendJson(openAiWs, {
          type: "input_audio_buffer.append",
          audio: event.media.payload
        });
      }
      return;
    }

    if (event.event === "stop") {
      console.log("[voice-ai] Twilio stream stopped.");
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
    }
  });

  twilioWs.on("close", async () => {
    if (openAiWs.readyState === WebSocket.OPEN || openAiWs.readyState === WebSocket.CONNECTING) {
      openAiWs.close();
    }
    if (!saved) {
      saved = true;
      try {
        await saveVoiceCall({ leadId, businessId, transcript });
        console.log(`[voice-ai] Saved voice transcript lines=${transcript.length} leadId=${leadId}`);
      } catch (error) {
        console.error("[voice-ai] Failed to save voice transcript:", error.message);
      }
    }
  });
}
