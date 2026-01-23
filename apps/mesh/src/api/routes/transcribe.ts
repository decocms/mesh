/**
 * Transcription API Route
 *
 * Provides audio transcription functionality by:
 * 1. Receiving audio via FormData (blob) or URL
 * 2. Finding a connection with TRANSCRIPTION_BINDING
 * 3. Converting audio blob to base64 (passed via 'audio' field) or using URL directly
 * 4. Calling TRANSCRIBE_AUDIO and returning the result
 */

import {
  TranscriptionBinding,
  TRANSCRIPTION_BINDING,
  SUPPORTED_AUDIO_FORMATS,
  connectionImplementsBinding,
  type Binder,
} from "@decocms/bindings";
import { Hono } from "hono";
import { lookup } from "node:dns/promises";
import type { MeshContext } from "../../core/mesh-context";
import type { ConnectionEntity } from "../../tools/connection/schema";

type Variables = {
  meshContext: MeshContext;
};

const app = new Hono<{ Variables: Variables }>();

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * Check if an IP address is private/internal
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 check
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    return (
      a === 10 || // 10.0.0.0/8
      a === 127 || // 127.0.0.0/8 (loopback)
      (a === 172 && b && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 169 && b === 254) || // 169.254.0.0/16 (link-local, AWS metadata)
      a === 0 // 0.0.0.0/8
    );
  }

  // IPv6 check
  const ipLower = ip.toLowerCase();
  const ipv4MappedMatch = ipLower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4MappedMatch && isPrivateIp(ipv4MappedMatch[1] ?? "")) {
    return true;
  }
  if (
    ipLower === "::1" || // loopback
    ipLower.startsWith("fe80:") || // link-local
    ipLower.startsWith("fc") || // unique local (fc00::/7)
    ipLower.startsWith("fd") // unique local (fc00::/7)
  ) {
    return true;
  }

  return false;
}

/**
 * Validate audioUrl to prevent SSRF attacks
 * Checks URL format, scheme, and resolves DNS to verify IPs are public
 */
async function validateAudioUrl(
  urlString: string,
): Promise<{ valid: true } | { valid: false; error: string }> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Only allow HTTP/HTTPS schemes
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, error: "Only HTTP and HTTPS URLs are allowed" };
  }

  const hostname = url.hostname.toLowerCase();

  // Block localhost and loopback addresses (string check)
  if (hostname === "localhost" || hostname === "[::1]") {
    return { valid: false, error: "Localhost URLs are not allowed" };
  }

  // If hostname is already an IP, check it directly
  if (isPrivateIp(hostname)) {
    return {
      valid: false,
      error: "Private or internal IP addresses are not allowed",
    };
  }

  // Resolve DNS and check all returned IPs to prevent DNS rebinding
  try {
    const results = await lookup(hostname, { all: true });
    for (const { address } of results) {
      if (isPrivateIp(address)) {
        return {
          valid: false,
          error: "URL resolves to a private or internal IP address",
        };
      }
    }
  } catch {
    return { valid: false, error: "Failed to resolve hostname" };
  }

  return { valid: true };
}

/**
 * Find a connection that implements a specific binding
 */
async function findConnectionWithBinding(
  ctx: MeshContext,
  organizationId: string,
  binding: Binder,
): Promise<ConnectionEntity | null> {
  const connections = await ctx.storage.connections.list(organizationId);
  return (
    connections.find(
      (conn) =>
        conn.status === "active" && connectionImplementsBinding(conn, binding),
    ) ?? null
  );
}

/**
 * Convert a Blob to base64 string
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

/**
 * POST /:org/transcribe
 *
 * Transcribe audio to text using available transcription service.
 *
 * Request: FormData with:
 * - audio: Blob (audio file)
 * - audioUrl: string (optional, URL to audio file)
 * - language: string (optional, ISO 639-1 language code)
 *
 * Response: { text, language, duration, confidence }
 */
app.post("/:org/transcribe", async (c) => {
  const ctx = c.get("meshContext");
  const orgSlug = c.req.param("org");

  // 1. Validate auth
  if (!ctx.auth.user?.id && !ctx.auth.apiKey?.id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // 2. Validate organization
  if (!ctx.organization) {
    return c.json({ error: "Organization context required" }, 400);
  }

  if (ctx.organization.slug !== orgSlug && ctx.organization.id !== orgSlug) {
    return c.json({ error: "Organization mismatch" }, 403);
  }

  const organizationId = ctx.organization.id;

  // 3. Parse FormData
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: "Invalid form data" }, 400);
  }

  const audioFile = formData.get("audio") as File | null;
  const audioUrl = formData.get("audioUrl") as string | null;
  const language = formData.get("language") as string | null;

  if (!audioFile && !audioUrl) {
    return c.json({ error: "Either audio file or audioUrl is required" }, 400);
  }

  // 4. Validate audioUrl if provided (prevent SSRF)
  if (audioUrl) {
    const urlValidation = await validateAudioUrl(audioUrl);
    if (!urlValidation.valid) {
      return c.json({ error: urlValidation.error }, 400);
    }
  }

  // 5. Validate file size and format (if file provided)
  if (audioFile) {
    if (audioFile.size > MAX_FILE_SIZE) {
      return c.json(
        {
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        400,
      );
    }

    const mimeType = audioFile.type.split(";")[0];
    if (
      !SUPPORTED_AUDIO_FORMATS.includes(
        mimeType as (typeof SUPPORTED_AUDIO_FORMATS)[number],
      )
    ) {
      return c.json(
        {
          error: `Unsupported audio format: ${mimeType}. Supported formats: ${SUPPORTED_AUDIO_FORMATS.join(", ")}`,
        },
        400,
      );
    }
  }

  // 5. Find transcription connection
  const transcriptionConnection = await findConnectionWithBinding(
    ctx,
    organizationId,
    TRANSCRIPTION_BINDING,
  );

  if (!transcriptionConnection) {
    return c.json(
      {
        error:
          "No transcription service configured. Please add a connection with transcription capabilities (e.g., OpenAI Whisper).",
      },
      400,
    );
  }

  // 6. Convert audio to base64 if blob provided
  let audioBase64: string | undefined;

  if (audioFile && !audioUrl) {
    try {
      audioBase64 = await blobToBase64(audioFile);
    } catch (error) {
      console.error("[transcribe] Failed to convert audio to base64:", error);
      return c.json(
        {
          error: `Failed to process audio: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
        500,
      );
    }
  }

  // 7. Call transcription service
  try {
    const proxy = await ctx.createMCPProxy(transcriptionConnection);
    const transcriptionClient = TranscriptionBinding.forClient(proxy);

    const result = await transcriptionClient.TRANSCRIBE_AUDIO({
      audio: audioBase64,
      audioUrl: audioUrl ?? undefined,
      mimeType: audioFile?.type,
      language: language ?? undefined,
    });

    // 8. Return result
    return c.json({
      text: result.text,
      language: result.language,
      duration: result.duration,
      confidence: result.confidence,
    });
  } catch (error) {
    console.error("[transcribe] Transcription failed:", error);

    return c.json(
      {
        error: `Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      500,
    );
  }
});

export default app;
