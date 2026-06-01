import { prisma } from "../prisma/client.js";

function parseTime(date, time) {
  const [hours, minutes] = time.split(":").map(Number);
  const value = new Date(date);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

export async function getAvailableSlots(businessId, daysAhead = 10) {
  const availability = await prisma.businessAvailability.findMany({ where: { businessId } });
  const booked = await prisma.appointment.findMany({
    where: {
      businessId,
      status: "booked",
      startAt: { gte: new Date() }
    }
  });

  const bookedStartTimes = new Set(booked.map((appointment) => appointment.startAt.getTime()));
  const slots = [];
  const now = new Date();

  for (let offset = 0; offset < daysAhead; offset += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + offset);
    const rules = availability.filter((rule) => rule.dayOfWeek === day.getDay());

    for (const rule of rules) {
      let cursor = parseTime(day, rule.startTime);
      const end = parseTime(day, rule.endTime);

      while (cursor < end) {
        const slotEnd = new Date(cursor.getTime() + rule.slotMinutes * 60 * 1000);
        if (slotEnd <= end && cursor > now && !bookedStartTimes.has(cursor.getTime())) {
          slots.push({ startAt: cursor.toISOString(), endAt: slotEnd.toISOString() });
        }
        cursor = slotEnd;
      }
    }
  }

  return slots.slice(0, 12);
}

export async function bookAppointment({ businessId, leadId, startAt, notes }) {
  const slots = await getAvailableSlots(businessId);
  const selected = slots.find((slot) => slot.startAt === startAt);

  if (!selected) {
    throw new Error("Selected appointment slot is no longer available");
  }

  const appointment = await prisma.appointment.create({
    data: {
      businessId,
      leadId,
      startAt: new Date(selected.startAt),
      endAt: new Date(selected.endAt),
      notes
    }
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "appointment_booked", preferredAppointmentTime: selected.startAt }
  });

  return appointment;
}
