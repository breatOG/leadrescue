import express from "express";
import Stripe from "stripe";
import asyncHandler from "express-async-handler";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../prisma/client.js";
import { sendRenewalReminderEmail, sendRenewalConfirmationEmail } from "../services/emailService.js";
import { provisionNumberForBusiness, poolNumberFromUser } from "../services/phoneProvisioningService.js";

const router = express.Router();

const PLAN_NAMES = { starter: "Starter", pro: "Pro", scale: "Scale" };

export const PLAN_LIMITS = {
  starter: { leadsPerMonth: 100, voice: false, locations: 1, label: "Starter" },
  pro:     { leadsPerMonth: 500, voice: true,  locations: 1, label: "Pro" },
  scale:   { leadsPerMonth: Infinity, voice: true, locations: 10, label: "Scale" },
};

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function getPriceId(plan) {
  const ids = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    scale: process.env.STRIPE_PRICE_SCALE
  };
  return ids[plan] || null;
}

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

async function autoProvisionNumber(userId, plan) {
  // Pro and Scale subscribers choose their own number via the ZIP picker in Settings.
  // Only Starter gets one assigned automatically from the pool.
  if ((plan || "").toLowerCase() !== "starter") return;
  const baseUrl = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  if (!baseUrl) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const business = user ? await prisma.business.findUnique({ where: { ownerId: userId } }) : null;
    if (user && business) {
      await provisionNumberForBusiness({ user, business, baseUrl });
    }
  } catch (e) {
    console.error("[auto-provision] Failed:", e.message);
  }
}

