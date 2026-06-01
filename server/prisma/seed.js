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
  const passwordHash = await bcrypt.hash("password123", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@leadrescue.local" },
    update: { passwordHash },
    create: {
      email: "demo@leadrescue.local",
      passwordHash,
      name: "Jordan Carter"
    }
  });

  await prisma.business.upsert({
    where: { ownerId: user.id },
    update: {},
    create: {
      ownerId: user.id,
      subscriptionPlanId: starter.id,
      name: "Indy Comfort HVAC",
      industryType: "HVAC contractor",
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || "+15551234567",
      businessPhoneNumber: "+15557654321",
      ownerNotificationPhone: "+15559876543",
      ownerNotificationEmail: "demo@leadrescue.local",
      serviceAreas: ["Indianapolis", "Carmel", "Fishers", "Noblesville"],
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

  await prisma.serviceType.deleteMany({ where: { businessId: business.id } });
  await prisma.businessAvailability.deleteMany({ where: { businessId: business.id } });
  await prisma.lead.deleteMany({ where: { businessId: business.id } });

  await prisma.serviceType.createMany({
    data: ["AC repair", "Furnace repair", "No heat call", "No cooling call", "Seasonal maintenance"].map((name) => ({
      businessId: business.id,
      name
    }))
  });

  await prisma.businessAvailability.createMany({
    data: [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
      { businessId: business.id, dayOfWeek, startTime: "09:00", endTime: "12:00", slotMinutes: 60 },
      { businessId: business.id, dayOfWeek, startTime: "13:00", endTime: "17:00", slotMinutes: 60 }
    ])
  });

  const leadOne = await prisma.lead.create({
    data: {
      businessId: business.id,
      customerName: "Maya Thompson",
      customerPhone: "+13175550101",
      address: "412 Maple Street",
      zipCode: "46220",
      jobType: "No heat call",
      urgency: "today",
      issueDescription: "Furnace stopped heating after missed call.",
      source: "missed_call",
      status: "appointment_booked",
      priority: "high",
      aiSummary: "High priority no-heat HVAC call. Customer is available today and provided ZIP 46220.",
      lastMessage: "You're booked for tomorrow morning. The team has your details."
    }
  });

  await prisma.message.createMany({
    data: [
      {
        leadId: leadOne.id,
        direction: "outbound",
        channel: "sms",
        body: "Hi, sorry we missed your call to Indy Comfort HVAC. What HVAC issue do you need help with?"
      },
      {
        leadId: leadOne.id,
        direction: "inbound",
        channel: "sms",
        body: "My name is Maya. My furnace stopped heating and I need help today. 46220."
      },
      {
        leadId: leadOne.id,
        direction: "outbound",
        channel: "sms",
        body: "Thanks, I have enough to get this started. Which appointment works best?"
      }
    ]
  });

  await prisma.appointment.create({
    data: {
      businessId: business.id,
      leadId: leadOne.id,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
      notes: "Demo booked appointment."
    }
  });

  const leadTwo = await prisma.lead.create({
    data: {
      businessId: business.id,
      customerPhone: "+13175550102",
      zipCode: "46032",
      jobType: "HVAC repair",
      urgency: "this week",
      issueDescription: "AC is blowing warm air.",
      source: "sms",
      status: "qualified",
      priority: "normal",
      aiSummary: "Normal HVAC lead in Carmel. Needs AC repair this week.",
      lastMessage: "Which appointment works best?"
    }
  });

  await prisma.message.createMany({
    data: [
      { leadId: leadTwo.id, direction: "inbound", channel: "sms", body: "AC is blowing warm air. I am in 46032." },
      { leadId: leadTwo.id, direction: "outbound", channel: "sms", body: "How urgent is this: emergency, today, this week, or flexible?" },
      { leadId: leadTwo.id, direction: "inbound", channel: "sms", body: "This week is fine." }
    ]
  });

  console.log("Seeded LeadRescue demo data.");
  console.log("Login: demo@leadrescue.local / password123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
