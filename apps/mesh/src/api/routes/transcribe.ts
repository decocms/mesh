/**
 * Audio Transcription Route
 *
 * Receives audio files and transcribes them to text using the TRANSCRIPTION binding.
 * Uses the user's configured transcription connection via MCP proxy.
 *
 * This follows the same pattern as the LLM binding - any MCP server that implements
 * the TRANSCRIPTION_TRANSCRIBE tool can be used for transcription.
 */

import {
  TranscriptionBinding,
  TRANSCRIPTION_BINDING,
  SUPPORTED_AUDIO_FORMATS,
} from "@decocms/bindings";
import { connectionImplementsBinding } from "@decocms/bindings";
import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import type { ConnectionEntity } from "../../tools/connection/schema";

type Variables = {
  meshContext: MeshContext;
};

const app = new Hono<{ Variables: Variables }>();

// Max file size: 25MB (common limit for transcription APIs)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Find a connection that implements the TRANSCRIPTION binding.
 *
 * Priority:
 * 1. Preferred connection ID (if provided and implements binding)
 * 2. Any connection with TRANSCRIPTION binding
 *
 * Falls back to legacy behavior (looking for OpenAI connections) if no
 * transcription binding is found.
 */
async function findTranscriptionConnection(
  ctx: MeshContext,
  organizationId: string,
  preferredConnectionId?: string,
): Promise<ConnectionEntity | null> {
  const connections = await ctx.storage.connections.list(organizationId);
  const activeConnections = connections.filter((c) => c.status === "active");

  // If a specific connection is requested, try to use it
  if (preferredConnectionId) {
    const preferred = activeConnections.find(
      (c) => c.id === preferredConnectionId,
    );
    if (
      preferred &&
      connectionImplementsBinding(preferred, TRANSCRIPTION_BINDING)
    ) {
      console.log(
        "[transcribe] Using preferred connection with TRANSCRIPTION binding:",
        preferred.title,
      );
      return preferred;
    }
  }

  // Priority 1: Look for connections that implement TRANSCRIPTION binding
  const transcriptionConnection = activeConnections.find((c) =>
    connectionImplementsBinding(c, TRANSCRIPTION_BINDING),
  );

  if (transcriptionConnection) {
    console.log(
      "[transcribe] Found connection with TRANSCRIPTION binding:",
      transcriptionConnection.title,
    );
    return transcriptionConnection;
  }

  console.log("[transcribe] No connection with TRANSCRIPTION binding found");
  return null;
}

/**
 * Convert a Blob to base64 string
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

/**
 * POST /:org/transcribe
 *
 * Transcribes audio to text using the TRANSCRIPTION binding via MCP proxy.
 *
 * Request: multipart/form-data
 * - audio: Audio file (webm, mp3, wav, etc.)
 * - connectionId: (optional) Specific transcription connection to use
 * - language: (optional) Language hint (ISO 639-1 code)
 *
 * Response: { text: string, language?: string, duration?: number }
 */
app.post("/:org/transcribe", async (c) => {
  const ctx = c.get("meshContext");
  const orgSlug = c.req.param("org");

  // Require authentication
  if (!ctx.auth.user?.id && !ctx.auth.apiKey?.id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // Validate organization
  if (!ctx.organization) {
    return c.json({ error: "Organization context required" }, 400);
  }

  const orgId = ctx.organization.slug ?? ctx.organization.id;
  if (orgId !== orgSlug) {
    return c.json({ error: "Organization mismatch" }, 403);
  }

  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const audioFile = formData.get("audio");
    const connectionId = formData.get("connectionId")?.toString();
    const language = formData.get("language")?.toString();

    if (!audioFile || !(audioFile instanceof Blob)) {
      return c.json({ error: "No audio file provided" }, 400);
    }

    // Validate file size
    if (audioFile.size > MAX_FILE_SIZE) {
      return c.json(
        {
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        400,
      );
    }

    // Validate file type (lenient check - browser might report different types)
    const contentType = audioFile.type;
    if (
      contentType &&
      !SUPPORTED_AUDIO_FORMATS.some((f) => {
        const prefix = f.split("/")[0];
        return prefix ? contentType.startsWith(prefix) : false;
      })
    ) {
      return c.json({ error: `Unsupported audio format: ${contentType}` }, 400);
    }

    // Find connection for transcription
    const connection = await findTranscriptionConnection(
      ctx,
      ctx.organization.id,
      connectionId,
    );

    if (!connection) {
      return c.json(
        {
          error:
            "No transcription connection found. Please connect a provider that supports the TRANSCRIPTION binding (e.g., OpenAI Whisper MCP).",
        },
        404,
      );
    }

    console.log(
      "[transcribe] Using connection:",
      connection.id,
      connection.title,
    );

    // Create MCP proxy for the connection
    const proxy = await ctx.createMCPProxy(connection);
    const transcriptionBinding = TranscriptionBinding.forClient(proxy);

    // Convert audio to base64 for the binding
    const audioBase64 = await blobToBase64(audioFile);

    // Call the transcription tool via the binding
    const result = await transcriptionBinding.TRANSCRIBE_AUDIO({
      audio: audioBase64,
      mimeType: contentType || "audio/webm",
      language: language || undefined,
    });

    // Return the transcription result
    return c.json({
      text: result.text,
      language: result.language,
      duration: result.duration,
      confidence: result.confidence,
    });
  } catch (error) {
    const err = error as Error;
    console.error("[transcribe] Error:", err.message);

    // Check for specific error types
    if (
      err.message.includes("not found") ||
      err.message.includes("No handler")
    ) {
      return c.json(
        {
          error:
            "Transcription tool not available. Make sure your connection implements the TRANSCRIPTION_TRANSCRIBE tool.",
        },
        400,
      );
    }

    return c.json({ error: err.message }, 500);
  }
});

export default app;
