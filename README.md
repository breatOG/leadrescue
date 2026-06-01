# LeadRescue

LeadRescue is a full-stack SaaS MVP for local construction service companies. It recovers missed calls with instant SMS, qualifies leads with AI, books appointments from local database availability, and gives contractors concise lead summaries.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL + Prisma
- Auth: email/password with JWT
- AI: OpenAI API, with local mock mode when `OPENAI_API_KEY` is empty
- Phone/SMS: Twilio, with local mock mode when Twilio credentials are empty
- Scheduling: database-backed slots now, Google Calendar integration-ready later

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

The root `.env.example` includes all expected variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `APP_BASE_URL`
- `CLIENT_URL`

If OpenAI or Twilio keys are missing, the app runs in mock mode so local testing still works.

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

## MVP Routes

Auth:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

Business:

- `GET /api/business/settings`
- `PUT /api/business/settings`

Leads:

- `GET /api/leads`
- `GET /api/leads/:id`
- `PATCH /api/leads/:id`
- `POST /api/leads/:id/manual-message`

Appointments:

- `GET /api/appointments`
- `POST /api/appointments/book`
- `GET /api/availability`

Twilio:

- `POST /webhooks/twilio/voice`
- `POST /webhooks/twilio/call-status`
- `POST /webhooks/twilio/sms`

## Later-Ready Architecture

Service boundaries are under `server/src/services`:

- `aiLeadAgent.js`: AI receptionist behavior and structured lead extraction
- `twilioService.js`: SMS/TwiML integration and mock mode
- `schedulingService.js`: local slot generation and appointment booking
- `notificationService.js`: contractor alerts

AI voice answering can be added later by extending Twilio Voice webhook handling and adding an OpenAI Realtime service without rewriting lead, message, scheduling, or dashboard flows.
