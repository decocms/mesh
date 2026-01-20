import {
  TranscriptionBinding,
  TRANSCRIPTION_BINDING,
  OBJECT_STORAGE_BINDING,
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

const MAX_FILE_SIZE = 25 * 1024 * 1024;

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

async function findObjectStorageConnection(
  ctx: MeshContext,
  organizationId: string,
): Promise<ConnectionEntity | null> {
  const connections = await ctx.storage.connections.list(organizationId);
  const activeConnections = connections.filter((c) => c.status === "active");

  // Look for connections that implement OBJECT_STORAGE binding
  for (const c of activeConnections) {
    const hasBinding = connectionImplementsBinding(c, OBJECT_STORAGE_BINDING);
    if (hasBinding) {
      return c;
    }
  }

  return null;
}

type MCPProxy = Awaited<ReturnType<MeshContext["createMCPProxy"]>>;

async function uploadAudioToObjectStorage(
  proxy: MCPProxy,
  audioBlob: Blob,
  mimeType: string,
): Promise<{ key: string; publicUrl: string }> {
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
  const key = `temp/audio-transcriptions/${timestamp}_${randomId}.${extension}`;

  // Get presigned URL for upload
  const putResult = await proxy.client.callTool({
    name: "PUT_PRESIGNED_URL",
    arguments: {
      key,
      contentType: mimeType,
    },
  });

  const putContent = putResult.content[0];
  if (!putContent || putContent.type !== "text" || !putContent.text) {
    throw new Error("Failed to get upload URL from Object Storage");
  }

  const putData = JSON.parse(putContent.text) as { url: string };
  const uploadUrl = putData.url;

  // Upload the audio file
  const arrayBuffer = await audioBlob.arrayBuffer();
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    body: arrayBuffer,
    headers: {
      "Content-Type": mimeType,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Failed to upload audio to Object Storage: ${uploadResponse.statusText}`,
    );
  }

  // Get presigned URL for download (to pass to transcription service)
  const getResult = await proxy.client.callTool({
    name: "GET_PRESIGNED_URL",
    arguments: {
      key,
    },
  });

  const getContent = getResult.content[0];
  if (!getContent || getContent.type !== "text" || !getContent.text) {
    throw new Error("Failed to get download URL from Object Storage");
  }

  const getData = JSON.parse(getContent.text) as { url: string };

  return { key, publicUrl: getData.url };
}

async function deleteAudioFromObjectStorage(
  proxy: MCPProxy,
  key: string,
): Promise<void> {
  try {
    await proxy.client.callTool({
      name: "DELETE_OBJECT",
      arguments: { key },
    });
  } catch (error) {
    // Log but don't throw - cleanup failure shouldn't break the response
    console.warn(`Failed to delete temporary audio file ${key}:`, error);
  }
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

  let uploadedKey: string | null = null;
  let objectStorageProxy: MCPProxy | null = null;

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

    const transcriptionConnection = await findTranscriptionConnection(
      ctx,
      ctx.organization.id,
      connectionId,
    );

    if (!transcriptionConnection) {
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
      // Find an Object Storage connection for uploading
      const objectStorageConnection = await findObjectStorageConnection(
        ctx,
        ctx.organization.id,
      );

      if (!objectStorageConnection) {
        return c.json(
          {
            error:
              "No object storage connection found. Please connect a provider that supports the OBJECT_STORAGE binding (e.g., S3, R2, GCS).",
          },
          404,
        );
      }

      objectStorageProxy = await ctx.createMCPProxy(objectStorageConnection);

      const { key, publicUrl } = await uploadAudioToObjectStorage(
        objectStorageProxy,
        audioFile,
        contentType || "audio/webm",
      );

      uploadedKey = key;
      finalAudioUrl = publicUrl;
    }

    const transcriptionProxy = await ctx.createMCPProxy(
      transcriptionConnection,
    );
    const transcriptionBinding =
      TranscriptionBinding.forClient(transcriptionProxy);

    const result = await transcriptionBinding.TRANSCRIBE_AUDIO({
      audioUrl: finalAudioUrl,
      language: language || undefined,
    });

    // Cleanup: delete the temporary audio file
    if (uploadedKey && objectStorageProxy) {
      await deleteAudioFromObjectStorage(objectStorageProxy, uploadedKey);
    }

    return c.json({
      text: result.text,
      language: result.language,
      duration: result.duration,
      confidence: result.confidence,
    });
  } catch (error) {
    // Cleanup on error
    if (uploadedKey && objectStorageProxy) {
      await deleteAudioFromObjectStorage(objectStorageProxy, uploadedKey);
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
