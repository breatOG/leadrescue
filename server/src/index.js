import "dotenv/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Prefer public URL so Railway's internal DNS issues don't block startup
if (process.env.DATABASE_PUBLIC_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

import http from "node:http";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes.js";
import businessRoutes from "./routes/businessRoutes.js";
import leadRoutes from "./routes/leadRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import smsRegistrationRoutes from "./routes/smsRegistrationRoutes.js";
import inviteRoutes from "./routes/inviteRoutes.js";
import { hasTwilioConfig } from "./services/twilioService.js";
import { hasEmailConfig } from "./services/emailService.js";
import { WebSocketServer } from "ws";
import { handleTwilioVoiceStream, aiVoiceEnabled } from "./services/realtimeVoiceService.js";

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "local-dev-only-secret";
  console.warn("[warn] JWT_SECRET not set — using insecure dev default. Set JWT_SECRET in Railway environment variables.");
}

const app = express();
const port = process.env.PORT || 4000;
const server = http.createServer(app);

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: false }));
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mockOpenAI: !process.env.OPENAI_API_KEY,
    mockTwilio: !hasTwilioConfig(),
    mockEmail: !hasEmailConfig()
  });
});

app.get("/legal/privacy", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LeadRescue Privacy Policy</title>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 820px; margin: 40px auto; padding: 0 20px; color: #172033; }
      h1, h2 { line-height: 1.2; }
    </style>
  </head>
  <body>
    <h1>LeadRescue Privacy Policy</h1>
    <p>Last updated: June 1, 2026</p>
    <p>LeadRescue helps local service businesses respond to customer-initiated calls and text messages, qualify service requests, and coordinate appointments.</p>
    <h2>Information We Collect</h2>
    <p>We may collect customer names, phone numbers, service request details, job address or ZIP code, appointment preferences, conversation history, and related notes provided during a service request.</p>
    <h2>How We Use Information</h2>
    <p>We use this information to respond to missed calls and incoming messages, qualify service requests, schedule appointments, send appointment-related updates, and provide summaries to the service business.</p>
    <h2>SMS Messaging</h2>
    <p>Message frequency varies based on the service request and appointment coordination needs, typically 1 to 6 messages per request. Message and data rates may apply. Customers may reply STOP to opt out or HELP for help.</p>
    <h2>Mobile Number Non-Sharing</h2>
    <p>We do not sell, rent, or share mobile phone numbers or SMS consent with third parties for marketing or promotional purposes. Mobile information will not be shared with third parties or affiliates for marketing or promotional purposes.</p>
    <h2>Service Providers</h2>
    <p>We may use service providers, such as communications, hosting, scheduling, and software providers, only as needed to operate the service and support customer-requested communications.</p>
    <h2>Contact</h2>
    <p>For privacy questions, contact the business using the phone number or email address listed where you opted in to receive service communications.</p>
  </body>
</html>`);
});

app.get("/legal/terms", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LeadRescue Terms and Conditions</title>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 820px; margin: 40px auto; padding: 0 20px; color: #172033; }
      h1, h2 { line-height: 1.2; }
    </style>
  </head>
  <body>
    <h1>LeadRescue SMS Terms and Conditions</h1>
    <p>Last updated: June 1, 2026</p>
    <p>By calling or texting a participating service business, you agree to receive conversational SMS messages related to your service request, missed-call follow-up, job qualification, appointment scheduling, and appointment updates.</p>
    <h2>Message Frequency</h2>
    <p>Message frequency varies based on your service request and appointment coordination needs, typically 1 to 6 messages per request.</p>
    <h2>Costs</h2>
    <p>Message and data rates may apply.</p>
    <h2>Opt Out</h2>
    <p>You can cancel SMS messages at any time by replying STOP. After you reply STOP, you may receive a confirmation message and will no longer receive SMS messages for that conversation.</p>
    <h2>Help</h2>
    <p>Reply HELP for help. You may also contact the service business directly using the phone number or email address listed where you opted in.</p>
    <h2>Use Case</h2>
    <p>Messages are used for customer-initiated service requests, missed-call follow-up, service qualification, appointment coordination, and appointment updates. The campaign does not send marketing blasts, cold outreach, or purchased lead-list messages.</p>
    <h2>Privacy</h2>
    <p>See our Privacy Policy for details about data use and mobile number non-sharing.</p>
  </body>
</html>`);
});

app.use("/api/auth", authRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api", appointmentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/sms-registration", smsRegistrationRoutes);
app.use("/api/invites", inviteRoutes);

// Serve the React frontend in production
const clientDist = path.join(serverDir, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/webhooks")) return next();
  res.sendFile(path.join(clientDist, "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  const status = error.name === "ZodError" ? 400 : 500;
  if (status === 400) {
    return res.status(status).json({ error: error.errors });
  }

  if (error.message?.includes("Environment variable not found: DATABASE_URL")) {
    return res.status(500).json({
      error: "Database is not configured. Create server/.env and set DATABASE_URL, then run npm run db:push --workspace server and npm run db:seed --workspace server."
    });
  }

  if (error.code === "P1001" || error.message?.includes("Can't reach database server")) {
    return res.status(500).json({
      error: "Database is not running. Start PostgreSQL, then run npm run db:push --workspace server and npm run db:seed --workspace server."
    });
  }

  return res.status(status).json({ error: error.message || "Server error" });
});

server.listen(port, () => {
  console.log(`LeadRescue API running on http://localhost:${port}`);
});

if (aiVoiceEnabled()) {
  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", handleTwilioVoiceStream);
  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/webhooks/twilio/voice-stream") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else {
      socket.destroy();
    }
  });
  console.log("[voice-ai] WebSocket listener active at /webhooks/twilio/voice-stream");
}
