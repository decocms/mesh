/**
 * Audio Transcription Route
 *
 * Receives audio files and transcribes them to text using the TRANSCRIPTION binding.
 * Uses Supabase Storage for temporary audio file hosting.
 *
 * Flow:
 * 1. Receive audio from frontend
 * 2. Upload to Supabase Storage (temporary)
 * 3. Get public URL
 * 4. Call TRANSCRIBE_AUDIO with the URL
 * 5. Delete temporary file
 * 6. Return transcription
 */

import {
  TranscriptionBinding,
  TRANSCRIPTION_BINDING,
  SUPPORTED_AUDIO_FORMATS,
} from "@decocms/bindings";
import { connectionImplementsBinding } from "@decocms/bindings";
import { createClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import type { ConnectionEntity } from "../../tools/connection/schema";

type Variables = {
  meshContext: MeshContext;
};

const app = new Hono<{ Variables: Variables }>();

// Max file size: 25MB (common limit for transcription APIs)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Supabase Storage bucket for temporary audio files
const AUDIO_BUCKET = "audio-transcriptions";

/**
 * Get Supabase client for storage operations
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Find a connection that implements the TRANSCRIPTION binding.
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
    if (preferred) {
      const hasBinding = connectionImplementsBinding(
        preferred,
        TRANSCRIPTION_BINDING,
      );
      if (hasBinding) {
        return preferred;
      }
    }
  }

  // Look for connections that implement TRANSCRIPTION binding
  for (const c of activeConnections) {
    const hasBinding = connectionImplementsBinding(c, TRANSCRIPTION_BINDING);
    if (hasBinding) {
      return c;
    }
  }

  return null;
}

// Supabase client type (simplified for internal use)
type SupabaseStorageClient = NonNullable<ReturnType<typeof getSupabaseClient>>;

/**
 * Upload audio to Supabase Storage and get public URL
 */
async function uploadAudioToStorage(
  supabase: SupabaseStorageClient,
  audioBlob: Blob,
  mimeType: string,
): Promise<{ path: string; publicUrl: string }> {
  // Generate unique filename
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 10);
  const extension = mimeType.includes("webm")
    ? "webm"
    : mimeType.includes("mp3") || mimeType.includes("mpeg")
      ? "mp3"
      : mimeType.includes("wav")
        ? "wav"
        : mimeType.includes("mp4") || mimeType.includes("m4a")
          ? "m4a"
          : "audio";
  const filename = `${timestamp}_${randomId}.${extension}`;
  const path = `temp/${filename}`;

  // Convert Blob to ArrayBuffer for upload
  const arrayBuffer = await audioBlob.arrayBuffer();

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload audio: ${uploadError.message}`);
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path);

  return { path, publicUrl };
}

/**
 * Delete audio from Supabase Storage
 */
async function deleteAudioFromStorage(
  supabase: SupabaseStorageClient,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from(AUDIO_BUCKET).remove([path]);

  // Silently ignore delete errors (file will expire anyway)
}

/**
 * POST /:org/transcribe
 *
 * Transcribes audio to text using the TRANSCRIPTION binding via MCP proxy.
 *
 * Request: multipart/form-data
 * - audio: Audio file (webm, mp3, wav, etc.)
 * - audioUrl: (optional) URL to audio file (skips upload)
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

  // Track uploaded file path for cleanup
  let uploadedPath: string | null = null;
  let supabase: ReturnType<typeof getSupabaseClient> = null;

  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const audioFile = formData.get("audio");
    const audioUrl = formData.get("audioUrl")?.toString();
    const connectionId = formData.get("connectionId")?.toString();
    const language = formData.get("language")?.toString();

    // Either audioUrl or audio file is required
    if (!audioUrl && (!audioFile || !(audioFile instanceof Blob))) {
      return c.json(
        { error: "Either audioUrl or audio file is required" },
        400,
      );
    }

    // Validate file size if file is provided
    if (audioFile instanceof Blob && audioFile.size > MAX_FILE_SIZE) {
      return c.json(
        {
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        400,
      );
    }

    // Validate file type if file is provided
    const contentType =
      audioFile instanceof Blob ? audioFile.type || "audio/webm" : undefined;
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
            "No transcription connection found. Please connect a provider that supports the TRANSCRIPTION binding.",
        },
        404,
      );
    }

    // Determine the audio URL to use
    let finalAudioUrl = audioUrl;

    // If no URL provided, upload to Supabase Storage
    if (!finalAudioUrl && audioFile instanceof Blob) {
      supabase = getSupabaseClient();

      if (!supabase) {
        return c.json(
          {
            error:
              "Audio storage not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.",
          },
          500,
        );
      }

      const { path, publicUrl } = await uploadAudioToStorage(
        supabase,
        audioFile,
        contentType || "audio/webm",
      );

      uploadedPath = path;
      finalAudioUrl = publicUrl;
    }

    // Create MCP proxy for the connection
    const proxy = await ctx.createMCPProxy(connection);
    const transcriptionBinding = TranscriptionBinding.forClient(proxy);

    // Call the transcription tool with the audio URL
    const result = await transcriptionBinding.TRANSCRIBE_AUDIO({
      audioUrl: finalAudioUrl,
      language: language || undefined,
    });

    // Clean up temporary file
    if (uploadedPath && supabase) {
      await deleteAudioFromStorage(supabase, uploadedPath);
    }

    // Return the transcription result
    return c.json({
      text: result.text,
      language: result.language,
      duration: result.duration,
      confidence: result.confidence,
    });
  } catch (error) {
    // Clean up on error
    if (uploadedPath && supabase) {
      await deleteAudioFromStorage(supabase, uploadedPath);
    }

    const err = error as Error;

    if (
      err.message.includes("not found") ||
      err.message.includes("No handler")
    ) {
      return c.json(
        {
          error:
            "Transcription tool not available. Make sure your connection implements the TRANSCRIBE_AUDIO tool.",
        },
        400,
      );
    }

    return c.json({ error: err.message }, 500);
  }
});

export default app;
