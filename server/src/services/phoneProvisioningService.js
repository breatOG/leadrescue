import twilio from "twilio";
import { prisma } from "../prisma/client.js";

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

// Extract US area code from an E.164 phone number (+13175550100 → "317")
function areaCodeFrom(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") return digits.slice(1, 4);
  if (digits.length === 10) return digits.slice(0, 3);
  return "";
}

// Format E.164 number for display: +13175550100 → (317) 555-0100
export function formatPhoneNumber(e164) {
  const d = (e164 || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164;
}

async function configureWebhooks(client, numberSid, businessName, baseUrl) {
  await client.incomingPhoneNumbers(numberSid).update({
    friendlyName: `LeadRescue – ${businessName}`,
    smsUrl: `${baseUrl}/webhooks/twilio/sms`,
    smsMethod: "POST",
    voiceUrl: `${baseUrl}/webhooks/twilio/voice`,
    voiceMethod: "POST",
    statusCallback: `${baseUrl}/webhooks/twilio/call-status`,
    statusCallbackMethod: "POST"
  });
}

// Assign a phone number to a business when they subscribe.
// Tries the pool first (same area code), then buys a new number.
// Returns the assigned phone number string, or null if Twilio isn't configured.
export async function provisionNumberForBusiness({ user, business, baseUrl }) {
  const client = getTwilioClient();
  if (!client) return null;

  // Already has a number — nothing to do
  if (business.twilioPhoneNumber) return business.twilioPhoneNumber;

  const targetArea = areaCodeFrom(user.phoneNumber || business.ownerNotificationPhone || business.businessPhoneNumber || "");
  const businessName = business.name || business.id;
  const base = baseUrl.replace(/\/$/, "");

  // 1. Try recycled pool number with matching area code
  if (targetArea) {
    const pooled = await prisma.pooledPhoneNumber.findFirst({ where: { areaCode: targetArea } });
    if (pooled) {
      try {
        if (pooled.twilioSid) await configureWebhooks(client, pooled.twilioSid, businessName, base);
        await prisma.pooledPhoneNumber.delete({ where: { id: pooled.id } });
        await prisma.business.update({ where: { id: business.id }, data: { twilioPhoneNumber: pooled.phoneNumber } });
        console.log(`[provision] Reused pooled number ${pooled.phoneNumber} for business ${business.id}`);
        return pooled.phoneNumber;
      } catch (e) {
        console.error("[provision] Pooled number reconfiguration failed:", e.message);
      }
    }
  }

  // 2. Buy a new number — prefer the target area code, fall back to any available
  let purchased = null;
  for (const searchArea of [targetArea, ""].filter(Boolean)) {
    try {
      const opts = { smsEnabled: true, voiceEnabled: true, limit: 1 };
      if (searchArea) opts.areaCode = searchArea;
      const results = await client.availablePhoneNumbers("US").local.list(opts);
      if (!results.length) continue;
      purchased = await client.incomingPhoneNumbers.create({
        phoneNumber: results[0].phoneNumber,
        friendlyName: `LeadRescue – ${businessName}`,
        smsUrl: `${base}/webhooks/twilio/sms`,
        smsMethod: "POST",
        voiceUrl: `${base}/webhooks/twilio/voice`,
        voiceMethod: "POST",
        statusCallback: `${base}/webhooks/twilio/call-status`,
        statusCallbackMethod: "POST"
      });
      break;
    } catch (e) {
      console.error(`[provision] Could not buy number (area=${searchArea}):`, e.message);
    }
  }

  if (!purchased) {
    console.error("[provision] Could not assign any number to business", business.id);
    return null;
  }

  await prisma.business.update({ where: { id: business.id }, data: { twilioPhoneNumber: purchased.phoneNumber } });
  console.log(`[provision] Purchased ${purchased.phoneNumber} for business ${business.id}`);
  return purchased.phoneNumber;
}

// Search available numbers near a ZIP code (used by Pro/Scale number picker).
export async function searchNumbersByZip(zip, limit = 6) {
  const client = getTwilioClient();
  if (!client) return [];
  const results = await client.availablePhoneNumbers("US").local.list({
    inPostalCode: zip,
    smsEnabled: true,
    voiceEnabled: true,
    limit
  });
  return results.map((n) => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
    locality: n.locality,
    region: n.region
  }));
}

// Purchase a specific number the Pro/Scale user chose and wire up webhooks.
export async function purchaseSelectedNumber({ phoneNumber, business, baseUrl }) {
  const client = getTwilioClient();
  if (!client) throw new Error("Twilio is not configured.");

  const base = baseUrl.replace(/\/$/, "");
  const businessName = business.name || business.id;

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
    friendlyName: `LeadRescue – ${businessName}`,
    smsUrl: `${base}/webhooks/twilio/sms`,
    smsMethod: "POST",
    voiceUrl: `${base}/webhooks/twilio/voice`,
    voiceMethod: "POST",
    statusCallback: `${base}/webhooks/twilio/call-status`,
    statusCallbackMethod: "POST"
  });

  await prisma.business.update({ where: { id: business.id }, data: { twilioPhoneNumber: purchased.phoneNumber } });
  console.log(`[provision] Pro/Scale selected ${purchased.phoneNumber} for business ${business.id}`);
  return purchased.phoneNumber;
}

// Move a business's number to the pool when their subscription ends.
// Disconnects webhooks so the idle number doesn't route calls anywhere.
export async function poolNumberFromUser(userId) {
  const client = getTwilioClient();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const business = await prisma.business.findUnique({ where: { ownerId: userId } });
  if (!business?.twilioPhoneNumber) return;

  const phoneNumber = business.twilioPhoneNumber;
  const areaCode = areaCodeFrom(phoneNumber);

  // Disconnect webhooks on the Twilio side
  try {
    const [number] = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
    if (number) {
      await client.incomingPhoneNumbers(number.sid).update({
        friendlyName: `[Pool] ${phoneNumber}`,
        smsUrl: "",
        voiceUrl: "",
        statusCallback: ""
      });
      await prisma.pooledPhoneNumber.upsert({
        where: { phoneNumber },
        update: { twilioSid: number.sid, areaCode, releasedAt: new Date() },
        create: { phoneNumber, twilioSid: number.sid, areaCode }
      });
      console.log(`[pool] ${phoneNumber} returned to pool from business ${business.id}`);
    }
  } catch (e) {
    console.error("[pool] Failed to disconnect number:", e.message);
  }

  // Clear from business record regardless of Twilio API result
  await prisma.business.update({ where: { id: business.id }, data: { twilioPhoneNumber: null } });
}
