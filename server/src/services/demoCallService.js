import WebSocket from "ws";
import twilio from "twilio";
import crypto from "crypto";

// ─── Session store ─────────────────────────────────────────────────────────────
const sessions = new Map();

export function createSession({ contractorPhone, businessName }) {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    sessionId,
    contractorPhone,
    businessName: businessName?.trim() || "the business",
    conferenceName: `demo-${sessionId}`,
    conferenceSid: null,
    breatCallSid: null,
    contractorCallSid: null,
    status: "initiating",
    aiStartedAt: null,
    timeLimitTimer: null,
    baseUrl: null,
    createdAt: Date.now(),
  });
  return sessionId;
}

export function getSession(id) {
  return sessions.get(id) || null;
}

export function updateSession(id, updates) {
  const s = sessions.get(id);
  if (!s) return null;
  Object.assign(s, updates);
  return s;
}

function client() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// ─── Call lifecycle ────────────────────────────────────────────────────────────

export async function startDemoCall(sessionId, baseUrl) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("Session not found");
  updateSession(sessionId, { baseUrl });

  const ownerPhone = process.env.DEMO_CALLER_PHONE || "+18123141609";
  const twClient = client();

  const ownerCall = await twClient.calls.create({
    to: ownerPhone,
    from: process.env.TWILIO_PHONE_NUMBER,
    url: `${baseUrl}/webhooks/twilio/demo-owner-join?sessionId=${sessionId}`,
    statusCallback: `${baseUrl}/webhooks/twilio/demo-call-status?sessionId=${sessionId}&leg=owner`,
    statusCallbackEvent: ["answered", "completed"],
    statusCallbackMethod: "POST",
  });

  updateSession(sessionId, { breatCallSid: ownerCall.sid, status: "calling" });
}

export async function callContractor(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  const twClient = client();

  const contractorCall = await twClient.calls.create({
    to: s.contractorPhone,
    from: process.env.TWILIO_PHONE_NUMBER,
    url: `${s.baseUrl}/webhooks/twilio/demo-contractor-join?sessionId=${sessionId}`,
    statusCallback: `${s.baseUrl}/webhooks/twilio/demo-call-status?sessionId=${sessionId}&leg=contractor`,
    statusCallbackEvent: ["answered", "completed"],
    statusCallbackMethod: "POST",
  });

  updateSession(sessionId, { contractorCallSid: contractorCall.sid });
}

export async function handToAI(sessionId) {
  const s = sessions.get(sessionId);
  if (!s || s.status !== "connected") throw new Error("Call not ready for AI handoff");

  const twClient = client();

  // Put Breat on hold with music
  if (s.conferenceSid && s.breatCallSid) {
    await twClient.conferences(s.conferenceSid)
      .participants(s.breatCallSid)
      .update({
        hold: true,
        holdUrl: "https://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3",
        holdMethod: "GET",
      })
      .catch((e) => console.error("[demo] Hold Breat failed:", e.message));
  }

  // Redirect contractor's call to demo AI
  await twClient.calls(s.contractorCallSid).update({
    url: `${s.baseUrl}/webhooks/twilio/demo-ai-voice?sessionId=${sessionId}`,
    method: "POST",
  });

  const timeLimitTimer = setTimeout(() => {
    reconnect(sessionId).catch((e) => console.error("[demo] Auto-reconnect failed:", e.message));
  }, 4 * 60 * 1000);

  updateSession(sessionId, { status: "ai_active", aiStartedAt: Date.now(), timeLimitTimer });
}

export async function reconnect(sessionId) {
  const s = sessions.get(sessionId);
  if (!s || s.status === "ended" || s.status === "connected") return;

  if (s.timeLimitTimer) clearTimeout(s.timeLimitTimer);
  updateSession(sessionId, { status: "reconnecting" });

  const twClient = client();

  // Redirect contractor back into conference
  await twClient.calls(s.contractorCallSid)
    .update({
      url: `${s.baseUrl}/webhooks/twilio/demo-rejoin?sessionId=${sessionId}`,
      method: "POST",
    })
    .catch((e) => console.error("[demo] Rejoin redirect failed:", e.message));

  // Take Breat off hold
  if (s.conferenceSid && s.breatCallSid) {
    await twClient.conferences(s.conferenceSid)
      .participants(s.breatCallSid)
      .update({ hold: false })
      .catch((e) => console.error("[demo] Unhold Breat failed:", e.message));
  }

  updateSession(sessionId, { status: "connected" });
}