// POST /api/payments/subscribe — create Stripe subscription checkout session
router.post(
  "/subscribe",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { plan } = req.body;
    if (!PLAN_NAMES[plan]) return res.status(400).json({ error: "Invalid plan. Choose starter, pro, or scale." });

    const stripe = getStripe();
    const baseUrl = (process.env.APP_BASE_URL || process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");

    const priceId = getPriceId(plan);
    if (!priceId) {
      return res.status(503).json({
        error: `STRIPE_PRICE_${plan.toUpperCase()} is not configured. Add it to your environment variables.`
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: req.user.stripeCustomerId || undefined,
      customer_email: req.user.stripeCustomerId ? undefined : req.user.email,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?sub=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/subscribe`,
      metadata: { userId: req.user.id, plan }
    });

    res.json({ url: session.url });
  })
);

// POST /api/payments/verify-session — called on success redirect as a fallback to the webhook
router.post(
  "/verify-session",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId is required." });

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid" && session.status !== "complete") {
      return res.status(402).json({ error: "Payment not yet completed." });
    }

    const plan = session.metadata?.plan;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        subscriptionStatus: "active",
        subscriptionPlan: plan || req.user.subscriptionPlan,
        stripeSubscriptionId: session.subscription || req.user.stripeSubscriptionId,
        stripeCustomerId: session.customer || req.user.stripeCustomerId
      }
    });

    autoProvisionNumber(req.user.id, plan || req.user.subscriptionPlan); // Starter only
    res.json({ user: publicUser(user) });
  })
);

// POST /api/payments/custom-link — generate a one-off Stripe payment link
router.post(
  "/custom-link",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { clientName, clientEmail, amount, description } = req.body;
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: "A valid amount is required." });
    }

    const stripe = getStripe();
    const baseUrl = (process.env.APP_BASE_URL || process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: clientEmail || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(Number(amount) * 100),
            product_data: {
              name: description || "Custom Service",
              ...(clientName ? { description: `For ${clientName}` } : {})
            }
          }
        }
      ],
      success_url: `${baseUrl}/dashboard?payment=success`,
      cancel_url: `${baseUrl}/dashboard?payment=cancelled`
    });

    res.json({ url: session.url });
  })
);

// POST /api/payments/change-plan — instantly switch subscription plan (prorated)
router.post(
  "/change-plan",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { plan } = req.body;
    if (!PLAN_NAMES[plan]) return res.status(400).json({ error: "Invalid plan." });

    const priceId = getPriceId(plan);
    if (!priceId) return res.status(503).json({ error: `STRIPE_PRICE_${plan.toUpperCase()} is not configured.` });

    if (!req.user.stripeSubscriptionId) {
      return res.status(400).json({ error: "No active subscription found. Please subscribe first." });
    }

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(req.user.stripeSubscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) return res.status(400).json({ error: "Could not find subscription item." });

    await stripe.subscriptions.update(req.user.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "create_prorations"
    });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { subscriptionPlan: plan }
    });

    const { passwordHash, ...safe } = user;
    res.json({ ok: true, plan, user: safe });
  })
);

// POST /api/payments/portal — create Stripe customer portal session (upgrade/downgrade/cancel)
router.post(
  "/portal",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user.stripeCustomerId) {
      return res.status(400).json({ error: "No billing account found. Please subscribe first." });
    }

    const stripe = getStripe();
    const baseUrl = (process.env.APP_BASE_URL || process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");

    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripeCustomerId,
      return_url: `${baseUrl}/settings`
    });

    res.json({ url: session.url });
  })
);

// GET /api/payments/usage — current plan limits and lead usage this month
router.get(
  "/usage",
  requireAuth,
  asyncHandler(async (req, res) => {
    const plan = (req.user.subscriptionPlan || "starter").toLowerCase();
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const leadsThisMonth = await prisma.lead.count({
      where: { businessId: req.business.id, createdAt: { gte: startOfMonth } }
    });

    res.json({
      plan,
      planLabel: limits.label,
      subscriptionStatus: req.user.subscriptionStatus,
      renewsAt: req.user.subscriptionRenewsAt || null,
      leadsThisMonth,
      leadsLimit: limits.leadsPerMonth,
      voice: limits.voice,
      locations: limits.locations,
      numberType: ["pro","scale"].includes(plan) ? "choose" : "auto",
      twilioPhoneNumber: req.business.twilioPhoneNumber || null
    });
  })
);

// POST /api/payments/webhook — Stripe webhook (subscription lifecycle)
router.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    if (webhookSecret) {
      try {
        const stripe = getStripe();
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
      } catch (err) {
        console.error("[stripe] Webhook signature failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    } else {
      event = req.body;
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan;
        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionStatus: "active",
              subscriptionPlan: plan,
              stripeSubscriptionId: session.subscription,
              stripeCustomerId: session.customer
            }
          });
          console.log(`[stripe] Subscription activated for user ${userId} (${plan})`);
          autoProvisionNumber(userId, plan); // Starter only — Pro/Scale pick their own
        }
        break;
      }
      case "customer.subscription.deleted": {
        // Subscription has fully ended (cancel_at_period_end reached its end date).
        // Only now do we recycle the number — NOT when they first clicked "cancel".
        const sub = event.data.object;
        const affected = await prisma.user.findMany({ where: { stripeSubscriptionId: sub.id }, select: { id: true } });
        await prisma.user.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { subscriptionStatus: "inactive", subscriptionRenewsAt: null }
        });
        for (const u of affected) poolNumberFromUser(u.id).catch(() => {});
        console.log(`[stripe] Subscription ended and number recycled: ${sub.id}`);
        break;
      }
      case "customer.subscription.paused": {
        // Paused (e.g. dunning) — mark status but do NOT recycle the number yet.
        const sub = event.data.object;
        await prisma.user.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { subscriptionStatus: "inactive" }
        });
        console.log(`[stripe] Subscription paused (number kept): ${sub.id}`);
        break;
      }
      case "invoice.payment_succeeded": {
        // Fires on every successful charge — first payment AND renewals.
        const invoice = event.data.object;
        if (!invoice.subscription || invoice.billing_reason === "subscription_create") break; // skip initial payment
        const renewedUser = await prisma.user.findFirst({ where: { stripeSubscriptionId: invoice.subscription } });
        if (!renewedUser) break;
        const nextRenewal = new Date(invoice.period_end * 1000);
        await prisma.user.update({
          where: { id: renewedUser.id },
          data: { subscriptionStatus: "active", subscriptionRenewsAt: nextRenewal }
        });
        await sendRenewalConfirmationEmail({
          to: renewedUser.email,
          name: renewedUser.name,
          renewalDate: nextRenewal,
          plan: renewedUser.subscriptionPlan,
          amountCents: invoice.amount_paid
        }).catch((e) => console.error("[stripe] Renewal confirmation email failed:", e.message));
        console.log(`[stripe] Subscription renewed for ${renewedUser.email} until ${nextRenewal.toISOString()}`);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await prisma.user.updateMany({
            where: { stripeSubscriptionId: invoice.subscription },
            data: { subscriptionStatus: "past_due" }
          });
          console.log(`[stripe] Payment failed for subscription: ${invoice.subscription}`);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const status = sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "inactive";

        const priceId = sub.items?.data?.[0]?.price?.id;
        const planByPrice = {
          [process.env.STRIPE_PRICE_STARTER]: "starter",
          [process.env.STRIPE_PRICE_PRO]: "pro",
          [process.env.STRIPE_PRICE_SCALE]: "scale"
        };
        const newPlan = priceId ? (planByPrice[priceId] || null) : null;
        const renewsAt = sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined;

        await prisma.user.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            subscriptionStatus: status,
            ...(newPlan ? { subscriptionPlan: newPlan } : {}),
            ...(renewsAt ? { subscriptionRenewsAt: renewsAt } : {})
          }
        });
        console.log(`[stripe] Subscription updated: ${sub.id} → status=${status}${newPlan ? ` plan=${newPlan}` : ""}`);
        break;
      }
      case "invoice.upcoming": {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const user = await prisma.user.findFirst({
            where: { stripeSubscriptionId: invoice.subscription }
          });
          if (user?.email) {
            const renewalDate = new Date(invoice.period_end * 1000);
            await sendRenewalReminderEmail({
              to: user.email,
              name: user.name,
              renewalDate,
              plan: user.subscriptionPlan,
              amountCents: invoice.amount_due
            }).catch((e) => console.error("[stripe] Renewal reminder email failed:", e.message));
            console.log(`[stripe] Renewal reminder sent to ${user.email} for subscription ${invoice.subscription}`);
          }
        }
        break;
      }
    }

    res.json({ received: true });
  })
);

export default router;
