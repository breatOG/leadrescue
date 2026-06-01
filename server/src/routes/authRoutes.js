import express from "express";
import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { signToken } from "../services/tokenService.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function isPhone(value) {
  return /^\+?[\d\s\-()]{7,}$/.test(value.trim());
}

async function findUserByIdentifier(identifier) {
  const clean = identifier.trim().toLowerCase();
  if (isPhone(identifier)) {
    const normalized = identifier.trim().replace(/\s/g, "");
    return prisma.user.findFirst({
      where: { phoneNumber: normalized },
      include: { business: { include: { subscriptionPlan: true } } }
    });
  }
  return prisma.user.findUnique({
    where: { email: clean },
    include: { business: { include: { subscriptionPlan: true } } }
  });
}

// Login — accepts email OR phone number
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { identifier, password } = z.object({
      identifier: z.string().min(1),
      password: z.string().min(1)
    }).parse(req.body);

    const user = await findUserByIdentifier(identifier);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    return res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// Public signup is disabled — accounts are created by the owner in Settings
router.post("/signup", (req, res) => {
  res.status(403).json({ error: "Account creation is managed by the business owner. Contact your administrator." });
});

// Get current user
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// List all users (owner only)
router.get(
  "/users",
  requireAuth,
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    res.json({ users: users.map(publicUser) });
  })
);

// Create a new user (owner only)
router.post(
  "/users",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = z.object({
      name: z.string().min(1),
      identifier: z.string().min(1),
      password: z.string().min(8),
      role: z.enum(["owner", "staff"]).default("staff")
    }).parse(req.body);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const isPhoneInput = isPhone(input.identifier);

    const user = await prisma.user.create({
      data: {
        email: isPhoneInput ? `${input.identifier.replace(/\D/g, "")}@leadrescue.internal` : input.identifier.toLowerCase(),
        phoneNumber: isPhoneInput ? input.identifier.trim() : null,
        passwordHash,
        name: input.name,
        role: input.role
      }
    });

    res.status(201).json({ user: publicUser(user) });
  })
);

// Delete a user (owner only)
router.delete(
  "/users/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);

// Change own password
router.patch(
  "/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8)
    }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
    res.json({ ok: true });
  })
);

export default router;
