import bcrypt from "bcryptjs";
import { prisma } from "../prisma/client.js";

const DEMO_EMAIL    = "breataronov@gmail.com";
const DEMO_PASSWORD = "leadrescue";
const DEMO_PHONE    = "+13177902426";
const DEMO_TAG      = "[demo-seed]";

const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";

function datePartsInTz(date, tz) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric"
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function toUtcAtBusinessTime(dayOffset, hour, minute = 0) {
  const base = new Date(Date.now() + dayOffset * 86_400_000);
  const parts = datePartsInTz(base, BUSINESS_TZ);
  let utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0, 0);

  for (let i = 0; i < 4; i++) {
    const shown = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: BUSINESS_TZ,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      })
        .formatToParts(new Date(utcMs))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)])
    );
    const shownLocalMs = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour % 24, shown.minute, 0, 0);
    const targetLocalMs = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0, 0);
    const diffMs = targetLocalMs - shownLocalMs;
    if (diffMs === 0) break;
    utcMs += diffMs;
  }

  return new Date(utcMs);
}

function ago(hours) {
  return new Date(Date.now() - hours * 60 * 60_000);
}

function appointment(dayOffset, hour, status = "booked", source = "ai") {
  const startAt = toUtcAtBusinessTime(dayOffset, hour);
  return {
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60_000),
    status,
    source
  };
}

