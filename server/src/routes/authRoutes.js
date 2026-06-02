import express from "express";
import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { signToken } from "../services/tokenService.js";
import { requireAuth } from "../middleware/auth.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/emailService.js";

const router = express.Router();

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function clientUrl() {
  return process.env.CLIENT_URL || "http://localhost:5173";
}

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function isPhone(value) {
  return /^\+?[\d\s\-()]{7,}$/.test(value.trim());
}

// Normalize any phone input to E.164. Assumes US (+1) when no country code is given,
// so users never have to type the leading "+".
function normalizePhone(value) {
  if (!value) return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

// --- Token helpers: the raw token goes in the email link, only its hash is stored ---
function generateToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

async function issueToken(userId, type, ttlMs) {
  // Invalidate any outstanding tokens of the same type so only the newest link works.
  await prisma.authToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() }
  });
  const { raw, hash } = generateToken();
  await prisma.authToken.create({
    data: { userId, type, tokenHash: hash, expiresAt: new Date(Date.now() + ttlMs) }
  });
  return raw;
}

async function consumeToken(rawToken, type) {
  if (!rawToken) return null;
  const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const record = await prisma.authToken.findUnique({ where: { tokenHash: hash }, include: { user: true } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) return null;
  await prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return record.user;
}

async function findUserByIdentifier(identifier) {
  const clean = identifier.trim().toLowerCase();
  if (isPhone(identifier)) {
    const normalized = normalizePhone(identifier);
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

// Public registration — creates an owner account + their own business (a new tenant)
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Invalid email address"),
      phone: z.string().optional(),
      password: z.string().min(8, "Password must be at least 8 characters"),
      businessName: z.string().optional(),
      industryType: z.string().optional()
    }).parse(req.body);

    const email = input.email.trim().toLowerCase();
    const phoneNumber = input.phone ? normalizePhone(input.phone) : null;
    const businessName = (input.businessName || "").trim() || `${input.name.split(" ")[0]}'s Business`;
    const industryType = (input.industryType || "").trim() || "General Contractor";

    if (await prisma.user.findUnique({ where: { email } })) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    if (phoneNumber && (await prisma.user.findFirst({ where: { phoneNumber } }))) {
      return res.status(409).json({ error: "An account with this phone number already exists." });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    let stripeCustomerId;
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const customer = await stripe.customers.create({ email, name: input.name });
        stripeCustomerId = customer.id;
      } catch (err) {
        console.error("[stripe] Failed to create customer during registration:", err.message);
      }
    }

    const starter = await prisma.subscriptionPlan.findUnique({ where: { name: "Starter" } }).catch(() => null);

    const user = await prisma.user.create({
      data: {
        email,
        phoneNumber,
        passwordHash,
        name: input.name,
        role: "owner",
        emailVerified: false,
        stripeCustomerId,
        subscriptionStatus: "inactive",
        business: {
          create: {
            subscriptionPlanId: starter?.id || null,
            name: businessName,
            industryType,
            ownerNotificationEmail: email,
            ownerNotificationPhone: phoneNumber || "", // default the ring/alert number to their login phone
            serviceAreas: [],
            businessHours: {
              monday: "8:00 AM - 5:00 PM",
              tuesday: "8:00 AM - 5:00 PM",
              wednesday: "8:00 AM - 5:00 PM",
              thursday: "8:00 AM - 5:00 PM",
              friday: "8:00 AM - 5:00 PM"
            },
            availability: {
              createMany: {
                data: [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
                  { dayOfWeek, startTime: "09:00", endTime: "12:00", slotMinutes: 60 },
                  { dayOfWeek, startTime: "13:00", endTime: "17:00", slotMinutes: 60 }
                ])
              }
            }
          }
        }
      },
      include: { business: { include: { subscriptionPlan: true } } }
    });

    // Send verification email (best-effort — registration still succeeds if email fails).
    try {
      const raw = await issueToken(user.id, "email_verify", VERIFY_TTL_MS);
      await sendVerificationEmail({ to: email, name: user.name, link: `${clientUrl()}/verify-email?token=${raw}` });
    } catch (err) {
      console.error("[register] verification email failed:", err.message);
    }

    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

// Email verification
router.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    const user = await consumeToken(token, "email_verify");
    if (!user) {
      return res.status(400).json({ error: "This verification link is invalid or has expired." });
    }
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    return res.json({ ok: true });
  })
);

// Resend verification email to the logged-in user
router.post(
  "/resend-verification",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.emailVerified) return res.json({ ok: true, alreadyVerified: true });
    const raw = await issueToken(req.user.id, "email_verify", VERIFY_TTL_MS);
    await sendVerificationEmail({ to: req.user.email, name: req.user.name, link: `${clientUrl()}/verify-email?token=${raw}` });
    return res.json({ ok: true });
  })
);

// Account recovery — request a reset link (always 200 to avoid account enumeration)
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user) {
      const raw = await issueToken(user.id, "password_reset", RESET_TTL_MS);
      try {
        await sendPasswordResetEmail({ to: user.email, name: user.name, link: `${clientUrl()}/reset-password?token=${raw}` });
      } catch (err) {
        console.error("[forgot-password] email failed:", err.message);
      }
    }
    return res.json({ ok: true });
  })
);

// Account recovery — set a new password with the reset token
router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, password } = z.object({
      token: z.string().min(1),
      password: z.string().min(8, "Password must be at least 8 characters")
    }).parse(req.body);

    const user = await consumeToken(token, "password_reset");
    if (!user) {
      return res.status(400).json({ error: "This reset link is invalid or has expired." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    return res.json({ ok: true });
  })
);

// Legacy signup disabled
router.post("/signup", (req, res) => {
  res.status(403).json({ error: "Please use /api/auth/register to create an account." });
});

// Get current user
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// List all users (owner only) — scoped to this business's owner
router.get(
  "/users",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== "owner") return res.status(403).json({ error: "Owner access required." });
    // Return the owner + any staff whose email is @leadrescue.internal (created via this dashboard)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { id: req.user.id },
          { email: { endsWith: "@leadrescue.internal" } }
        ]
      },
      orderBy: { createdAt: "asc" }
    });
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
    const normalizedPhone = isPhoneInput ? normalizePhone(input.identifier) : null;

    const user = await prisma.user.create({
      data: {
        email: isPhoneInput ? `${(normalizedPhone || "").replace(/\D/g, "")}@leadrescue.internal` : input.identifier.toLowerCase(),
        phoneNumber: normalizedPhone,
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
    if (req.user.role !== "owner") return res.status(403).json({ error: "Owner access required." });
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);

// Update a team member's permissions (owner only)
router.patch(
  "/users/:id/permissions",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== "owner") return res.status(403).json({ error: "Owner access required." });
    if (req.params.id === req.user.id) return res.status(400).json({ error: "Cannot change your own permissions." });

    const { permissions } = req.body;
    if (!Array.isArray(permissions)) return res.status(400).json({ error: "permissions must be an array." });

    const VALID = ["leads:view", "leads:message", "calendar:view", "settings:view"];
    const cleaned = permissions.filter((p) => VALID.includes(p));

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { permissions: cleaned }
    });
    res.json({ user: publicUser(user) });
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
