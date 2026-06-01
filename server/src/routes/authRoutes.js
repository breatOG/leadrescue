import express from "express";
import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { signToken } from "../services/tokenService.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  businessName: z.string().optional()
});

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const input = authSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const starterPlan = await prisma.subscriptionPlan.findUnique({ where: { name: "Starter" } });

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        name: input.name,
        business: {
          create: {
            name: input.businessName || "My Construction Business",
            industryType: "General Contractor",
            subscriptionPlanId: starterPlan?.id,
            ownerNotificationEmail: input.email.toLowerCase(),
            businessHours: {
              monday: "8:00 AM - 5:00 PM",
              tuesday: "8:00 AM - 5:00 PM",
              wednesday: "8:00 AM - 5:00 PM",
              thursday: "8:00 AM - 5:00 PM",
              friday: "8:00 AM - 5:00 PM"
            },
            availability: {
              createMany: {
                data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
                  dayOfWeek,
                  startTime: "09:00",
                  endTime: "16:00",
                  slotMinutes: 60
                }))
              }
            }
          }
        }
      },
      include: { business: { include: { subscriptionPlan: true } } }
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = authSchema.pick({ email: true, password: true }).parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { business: { include: { subscriptionPlan: true } } }
    });

    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
