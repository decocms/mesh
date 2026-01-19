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

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const AUDIO_BUCKET = "audio-transcriptions";

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey);
}

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

type SupabaseStorageClient = NonNullable<ReturnType<typeof getSupabaseClient>>;

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

async function deleteAudioFromStorage(
  supabase: SupabaseStorageClient,
  path: string,
): Promise<void> {
  await supabase.storage.from(AUDIO_BUCKET).remove([path]);
}

app.post("/:org/transcribe", async (c) => {
  const ctx = c.get("meshContext");
  const orgSlug = c.req.param("org");

  if (!ctx.auth.user?.id && !ctx.auth.apiKey?.id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  if (!ctx.organization) {
    return c.json({ error: "Organization context required" }, 400);
  }

  const orgId = ctx.organization.slug ?? ctx.organization.id;
  if (orgId !== orgSlug) {
    return c.json({ error: "Organization mismatch" }, 403);
  }

  let uploadedPath: string | null = null;
  let supabase: ReturnType<typeof getSupabaseClient> = null;

  try {
    const formData = await c.req.formData();
    const audioFile = formData.get("audio");
    const audioUrl = formData.get("audioUrl")?.toString();
    const connectionId = formData.get("connectionId")?.toString();
    const language = formData.get("language")?.toString();

    if (!audioUrl && (!audioFile || !(audioFile instanceof Blob))) {
      return c.json(
        { error: "Either audioUrl or audio file is required" },
        400,
      );
    }

    if (audioFile instanceof Blob && audioFile.size > MAX_FILE_SIZE) {
      return c.json(
        {
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        400,
      );
    }

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

    let finalAudioUrl = audioUrl;

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

    const proxy = await ctx.createMCPProxy(connection);
    const transcriptionBinding = TranscriptionBinding.forClient(proxy);

    const result = await transcriptionBinding.TRANSCRIBE_AUDIO({
      audioUrl: finalAudioUrl,
      language: language || undefined,
    });

    if (uploadedPath && supabase) {
      await deleteAudioFromStorage(supabase, uploadedPath);
    }

    return c.json({
      text: result.text,
      language: result.language,
      duration: result.duration,
      confidence: result.confidence,
    });
  } catch (error) {
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
