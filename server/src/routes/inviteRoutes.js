import express from "express";
import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import { requireAuth } from "../middleware/auth.js";
import { signToken } from "../services/tokenService.js";
import { sendInviteEmail } from "../services/emailService.js";

const router = express.Router();

const INVITE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

function clientUrl() {
  return (process.env.APP_BASE_URL || process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
}

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

// POST /api/invites — owner sends an invite email
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== "owner") return res.status(403).json({ error: "Only the account owner can invite team members." });
    if (!req.business) return res.status(400).json({ error: "No business configured." });

    const { email, name } = z.object({
      email: z.string().email("Invalid email address"),
      name: z.string().min(1).optional()
    }).parse(req.body);

    const clean = email.trim().toLowerCase();

    // Don't allow inviting someone already on the team
    const existing = await prisma.user.findUnique({ where: { email: clean } });
    if (existing) return res.status(409).json({ error: "A user with this email already has an account." });

    // Invalidate any existing pending invite for this email + business
    await prisma.invitation.deleteMany({
      where: { businessId: req.business.id, email: clean, acceptedAt: null }
    });

    const raw = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");

    await prisma.invitation.create({
      data: {
        businessId: req.business.id,
        email: clean,
        name: name || null,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS)
      }
    });

    const link = `${clientUrl()}/accept-invite?token=${raw}`;

    try {
      await sendInviteEmail({
        to: clean,
        name: name || null,
        businessName: req.business.name,
        inviterName: req.user.name || req.user.email,
        link
      });
    } catch (err) {
      console.error("[invite] email failed:", err.message);
      // Still return success — invitation exists, just email may not have sent
    }

    res.status(201).json({ ok: true, email: clean });
  })
);

// GET /api/invites — list pending invitations for this business
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.business) return res.json({ invitations: [] });
    const invitations = await prisma.invitation.findMany({
      where: { businessId: req.business.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" }
    });
    res.json({ invitations });
  })
);

// DELETE /api/invites/:id — cancel an invite
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.role !== "owner") return res.status(403).json({ error: "Owner access required." });
    await prisma.invitation.deleteMany({
      where: { id: req.params.id, businessId: req.business.id }
    });
    res.json({ ok: true });
  })
);

// GET /api/invites/validate/:token — check invite token (public, no auth required)
router.get(
  "/validate/:token",
  asyncHandler(async (req, res) => {
    const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const invite = await prisma.invitation.findUnique({
      where: { tokenHash },
      include: { business: { select: { name: true } } }
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return res.status(410).json({ error: "This invitation link is invalid or has expired." });
    }
    res.json({ email: invite.email, name: invite.name, businessName: invite.business.name });
  })
);

// POST /api/invites/accept — new user accepts invite and creates their account
router.post(
  "/accept",
  asyncHandler(async (req, res) => {
    const { token, password, name } = z.object({
      token: z.string().min(1),
      password: z.string().min(8, "Password must be at least 8 characters"),
      name: z.string().min(1, "Name is required")
    }).parse(req.body);

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const invite = await prisma.invitation.findUnique({
      where: { tokenHash },
      include: { business: true }
    });

    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return res.status(410).json({ error: "This invitation link is invalid or has expired." });
    }

    // Check if user already exists (e.g. they registered separately after the invite was sent)
    const existing = await prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists. Please log in instead." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: invite.email,
        name,
        passwordHash,
        role: "staff",
        emailVerified: true,
        staffBusinessId: invite.businessId,
        permissions: ["leads:view", "leads:message", "calendar:view"]
      }
    });

    await prisma.invitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() }
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

export default router;
