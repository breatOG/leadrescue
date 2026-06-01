import express from "express";
import Stripe from "stripe";
import asyncHandler from "express-async-handler";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post(
  "/custom-link",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY to your environment." });
    }

    const { clientName, clientEmail, amount, description } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: "A valid amount is required." });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
              ...(clientName ? { description: `For ${clientName}` } : {}),
            },
          },
        },
      ],
      success_url: `${baseUrl}/dashboard?payment=success`,
      cancel_url: `${baseUrl}/dashboard?payment=cancelled`,
    });

    res.json({ url: session.url });
  })
);

export default router;
