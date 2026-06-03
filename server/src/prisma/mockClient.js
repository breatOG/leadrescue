import bcrypt from "bcryptjs";

let idCounter = 1;
const id = (prefix) => `${prefix}_${idCounter++}`;
const now = () => new Date();

const plans = [
  { id: id("plan"), name: "Starter", priceCents: 19900, description: "Missed-call text-back and AI qualification." },
  { id: id("plan"), name: "Pro", priceCents: 49900, description: "Expanded reporting and priority lead alerts." },
  { id: id("plan"), name: "Premium", priceCents: 99900, description: "Multi-location workflows and premium support." }
];

const user = {
  id: id("user"),
  email: "demo@leadrescue.local",
  passwordHash: bcrypt.hashSync("password123", 12),
  name: "Jordan Carter",
  phoneNumber: "+13175550000",
  emailVerified: true,
  createdAt: now(),
  updatedAt: now()
};

const business = {
  id: id("business"),
  ownerId: user.id,
  subscriptionPlanId: plans[0].id,
  name: "Indy Comfort HVAC",
  industryType: "HVAC contractor",
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || "+15551234567",
  businessPhoneNumber: "+15557654321",
  ownerNotificationPhone: "",
  ownerNotificationEmail: "demo@leadrescue.local",
  callHandlingMode: "ring_first",
  ringSeconds: 15,
  afterHoursRing: false,
  ringNumbers: [],
  watchMode: false,
  smsChoiceMode: true,
  serviceAreas: ["Indianapolis", "Carmel", "Fishers"],
  businessHours: {
    monday: "8:00 AM - 5:00 PM",
    tuesday: "8:00 AM - 5:00 PM",
    wednesday: "8:00 AM - 5:00 PM",
    thursday: "8:00 AM - 5:00 PM",
    friday: "8:00 AM - 5:00 PM"
  },
  createdAt: now(),
  updatedAt: now()
};

const db = {
  users: [user],
  businesses: [business],
  subscriptionPlans: plans,
  serviceTypes: ["AC repair", "Furnace repair", "No heat call", "No cooling call", "Seasonal maintenance"].map((name) => ({
    id: id("service"),
    businessId: business.id,
    name,
    createdAt: now()
  })),
  availability: [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
    { id: id("avail"), businessId: business.id, dayOfWeek, startTime: "09:00", endTime: "12:00", slotMinutes: 60, createdAt: now() },
    { id: id("avail"), businessId: business.id, dayOfWeek, startTime: "13:00", endTime: "17:00", slotMinutes: 60, createdAt: now() }
  ]),
  leads: [],
  messages: [],
  appointments: [],
  webhookLogs: [],
  authTokens: []
};

