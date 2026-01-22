/**
 * Transcription API Route
 *
 * Provides audio transcription functionality by:
 * 1. Receiving audio via FormData (blob) or URL
 * 2. Finding a connection with TRANSCRIPTION_BINDING
 * 3. Using OBJECT_STORAGE_BINDING for temporary upload if needed
 * 4. Calling TRANSCRIBE_AUDIO and returning the result
 */

import {
  TranscriptionBinding,
  TRANSCRIPTION_BINDING,
  OBJECT_STORAGE_BINDING,
  SUPPORTED_AUDIO_FORMATS,
  connectionImplementsBinding,
} from "@decocms/bindings";
import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import type { ConnectionEntity } from "../../tools/connection/schema";

type Variables = {
  meshContext: MeshContext;
};

const app = new Hono<{ Variables: Variables }>();

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * Find a connection that implements TRANSCRIPTION_BINDING
 */
async function findTranscriptionConnection(
  ctx: MeshContext,
  organizationId: string,
): Promise<ConnectionEntity | null> {
  const connections = await ctx.storage.connections.list(organizationId);
  return (
    connections.find(
      (conn) =>
        conn.status === "active" &&
        connectionImplementsBinding(conn, TRANSCRIPTION_BINDING),
    ) ?? null
  );
}

/**
 * Find a connection that implements OBJECT_STORAGE_BINDING
 */
async function findObjectStorageConnection(
  ctx: MeshContext,
  organizationId: string,
): Promise<ConnectionEntity | null> {
  const connections = await ctx.storage.connections.list(organizationId);
  return (
    connections.find(
      (conn) =>
        conn.status === "active" &&
        connectionImplementsBinding(conn, OBJECT_STORAGE_BINDING),
    ) ?? null
  );
}

/**
 * Upload audio to object storage and get a presigned URL
 */
async function uploadAudioToObjectStorage(
  ctx: MeshContext,
  connection: ConnectionEntity,
  audioBlob: Blob,
  mimeType: string,
): Promise<{ url: string; key: string }> {
  const proxy = await ctx.createMCPProxy(connection);

  // Generate unique key for temporary audio file
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = mimeType.split("/")[1]?.split(";")[0] || "webm";
  const key = `_transcription_temp/${timestamp}-${randomSuffix}.${extension}`;

  // Get presigned URL for upload
  const putResult = await proxy.client.callTool({
    name: "PUT_PRESIGNED_URL",
    arguments: {
      key,
      contentType: mimeType,
      expiresIn: 300, // 5 minutes
    },
  });

  if (putResult.isError) {
    const errorText =
      putResult.content
        .map((c: { type: string; text?: string }) =>
          c.type === "text" ? c.text : "",
        )
        .join("\n") || "Failed to get upload URL";
    throw new Error(errorText);
  }

  // Extract URL from result
  const putContent = putResult.content.find(
    (c: { type: string }) => c.type === "text",
  );
  if (!putContent || putContent.type !== "text") {
    throw new Error("Invalid PUT_PRESIGNED_URL response");
  }

  const putData = JSON.parse((putContent as { text: string }).text) as {
    url: string;
  };

  // Upload the audio blob
  const uploadResponse = await fetch(putData.url, {
    method: "PUT",
    body: audioBlob,
    headers: {
      "Content-Type": mimeType,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload audio: ${uploadResponse.statusText}`);
  }

  // Get presigned URL for reading
  const getResult = await proxy.client.callTool({
    name: "GET_PRESIGNED_URL",
    arguments: {
      key,
      expiresIn: 300, // 5 minutes
    },
  });

  if (getResult.isError) {
    const errorText =
      getResult.content
        .map((c: { type: string; text?: string }) =>
          c.type === "text" ? c.text : "",
        )
        .join("\n") || "Failed to get download URL";
    throw new Error(errorText);
  }

  const getContent = getResult.content.find(
    (c: { type: string }) => c.type === "text",
  );
  if (!getContent || getContent.type !== "text") {
    throw new Error("Invalid GET_PRESIGNED_URL response");
  }

  const getData = JSON.parse((getContent as { text: string }).text) as {
    url: string;
  };

  return { url: getData.url, key };
}

/**
 * Delete temporary audio file from object storage
 */
async function deleteAudioFromObjectStorage(
  ctx: MeshContext,
  connection: ConnectionEntity,
  key: string,
): Promise<void> {
  try {
    const proxy = await ctx.createMCPProxy(connection);
    await proxy.client.callTool({
      name: "DELETE_OBJECT",
      arguments: { key },
    });
  } catch (error) {
    // Log but don't fail if cleanup fails
    console.warn("[transcribe] Failed to cleanup temporary file:", key, error);
  }
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

  // 4. Validate file size and format
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
  const transcriptionConnection = await findTranscriptionConnection(
    ctx,
    organizationId,
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

  // 6. Handle audio upload if blob provided
  let finalAudioUrl = audioUrl;
  let tempFileKey: string | null = null;
  let objectStorageConnection: ConnectionEntity | null = null;

  if (audioFile && !audioUrl) {
    // Find object storage connection for temporary upload
    objectStorageConnection = await findObjectStorageConnection(
      ctx,
      organizationId,
    );

    if (!objectStorageConnection) {
      return c.json(
        {
          error:
            "No object storage configured. Please add a connection with object storage capabilities (e.g., S3, R2, GCS) or provide an audioUrl instead.",
        },
        400,
      );
    }

    try {
      const uploadResult = await uploadAudioToObjectStorage(
        ctx,
        objectStorageConnection,
        audioFile,
        audioFile.type,
      );
      finalAudioUrl = uploadResult.url;
      tempFileKey = uploadResult.key;
    } catch (error) {
      console.error("[transcribe] Upload failed:", error);
      return c.json(
        {
          error: `Failed to upload audio: ${error instanceof Error ? error.message : "Unknown error"}`,
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
      audioUrl: finalAudioUrl ?? undefined,
      mimeType: audioFile?.type,
      language: language ?? undefined,
    });

    // 8. Cleanup temporary file
    if (tempFileKey && objectStorageConnection) {
      // Don't await - cleanup in background
      void deleteAudioFromObjectStorage(
        ctx,
        objectStorageConnection,
        tempFileKey,
      );
    }

    // 9. Return result
    return c.json({
      text: result.text,
      language: result.language,
      duration: result.duration,
      confidence: result.confidence,
    });
  } catch (error) {
    console.error("[transcribe] Transcription failed:", error);

    // Cleanup on error
    if (tempFileKey && objectStorageConnection) {
      void deleteAudioFromObjectStorage(
        ctx,
        objectStorageConnection,
        tempFileKey,
      );
    }

    return c.json(
      {
        error: `Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      500,
    );
  }
});

export default app;