const demoLeads = [
  {
    customerName: "Megan Carter",
    customerPhone: "+13175550111",
    source: "missed_call",
    status: "appointment_booked",
    priority: "high",
    jobType: "No cooling call",
    urgency: "today",
    address: "1428 Winfield Ave",
    zipCode: "46220",
    issueDescription: "AC is blowing warm air and the house is getting hot.",
    aiSummary: "High-priority AC lead. Customer confirmed address and booked the earliest open afternoon slot.",
    lastMessage: "Your appointment is confirmed for today at 2:00 PM.",
    appointment: appointment(0, 14, "booked", "ai"),
    messages: [
      ["inbound", "voice", "Hi, our AC is running but it is only blowing warm air.", 10],
      ["outbound", "voice", "Oof, sorry about that. Is the home getting uncomfortable already?", 9.9],
      ["inbound", "voice", "Yes, it is 80 inside. We are at 1428 Winfield Ave.", 9.8],
      ["outbound", "voice", "I have that. We can do today at 2 PM. Does that work?", 9.7],
      ["inbound", "voice", "Yes, book that please.", 9.6]
    ]
  },
  {
    customerName: "Darius Miller",
    customerPhone: "+13175550112",
    source: "sms",
    status: "qualified",
    priority: "normal",
    jobType: "Water heater repair",
    urgency: "this week",
    address: "809 Keystone Crossing",
    zipCode: "46240",
    issueDescription: "Water heater is making a popping sound and hot water runs out quickly.",
    aiSummary: "Customer needs water heater diagnosis this week. Waiting for them to choose one of the offered slots.",
    lastMessage: "I can do tomorrow at 10 AM or 1 PM. Which works better?",
    messages: [
      ["inbound", "sms", "Need someone to look at my water heater. It is making a popping noise.", 30],
      ["outbound", "sms", "We can help with that. What address or ZIP is the job at?", 29.8],
      ["inbound", "sms", "46240, Keystone Crossing area.", 29.5],
      ["outbound", "sms", "Thanks. I can do tomorrow at 10 AM or 1 PM. Which works better?", 29.3]
    ]
  },
  {
    customerName: "Alisha Grant",
    customerPhone: "+13175550113",
    source: "missed_call",
    status: "appointment_booked",
    priority: "emergency",
    jobType: "Active leak",
    urgency: "emergency",
    address: "52 North Temple Ave",
    zipCode: "46201",
    issueDescription: "Active ceiling leak from upstairs bathroom.",
    aiSummary: "Emergency leak call. Customer was told to shut off water if safe. Appointment booked for the next emergency slot.",
    lastMessage: "Emergency appointment confirmed.",
    appointment: appointment(0, 16, "booked", "ai"),
    messages: [
      ["inbound", "voice", "Water is coming through the ceiling under our bathroom.", 7],
      ["outbound", "voice", "Oh my gosh, okay. If you can safely shut the water off, do that now.", 6.9],
      ["inbound", "voice", "We shut it off. Can someone come today?", 6.8],
      ["outbound", "voice", "Yes, the emergency opening today at 4 PM is available. I booked it for you.", 6.7]
    ]
  },
  {
    customerName: "Ron Patel",
    customerPhone: "+13175550114",
    source: "sms",
    status: "appointment_booked",
    priority: "normal",
    jobType: "Furnace maintenance",
    urgency: "flexible",
    address: "2338 Carrollton Ave",
    zipCode: "46205",
    issueDescription: "Annual furnace tune-up before winter.",
    aiSummary: "Routine maintenance lead. Customer chose a flexible morning appointment.",
    lastMessage: "You are booked for Friday morning.",
    appointment: appointment(3, 9, "booked", "manual"),
    messages: [
      ["inbound", "sms", "Can I schedule a furnace tune-up sometime this week?", 42],
      ["outbound", "sms", "Absolutely. Are mornings or afternoons better?", 41.8],
      ["inbound", "sms", "Morning is best.", 41.6],
      ["outbound", "sms", "Friday at 9 AM is open. Want me to book it?", 41.4],
      ["inbound", "sms", "Yes thanks.", 41.2]
    ]
  },
  {
    customerName: "Tanya Brooks",
    customerPhone: "+13175550115",
    source: "missed_call",
    status: "texting",
    priority: "normal",
    jobType: "Roof estimate",
    urgency: "this week",
    address: "620 Orange St",
    zipCode: "46203",
    issueDescription: "Missing shingles after wind and wants estimate.",
    aiSummary: "Roof estimate lead. AI collected details and asked for photo availability.",
    lastMessage: "Do you have any photos of the missing shingles?",
    messages: [
      ["inbound", "voice", "We lost a few shingles in the wind and need an estimate.", 18],
      ["outbound", "voice", "Got it. Is anything leaking inside right now?", 17.9],
      ["inbound", "voice", "No leak, just missing shingles.", 17.8],
      ["outbound", "sms", "Thanks. Do you have any photos of the missing shingles?", 17.6]
    ]
  },
  {
    customerName: "Chris Nguyen",
    customerPhone: "+13175550116",
    source: "sms",
    status: "closed",
    priority: "low",
    jobType: "Gutter cleaning",
    urgency: "flexible",
    address: "118 College Ave",
    zipCode: "46202",
    issueDescription: "Asked about gutter cleaning, then decided to wait.",
    aiSummary: "Customer decided to wait and asked to close the request.",
    lastMessage: "No problem, we will close this out for now.",
    messages: [
      ["inbound", "sms", "Do you do gutter cleaning?", 90],
      ["outbound", "sms", "Yes, we can help. What ZIP code is the home in?", 89.8],
      ["inbound", "sms", "Actually I am going to wait. Thanks.", 89.6],
      ["outbound", "sms", "No problem, we will close this out for now.", 89.4]
    ]
  },
  {
    customerName: "Brittany Evans",
    customerPhone: "+13175550117",
    source: "missed_call",
    status: "appointment_booked",
    priority: "high",
    jobType: "No heat call",
    urgency: "today",
    address: "903 Mapleton Fall Creek",
    zipCode: "46205",
    issueDescription: "Furnace stopped overnight; house is cold.",
    aiSummary: "No-heat lead. Customer booked a next-day morning slot after the same-day slot was unavailable.",
    lastMessage: "Tomorrow at 8 AM is confirmed.",
    appointment: appointment(1, 8, "booked", "ai"),
    messages: [
      ["inbound", "voice", "Our furnace quit last night. Is 2 PM open today?", 4.2],
      ["outbound", "voice", "I am sorry, 2 PM is already taken. I can do tomorrow at 8 AM or 11 AM.", 4.1],
      ["inbound", "voice", "Tomorrow at 8 works.", 4],
      ["outbound", "voice", "Perfect, you are booked for tomorrow at 8 AM.", 3.9]
    ]
  },
  {
    customerName: "Owen Wallace",
    customerPhone: "+13175550118",
    source: "sms",
    status: "qualified",
    priority: "normal",
    jobType: "Kitchen remodel estimate",
    urgency: "flexible",
    address: "4702 Central Ave",
    zipCode: "46205",
    issueDescription: "Wants estimate for cabinets, counters, and layout changes.",
    aiSummary: "Larger remodel estimate. Lead is qualified; team should review scope before scheduling.",
    lastMessage: "Thanks, I have the basics. A team member will review the remodel scope.",
    messages: [
      ["inbound", "sms", "Looking for an estimate on a kitchen remodel.", 55],
      ["outbound", "sms", "Happy to help. Are you changing the layout or mostly finishes?", 54.8],
      ["inbound", "sms", "Layout, cabinets, counters, probably flooring too.", 54.5],
      ["outbound", "sms", "Thanks, I have the basics. A team member will review the remodel scope.", 54.3]
    ]
  },
  {
    customerName: "Sofia Ramirez",
    customerPhone: "+13175550119",
    source: "missed_call",
    status: "appointment_booked",
    priority: "normal",
    jobType: "Drain clog",
    urgency: "this week",
    address: "31 Woodruff Place",
    zipCode: "46201",
    issueDescription: "Slow kitchen drain, no backup yet.",
    aiSummary: "Drain clog lead. Customer booked an afternoon appointment.",
    lastMessage: "Appointment confirmed for Thursday afternoon.",
    appointment: appointment(2, 15, "booked", "ai"),
    messages: [
      ["inbound", "voice", "Kitchen sink is draining really slow.", 26],
      ["outbound", "voice", "Gotcha. Is it backing up or just slow right now?", 25.9],
      ["inbound", "voice", "Just slow.", 25.8],
      ["outbound", "voice", "Thursday at 3 PM is open. Want that one?", 25.7],
      ["inbound", "voice", "Yes, that works.", 25.6]
    ]
  },
  {
    customerName: "Marcus Reed",
    customerPhone: "+13175550120",
    source: "sms",
    status: "spam",
    priority: "low",
    jobType: null,
    urgency: null,
    address: null,
    zipCode: null,
    issueDescription: "Wrong number.",
    aiSummary: "Customer indicated this was a wrong number.",
    lastMessage: "Thanks for letting us know.",
    messages: [
      ["inbound", "sms", "Wrong number stop texting me", 120],
      ["outbound", "sms", "Thanks for letting us know. We will close this out.", 119.9]
    ]
  },
  {
    customerName: "Dana Collins",
    customerPhone: "+13175550121",
    source: "missed_call",
    status: "appointment_booked",
    priority: "normal",
    jobType: "Electrical outlet repair",
    urgency: "this week",
    address: "755 East 10th St",
    zipCode: "46202",
    issueDescription: "Two kitchen outlets stopped working after using toaster.",
    aiSummary: "Electrical repair lead. No sparks or immediate danger reported. Booked for next available afternoon.",
    lastMessage: "Appointment booked for next available afternoon.",
    appointment: appointment(4, 13, "booked", "manual"),
    messages: [
      ["inbound", "voice", "Two kitchen outlets stopped working.", 13],
      ["outbound", "voice", "Any sparks, burning smell, or breaker issues?", 12.9],
      ["inbound", "voice", "No sparks. Breaker reset did not fix it.", 12.8],
      ["outbound", "voice", "Okay, next afternoon opening is 1 PM. I have you down.", 12.7]
    ]
  },
  {
    customerName: "Heather James",
    customerPhone: "+13175550122",
    source: "sms",
    status: "qualified",
    priority: "high",
    jobType: "Sump pump issue",
    urgency: "today",
    address: "4018 Primrose Ave",
    zipCode: "46205",
    issueDescription: "Sump pump keeps cycling and pit is near the top.",
    aiSummary: "High-priority sump pump lead. Customer gave address; needs same-day callback if no slot opens.",
    lastMessage: "I am not seeing another same-day opening right now. The team will call you back.",
    messages: [
      ["inbound", "sms", "Sump pump keeps cycling and water is almost at the top.", 2],
      ["outbound", "sms", "That sounds urgent. Any active flooding yet?", 1.9],
      ["inbound", "sms", "Not yet but it is close. 4018 Primrose.", 1.8],
      ["outbound", "sms", "I am not seeing another same-day opening right now. The team will call you back.", 1.7]
    ]
  }
];

