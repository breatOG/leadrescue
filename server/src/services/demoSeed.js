import bcrypt from "bcryptjs";
import { prisma } from "../prisma/client.js";

const DEMO_EMAIL    = "breataronov@gmail.com";
const DEMO_PASSWORD = "leadrescue";
const DEMO_PHONE    = "+13177902426";

export async function seedDemoAccount() {
  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: {
        passwordHash,
        emailVerified: true,
        subscriptionStatus: "active",
        subscriptionPlan: "pro",
      },
      create: {
        email: DEMO_EMAIL,
        passwordHash,
        name: "Breat",
        role: "owner",
        emailVerified: true,
        subscriptionStatus: "active",
        subscriptionPlan: "pro",
      },
    });

    const existing = await prisma.business.findUnique({ where: { ownerId: user.id } });

    if (existing) {
      await prisma.business.update({
        where: { id: existing.id },
        data: { twilioPhoneNumber: DEMO_PHONE },
      });
    } else {
      await prisma.business.create({
        data: {
          ownerId: user.id,
          name: "LeadRescue Demo",
          industryType: "construction",
          twilioPhoneNumber: DEMO_PHONE,
        },
      });
    }

    // Seed Mon–Sat 8 AM–6 PM availability if the business has none
    const bizRecord = await prisma.business.findUnique({ where: { ownerId: user.id }, include: { availability: true } });
    if (bizRecord && bizRecord.availability.length === 0) {
      const workDays = [1, 2, 3, 4, 5, 6]; // Mon–Sat
      await prisma.businessAvailability.createMany({
        data: workDays.map((day) => ({
          businessId: bizRecord.id,
          dayOfWeek: day,
          startTime: "08:00",
          endTime: "18:00",
          slotMinutes: 60,
        })),
      });
      console.log("[demo-seed] ✅ Availability seeded Mon–Sat 8 AM–6 PM");
    }

    console.log(`[demo-seed] ✅ ${DEMO_EMAIL} → phone ${DEMO_PHONE}`);
  } catch (err) {
    console.error("[demo-seed] failed:", err.message);
  }
}
