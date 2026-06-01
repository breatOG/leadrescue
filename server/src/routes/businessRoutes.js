import express from "express";
import asyncHandler from "express-async-handler";
import { prisma } from "../prisma/client.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUnique({
      where: { id: req.business.id },
      include: { serviceTypes: true, availability: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }, subscriptionPlan: true }
    });
    res.json({ business });
  })
);

router.put(
  "/settings",
  asyncHandler(async (req, res) => {
    const {
      name,
      industryType,
      serviceAreas,
      serviceTypes,
      businessHours,
      twilioPhoneNumber,
      businessPhoneNumber,
      ownerNotificationPhone,
      ownerNotificationEmail,
      availability
    } = req.body;

    await prisma.serviceType.deleteMany({ where: { businessId: req.business.id } });
    await prisma.businessAvailability.deleteMany({ where: { businessId: req.business.id } });

    const business = await prisma.business.update({
      where: { id: req.business.id },
      data: {
        name,
        industryType,
        serviceAreas: serviceAreas || [],
        businessHours: businessHours || {},
        twilioPhoneNumber,
        businessPhoneNumber,
        ownerNotificationPhone,
        ownerNotificationEmail,
        serviceTypes: {
          create: (serviceTypes || []).filter(Boolean).map((type) => ({ name: type }))
        },
        availability: {
          create: (availability || []).map((slot) => ({
            dayOfWeek: Number(slot.dayOfWeek),
            startTime: slot.startTime,
            endTime: slot.endTime,
            slotMinutes: Number(slot.slotMinutes || 60)
          }))
        }
      },
      include: { serviceTypes: true, availability: true, subscriptionPlan: true }
    });

    res.json({ business });
  })
);

export default router;
