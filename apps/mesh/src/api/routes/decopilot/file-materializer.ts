/**
 * File Materializer
 *
 * Two-phase pipeline for handling file attachments in chat messages:
 *
 * Phase 1 — uploadFileParts (called once, before saving to DB)
 *   data: URL  →  upload to org storage  →  mesh-storage:{key}  stored in DB
 *   The stable `mesh-storage:` URI never expires and is safe to persist.
 *
 * Phase 2 — resolveStorageRefs (called every turn, before the model)
 *   mesh-storage:{key}  →  fresh presigned GET URL  (in-memory only)
 *   File parts get a live URL the AI SDK / vision model can fetch.
 *   The text annotation also has a stable redirect URL the LLM can hand
 *   to downstream MCP tools.
 *
 * Storage backends:
 * - S3             : ctx.objectStorage (BoundObjectStorage) — used when configured
 * - Dev filesystem : ./data/assets/<orgId>/ + HMAC-signed URLs — development only
 * - Base64 inline  : data: URL kept as-is in message parts — production fallback when no storage
 */

import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MeshContext } from "@/core/mesh-context";
import { getSettings } from "@/settings";
import type { ChatMessage } from "./types";

// ============================================================================
// Stable URI scheme
// ============================================================================

/** Prefix for stable storage references stored in the DB. */
const MESH_STORAGE_SCHEME = "mesh-storage:";

/** Wrap a storage key in the stable URI scheme. */
function toMeshStorageUrl(key: string): string {
  return `${MESH_STORAGE_SCHEME}${key}`;
}

/** Extract the storage key from a mesh-storage: URI, or return null. */
function parseMeshStorageKey(url: string): string | null {
  if (!url.startsWith(MESH_STORAGE_SCHEME)) return null;
  return url.slice(MESH_STORAGE_SCHEME.length);
}

/** Build the stable redirect URL the UI / tools use to access a file. */
function toFileRedirectUrl(
  baseUrl: string,
  orgId: string,
  key: string,
): string {
  return `${baseUrl}/api/${orgId}/files/${key}`;
}

// ============================================================================
// Dev-mode filesystem helpers (mirrors dev-assets-mcp.ts logic)
// ============================================================================

const DEV_ASSETS_BASE_DIR = "./data/assets";

// SigV4 presigned URLs are capped at 7 days by the AWS spec.
const S3_PRESIGNED_EXPIRES_IN = 7 * 24 * 3600; // 7 days (SigV4 max)
// Dev HMAC URLs use our own signing so can be much longer.
const DEV_PRESIGNED_EXPIRES_IN = 365 * 24 * 3600; // 1 year

function devSanitizeKey(key: string): string {
  return key.replace(/^\/+/, "").replace(/\.\./g, "");
}

function devGetOrgAssetsDir(orgId: string): string {
  const sanitizedOrgId = orgId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(DEV_ASSETS_BASE_DIR, sanitizedOrgId);
}

function devGenerateSignature(
  orgId: string,
  key: string,
  expires: number,
  method: "GET" | "PUT",
): string {
  const secret = getSettings().encryptionKey || "dev-secret";
  const data = `${orgId}:${key}:${expires}:${method}`;
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function devGeneratePresignedGetUrl(
  baseUrl: string,
  orgId: string,
  key: string,
): string {
  const expires = Math.floor(Date.now() / 1000) + DEV_PRESIGNED_EXPIRES_IN;
  const signature = devGenerateSignature(orgId, key, expires, "GET");
  const url = new URL(
    `/api/dev-assets/${orgId}/${devSanitizeKey(key)}`,
    baseUrl,
  );
  url.searchParams.set("expires", expires.toString());
  url.searchParams.set("signature", signature);
  url.searchParams.set("method", "GET");
  return url.toString();
}

async function devWriteFile(
  orgId: string,
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  const baseDir = devGetOrgAssetsDir(orgId);
  const filePath = join(baseDir, devSanitizeKey(key));
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

// ============================================================================
// Data URL parsing
// ============================================================================

interface ParsedDataUrl {
  mimeType: string;
  bytes: Uint8Array;
}

function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  const [, mimeType, base64] = match;
  try {
    const binary = atob(base64!);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { mimeType: mimeType!, bytes };
  } catch {
    return null;
  }
}

function mimeTypeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/html": "html",
    "application/json": "json",
  };
  return map[mimeType] ?? "bin";
}

