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

  try {
    const message = await client.messages.create({
      to,
      from: from || process.env.TWILIO_PHONE_NUMBER,
      body
    });
    console.log(`[twilio] SMS queued sid=${message.sid} status=${message.status} ${message.from} -> ${message.to}`);
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
