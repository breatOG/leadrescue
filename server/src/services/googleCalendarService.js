import { google } from "googleapis";

const TZ = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function makeOAuthClient() {
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${base}/api/business/google-callback`
  );
}

export function getGoogleAuthUrl(businessId) {
  return makeOAuthClient().generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state: businessId,
    prompt: "consent",
  });
}

export async function exchangeGoogleCode(code) {
  const { tokens } = await makeOAuthClient().getToken(code);
  return tokens; // { access_token, refresh_token }
}

function calendarClient(accessToken, refreshToken) {
  const auth = makeOAuthClient();
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth });
}

function buildEvent(appointment, lead, businessName) {
  const customerLabel = lead?.customerName || lead?.customerPhone || "Customer";
  const jobLabel      = lead?.jobType || "Service Call";
  const lines = [
    lead?.issueDescription,
    lead?.address  ? `Address: ${lead.address}` : null,
    lead?.urgency  ? `Urgency: ${lead.urgency}` : null,
    `Source: LeadRescue (${appointment.source === "ai" ? "AI scheduled" : "Manual"})`,
  ].filter(Boolean);

  return {
    summary: `${customerLabel} — ${jobLabel}`,
    description: lines.join("\n"),
    start: { dateTime: new Date(appointment.startAt).toISOString(), timeZone: TZ },
    end:   { dateTime: new Date(appointment.endAt).toISOString(),   timeZone: TZ },
    colorId: "2", // sage/teal in Google Calendar
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }] },
  };
}

export async function createGoogleEvent({ accessToken, refreshToken, appointment, lead }) {
  const cal = calendarClient(accessToken, refreshToken);
  const res = await cal.events.insert({
    calendarId: "primary",
    resource: buildEvent(appointment, lead),
  });
  return res.data.id;
}

export async function deleteGoogleEvent({ accessToken, refreshToken, eventId }) {
  if (!eventId) return;
  try {
    const cal = calendarClient(accessToken, refreshToken);
    await cal.events.delete({ calendarId: "primary", eventId });
  } catch { /* already gone */ }
}

export async function updateGoogleEvent({ accessToken, refreshToken, eventId, appointment, lead }) {
  if (!eventId) return;
  try {
    const cal = calendarClient(accessToken, refreshToken);
    await cal.events.update({
      calendarId: "primary",
      eventId,
      resource: buildEvent(appointment, lead),
    });
  } catch { /* ignore update failures */ }
}

// ── .ics feed generator ────────────────────────────────────────────────────────
function icsDate(d) {
  return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsEscape(str) {
  return String(str || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function generateIcsFeed(appointments, businessName) {
  const now = icsDate(new Date());
  const events = appointments.map((a) => {
    const summary = icsEscape(
      `${a.lead?.customerName || a.lead?.customerPhone || "Customer"} — ${a.lead?.jobType || "Service Call"}`
    );
    const desc = icsEscape(
      [a.lead?.address, a.lead?.urgency, a.notes].filter(Boolean).join(", ")
    );
    const status = a.status === "booked" ? "CONFIRMED" : a.status === "completed" ? "CONFIRMED" : "CANCELLED";
    return [
      "BEGIN:VEVENT",
      `UID:${a.id}@leadrescue.app`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(a.startAt)}`,
      `DTEND:${icsDate(a.endAt)}`,
      `SUMMARY:${summary}`,
      desc ? `DESCRIPTION:${desc}` : null,
      `STATUS:${status}`,
      "END:VEVENT",
    ].filter(Boolean).join("\r\n");
  }).join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LeadRescue//LeadRescue//EN",
    `X-WR-CALNAME:${icsEscape(businessName)} — LeadRescue`,
    "X-WR-TIMEZONE:" + TZ,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    events,
    "END:VCALENDAR",
  ].join("\r\n");
}
