import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plans = [
    { name: "Starter", priceCents: 19900, description: "Missed-call text-back, AI qualification, basic dashboard." },
    { name: "Pro", priceCents: 49900, description: "More automations, expanded reporting, priority lead alerts." },
    { name: "Premium", priceCents: 99900, description: "Multi-location workflows and premium support." }
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan
    });
  }

  const starter = await prisma.subscriptionPlan.findUnique({ where: { name: "Starter" } });

  // Owner account — password only set on first create, never reset on restart
  const initialHash = await bcrypt.hash("LeadRescue1!", 12);
  const user = await prisma.user.upsert({
    where: { email: "owner@leadrescue.app" },
    update: {}, // never overwrite password after first create
    create: {
      email: "owner@leadrescue.app",
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || "+13179519758",
      passwordHash: initialHash,
      name: "Owner",
      role: "owner",
      subscriptionStatus: "active",
      subscriptionPlan: "pro"
    }
  });

  const twilioPhone = process.env.TWILIO_PHONE_NUMBER || "+13179519758";

  // Ensure only the owner's business owns the Twilio number
  await prisma.business.updateMany({
    where: { twilioPhoneNumber: twilioPhone, ownerId: { not: user.id } },
    data: { twilioPhoneNumber: null }
  });

  // Always keep the owner's business phone number up to date
  await prisma.business.upsert({
    where: { ownerId: user.id },
    update: { twilioPhoneNumber: twilioPhone },
    create: {
      ownerId: user.id,
      subscriptionPlanId: (await prisma.subscriptionPlan.findUnique({ where: { name: "Starter" } }))?.id,
      name: "My Business",
      industryType: "General Contractor",
      twilioPhoneNumber: twilioPhone,
      ownerNotificationEmail: "owner@leadrescue.app",
      serviceAreas: [],
      businessHours: {
        monday: "8:00 AM - 5:00 PM",
        tuesday: "8:00 AM - 5:00 PM",
        wednesday: "8:00 AM - 5:00 PM",
        thursday: "8:00 AM - 5:00 PM",
        friday: "8:00 AM - 5:00 PM"
      }
    }
  });

  const business = await prisma.business.findUnique({ where: { ownerId: user.id } });

  // Only set up service types and availability if not already configured
  const existingTypes = await prisma.serviceType.count({ where: { businessId: business.id } });
  if (existingTypes === 0) {
    await prisma.serviceType.createMany({
      data: ["AC repair", "Furnace repair", "No heat call", "No cooling call", "Seasonal maintenance"].map((name) => ({
        businessId: business.id,
        name
      }))
    });
  }

  const existingAvailability = await prisma.businessAvailability.count({ where: { businessId: business.id } });
  if (existingAvailability === 0) {
    await prisma.businessAvailability.createMany({
      data: [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
        { businessId: business.id, dayOfWeek, startTime: "09:00", endTime: "12:00", slotMinutes: 60 },
        { businessId: business.id, dayOfWeek, startTime: "13:00", endTime: "17:00", slotMinutes: 60 }
      ])
    });
  }

  console.log("LeadRescue setup complete.");
  console.log(`Login: ${process.env.TWILIO_PHONE_NUMBER || "+13179519758"} / LeadRescue1!`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
