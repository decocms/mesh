/**
 * Slack Webhook Adapter
 *
 * Handles Slack's webhook verification using:
 * - HMAC-SHA256 signature verification via X-Slack-Signature header
 * - url_verification challenge response
 */

import type {
  WebhookAdapter,
  WebhookConfig,
  VerificationResult,
} from "./types";

/**
 * Slack webhook payload types
 */
interface SlackUrlVerificationPayload {
  type: "url_verification";
  challenge: string;
  token?: string;
}

interface SlackEventCallbackPayload {
  type: "event_callback";
  team_id: string;
  api_app_id: string;
  event: {
    type: string;
    user?: string;
    channel?: string;
    ts?: string;
    thread_ts?: string;
    text?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type SlackPayload = SlackUrlVerificationPayload | SlackEventCallbackPayload;

/**
 * Verify Slack request signature using HMAC-SHA256
 */
async function verifySlackSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  signingSecret: string,
): Promise<boolean> {
  // Construct the signature base string
  const sigBasestring = `v0:${timestamp}:${rawBody}`;

  // Compute HMAC SHA256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingSecret);
  const messageData = encoder.encode(sigBasestring);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    messageData,
  );

  // Convert to hex string
  const computedSignature =
    "v0=" +
    Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  // Constant-time comparison to prevent timing attacks
  if (computedSignature.length !== signature.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < computedSignature.length; i++) {
    result |= computedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }

  return result === 0;
}

export const slackAdapter: WebhookAdapter = {
  type: "slack",
  name: "Slack",

  async verify(
    req: Request,
    rawBody: string,
    config: WebhookConfig,
  ): Promise<VerificationResult> {
    const signature = req.headers.get("x-slack-signature");
    const timestamp = req.headers.get("x-slack-request-timestamp");

    if (!signature || !timestamp) {
      return {
        verified: false,
        error: "Missing X-Slack-Signature or X-Slack-Request-Timestamp header",
      };
    }

    // Check timestamp to prevent replay attacks (5 minutes tolerance)
    const requestTimestamp = parseInt(timestamp, 10);
    if (Number.isNaN(requestTimestamp)) {
      return {
        verified: false,
        error: "Invalid timestamp format",
      };
    }
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - requestTimestamp) > 300) {
      return {
        verified: false,
        error: "Request timestamp too old (possible replay attack)",
      };
    }

    // Get signing secret from config (field name: SIGNING_SECRET)
    const signingSecret = config.SIGNING_SECRET as string | undefined;
    if (!signingSecret) {
      return {
        verified: false,
        error: "No signing secret configured for this connection",
      };
    }

    const isValid = await verifySlackSignature(
      rawBody,
      signature,
      timestamp,
      signingSecret,
    );

    if (!isValid) {
      return {
        verified: false,
        error: "Invalid signature",
      };
    }

    return { verified: true };
  },

  handleChallenge(
    _req: Request,
    body: unknown,
    _config: WebhookConfig,
  ): Response | null {
    const payload = body as SlackPayload;

    if (payload.type === "url_verification" && "challenge" in payload) {
      // Return challenge as plain text (Slack requirement)
      return new Response(payload.challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return null;
  },

  getEventType(body: unknown): string {
    const payload = body as SlackPayload;

    if (payload.type === "event_callback" && "event" in payload) {
      return payload.event.type; // e.g. "message", "app_mention"
    }

    return payload.type; // e.g. "url_verification"
  },

  getSubject(body: unknown): string | undefined {
    const payload = body as SlackPayload;

    if (payload.type === "event_callback" && "event" in payload) {
      const event = payload.event;
      // Use channel:thread_ts or channel:ts as subject
      if (event.channel) {
        const ts = event.thread_ts || event.ts;
        return ts ? `${event.channel}:${ts}` : event.channel;
      }
    }

    return undefined;
  },
};
