import { Router } from "express";
import asyncHandler from "express-async-handler";
import { requireAuth } from "../middleware/auth.js";
import {
  createSession,
  getSession,
  startDemoCall,
  handToAI,
  reconnect,
  endDemoCall,
} from "../services/demoCallService.js";

const router = Router();

function baseUrl(req) {
  const env = process.env.APP_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { contractorPhone, businessName } = req.body;
    if (!contractorPhone) return res.status(400).json({ error: "contractorPhone required" });

    const sessionId = createSession({ contractorPhone, businessName });
    await startDemoCall(sessionId, baseUrl(req));
    res.json({ sessionId });
  })
);

router.post(
  "/hand-to-ai",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });
    await handToAI(sessionId);
    res.json({ success: true });
  })
);

router.post(
  "/reconnect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });
    await reconnect(sessionId);
    res.json({ success: true });
  })
);

router.post(
  "/end",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) await endDemoCall(sessionId);
    res.json({ success: true });
  })
);

router.get(
  "/status/:sessionId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const s = getSession(req.params.sessionId);
    if (!s) return res.status(404).json({ error: "Session not found" });
    res.json({
      status: s.status,
      aiStartedAt: s.aiStartedAt,
      contractorPhone: s.contractorPhone,
      businessName: s.businessName,
    });
  })
);

export default router;
