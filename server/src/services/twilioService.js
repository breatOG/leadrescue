import twilio from "twilio";

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;

  if (accountSid && authToken) {
    return twilio(accountSid, authToken);
  }

  if (accountSid && apiKeySid && apiKeySecret) {
    return twilio(apiKeySid, apiKeySecret, { accountSid });
  }

  return null;
}

export function hasTwilioConfig() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      (process.env.TWILIO_AUTH_TOKEN || (process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET))
  );
}

export async function sendSms({ to, from, body }) {
  const client = getClient();

  if (!client) {
    console.log(`[mock twilio] SMS ${from || process.env.TWILIO_PHONE_NUMBER} -> ${to}: ${body}`);
    return { sid: `mock_${Date.now()}`, mock: true };
  }

  const params = {
    to,
    from: from || process.env.TWILIO_PHONE_NUMBER,
    body
  };

  // When the platform messaging service is configured, route through it so all
  // messages count against the single registered A2P campaign. The explicit
  // `from` number ensures inbound replies still route to the correct business.
  const platformSid = process.env.TWILIO_PLATFORM_MSG_SERVICE_SID;
  if (platformSid) params.messagingServiceSid = platformSid;

  try {
    const message = await client.messages.create(params);
    console.log(`[twilio] SMS queued sid=${message.sid} status=${message.status} ${message.from} -> ${message.to}${platformSid ? " (platform campaign)" : ""}`);
    return message;
  } catch (error) {
    console.error(
      `[twilio] SMS failed code=${error.code || "unknown"} status=${error.status || "unknown"} message=${error.message}`
    );
    throw error;
  }
}

export function missedCallTwiML() {
  const response = new twilio.twiml.VoiceResponse();
  response.say(
    "Thanks for calling. We are helping another customer right now, but we just sent you a text so we can help you faster."
  );
  return response.toString();
}