async function seedDemoLeads(businessId) {
  await prisma.lead.deleteMany({
    where: {
      businessId,
      manualNotes: { contains: DEMO_TAG }
    }
  });

  for (const demo of demoLeads) {
    const { appointment: demoAppointment, messages, ...leadData } = demo;
    const createdAt = ago(Math.max(...messages.map((message) => message[3])) + 0.25);
    const lead = await prisma.lead.create({
      data: {
        businessId,
        ...leadData,
        manualNotes: `${DEMO_TAG} Demo lead generated for the presentation account.`,
        preferredAppointmentTime: demoAppointment?.startAt?.toISOString() || null,
        createdAt,
        updatedAt: ago(Math.min(...messages.map((message) => message[3]))),
        messages: {
          create: messages.map(([direction, channel, body, hoursAgo]) => ({
            direction,
            channel,
            body,
            createdAt: ago(hoursAgo)
          }))
        }
      }
    });

    if (demoAppointment) {
      await prisma.appointment.create({
        data: {
          businessId,
          leadId: lead.id,
          startAt: demoAppointment.startAt,
          endAt: demoAppointment.endAt,
          status: demoAppointment.status,
          source: demoAppointment.source,
          notes: `${DEMO_TAG} ${demo.jobType || "Demo appointment"}`
        }
      });
    }
  }

  console.log(`[demo-seed] seeded ${demoLeads.length} demo leads for ${DEMO_EMAIL}`);
}

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

    if (bizRecord) {
      await prisma.business.update({
        where: { id: bizRecord.id },
        data: {
          name: "Indy Comfort HVAC Demo",
          industryType: "HVAC, plumbing, electrical, and home repair",
          serviceAreas: ["Indianapolis", "Broad Ripple", "Meridian-Kessler", "Fountain Square", "Carmel"],
          ownerNotificationEmail: DEMO_EMAIL,
          ownerNotificationPhone: DEMO_PHONE,
          businessPhoneNumber: DEMO_PHONE,
          callHandlingMode: "ring_first",
          ringSeconds: 15,
          smsChoiceMode: false
        }
      });

      const existingTypes = await prisma.serviceType.count({ where: { businessId: bizRecord.id } });
      if (existingTypes === 0) {
        await prisma.serviceType.createMany({
          data: [
            "AC repair",
            "No heat call",
            "Water heater repair",
            "Drain clog",
            "Electrical repair",
            "Roof estimate",
            "Kitchen remodel"
          ].map((name) => ({ businessId: bizRecord.id, name }))
        });
      }

      await seedDemoLeads(bizRecord.id);
    }

    console.log(`[demo-seed] ✅ ${DEMO_EMAIL} → phone ${DEMO_PHONE}`);
  } catch (err) {
    console.error("[demo-seed] failed:", err.message);
  }
}