function seedLeads() {
  const leadOne = {
    id: id("lead"),
    businessId: business.id,
    customerName: "Maya Thompson",
    customerPhone: "+13175550101",
    address: "412 Maple Street",
    zipCode: "46220",
      jobType: "No heat call",
    urgency: "today",
      issueDescription: "Furnace stopped heating after a missed call.",
    preferredAppointmentTime: null,
    photosAvailable: true,
    source: "missed_call",
    status: "appointment_booked",
    priority: "high",
      aiSummary: "High priority no-heat HVAC call. Customer is available today and provided ZIP 46220.",
    manualNotes: "",
    lastMessage: "You're booked for tomorrow morning. The team has your details.",
    createdAt: now(),
    updatedAt: now()
  };
  const leadTwo = {
    id: id("lead"),
    businessId: business.id,
    customerName: null,
    customerPhone: "+13175550102",
    address: null,
    zipCode: "46032",
    jobType: "HVAC repair",
    urgency: "this week",
    issueDescription: "AC is blowing warm air.",
    preferredAppointmentTime: null,
    photosAvailable: null,
    source: "sms",
    status: "qualified",
    priority: "normal",
    aiSummary: "Normal HVAC lead in Carmel. Needs AC repair this week.",
    manualNotes: "",
    lastMessage: "Which appointment works best?",
    createdAt: now(),
    updatedAt: now()
  };

  db.leads.push(leadOne, leadTwo);
  db.messages.push(
    { id: id("msg"), leadId: leadOne.id, direction: "outbound", channel: "sms", body: "Hi, sorry we missed your call to Indy Comfort HVAC. What HVAC issue do you need help with?", twilioSid: null, createdAt: now() },
    { id: id("msg"), leadId: leadOne.id, direction: "inbound", channel: "sms", body: "My name is Maya. My furnace stopped heating and I need help today. 46220.", twilioSid: null, createdAt: now() },
    { id: id("msg"), leadId: leadOne.id, direction: "outbound", channel: "sms", body: "Thanks, I have enough to get this started. Which appointment works best?", twilioSid: null, createdAt: now() },
    { id: id("msg"), leadId: leadTwo.id, direction: "inbound", channel: "sms", body: "AC is blowing warm air. I am in 46032.", twilioSid: null, createdAt: now() },
    { id: id("msg"), leadId: leadTwo.id, direction: "outbound", channel: "sms", body: "How urgent is this: emergency, today, this week, or flexible?", twilioSid: null, createdAt: now() },
    { id: id("msg"), leadId: leadTwo.id, direction: "inbound", channel: "sms", body: "This week is fine.", twilioSid: null, createdAt: now() }
  );
  db.appointments.push({
    id: id("appt"),
    businessId: business.id,
    leadId: leadOne.id,
    startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
    status: "booked",
    calendarEventId: null,
    notes: "Demo booked appointment.",
    createdAt: now(),
    updatedAt: now()
  });
}

seedLeads();

function matches(record, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("in" in value) return value.in.includes(record[key]);
      if ("notIn" in value) return !value.notIn.includes(record[key]);
      if ("gte" in value) return record[key] >= value.gte;
    }
    return record[key] === value;
  });
}

function sortRecords(records, orderBy) {
  if (!orderBy) return records;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...records].sort((a, b) => {
    for (const order of orders) {
      const [key, direction] = Object.entries(order)[0];
      if (a[key] < b[key]) return direction === "desc" ? 1 : -1;
      if (a[key] > b[key]) return direction === "desc" ? -1 : 1;
    }
    return 0;
  });
}

function includeUser(record, include) {
  if (!record || !include?.business) return record;
  return { ...record, business: includeBusiness(db.businesses.find((item) => item.ownerId === record.id), include.business.include) };
}

function includeBusiness(record, include) {
  if (!record) return record;
  const result = { ...record };
  if (include?.subscriptionPlan) result.subscriptionPlan = db.subscriptionPlans.find((plan) => plan.id === record.subscriptionPlanId);
  if (include?.serviceTypes) result.serviceTypes = db.serviceTypes.filter((item) => item.businessId === record.id);
  if (include?.availability) result.availability = sortRecords(db.availability.filter((item) => item.businessId === record.id), include.availability.orderBy);
  if (include?.owner) result.owner = db.users.find((u) => u.id === record.ownerId) || null;
  return result;
}

function includeLead(record, include) {
  if (!record) return record;
  const result = { ...record };
  if (include?.messages) {
    let messages = db.messages.filter((item) => item.leadId === record.id);
    messages = sortRecords(messages, include.messages.orderBy);
    result.messages = include.messages.take ? messages.slice(0, include.messages.take) : messages;
  }
  if (include?.appointments) {
    result.appointments = sortRecords(db.appointments.filter((item) => item.leadId === record.id), include.appointments.orderBy);
  }
  return result;
}

