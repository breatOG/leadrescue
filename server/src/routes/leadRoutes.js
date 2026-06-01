import express from "express";
import asyncHandler from "express-async-handler";
import { prisma } from "../prisma/client.js";
import { requireAuth } from "../middleware/auth.js";
import { sendSms } from "../services/twilioService.js";

const router = express.Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const leads = await prisma.lead.findMany({
      where: { businessId: req.business.id },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, appointments: true },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ leads });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, businessId: req.business.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        appointments: { orderBy: { startAt: "asc" } }
      }
    });

    if (!lead) return res.status(404).json({ error: "Lead not found" });
    return res.json({ lead });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    // Whitelist updatable fields so clients can't mutate businessId or other sensitive columns
    const { status, priority, customerName, jobType, issueDescription, address, zipCode, urgency, manualNotes } = req.body;
    const lead = await prisma.lead.update({
      where: { id: req.params.id, businessId: req.business.id },
      data: { status, priority, customerName, jobType, issueDescription, address, zipCode, urgency, manualNotes }
    });
    res.json({ lead });
  })
);

router.post(
  "/:id/manual-message",
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, businessId: req.business.id } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const body = String(req.body.body || "").trim();
    const result = await sendSms({
      to: lead.customerPhone,
      from: req.business.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER,
      body
    });

    const message = await prisma.message.create({
      data: { leadId: lead.id, direction: "outbound", channel: "sms", body, twilioSid: result.sid }
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { lastMessage: body, status: "texting" } });

    return res.json({ message });
  })
);

export default router;
