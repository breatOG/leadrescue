# LeadRescue

LeadRescue is a full-stack SaaS MVP for local home-service and construction companies. It recovers missed calls with instant SMS, qualifies leads with AI, supports AI voice answering through Twilio Media Streams, books appointments from local database availability, and gives contractors a dashboard for conversations, scheduling, team access, billing, and business setup.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL + Prisma
- Auth: email/password with JWT
- Email: SMTP or Resend for verification, password reset, and team invites
- AI: OpenAI API for lead qualification, suggested replies, and optional realtime voice; local mock mode when `OPENAI_API_KEY` is empty
- Phone/SMS: Twilio, with local mock mode when Twilio credentials are empty
- Payments: Stripe subscriptions, billing portal, usage limits, and custom payment links
- Scheduling: database-backed slots now, Google Calendar integration-ready later

## Current Features

- Public pricing/register/login flows with email verification and password reset
- Contractor dashboard with lead counts, missed-call recovery stats, appointments, and recent conversations
- Lead inbox and detail pages with message history, editable lead fields, manual SMS replies, AI/human handoff, and AI reply suggestions
- Missed-call recovery via Twilio voice webhook and SMS follow-up
- Incoming SMS handling that stores conversations, runs the AI lead agent, updates lead status/priority/summary, and replies by SMS
- Optional live AI voice answering with Twilio Media Streams and OpenAI Realtime
- Calendar view with locally generated availability and appointment booking
- Business settings for service areas, service types, hours, availability, notification contacts, Twilio numbers, and call handling
- Twilio phone-number search/provisioning, existing-number connection, webhook reconfiguration, and A2P 10DLC SMS registration workflow
- Stripe subscription checkout, plan changes, customer portal, monthly usage reporting, and one-off custom payment links
- Owner/staff team management with invite links and scoped permissions
- Hosted privacy and terms pages for SMS compliance

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a PostgreSQL database named `leadrescue`.

3. For instant local testing, keep `DEMO_MODE=true` in `server/.env`. This uses in-memory demo data and does not require PostgreSQL.

4. To test with PostgreSQL instead, set `DEMO_MODE=false`, update `DATABASE_URL`, then run:

   ```bash
   npm run db:generate --workspace server
   npm run db:push --workspace server
   npm run db:seed --workspace server
   ```

5. Run the app:

   ```bash
   npm run dev
   ```

6. Open:

   - Contractor app: `http://localhost:5173`
   - API health: `http://localhost:4000/health`

Demo login:

- Email: `demo@leadrescue.local`
- Password: `password123`

## Environment Variables

`server/.env.example` includes the core server variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `OPENAI_API_KEY`
- `OPENAI_REALTIME_MODEL`
- `OPENAI_REALTIME_VOICE`
- `ENABLE_AI_VOICE`
- `ENABLE_VOICE_MEMORY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_API_KEY_SID`
- `TWILIO_API_KEY_SECRET`
- `TWILIO_PHONE_NUMBER`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `RESEND_API_KEY`
- `APP_BASE_URL`
- `CLIENT_URL`
- Stripe variables such as `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, and `STRIPE_PRICE_SCALE` when payments are enabled

If OpenAI, Twilio, or email keys are missing, the app uses mock or best-effort behavior where possible so local testing still works.

## Twilio Webhook Configuration

When exposing the API with a tunnel such as ngrok, set `APP_BASE_URL` to the public tunnel URL and configure these Twilio webhooks:

- Voice incoming call webhook: `POST {APP_BASE_URL}/webhooks/twilio/voice`
- Call status callback: `POST {APP_BASE_URL}/webhooks/twilio/call-status`
- Messaging incoming SMS webhook: `POST {APP_BASE_URL}/webhooks/twilio/sms`

The voice webhook returns TwiML saying the team is helping another customer and that a text was sent. It also creates or reuses a lead, sends the missed-call recovery SMS, stores the outbound message, and notifies the contractor.

## AI Voice Testing

Live AI phone conversations are available through Twilio Media Streams and OpenAI Realtime.

Set these in `server/.env`:

```bash
OPENAI_API_KEY="sk-..."
ENABLE_AI_VOICE=true
OPENAI_REALTIME_MODEL="gpt-realtime-mini"
OPENAI_REALTIME_VOICE="marin"
APP_BASE_URL="https://your-public-tunnel-url"
```

Keep the Twilio voice webhook pointed to:

```text
https://your-public-tunnel-url/webhooks/twilio/voice
```

When `OPENAI_API_KEY` is present, the voice webhook connects the call to:

```text
wss://your-public-tunnel-url/webhooks/twilio/voice-stream
```

If the OpenAI key is missing, calls fall back to the short TwiML missed-call message.

The SMS webhook finds or creates a lead based on the customer phone and business Twilio number, stores the inbound message, runs the AI lead agent, stores the response, sends the response by SMS, and updates lead status, priority, summary, and extracted fields.

## Main Routes

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `GET /api/auth/users`
- `POST /api/auth/users`
- `DELETE /api/auth/users/:id`
- `PATCH /api/auth/users/:id/permissions`
- `PATCH /api/auth/password`

Business:

- `GET /api/business/settings`
- `PUT /api/business/settings`
- `GET /api/business/available-numbers`
- `POST /api/business/provision-phone`
- `POST /api/business/connect-existing-number`
- `POST /api/business/reconfigure-webhooks`

Leads:

- `GET /api/leads`
- `GET /api/leads/:id`
- `PATCH /api/leads/:id`
- `POST /api/leads/:id/manual-message`
- `POST /api/leads/:id/handoff`
- `POST /api/leads/:id/suggest-reply`

Appointments:

- `GET /api/appointments`
- `POST /api/appointments/book`
- `GET /api/availability`

Dashboard:

- `GET /api/dashboard`

Payments:

- `POST /api/payments/subscribe`
- `POST /api/payments/verify-session`
- `POST /api/payments/custom-link`
- `POST /api/payments/change-plan`
- `POST /api/payments/portal`
- `GET /api/payments/usage`
- `POST /api/payments/webhook`

SMS registration:

- `GET /api/sms-registration`
- `POST /api/sms-registration/submit`
- `POST /api/sms-registration/refresh`

Invites:

- `POST /api/invites`
- `GET /api/invites`
- `DELETE /api/invites/:id`
- `GET /api/invites/validate/:token`
- `POST /api/invites/accept`

Twilio:

- `POST /webhooks/twilio/voice`
- `WSS /webhooks/twilio/voice-stream`
- `GET /webhooks/twilio/tts/:id`
- `POST /webhooks/twilio/screen`
- `POST /webhooks/twilio/screen-accept`
- `POST /webhooks/twilio/after-dial`
- `POST /webhooks/twilio/voice-gather`
- `POST /webhooks/twilio/call-status`
- `POST /webhooks/twilio/sms`

Legal:

- `GET /legal/privacy`
- `GET /legal/terms`

## Later-Ready Architecture

Service boundaries are under `server/src/services`:

- `aiLeadAgent.js`: AI receptionist behavior and structured lead extraction
- `twilioService.js`: SMS/TwiML integration and mock mode
- `realtimeVoiceService.js`: Twilio Media Streams and OpenAI Realtime bridge
- `schedulingService.js`: local slot generation and appointment booking
- `notificationService.js`: contractor alerts
- `emailService.js`: SMTP/Resend transactional emails
- `tokenService.js`: JWT signing

The app is still structured so external scheduling and deeper CRM integrations can be added without rewriting lead, message, scheduling, or dashboard flows.
