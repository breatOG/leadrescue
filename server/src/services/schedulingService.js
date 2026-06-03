import { prisma } from "../prisma/client.js";

const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";
const LOCAL_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

function datePartsInTz(date, tz) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)])
  );
}

function localPartsToUtc({ year, month, day, hour, minute }, tz) {
  const targetLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utcMs = targetLocalMs;

  for (let i = 0; i < 4; i++) {
    const shown = datePartsInTz(new Date(utcMs), tz);
    const shownLocalMs = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour % 24, shown.minute, 0, 0);
    const diffMs = targetLocalMs - shownLocalMs;
    if (diffMs === 0) break;
    utcMs += diffMs;
  }

  return new Date(utcMs);
}

function parseAppointmentStart(startAt) {
  if (startAt instanceof Date) return startAt;
  const raw = String(startAt || "").trim();
  if (LOCAL_DATE_TIME_RE.test(raw)) {
    const [datePart, timePart] = raw.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    return localPartsToUtc({ year, month, day, hour, minute }, BUSINESS_TZ);
  }
  return new Date(raw);
}

// ── Timezone-correct time parsing ────────────────────────────────────────────
// Returns the UTC Date that corresponds to "HH:MM on the calendar day of baseDate"
// as seen in the business timezone.  Uses an iterative approach so DST transitions
// are handled automatically without any external library.
function toUtcAtTzTime(baseDate, timeStr, tz) {
  const [h, m] = timeStr.split(":").map(Number);

  // Step 1: find the calendar date (Y/M/D) in the target timezone for baseDate
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(baseDate)
      .filter(p => p.type !== "literal")
      .map(p => [p.type, Number(p.value)])
  );

  // Step 2: seed with a UTC timestamp at the nominal h:m on that calendar date
  let utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, h, m, 0, 0);

  // Step 3: iterate to correct for the actual timezone offset (1–2 rounds is always enough)
  for (let i = 0; i < 3; i++) {
    const shown = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date(utcMs));
    const shownH = Number(shown.find(p => p.type === "hour").value) % 24;
    const shownM = Number(shown.find(p => p.type === "minute").value);
    const diffMs = ((h - shownH) * 60 + (m - shownM)) * 60_000;
    if (diffMs === 0) break;
    utcMs += diffMs;
  }

  return new Date(utcMs);
}

// Returns 0 (Sun) – 6 (Sat) for a date as seen in the given timezone
function dayOfWeekInTz(date, tz) {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(date);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[label] ?? 0;
}

// ── Available slots ───────────────────────────────────────────────────────────
export async function getAvailableSlots(businessId, daysAhead = 10) {
  const availability = await prisma.businessAvailability.findMany({ where: { businessId } });
  const booked = await prisma.appointment.findMany({
    where: { businessId, status: "booked", startAt: { gte: new Date() } }
  });

  const slots = [];
  const now = new Date();

  for (let d = 0; d < daysAhead; d++) {
    // Advance by whole days in ms so we don't drift across DST boundaries
    const day = new Date(now.getTime() + d * 86_400_000);
    const dow = dayOfWeekInTz(day, BUSINESS_TZ);
    const rules = availability.filter(r => r.dayOfWeek === dow);

    for (const rule of rules) {
      let cursor = toUtcAtTzTime(day, rule.startTime, BUSINESS_TZ);
      const end  = toUtcAtTzTime(day, rule.endTime,   BUSINESS_TZ);

      while (cursor < end) {
        const slotEnd = new Date(cursor.getTime() + rule.slotMinutes * 60_000);
        // Overlap check — hides any slot touched by an existing booking
        const overlaps = booked.some(b =>
          cursor.getTime() < b.endAt.getTime() &&
          slotEnd.getTime() > b.startAt.getTime()
        );
        if (slotEnd <= end && cursor > now && !overlaps) {
          slots.push({ startAt: cursor.toISOString(), endAt: slotEnd.toISOString() });
        }
        cursor = slotEnd;
      }
    }
  }

  return slots.slice(0, 12);
}

// ── Book appointment ──────────────────────────────────────────────────────────
export async function bookAppointment({ businessId, leadId, startAt, notes, force = false, source = "ai" }) {
  let selected;
  const selectedStart = parseAppointmentStart(startAt);

  if (force) {
    const selectedEnd = new Date(selectedStart.getTime() + 60 * 60_000);

    // Even with force=true we must reject overlapping bookings
    const conflict = await prisma.appointment.findFirst({
      where: {
        businessId,
        status: "booked",
        AND: [
          { startAt: { lt: selectedEnd } },
          { endAt:   { gt: selectedStart } },
        ],
      },
    });
    if (conflict) {
      const conflictStr = new Date(conflict.startAt).toLocaleString("en-US", {
        timeZone: BUSINESS_TZ, weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
      throw new Error(`That time overlaps with an existing appointment at ${conflictStr}. Please choose a different time.`);
    }

    selected = { startAt: selectedStart.toISOString(), endAt: selectedEnd.toISOString() };
  } else {
    const slots = await getAvailableSlots(businessId);
    // Lenient match (within 60 s) so minor floating-point differences don't break booking
    selected = slots.find(s => Math.abs(new Date(s.startAt) - selectedStart) < 60_000);
    if (!selected) throw new Error("Selected appointment slot is no longer available");
  }

  const appointment = await prisma.appointment.create({
    data: {
      businessId,
      leadId,
      startAt: new Date(selected.startAt),
      endAt:   new Date(selected.endAt),
      source,
      notes,
    },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "appointment_booked", preferredAppointmentTime: selected.startAt },
  });

  return appointment;
}
