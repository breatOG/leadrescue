import express from "express";
import Stripe from "stripe";
import asyncHandler from "express-async-handler";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../prisma/client.js";

const router = express.Router();

const PLAN_NAMES = { starter: "Starter", pro: "Pro", scale: "Scale" };

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
        }
        break;
      }
      case "customer.subscription.deleted":
      case "customer.subscription.paused": {
        const sub = event.data.object;
        await prisma.user.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { subscriptionStatus: "inactive" }
        });
        console.log(`[stripe] Subscription deactivated: ${sub.id}`);
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
        await prisma.user.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { subscriptionStatus: status }
        });
        break;
      }
    }

    res.json({ received: true });
  })
);

export default router;