// ============================================================================
// Storage helpers
// ============================================================================

/**
 * Upload raw bytes to org storage.
 * Returns the storage key on success, null on failure.
 *
 * Storage selection:
 * - S3 (ctx.objectStorage present): always used when configured.
 * - Dev filesystem: only in development; never used as a prod fallback.
 * - No storage in production: returns null so callers keep the data: URL as-is (base64 inline).
 */
async function uploadBytes(
  bytes: Uint8Array,
  key: string,
  mimeType: string,
  orgId: string,
  ctx: MeshContext,
): Promise<string | null> {
  try {
    if (ctx.objectStorage) {
      await ctx.objectStorage.put(key, bytes, { contentType: mimeType });
      return key;
    }
    if (getSettings().nodeEnv === "development") {
      await devWriteFile(orgId, key, bytes);
      return key;
    }
    // Production without object storage: signal to keep data: URL as-is.
    return null;
  } catch (err) {
    console.error("[file-materializer] Failed to upload file:", err);
    return null;
  }
}

/**
 * Generate a fresh presigned GET URL for an existing storage key.
 * Used by resolveStorageRefs on every turn.
 *
 * Returns null in production without object storage — those deployments never
 * persist mesh-storage: keys, so this path should not be reached.
 */
export async function generatePresignedGetUrl(
  key: string,
  orgId: string,
  ctx: MeshContext,
): Promise<string | null> {
  try {
    if (ctx.objectStorage) {
      return await ctx.objectStorage.presignedGetUrl(
        key,
        S3_PRESIGNED_EXPIRES_IN,
      );
    }
    if (getSettings().nodeEnv === "development") {
      return devGeneratePresignedGetUrl(ctx.baseUrl, orgId, key);
    }
    return null;
  } catch (err) {
    console.error("[file-materializer] Failed to generate presigned URL:", err);
    return null;
  }
}

// ============================================================================
// Phase 1 — uploadFileParts
// ============================================================================

/**
 * Upload file parts that carry `data:` URLs to org-scoped storage.
 * Stores stable `mesh-storage:{key}` URIs in the message — safe to persist to DB.
 * The text annotation also uses stable `mesh-storage:` URIs and a redirect URL
 * so the caller can reconstruct them without further DB writes.
 *
 * Only the last user message is processed — historical messages are skipped
 * to avoid re-uploading on every turn.
 */
