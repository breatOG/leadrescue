import OpenAI from "openai";
import { getAvailableSlots } from "./schedulingService.js";

export async function runVoiceAiTurn({ business, lead, messages }) {
  const now = new Date();
  const timeStr = now.toLocaleString("en-US", {
    weekday: "long", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true
  });

  const serviceTypes = business.serviceTypes?.map((t) => t.name).join(", ") || "general services";
  const areas = business.serviceAreas?.join(", ") || "local area";
  const hoursText = business.businessHours
    ? Object.entries(business.businessHours).map(([d, h]) => `${d}: ${h}`).join(", ")
    : "Monday–Friday 8:00 AM – 5:00 PM";

  const history = messages
    .filter((m) => m.body !== "[call started]")
    .map((m) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: m.body }));

  const system = `You are Alex, a friendly, upbeat receptionist at ${business.name} (${business.industryType || "contractor"}). You are on a live phone call right now.

Current date and time: ${timeStr}
Business hours: ${hoursText}
Service areas: ${areas}
Services: ${serviceTypes}

YOUR PERSONALITY:
- Warm, genuine, emotionally responsive — like a real human, not a bot
- React naturally to what they say BEFORE moving on: "Oh no, that sounds awful!", "Totally understandable!", "Got it, no problem!", "Oh wow, yeah that needs to be looked at"
- Use casual, natural speech — contractions, "yeah", "sure", "of course", "absolutely"
- Never sound scripted or robotic. Vary your phrasing every time.

WHAT YOU NEED TO COLLECT (one at a time, naturally):
1. Their name
2. What the problem is — and how bad/severe
3. Their address or ZIP code
4. Urgency — emergency / today / this week / flexible
5. Preferred appointment time — ONLY suggest times within business hours, NEVER nights or early mornings

SCHEDULING RULES (very important):
- Current time is ${timeStr}. Use this to reason about today's schedule.
- If they say not urgent or flexible — do NOT offer today or same-day. Suggest next business day.
- NEVER suggest times outside business hours.
- If it is late in the day, acknowledge there may not be same-day availability.

EMERGENCY: If they mention gas leak, flooding, active fire, electrical sparks, or structural collapse — respond with urgency and empathy: "Oh my gosh — please call 911 or your utility company right now if there's immediate danger! I'm alerting our team as we speak."

ENDING THE CALL:
- When you have their name, problem description, and address (or just handled an emergency) — wrap up warmly and naturally
- End ONLY your final goodbye message with the hidden tag: [CALL_COMPLETE]
- Example: "Awesome, I think I have everything I need! Someone from our team will reach out to you soon to get you scheduled. Thanks so much for calling, have a great day! [CALL_COMPLETE]"

STRICT FORMAT RULES:
- 1 to 3 SHORT sentences max per response. This is a phone call.
- Never list multiple questions. One thing at a time.
- Never repeat questions for info already given.`;

  if (!process.env.OPENAI_API_KEY) {
    if (!lead.customerName) return { text: "Hey there, thanks for calling! What's your name?", done: false };
    if (!lead.issueDescription) return { text: `Hey ${lead.customerName}! What's going on — what can we help you with?`, done: false };
    if (!lead.address && !lead.zipCode) return { text: "Got it, that sounds like something we can definitely help with. What's the address for the job?", done: false };
    return { text: `Perfect, I think I have everything! Someone from ${business.name} will follow up with you soon. Thanks so much, have a great day! [CALL_COMPLETE]`, done: true };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: system }, ...history],
    max_tokens: 100,
    temperature: 0.9
  });

  const raw = completion.choices[0].message.content.trim();
  const done = raw.includes("[CALL_COMPLETE]");
  const text = raw.replace(/\[CALL_COMPLETE\]/g, "").trim();
  return { text, done };
}

const EMERGENCY_TERMS = ["gas leak", "flood", "flooding", "sparks", "fire", "roof collapse", "collapsed", "burst pipe"];
const HIGH_TERMS = ["no heat", "no ac", "leaking", "leak", "urgent", "today", "asap", "broken"];

function hasAny(text, terms) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function extractFields(lead, conversationText) {
  const fields = {};
  const zip = conversationText.match(/\b\d{5}(?:-\d{4})?\b/);
  const phoneName = conversationText.match(/(?:my name is|i'm|i am)\s+([a-z][a-z\s'-]{1,40})/i);

  if (!lead.zipCode && zip) fields.zipCode = zip[0];
  if (!lead.customerName && phoneName) fields.customerName = phoneName[1].trim();
  if (!lead.photosAvailable && /\b(photo|photos|picture|pictures|image|images)\b/i.test(conversationText)) {
    fields.photosAvailable = true;
  }

  return fields;
}

