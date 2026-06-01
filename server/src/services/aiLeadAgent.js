import OpenAI from "openai";
import { getAvailableSlots } from "./schedulingService.js";

export async function runVoiceAiTurn({ business, lead, messages }) {
  const conversationHistory = messages
    .filter((m) => m.body !== "[call started]")
    .map((m) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: m.body }));

  const serviceTypes = business.serviceTypes?.map((t) => t.name).join(", ") || "general service";
  const areas = business.serviceAreas?.join(", ") || "local area";

  const system = `You are a warm, natural-sounding receptionist answering a phone call for ${business.name}, a ${business.industryType || "contractor"} company.

Have a genuine conversation. Collect these details naturally — one at a time, never all at once:
• Customer's name
• What the problem is and how bad (severity)
• Their address or ZIP code
• How urgent: emergency, today, this week, or flexible
• Preferred appointment window (if not emergency)

Service areas: ${areas}
Services offered: ${serviceTypes}

STRICT RULES:
- Max 1-2 SHORT sentences per response. This is a phone call — brevity matters.
- Never list questions. Ask one thing, wait for the answer.
- Sound like a real person: warm, natural, casual. Not scripted.
- If they mention gas leak, flooding, fire, electrical sparks, or structural collapse — say: call emergency services now, and that you are alerting the contractor immediately.
- Once you have name, problem, and address — give a brief summary and say the contractor will follow up soon.
- Never repeat a question for something they already told you.`;

  if (!process.env.OPENAI_API_KEY) {
    const known = { name: lead.customerName, address: lead.address || lead.zipCode, issue: lead.issueDescription };
    if (!known.name) return "Hi there! What's your name?";
    if (!known.issue) return `Thanks ${known.name}. What's the problem you're dealing with?`;
    if (!known.address) return "And what's the address or ZIP code for the job?";
    return `Got it. I have everything I need. The team at ${business.name} will follow up with you soon.`;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: system }, ...conversationHistory],
    max_tokens: 80,
    temperature: 0.85
  });

  return completion.choices[0].message.content.trim();
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