export async function uploadFileParts(
  messages: ChatMessage[],
  ctx: MeshContext,
): Promise<ChatMessage[]> {
  if (!ctx.organization) return messages;
  const orgId = ctx.organization.id;

  const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
  if (lastUserIdx === -1) return messages;

  const message = messages[lastUserIdx]!;
  const dataUrlParts = message.parts.filter(
    (p) =>
      p.type === "file" &&
      "url" in p &&
      typeof p.url === "string" &&
      p.url.startsWith("data:"),
  );

  if (dataUrlParts.length === 0) return messages;

  // Upload all data: URL parts in parallel
  const uploadResults = await Promise.all(
    dataUrlParts.map(async (part) => {
      if (
        part.type !== "file" ||
        !("url" in part) ||
        typeof part.url !== "string"
      ) {
        return null;
      }
      const parsed = parseDataUrl(part.url);
      if (!parsed) return null;

      const ext = mimeTypeToExtension(parsed.mimeType);
      const key = `chat-uploads/${crypto.randomUUID()}.${ext}`;
      const uploadedKey = await uploadBytes(
        parsed.bytes,
        key,
        parsed.mimeType,
        orgId,
        ctx,
      );
      if (!uploadedKey) return null;

      const filename =
        "filename" in part && typeof part.filename === "string"
          ? part.filename
          : key;

      return {
        dataUrl: part.url,
        meshStorageUrl: toMeshStorageUrl(uploadedKey),
        redirectUrl: toFileRedirectUrl(ctx.baseUrl, orgId, uploadedKey),
        filename,
      };
    }),
  );

  const successful = uploadResults.filter(
    (r): r is NonNullable<typeof r> => r !== null,
  );
  if (successful.length === 0) return messages;

  // Annotation stored in DB uses stable mesh-storage: URIs
  const urlAnnotations = successful
    .map((r) => `- ${r.filename}: ${r.meshStorageUrl}`)
    .join("\n");
  const annotationText = `[Uploaded files — use these URLs when calling tools]\n${urlAnnotations}`;

  // Replace data: URLs with mesh-storage: in file parts
  const dataUrlToMeshStorage = new Map<string, string>(
    successful.map((r) => [r.dataUrl, r.meshStorageUrl]),
  );

  const transformedParts = message.parts.map((part) => {
    if (
      part.type !== "file" ||
      !("url" in part) ||
      typeof part.url !== "string"
    ) {
      return part;
    }
    const meshUrl = dataUrlToMeshStorage.get(part.url);
    if (!meshUrl) return part;
    return { ...part, url: meshUrl };
  });

  // Inject annotation into the first text part
  const firstTextIdx = transformedParts.findIndex((p) => p.type === "text");
  let finalParts: ChatMessage["parts"];
  if (firstTextIdx !== -1) {
    finalParts = transformedParts.map((p, i) => {
      if (i !== firstTextIdx || p.type !== "text") return p;
      return {
        ...p,
        text: `${annotationText}\n\n${"text" in p ? p.text : ""}`.trim(),
      };
    });
  } else {
    finalParts = [
      { type: "text" as const, text: annotationText },
      ...transformedParts,
    ];
  }

  return [
    ...messages.slice(0, lastUserIdx),
    { ...message, parts: finalParts },
    ...messages.slice(lastUserIdx + 1),
  ];
}

// ============================================================================
// Phase 2 — resolveStorageRefs
// ============================================================================

/**
 * Resolve `mesh-storage:` URIs in file parts to fresh presigned GET URLs so
 * the AI SDK / vision model can fetch the image. Text parts are left unchanged
 * — they keep the opaque `mesh-storage:` references that the LLM passes
 * verbatim to tool arguments. The tool-call interceptor (resolveArgsStorageRefs)
 * converts those references to presigned URLs at call time.
 *
 * Also handles legacy `data:` URLs for threads predating this pipeline.
 */
export async function resolveStorageRefs(
  messages: ChatMessage[],
  ctx: MeshContext,
): Promise<ChatMessage[]> {
  if (!ctx.organization) return messages;
  const orgId = ctx.organization.id;

  // Collect unique mesh-storage: keys from file parts only (not text)
  const keysToResolve = new Set<string>();
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (
        part.type === "file" &&
        "url" in part &&
        typeof part.url === "string"
      ) {
        const key = parseMeshStorageKey(part.url);
        if (key) keysToResolve.add(key);
      }
    }
  }

  // Generate fresh presigned URLs for all file-part keys
  const keyToPresigned = new Map<string, string>();
  await Promise.all(
    Array.from(keysToResolve).map(async (key) => {
      const url = await generatePresignedGetUrl(key, orgId, ctx);
      if (url) keyToPresigned.set(key, url);
    }),
  );

  if (keyToPresigned.size === 0) {
    // No mesh-storage: refs in file parts — safety net for legacy data: URLs
    return legacyMaterialize(messages, ctx, orgId);
  }

  // Replace mesh-storage: in file part URLs only; leave text parts untouched
  const resolved = messages.map((msg) => {
    const newParts = msg.parts.map((part) => {
      if (
        part.type === "file" &&
        "url" in part &&
        typeof part.url === "string"
      ) {
        const key = parseMeshStorageKey(part.url);
        if (key) {
          const presigned = keyToPresigned.get(key);
          if (presigned) return { ...part, url: presigned };
        }
      }
      return part;
    });

    const changed = newParts.some((p, i) => p !== msg.parts[i]);
    return changed ? { ...msg, parts: newParts } : msg;
  });

  return resolved;
}

// ============================================================================
// Tool-call interceptor
// ============================================================================

