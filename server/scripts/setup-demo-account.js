/**
 * One-time script: create or update the demo account
 *   email:    breataronov@gmail.com
 *   password: leadrescue
 *   phone:    +13177902426
 *
 * Run against Railway DB:
 *   DATABASE_URL="<your-railway-postgres-url>" node scripts/setup-demo-account.js
 *
 * Or locally (uses .env):
 *   node -r dotenv/config scripts/setup-demo-account.js
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const EMAIL    = "breataronov@gmail.com";
const PASSWORD = "leadrescue";
const PHONE    = "+13177902426";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // Upsert the user
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, emailVerified: true },
    create: {
      email: EMAIL,
      passwordHash,
      name: "Breat",
      role: "owner",
      emailVerified: true,
      subscriptionStatus: "active",
      subscriptionPlan: "pro",
    },
  });

  console.log("✅ User:", user.email, user.id);

  // Upsert the business tied to this owner
  const existing = await prisma.business.findUnique({ where: { ownerId: user.id } });

  if (existing) {
    const biz = await prisma.business.update({
      where: { id: existing.id },
      data: {
        twilioPhoneNumber: PHONE,
        subscriptionPlanId: null,
      },
    });
    console.log("✅ Business updated:", biz.id, "→ twilioPhoneNumber:", biz.twilioPhoneNumber);
  } else {
    const biz = await prisma.business.create({
      data: {
        ownerId: user.id,
        name: "Demo Business",
        industryType: "construction",
        twilioPhoneNumber: PHONE,
      },
    });
    console.log("✅ Business created:", biz.id, "→ twilioPhoneNumber:", biz.twilioPhoneNumber);
  }

  // Also update the user's subscription fields directly
  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionStatus: "active", subscriptionPlan: "pro" },
  });

  console.log("\n🎉 Done. Sign in with:");
  console.log("   Email:    " + EMAIL);
  console.log("   Password: " + PASSWORD);
  console.log("   Twilio #: " + PHONE);
}

main()
  .catch((e) => { console.error("❌", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