function createBusiness(data, ownerId) {
  const created = {
    id: id("business"),
    ownerId,
    subscriptionPlanId: data.subscriptionPlanId || null,
    name: data.name,
    industryType: data.industryType,
    twilioPhoneNumber: data.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER,
    businessPhoneNumber: data.businessPhoneNumber || "",
    ownerNotificationPhone: data.ownerNotificationPhone || "",
    ownerNotificationEmail: data.ownerNotificationEmail || "",
    callHandlingMode: data.callHandlingMode || "ring_first",
    ringSeconds: data.ringSeconds || 15,
    afterHoursRing: data.afterHoursRing || false,
    ringNumbers: data.ringNumbers || [],
    serviceAreas: data.serviceAreas || [],
    businessHours: data.businessHours || {},
    createdAt: now(),
    updatedAt: now()
  };
  db.businesses.push(created);
  if (data.availability?.createMany?.data) {
    db.availability.push(...data.availability.createMany.data.map((item) => ({ id: id("avail"), businessId: created.id, createdAt: now(), ...item })));
  }
  return created;
}

export const mockPrisma = {
  subscriptionPlan: {
    findUnique: async ({ where }) => db.subscriptionPlans.find((item) => matches(item, where)) || null,
    upsert: async ({ where, update, create }) => {
      const existing = db.subscriptionPlans.find((item) => matches(item, where));
      if (existing) return Object.assign(existing, update);
      const created = { id: id("plan"), ...create };
      db.subscriptionPlans.push(created);
      return created;
    }
  },
  user: {
    findUnique: async ({ where, include }) => includeUser(db.users.find((item) => matches(item, where)) || null, include),
    findFirst: async ({ where = {}, include } = {}) => includeUser(db.users.find((item) => matches(item, where)) || null, include),
    findMany: async ({ orderBy } = {}) => sortRecords(db.users, orderBy).map((u) => includeUser(u, null)),
    create: async ({ data, include }) => {
      const created = { id: id("user"), email: data.email, phoneNumber: data.phoneNumber || null, passwordHash: data.passwordHash, name: data.name || null, role: data.role || "owner", emailVerified: data.emailVerified ?? false, createdAt: now(), updatedAt: now() };
      db.users.push(created);
      if (data.business?.create) createBusiness(data.business.create, created.id);
      return includeUser(created, include);
    },
    update: async ({ where, data }) => {
      const record = db.users.find((item) => matches(item, where));
      if (record) Object.assign(record, data, { updatedAt: now() });
      return record;
    },
    delete: async ({ where }) => {
      const index = db.users.findIndex((item) => matches(item, where));
      if (index !== -1) db.users.splice(index, 1);
    },
    upsert: async ({ where, update, create }) => {
      const existing = db.users.find((item) => matches(item, where));
      if (existing) return Object.assign(existing, update);
      const created = { id: id("user"), createdAt: now(), updatedAt: now(), ...create };
      db.users.push(created);
      return created;
    }
  },
  business: {
    findUnique: async ({ where, include }) => includeBusiness(db.businesses.find((item) => matches(item, where)) || null, include),
    findFirst: async ({ where = {}, include } = {}) => includeBusiness(db.businesses.find((item) => matches(item, where)) || null, include),
    update: async ({ where, data, include }) => {
      const record = db.businesses.find((item) => matches(item, where));
      // Assign scalar fields generically (supports callHandlingMode, ringSeconds, smsStatus, etc.);
      // relation writes are handled separately below.
      const { serviceTypes, availability, ...scalar } = data;
      Object.assign(record, scalar, { updatedAt: now() });
      if (serviceTypes?.create) db.serviceTypes.push(...serviceTypes.create.map((item) => ({ id: id("service"), businessId: record.id, createdAt: now(), ...item })));
      if (availability?.create) db.availability.push(...availability.create.map((item) => ({ id: id("avail"), businessId: record.id, createdAt: now(), ...item })));
      return includeBusiness(record, include);
    }
  },
  serviceType: {
    deleteMany: async ({ where }) => {
      db.serviceTypes = db.serviceTypes.filter((item) => !matches(item, where));
      return { count: 0 };
    },
    createMany: async ({ data }) => {
      db.serviceTypes.push(...data.map((item) => ({ id: id("service"), createdAt: now(), ...item })));
      return { count: data.length };
    }
  },
  businessAvailability: {
    findMany: async ({ where }) => db.availability.filter((item) => matches(item, where)),
    deleteMany: async ({ where }) => {
      db.availability = db.availability.filter((item) => !matches(item, where));
      return { count: 0 };
    },
    createMany: async ({ data }) => {
      db.availability.push(...data.map((item) => ({ id: id("avail"), createdAt: now(), ...item })));
      return { count: data.length };
    }
  },
  lead: {
    count: async ({ where }) => db.leads.filter((item) => matches(item, where)).length,
    findMany: async ({ where = {}, include, orderBy, take } = {}) => {
      let records = sortRecords(db.leads.filter((item) => matches(item, where)), orderBy).map((item) => includeLead(item, include));
      return take ? records.slice(0, take) : records;
    },
    findFirst: async ({ where = {}, include, orderBy } = {}) => includeLead(sortRecords(db.leads.filter((item) => matches(item, where)), orderBy)[0] || null, include),
    findUnique: async ({ where, include }) => includeLead(db.leads.find((item) => matches(item, where)) || null, include),
    create: async ({ data }) => {
      const created = { id: id("lead"), createdAt: now(), updatedAt: now(), status: "new", priority: "normal", handoffMode: "ai", ...data };
      db.leads.push(created);
      return created;
    },
    update: async ({ where, data }) => {
      const record = db.leads.find((item) => matches(item, where));
      Object.assign(record, data, { updatedAt: now() });
      return record;
    }
  },
  message: {
    count: async ({ where = {} } = {}) => db.messages.filter((item) => matches(item, where)).length,
    findMany: async ({ where = {}, orderBy } = {}) => sortRecords(db.messages.filter((item) => matches(item, where)), orderBy),
    create: async ({ data }) => {
      const created = { id: id("msg"), createdAt: now(), ...data };
      db.messages.push(created);
      return created;
    },
    createMany: async ({ data }) => {
      db.messages.push(...data.map((item) => ({ id: id("msg"), createdAt: now(), ...item })));
      return { count: data.length };
    }
  },
  appointment: {
    count: async ({ where }) => db.appointments.filter((item) => matches(item, where)).length,
    findMany: async ({ where = {}, include, orderBy } = {}) => {
      return sortRecords(db.appointments.filter((item) => matches(item, where)), orderBy).map((item) => ({
        ...item,
        lead: include?.lead ? db.leads.find((lead) => lead.id === item.leadId) : undefined
      }));
    },
    create: async ({ data }) => {
      const created = { id: id("appt"), status: "booked", calendarEventId: null, createdAt: now(), updatedAt: now(), ...data };
      db.appointments.push(created);
      return created;
    }
  },
  webhookLog: {
    create: async ({ data }) => {
      const created = { id: id("webhook"), createdAt: now(), ...data };
      db.webhookLogs.push(created);
      return created;
    }
  },
  authToken: {
    create: async ({ data }) => {
      const created = { id: id("authtoken"), usedAt: null, createdAt: now(), ...data };
      db.authTokens.push(created);
      return created;
    },
    findUnique: async ({ where, include }) => {
      const record = db.authTokens.find((item) => matches(item, where)) || null;
      if (record && include?.user) return { ...record, user: db.users.find((u) => u.id === record.userId) || null };
      return record;
    },
    update: async ({ where, data }) => {
      const record = db.authTokens.find((item) => matches(item, where));
      if (record) Object.assign(record, data);
      return record;
    },
    updateMany: async ({ where, data }) => {
      const records = db.authTokens.filter((item) => matches(item, where));
      records.forEach((record) => Object.assign(record, data));
      return { count: records.length };
    },
    deleteMany: async ({ where }) => {
      const before = db.authTokens.length;
      db.authTokens = db.authTokens.filter((item) => !matches(item, where));
      return { count: before - db.authTokens.length };
    }
  },
  pooledPhoneNumber: {
    findFirst: async () => null,
    create: async ({ data }) => ({ id: id("pool"), releasedAt: now(), ...data }),
    upsert: async ({ create }) => ({ id: id("pool"), releasedAt: now(), ...create }),
    delete: async () => ({})
  },
  $transaction: async (arg) => {
    if (typeof arg === "function") return arg(mockPrisma);
    return Promise.all(arg);
  }
};
