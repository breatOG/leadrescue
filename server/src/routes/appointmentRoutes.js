import express from "express";
import asyncHandler from "express-async-handler";
import { prisma } from "../prisma/client.js";
import { requireAuth } from "../middleware/auth.js";
import { bookAppointment, getAvailableSlots } from "../services/schedulingService.js";
import { notifyContractor } from "../services/notificationService.js";

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
      notes: req.body.notes
    });
    const lead = await prisma.lead.findUnique({ where: { id: req.body.leadId } });
    await notifyContractor({ business: req.business, lead, summary: `Appointment booked for ${appointment.startAt.toLocaleString()}.` });
    res.status(201).json({ appointment });
  })
);

export default router;
