import express from "express";
import asyncHandler from "express-async-handler";
import { prisma } from "../prisma/client.js";
import { requireAuth } from "../middleware/auth.js";
import { bookAppointment, getAvailableSlots } from "../services/schedulingService.js";
import { notifyContractor } from "../services/notificationService.js";
import { sendSms } from "../services/twilioService.js";

const router = express.Router();
router.use(requireAuth);

router.get(
  "/appointments",
  asyncHandler(async (req, res) => {
    const appointments = await prisma.appointment.findMany({
      where: { businessId: req.business.id },
      include: { lead: true },
      orderBy: { startAt: "asc" }
    });
    res.json({ appointments });
  })
);

router.get(
  "/availability",
  asyncHandler(async (req, res) => {
    const slots = await getAvailableSlots(req.business.id);
    res.json({ slots });
  })
);

router.post(
  "/appointments/book",
  asyncHandler(async (req, res) => {
    const appointment = await bookAppointment({
      businessId: req.business.id,
      leadId: req.body.leadId,
      startAt: req.body.startAt,
      notes: req.body.notes,
      force: true,   // manual bookings bypass slot-availability re-validation
      source: "manual",
    });
    const lead = await prisma.lead.findUnique({ where: { id: req.body.leadId } });
    await notifyContractor({ business: req.business, lead, summary: `Appointment booked for ${appointment.startAt.toLocaleString()}.` });

    // Send confirmation SMS to the customer
    if (lead?.customerPhone) {
      const tz = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
      const aptTimeStr = new Date(appointment.startAt).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
      const confirmMsg = `Your appointment with ${req.business.name} is confirmed for ${aptTimeStr}. See you then!`;
      const twilioNum = req.business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;
      const sent = await sendSms({ to: lead.customerPhone, from: twilioNum, body: confirmMsg }).catch(() => null);
      if (sent) {
        await prisma.message.create({ data: { leadId: lead.id, direction: "outbound", channel: "sms", body: confirmMsg, twilioSid: sent?.sid } });
      }
    }

    res.status(201).json({ appointment });
  })
);

router.patch(
  "/appointments/:id",
  asyncHandler(async (req, res) => {
    const { status, notes } = req.body;
    const valid = ["booked", "cancelled", "completed"];
    if (status && !valid.includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be booked, cancelled, or completed." });
    }

    const apt = await prisma.appointment.findFirst({
      where: { id: req.params.id, businessId: req.business.id }
    });
    if (!apt) return res.status(404).json({ error: "Appointment not found" });

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        ...(status ? { status } : {}),
        ...(notes !== undefined ? { notes } : {})
      },
      include: { lead: true }
    });

    // Keep lead status in sync
    if (status === "cancelled") {
      await prisma.lead.update({ where: { id: apt.leadId }, data: { status: "qualified" } });
    } else if (status === "completed") {
      await prisma.lead.update({ where: { id: apt.leadId }, data: { status: "closed" } });
    }

    res.json({ appointment: updated });
  })
);

export default router;