/**
 * Deep-walk a tool-call arguments object and replace every string value that
 * contains a `mesh-storage:` URI with a fresh presigned GET URL.
 *
 * Called by the tool middleware in helpers.ts before forwarding the call to
 * the MCP client, so tools always receive a real fetchable URL regardless of
 * what the LLM passed.
 */
export async function resolveArgsStorageRefs(
  args: Record<string, unknown>,
  orgId: string,
  ctx: MeshContext,
): Promise<Record<string, unknown>> {
  // Collect all mesh-storage: keys present anywhere in the args tree
  const keysFound = new Set<string>();
  collectMeshStorageKeys(args, keysFound);
  if (keysFound.size === 0) return args;

  // Resolve all keys to fresh presigned URLs in one batch
  const keyToPresigned = new Map<string, string>();
  await Promise.all(
    Array.from(keysFound).map(async (key) => {
      const url = await generatePresignedGetUrl(key, orgId, ctx);
      if (url) keyToPresigned.set(key, url);
    }),
  );

  if (keyToPresigned.size === 0) return args;
  return substituteValues(args, keyToPresigned) as Record<string, unknown>;
}

function collectMeshStorageKeys(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(/mesh-storage:([^\s"'<>\[\]]+)/g)) {
      out.add(match[1]!);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectMeshStorageKeys(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectMeshStorageKeys(v, out);
    }
  }
}

function substituteValues(
  value: unknown,
  keyToPresigned: Map<string, string>,
): unknown {
  if (typeof value === "string") {
    return value.replace(
      /mesh-storage:([^\s"'<>\[\]]+)/g,
      (_, key: string) => keyToPresigned.get(key) ?? `mesh-storage:${key}`,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteValues(item, keyToPresigned));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        substituteValues(v, keyToPresigned),
      ]),
    );
  }
  return value;
}

// ============================================================================
// Legacy safety net
// ============================================================================

/**
 * Upload any remaining `data:` URLs in the last user message.
 * Only runs when resolveStorageRefs finds no mesh-storage: refs —
 * i.e. for threads created before the stable-key pipeline was deployed.
 */
async function legacyMaterialize(
  messages: ChatMessage[],
  ctx: MeshContext,
  orgId: string,
): Promise<ChatMessage[]> {
  const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
  if (lastUserIdx === -1) return messages;

  const message = messages[lastUserIdx]!;
  const dataUrlParts = message.parts.filter(
    (p) =>
      p.type === "file" &&
      "url" in p &&
      typeof p.url === "string" &&
      p.url.startsWith("data:"),
  );
  if (dataUrlParts.length === 0) return messages;

  const uploadResults = await Promise.all(
    dataUrlParts.map(async (part) => {
      if (
        part.type !== "file" ||
        !("url" in part) ||
        typeof part.url !== "string"
      ) {
        return null;
      }
      const parsed = parseDataUrl(part.url);
      if (!parsed) return null;

      const ext = mimeTypeToExtension(parsed.mimeType);
      const key = `chat-uploads/${crypto.randomUUID()}.${ext}`;
      const uploadedKey = await uploadBytes(
        parsed.bytes,
        key,
        parsed.mimeType,
        orgId,
        ctx,
      );
      if (!uploadedKey) return null;

      const presigned = await generatePresignedGetUrl(uploadedKey, orgId, ctx);
      return presigned ? { dataUrl: part.url, presigned } : null;
    }),
  );

  const successful = uploadResults.filter(
    (r): r is NonNullable<typeof r> => r !== null,
  );
  if (successful.length === 0) return messages;

  const dataUrlToPresigned = new Map(
    successful.map((r) => [r.dataUrl, r.presigned]),
  );

  const newParts = message.parts.map((part) => {
    if (
      part.type !== "file" ||
      !("url" in part) ||
      typeof part.url !== "string"
    ) {
      return part;
    }
    const presigned = dataUrlToPresigned.get(part.url);
    return presigned ? { ...part, url: presigned } : part;
  });

  return [
    ...messages.slice(0, lastUserIdx),
    { ...message, parts: newParts },
    ...messages.slice(lastUserIdx + 1),
  ];
}
