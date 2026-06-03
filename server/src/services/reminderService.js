import { prisma } from "../prisma/client.js";
import { sendSms } from "./twilioService.js";

const tz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";

function fmtApt(dt) {
  return new Date(dt).toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true
  });
}

async function runReminders() {
  const now = new Date();

  try {
    // ── 24-hour reminder: appointment is 23–25 hours from now ──────────────
    const appointments24h = await prisma.appointment.findMany({
      where: {
        status: "booked",
        reminder24hSentAt: null,
        startAt: {
          gte: new Date(now.getTime() + 23 * 60 * 60 * 1000),
          lte: new Date(now.getTime() + 25 * 60 * 60 * 1000)
        }
      },
      include: { lead: true, business: true }
    });

    for (const apt of appointments24h) {
      const { lead, business } = apt;
      const fromNumber = business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;
      if (!lead?.customerPhone || !fromNumber) continue;
      const firstName = lead.customerName?.split(" ")[0];
      const greeting = firstName ? `Hi ${firstName}!` : "Hi!";
      const body = `${greeting} Reminder: you have an appointment with ${business.name} tomorrow at ${fmtApt(apt.startAt)}. Reply CANCEL to cancel or RESCHEDULE to pick a new time.`;
      try {
        const sent = await sendSms({ to: lead.customerPhone, from: fromNumber, body });
        await Promise.all([
          prisma.message.create({ data: { leadId: lead.id, direction: "outbound", channel: "sms", body, twilioSid: sent?.sid } }),
          prisma.appointment.update({ where: { id: apt.id }, data: { reminder24hSentAt: now } })
        ]);
        console.log(`[reminder] 24h sent apt=${apt.id}`);
      } catch (e) {
        console.error(`[reminder] 24h failed apt=${apt.id}:`, e.message);
      }
    }

    // ── 2-hour reminder: appointment is 90–150 minutes from now ────────────
    const appointments2h = await prisma.appointment.findMany({
      where: {
        status: "booked",
        reminder2hSentAt: null,
        startAt: {
          gte: new Date(now.getTime() + 90 * 60 * 1000),
          lte: new Date(now.getTime() + 150 * 60 * 1000)
        }
      },
      include: { lead: true, business: true }
    });

    for (const apt of appointments2h) {
      const { lead, business } = apt;
      const fromNumber = business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;
      if (!lead?.customerPhone || !fromNumber) continue;
      const body = `Your appointment with ${business.name} is in about 2 hours at ${fmtApt(apt.startAt)}. See you soon!`;
      try {
        const sent = await sendSms({ to: lead.customerPhone, from: fromNumber, body });
        await Promise.all([
          prisma.message.create({ data: { leadId: lead.id, direction: "outbound", channel: "sms", body, twilioSid: sent?.sid } }),
          prisma.appointment.update({ where: { id: apt.id }, data: { reminder2hSentAt: now } })
        ]);
        console.log(`[reminder] 2h sent apt=${apt.id}`);
      } catch (e) {
        console.error(`[reminder] 2h failed apt=${apt.id}:`, e.message);
      }
    }

    // ── Post-appointment follow-up: started 2–3 hours ago, still "booked" ──
    const followUps = await prisma.appointment.findMany({
      where: {
        status: "booked",
        followUpSentAt: null,
        startAt: {
          gte: new Date(now.getTime() - 3 * 60 * 60 * 1000),
          lte: new Date(now.getTime() - 2 * 60 * 60 * 1000)
        }
      },
      include: { lead: true, business: true }
    });

    for (const apt of followUps) {
      const { lead, business } = apt;
      const fromNumber = business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;
      if (!lead?.customerPhone || !fromNumber) continue;
      const firstName = lead.customerName?.split(" ")[0];
      const greeting = firstName ? `Hi ${firstName}!` : "Hi!";
      const body = `${greeting} Thanks for choosing ${business.name}. We hope everything went smoothly today! If you need anything else or have questions, just reply and we'll be happy to help.`;
      try {
        const sent = await sendSms({ to: lead.customerPhone, from: fromNumber, body });
        await Promise.all([
          prisma.message.create({ data: { leadId: lead.id, direction: "outbound", channel: "sms", body, twilioSid: sent?.sid } }),
          prisma.appointment.update({ where: { id: apt.id }, data: { followUpSentAt: now, status: "completed" } }),
          prisma.lead.update({ where: { id: lead.id }, data: { status: "closed", lastMessage: body } })
        ]);
        console.log(`[reminder] follow-up sent apt=${apt.id}`);
      } catch (e) {
        console.error(`[reminder] follow-up failed apt=${apt.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error("[reminder] scheduler error:", e.message);
  }
}

export function startReminderScheduler() {
  runReminders();
  setInterval(runReminders, 15 * 60 * 1000).unref();
  console.log("[reminder] Scheduler started — checks every 15 min");
}
