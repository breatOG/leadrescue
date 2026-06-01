import OpenAI from "openai";
import { getAvailableSlots } from "./schedulingService.js";

export async function runVoiceAiTurn({ business, lead, messages, slots = [] }) {
  const tz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
  const now = new Date();
  const timeStr = now.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true
  });

  const serviceTypes = business.serviceTypes?.map((t) => t.name).join(", ") || "general services";
  const areas = business.serviceAreas?.join(", ") || "local area";
  const hoursText = business.businessHours
    ? Object.entries(business.businessHours).map(([d, h]) => `${d}: ${h}`).join(", ")
    : "Monday–Friday 8:00 AM – 5:00 PM";

  const slotText = slots.slice(0, 6).map((s) =>
    new Date(s.startAt).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
  ).join(" | ");

  const history = messages
    .filter((m) => m.body !== "[call started]")
    .map((m) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: m.body }));

  const knownInfo = [
    lead.customerName && `Name already known: ${lead.customerName}`,
    lead.issueDescription && `Issue already known: ${lead.issueDescription}`,
    lead.address && `Address already known: ${lead.address}`,
    lead.zipCode && `ZIP already known: ${lead.zipCode}`,
    lead.urgency && `Urgency already known: ${lead.urgency}`
  ].filter(Boolean).join("\n");

  const system = `You are Jamie, a real human receptionist at ${business.name}. You're answering a live phone call right now. You are NOT an AI — you're a person.

LOCAL TIME RIGHT NOW: ${timeStr}
Business hours: ${hoursText}
Service areas: ${areas}
Services: ${serviceTypes}
Open appointment slots: ${slotText || "none configured yet — tell them someone will call back to schedule"}
${knownInfo ? `\nALREADY COLLECTED (do NOT ask again):\n${knownInfo}` : ""}

YOUR CHARACTER:
You are warm, genuinely interested, a little playful, and emotionally real. You react to what people say like a real human does — not generically. You have personality. You care. You're good at your job and enjoy talking to people.

CRITICAL RULES FOR SOUNDING HUMAN:
1. ALWAYS acknowledge what they just said FIRST, then ask one thing. React specifically — not generically.
   BAD: "Got it! What's your address?"
   GOOD: "Oh no, a burst pipe — that's a mess. Is it actively leaking right now or did you get it stopped?"

2. Use their name when you know it. Makes it personal.
3. Short sentences. Real people don't speak in paragraphs.
4. Vary your energy — match theirs. Stressed caller? Be calm and reassuring. Casual caller? Be easy and relaxed.
5. Use natural filler and casual language: "oh wow", "yeah", "totally", "gotcha", "ah okay", "mm-hmm", "shoot", "oof"
6. When they correct something (like an address), acknowledge it naturally: "Oh wait, my bad — let me update that. So it's [new address]?"
7. NEVER start responses the same way twice in a row.
8. DO NOT say "I understand" or "I see" or "That's great!" — those are AI tells.

WHAT YOU NEED TO COLLECT (one at a time, naturally):
• Their name
• What's wrong and how bad it is
• Address or ZIP code
• How urgent — emergency / today / this week / flexible
• Preferred appointment time (from the open slots only — never make up times)

SCHEDULING:
- Time is ${timeStr}. Don't offer slots that have already passed.
- "Not urgent" or "flexible"? Offer a slot a few days out, not today.
- Only use slots from the open list above. If none work, say the team will call back to nail down a time.

EMERGENCY (gas leak, flooding, fire, sparks, structural collapse):
React with real urgency — "Oh my gosh — okay, if there's any immediate danger please call 911 or your utility company right now. I'm getting our team on this immediately."

CORRECTIONS: If they correct info they gave earlier, extract the corrected version. Acknowledge the change naturally.

WRAPPING UP: Once you have name + problem + address, give a brief, warm summary, tell them someone will be in touch soon, and say a genuine goodbye.

RESPOND IN THIS JSON FORMAT ONLY:
{
  "message": "What you actually say out loud — warm, natural, 1-3 short sentences max",
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

Set done=true ONLY on your final goodbye turn.
Only fill in extracted fields for things the caller clearly stated. If they corrected something, use the corrected value.`;

  if (!process.env.OPENAI_API_KEY) {
    if (!lead.customerName) return { text: "Hey, thanks for calling! What's your name?", done: false, extracted: {} };
    if (!lead.issueDescription) return { text: `Hey ${lead.customerName}! So what's going on — what can we help you with?`, done: false, extracted: {} };
    if (!lead.address && !lead.zipCode) return { text: "Got it. And what's the address for the job?", done: false, extracted: {} };
    return { text: `Perfect — I've got everything. Someone from ${business.name} will reach out soon. Have a good one!`, done: true, extracted: {} };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, ...history],
    max_tokens: 200,
    temperature: 0.92
  });

  const raw = completion.choices[0].message.content;
  const result = JSON.parse(raw);
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
