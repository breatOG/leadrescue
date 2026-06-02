import express from "express";
import asyncHandler from "express-async-handler";
import { prisma } from "../prisma/client.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.business) return res.status(400).json({ error: "No business configured. Please complete your profile in Settings." });
    const [totalLeads, missedCallsRecovered, appointmentsBooked, highPriorityLeads, recentConversations] = await Promise.all([
      prisma.lead.count({ where: { businessId: req.business.id } }),
      prisma.lead.count({ where: { businessId: req.business.id, source: "missed_call" } }),
      prisma.appointment.count({ where: { businessId: req.business.id, status: "booked" } }),
      prisma.lead.count({ where: { businessId: req.business.id, priority: { in: ["emergency", "high"] } } }),
      prisma.lead.findMany({
        where: { businessId: req.business.id },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
        take: 6
      })
    ]);

    res.json({ totalLeads, missedCallsRecovered, appointmentsBooked, highPriorityLeads, recentConversations });
  })
);

export default router;
