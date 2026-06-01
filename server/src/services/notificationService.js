import { sendSms } from "./twilioService.js";

export async function notifyContractor({ business, lead, summary }) {
  const message = `LeadRescue: ${lead.priority.toUpperCase()} lead from ${lead.customerPhone}. ${summary || lead.aiSummary || "Open dashboard for details."}`;

  if (business.ownerNotificationPhone) {
    await sendSms({
      to: business.ownerNotificationPhone,
      from: business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER,
      body: message.slice(0, 1500)
    });
  } else {
    console.log(`[mock notification] ${business.ownerNotificationEmail || business.name}: ${message}`);
  }
}