export async function endDemoCall(sessionId) {
  const s = sessions.get(sessionId);
  if (!s || s.status === "ended") return;
  if (s.timeLimitTimer) clearTimeout(s.timeLimitTimer);
  updateSession(sessionId, { status: "ended" });

  const twClient = client();
  for (const sid of [s.breatCallSid, s.contractorCallSid]) {
    if (sid) twClient.calls(sid).update({ status: "completed" }).catch(() => {});
  }

  setTimeout(() => sessions.delete(sessionId), 5 * 60 * 1000);
}

// ─── Demo AI WebSocket handler ─────────────────────────────────────────────────

const DEMO_INSTRUCTIONS = `You are Jamie, a professional AI receptionist. You answer incoming calls for a home services business, qualify the caller's service request, and get them scheduled.

Sound completely human — warm, confident, and natural. You are NOT a bot. You are a friendly office coordinator who genuinely wants to help.

STYLE:
- One short question at a time. Never ask two things at once.
- Each response: 1-3 sentences max.
- Natural phrases: "Got it", "Of course", "Sure thing", "Absolutely", "No problem at all", "Let me make sure I have that right."
- Never sound scripted. Be conversational.
- If you did not clearly hear something, ask them to repeat it.

WHAT TO COLLECT (naturally, through conversation):
1. What service they need help with
2. How urgent it is — emergency, this week, or flexible
3. Their address or ZIP code
4. A preferred appointment time

SCHEDULING:
Once you have the key info, offer two real-sounding time slots:
"We have an opening on Thursday at 10 AM or Friday at 2 PM — which works better for you?"
After they choose, confirm warmly: "Perfect, I've got you down for [day] at [time]. We'll send you a confirmation text shortly."

IF ASKED "ARE YOU AN AI?":
Say: "I am! Pretty natural-sounding, right? This is exactly what your customers would hear every time they call."

IF ASKED HOW THE SYSTEM WORKS:
Say: "I answer every missed call, qualify the lead, collect the job details, and book them right into the calendar — automatically. The team just shows up to confirmed jobs."

AFTER THE DEMO FLOW:
Once you have collected the key info and confirmed an appointment, give a warm closing:
"Perfect — I've got everything I need. We'll send over a confirmation text shortly. Is there anything else I can help you with?"

Then wait for their response. Stay engaged.

WHEN TO CALL end_call — STRICT RULES:
Only call end_call when ALL of the following are true:
1. You have fully completed the demo (collected service info AND confirmed an appointment time)
2. The caller has explicitly and clearly said they are done — phrases like "no that's all", "nope I'm good", "alright bye", "thanks goodbye", "sounds good, talk later", "perfect, thank you, bye"
3. You have spoken your goodbye out loud first — something like "Perfect, we'll see you then — have a great day!"

DO NOT call end_call if:
- The caller just said "thanks" or "great" as a filler mid-conversation
- The caller is still asking questions
- You haven't reached the appointment confirmation yet
- You are unsure whether they are truly done

Only call end_call when it is unmistakably clear the conversation has ended.`;

function encodeMulaw(sample) {
  const BIAS = 0x84, CLIP = 32635;
  let s = Math.max(-CLIP, Math.min(CLIP, sample));
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  s += BIAS;
  let exp = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exp > 0; exp--, mask >>= 1) {}
  const mantissa = (s >> (exp + 3)) & 0x0f;
  return (~(sign | (exp << 4) | mantissa)) & 0xff;
}

