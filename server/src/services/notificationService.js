import { sendSms } from "./twilioService.js";

export async function notifyContractor({ business, lead, summary }) {
  if (!business.ownerNotificationPhone) {
    console.log(`[mock notification] ${business.ownerNotificationEmail || business.name}: ${summary}`);
    return;
  }

  const channel = lead.source === "missed_call" ? "📞 Call" : "💬 SMS";
  const priority = lead.priority === "emergency" ? "🚨 EMERGENCY" : lead.priority === "high" ? "⚡ HIGH" : null;

  const lines = [
    priority ? `${priority} — ${channel} lead` : `${channel} lead`,
    lead.customerName ? `Name: ${lead.customerName}` : `Phone: ${lead.customerPhone}`,
    lead.jobType ? `Job: ${lead.jobType}` : null,
    lead.urgency ? `Urgency: ${lead.urgency}` : null,
    summary ? summary.slice(0, 120) : null,
  ].filter(Boolean);

  const body = lines.join("\n").slice(0, 320);

  await sendSms({
    to: business.ownerNotificationPhone,
    from: business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER,
    body
  });
}