function missingFieldPrompt(lead, extracted) {
  const combined = { ...lead, ...extracted };
  if (!combined.customerName) return "What is your name, and what kind of service do you need help with?";
  if (!combined.jobType && !combined.issueDescription) return "What type of job is this, and what issue are you seeing?";
  if (!combined.address && !combined.zipCode) return "What address or ZIP code is the job at?";
  if (!combined.urgency) return "How urgent is this: emergency, today, this week, or flexible?";
  return null;
}

function mockAgent({ business, lead, messages, slots }) {
  const conversationText = messages.map((message) => message.body).join(" ");
  const latest = messages[messages.length - 1]?.body || "";
  const extractedFields = extractFields(lead, conversationText);
  let leadPriority = "normal";

  if (hasAny(conversationText, EMERGENCY_TERMS)) leadPriority = "emergency";
  else if (hasAny(conversationText, HIGH_TERMS)) leadPriority = "high";
  else if (/\bwrong number|stop|unsubscribe\b/i.test(conversationText)) leadPriority = "low";

  if (/\bwrong number|spam|unsubscribe\b/i.test(conversationText)) {
    return {
      nextMessageToCustomer: "Thanks for letting us know. We will close this out.",
      extractedFields,
      leadPriority: "low",
      leadStatus: "spam",
      shouldOfferAppointments: false,
      suggestedAppointmentSlots: [],
      contractorSummary: "Customer indicated this is not a valid lead."
    };
  }

  if (leadPriority === "emergency") {
    return {
      nextMessageToCustomer:
        "That sounds urgent. I have alerted the team. If there is immediate danger, please contact emergency services or the utility company now. What is the job address or ZIP?",
      extractedFields: { ...extractedFields, urgency: "emergency" },
      leadPriority,
      leadStatus: "qualified",
      shouldOfferAppointments: false,
      suggestedAppointmentSlots: [],
      contractorSummary: `Emergency lead for ${business.name}: ${latest}`
    };
  }

  const prompt = missingFieldPrompt(lead, extractedFields);
  if (prompt) {
    return {
      nextMessageToCustomer: prompt,
      extractedFields,
      leadPriority,
      leadStatus: "texting",
      shouldOfferAppointments: false,
      suggestedAppointmentSlots: [],
      contractorSummary: `Lead is still being qualified. Latest: ${latest}`
    };
  }

  const slotText = slots
    .slice(0, 3)
    .map((slot, index) => `${index + 1}. ${new Date(slot.startAt).toLocaleString()}`)
    .join("\n");

  return {
    nextMessageToCustomer: `Thanks, I have enough to get this started. Which appointment works best?\n${slotText}`,
    extractedFields,
    leadPriority,
    leadStatus: "qualified",
    shouldOfferAppointments: true,
    suggestedAppointmentSlots: slots.slice(0, 3),
    contractorSummary: `${leadPriority} lead from ${lead.customerPhone}. ${lead.issueDescription || latest}`
  };
}

export async function runAiLeadAgent({ business, lead, messages }) {
  const slots = await getAvailableSlots(business.id);

  if (!process.env.OPENAI_API_KEY) {
    return mockAgent({ business, lead, messages, slots });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const profile = {
    businessName: business.name,
    industryType: business.industryType,
    serviceAreas: business.serviceAreas,
    serviceTypes: business.serviceTypes?.map((type) => type.name) || [],
    availableSlots: slots.slice(0, 5)
  };

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a helpful receptionist for a local construction service contractor. Ask one or two questions at a time. Do not quote exact pricing. Do not diagnose dangerous issues. For emergencies such as gas leaks, flooding, electrical sparks, or roof collapse, mark emergency and tell the customer the contractor has been alerted. Stay focused on booking the job. Return only JSON with keys: nextMessageToCustomer, extractedFields, leadPriority, leadStatus, shouldOfferAppointments, suggestedAppointmentSlots, contractorSummary."
      },
      {
        role: "user",
        content: JSON.stringify({
          businessProfile: profile,
          lead,
          conversation: messages.map((message) => ({
            direction: message.direction,
            body: message.body,
            createdAt: message.createdAt
          }))
        })
      }
    ]
  });

  return JSON.parse(completion.choices[0].message.content);
}