function makePcmConverter() {
  let remainder = Buffer.alloc(0);
  return function convert(base64Chunk) {
    const chunk = Buffer.from(base64Chunk, "base64");
    const buf = Buffer.concat([remainder, chunk]);
    const bytesPerOut = 6;
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
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
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

export function handleDemoVoiceStream(twilioWs) {
  if (!process.env.OPENAI_API_KEY) {
    twilioWs.close(1011, "Missing OpenAI API key");
    return;
  }

  const convertPcmToMulaw = makePcmConverter();
  let aiSpeaking = false;
  let callerAudioAllowedAt = 0;
  let streamSid = null;
  let sessionId = null;
  let businessName = "the business";
  let sessionInitialized = false;
  let twilioStartReceived = false;
  let openAiConnected = false;
  let endRequested = false;
  let endTimer = null;

  const model = process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";
  const openAiWs = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
  );

  function maybeInitSession() {
    if (!twilioStartReceived || !openAiConnected || sessionInitialized) return;
    sessionInitialized = true;

    const voice = process.env.OPENAI_REALTIME_VOICE || "shimmer";
    sendJson(openAiWs, {
      type: "session.update",
      session: {
        type: "realtime",
        output_modalities: ["audio"],
        instructions: `${DEMO_INSTRUCTIONS}\n\nBusiness name: ${businessName}`,
        tools: [
          {
            type: "function",
            name: "end_call",
            description: "Reconnect the business owner. Only call this after you have spoken your goodbye out loud AND the caller has explicitly said they are done.",
            parameters: { type: "object", properties: {}, required: [] },
          },
        ],
        tool_choice: "auto",
        audio: {
          input: {
            format: { type: "audio/pcmu" },
            turn_detection: { type: "semantic_vad" },
            transcription: { model: "gpt-realtime-whisper" },
          },
          output: { format: { type: "audio/pcm", rate: 24000 }, voice },
        },
      },
    });

    // Prompt AI to greet
    sendJson(openAiWs, {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `The phone just connected. Greet the caller warmly as the receptionist for ${businessName}. Say something like: "Thank you for calling ${businessName}, this is Jamie! How can I help you today?" Keep it natural and brief.`,
          },
        ],
      },
    });
    sendJson(openAiWs, { type: "response.create" });
  }

  async function finishDemo() {
    if (endRequested) return;
    endRequested = true;
    if (endTimer) clearTimeout(endTimer);
    console.log(`[demo-ai] AI demo ending, un-holding Breat sessionId=${sessionId}`);

    // Un-hold Breat first — contractor rejoins via TwiML fallback conference when stream closes
    const s = getSession(sessionId);
    if (s && s.conferenceSid && s.breatCallSid) {
      await client().conferences(s.conferenceSid)
        .participants(s.breatCallSid)
        .update({ hold: false })
        .catch((e) => console.error("[demo-ai] Un-hold Breat failed:", e.message));
      updateSession(sessionId, { status: "connected", timeLimitTimer: null });
    }

    // Close the stream — Twilio executes the fallback <Dial><Conference> automatically
    if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
  }

  openAiWs.on("open", () => {
    openAiConnected = true;
    maybeInitSession();
  });

  openAiWs.on("message", (raw) => {
    let event;
    try { event = JSON.parse(raw.toString()); } catch { return; }

    if (isAudioDeltaEvent(event) && streamSid) {
      const delta = getAudioDelta(event);
      if (delta) {
        aiSpeaking = true;
        const mulaw = convertPcmToMulaw(delta);
        if (mulaw) {
          sendJson(twilioWs, { event: "media", streamSid, media: { payload: mulaw } });
        }
      }
    }

    if (event.type === "response.output_audio.done") {
      aiSpeaking = false;
      callerAudioAllowedAt = Date.now() + 1500;
    }

    // Detect end_call — only fires when AI decides conversation is clearly done
    const fnName =
      event.item?.name ||
      event.name ||
      event.response?.output?.find?.((i) => i?.name)?.name;
    const isEndCall =
      fnName === "end_call" ||
      (event.type === "response.output_item.done" &&
        event.item?.type === "function_call" &&
        event.item?.name === "end_call");

    if (isEndCall) {
      console.log("[demo-ai] AI called end_call — reconnecting Breat");
      if (!endRequested && !endTimer) {
        endTimer = setTimeout(finishDemo, aiSpeaking ? 2500 : 800);
      }
    }

    if (event.type === "error") {
      console.error("[demo-ai] OpenAI error:", JSON.stringify(event.error || event));
    }
  });

  openAiWs.on("error", (e) => console.error("[demo-ai] OpenAI WS error:", e.message));
  openAiWs.on("close", () => {
    if (!endRequested) finishDemo();
  });

  twilioWs.on("message", (raw) => {
    let event;
    try { event = JSON.parse(raw.toString()); } catch { return; }

    if (event.event === "start") {
      streamSid = event.start?.streamSid || event.streamSid;
      sessionId = event.start?.customParameters?.sessionId || null;
      businessName = event.start?.customParameters?.businessName || businessName;
      console.log(`[demo-ai] Stream started sessionId=${sessionId} business=${businessName}`);
      twilioStartReceived = true;
      maybeInitSession();
      return;
    }

    if (event.event === "media" && event.media?.payload) {
      if (!aiSpeaking && Date.now() >= callerAudioAllowedAt && openAiWs.readyState === WebSocket.OPEN) {
        sendJson(openAiWs, { type: "input_audio_buffer.append", audio: event.media.payload });
      }
      return;
    }

    if (event.event === "stop") {
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
    }
  });

  twilioWs.on("close", () => {
    if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
  });
}
