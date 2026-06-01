import OpenAI from "openai";
import { getAvailableSlots } from "./schedulingService.js";

export async function runVoiceAiTurn({ business, lead, messages, slots = [] }) {
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

  const slotText = slots.slice(0, 8).map((s) =>
    new Date(s.startAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
  ).join(" | ");

  const history = messages
    .filter((m) => m.body !== "[call started]")
    .map((m) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: m.body }));

  const system = `You are Alex, a warm and natural receptionist at ${business.name} (${business.industryType || "contractor"}). You are on a live phone call right now.

NOW: ${timeStr}
Business hours: ${hoursText}
Service areas: ${areas}
Services: ${serviceTypes}
Real available appointment slots: ${slotText || "call back to schedule"}

YOUR PERSONALITY:
- Sound like a real, caring human — not a script, not a robot
- React emotionally and specifically to what they just said before asking anything new
  Examples: "Oh man, no heat in this weather? That's rough.", "Aw, a burst pipe — okay, let's get someone out there.", "Oh good, sounds like it caught early at least!"
- Use natural speech: contractions, "yeah", "totally", "of course", "gotcha", "oh wow"
- Never start two responses the same way. Vary everything.
- Mirror their energy — if they sound stressed, be reassuring; if casual, be relaxed

COLLECT THESE (one at a time, naturally woven into conversation):
1. Name
2. What the problem is and how severe
3. Address or ZIP code
4. Urgency: emergency / today / this week / flexible
5. Preferred appointment time — ONLY from the real available slots listed above

SCHEDULING RULES:
- It is currently ${timeStr}. Never offer a time that has already passed.
- If urgency is "not urgent" or "flexible" — suggest a slot a few days out, not today.
- Only offer slots from the real available list. Never invent times.
- If no slots fit what they want, say the team will call back to find a time that works.

EMERGENCY: Gas leak, flooding, active fire, electrical sparks, structural collapse — react immediately with urgency:
"Oh my gosh, please call 911 or your utility company right now if there's any immediate danger! I'm alerting our team this second."

WHEN TO WRAP UP: Once you have name + problem + address (or handled emergency), give a warm summary and say goodbye.

RESPOND ONLY IN THIS JSON FORMAT:
{
  "message": "Your spoken words here — warm, natural, 1-3 short sentences",
  "done": false,
  "extracted": {
    "customerName": null,
    "jobType": null,
    "issueDescription": null,
    "urgency": null,
    "address": null,
    "zipCode": null,
    "preferredAppointmentTime": null
  }
}

Set done=true only on your final goodbye message.
Only put values in extracted for things the customer clearly and explicitly said — never guess.`;

  if (!process.env.OPENAI_API_KEY) {
    if (!lead.customerName) return { text: "Hey, thanks for calling! What's your name?", done: false, extracted: {} };
    if (!lead.issueDescription) return { text: `Hey ${lead.customerName}! What's going on — what can we help you with?`, done: false, extracted: {} };
    if (!lead.address && !lead.zipCode) return { text: "Got it. What's the address or ZIP for the job?", done: false, extracted: {} };
    return { text: `Perfect, I've got everything I need! Someone from ${business.name} will follow up soon. Have a great day!`, done: true, extracted: {} };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, ...history],
    max_tokens: 220,
    temperature: 0.9
  });

  const result = JSON.parse(completion.choices[0].message.content);
  return {
    text: String(result.message || "").trim(),
    done: result.done === true,
    extracted: result.extracted || {}
  };
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
