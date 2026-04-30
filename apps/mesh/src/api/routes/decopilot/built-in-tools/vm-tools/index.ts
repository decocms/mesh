/**
 * VM File Tools — runner-agnostic.
 *
 * Registers the six LLM-visible tools (read/write/edit/grep/glob/bash) on
 * top of any `SandboxRunner.proxyDaemonRequest`. All runners speak the
 * unified `/_decopilot_vm/*` surface with base64-wrapped JSON bodies
 * (Cloudflare WAF bypass; harmless 33% overhead on non-CF paths).
 */

import { tool, zodSchema } from "ai";
import path from "node:path";
import type { SandboxRunner } from "@decocms/sandbox/runner";
import { maybeTruncate } from "./common";
import {
  BASH_DESCRIPTION,
  BashInputSchema,
  COPY_TO_SANDBOX_DESCRIPTION,
  CopyToSandboxInputSchema,
  EDIT_DESCRIPTION,
  EditInputSchema,
  GLOB_DESCRIPTION,
  GREP_DESCRIPTION,
  GlobInputSchema,
  GrepInputSchema,
  READ_DESCRIPTION,
  ReadInputSchema,
  SHARE_WITH_USER_DESCRIPTION,
  ShareWithUserInputSchema,
  TOOL_APPROVAL,
  WRITE_DESCRIPTION,
  WriteInputSchema,
} from "./schemas";
import type { VmToolsParams } from "./types";

const MESH_STORAGE_SCHEME = "mesh-storage://";

/**
 * Resolve a `copy_to_sandbox` input to a fetchable URL the daemon can GET.
 * Accepts only org-scoped storage references — `mesh-storage://KEY` (the
 * shape that lands in chat annotations) or a bare KEY. Both are minted
 * to a presigned GET via `ctx.objectStorage`, so the daemon only ever
 * fetches from S3/R2 endpoints mesh controls.
 *
 * Arbitrary `http(s)://` URLs are intentionally rejected: for public
 * URLs the model can use `bash` + `curl` (which is approval-gated, like
 * any shell command), and excluding them keeps the daemon's fetch path
 * free of SSRF concerns.
 *
 * The tool-arg interceptor (`resolveArgsStorageRefs` in file-materializer)
 * substitutes mesh-storage:// → presigned-URL before this handler runs in
 * the happy path. This function is the safety net when interception didn't
 * happen, plus the path for bare keys.
 */
async function resolveSourceUrl(
  raw: string,
  ctx: VmToolsParams["ctx"],
): Promise<string> {
  if (raw.startsWith("https://") || raw.startsWith("http://")) {
    throw new Error(
      "copy_to_sandbox does not accept arbitrary URLs — pass a " +
        "mesh-storage:// URI or a bare org storage key. For public URLs, " +
        "use the bash tool (curl).",
    );
  }
  const key = raw.startsWith(MESH_STORAGE_SCHEME)
    ? raw.slice(MESH_STORAGE_SCHEME.length)
    : raw;
  if (!key || key.startsWith("/") || key.includes("..")) {
    throw new Error(`Invalid source: ${raw}`);
  }
  const storage = ctx.objectStorage;
  if (!storage) {
    throw new Error("Object storage is not configured for this org");
  }
  return storage.presignedGetUrl(key);
}

function sanitizeFilename(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (trimmed === "." || trimmed === ".." || trimmed.includes("..")) {
    return null;
  }
  if (trimmed.length > 255) return null;
  return trimmed;
}

/**
 * Find a non-colliding key by appending `-1`, `-2`, ... before the
 * extension on collision. Avoids the silent-overwrite footgun when the
 * model regenerates an artifact under the same default name in two
 * turns of the same thread — both files end up in the chip list, the
 * user can pick.
 *
 * Cap at COLLISION_LIMIT to bound HEAD-request cost on a pathological
 * input. Race with another concurrent share_with_user is theoretical
 * (single user, mostly sequential turns) — skip the If-None-Match dance.
 */
const COLLISION_LIMIT = 100;
async function findFreeKey(
  storage: NonNullable<VmToolsParams["ctx"]["objectStorage"]>,
  baseKey: string,
): Promise<string> {
  const exists = async (k: string): Promise<boolean> => {
    try {
      await storage.head(k);
      return true;
    } catch {
      return false;
    }
  };
  if (!(await exists(baseKey))) return baseKey;

  const slashIdx = baseKey.lastIndexOf("/");
  const dir = baseKey.slice(0, slashIdx + 1);
  const fname = baseKey.slice(slashIdx + 1);
  const dotIdx = fname.lastIndexOf(".");
  const stem = dotIdx > 0 ? fname.slice(0, dotIdx) : fname;
  const ext = dotIdx > 0 ? fname.slice(dotIdx) : "";

  for (let i = 1; i <= COLLISION_LIMIT; i++) {
    const candidate = `${dir}${stem}-${i}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(
    `Could not find a free key after ${COLLISION_LIMIT} attempts for ${baseKey}`,
  );
}

/**
 * Build a stable file-redirect URL. Must encode each path segment so
 * keys carrying URL-special chars (`?`, `#`, `&`, space, ...) survive
 * round-trip — the `/api/:org/files/*` route reads `c.req.path` which
 * truncates at the first unescaped `?`.
 */
function toFileDownloadUrl(
  baseUrl: string,
  orgId: string,
  key: string,
): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/api/${encodeURIComponent(orgId)}/files/${encodedKey}`;
}

export type { VmToolsParams } from "./types";

async function daemonRequest(
  runner: SandboxRunner,
  handle: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  let res: Response;
  try {
    const b64Body = Buffer.from(JSON.stringify(body), "utf-8").toString(
      "base64",
    );
    res = await runner.proxyDaemonRequest(handle, path, {
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      body: b64Body,
    });
  } catch {
    throw new Error(
      "The sandbox is not running. Ask the user to start it by clicking the server button (left side of the header bar).",
    );
  }
  const rawText = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    console.error(
      "[vm-tools] Failed to parse JSON response runner=%s path=%s status=%d rawText=%s",
      runner.kind,
      path,
      res.status,
      rawText.slice(0, 2000),
    );
    const statusHint =
      res.status >= 500
        ? " (server error)"
        : res.status === 0
          ? " (no response)"
          : "";
    throw new Error(
      `Daemon ${path} returned invalid JSON (HTTP ${res.status}${statusHint}): ${rawText.slice(0, 800)}`,
    );
  }
  if (!res.ok) {
    console.error(
      "[vm-tools] Non-OK response runner=%s path=%s status=%d body=%s",
      runner.kind,
      path,
      res.status,
      rawText.slice(0, 2000),
    );
    throw new Error(
      (json as { error?: string }).error ??
        `Daemon ${path} failed (${res.status})`,
    );
  }
  return json;
}

export function createVmTools(params: VmToolsParams) {
  const {
    runner,
    ensureHandle,
    toolOutputMap,
    needsApproval,
    pendingImages,
    ctx,
    threadId,
  } = params;
  const approvalFor = (mutating: boolean) => (mutating ? needsApproval : false);
  const call = async (daemonPath: string, input: Record<string, unknown>) => {
    const handle = await ensureHandle();
    return daemonRequest(runner, handle, daemonPath, input);
  };

  const read = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.read),
    description: READ_DESCRIPTION,
    inputSchema: zodSchema(ReadInputSchema),
    execute: async (input) => {
      const result = (await call("/_decopilot_vm/read", input)) as
        | { kind: "text"; content: string; lineCount: number }
        | {
            kind: "image";
            mediaType: string;
            base64: string;
            size: number;
          };
      if (result.kind === "image") {
        // Queue the image for injection as a user message in prepareStep.
        // Tool result is text-only — providers don't all carry images in
        // tool result messages, but everyone supports them in user content.
        pendingImages.push({
          url: `data:${result.mediaType};base64,${result.base64}`,
          mediaType: result.mediaType,
          label: `[Image at ${input.path}]`,
        });
        return {
          kind: "image" as const,
          path: input.path,
          mediaType: result.mediaType,
          size: result.size,
          message: "Image attached below.",
        };
      }
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const write = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.write),
    description: WRITE_DESCRIPTION,
    inputSchema: zodSchema(WriteInputSchema),
    execute: async (input) => call("/_decopilot_vm/write", input),
  });

  const edit = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.edit),
    description: EDIT_DESCRIPTION,
    inputSchema: zodSchema(EditInputSchema),
    execute: async (input) => call("/_decopilot_vm/edit", input),
  });

  const grep = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.grep),
    description: GREP_DESCRIPTION,
    inputSchema: zodSchema(GrepInputSchema),
    execute: async (input) => {
      const result = await call("/_decopilot_vm/grep", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const glob = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.glob),
    description: GLOB_DESCRIPTION,
    inputSchema: zodSchema(GlobInputSchema),
    execute: async (input) => {
      const result = await call("/_decopilot_vm/glob", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const bash = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.bash),
    description: BASH_DESCRIPTION,
    inputSchema: zodSchema(BashInputSchema),
    execute: async (input) => {
      const result = await call("/_decopilot_vm/bash", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const copy_to_sandbox = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.copy_to_sandbox),
    description: COPY_TO_SANDBOX_DESCRIPTION,
    inputSchema: zodSchema(CopyToSandboxInputSchema),
    execute: async (input) => {
      const sourceUrl = await resolveSourceUrl(input.url, ctx);
      const result = await call("/_decopilot_vm/write_from_url", {
        url: sourceUrl,
        path: input.target,
      });
      return result as { ok: boolean; path: string; size: number };
    },
  });

  const share_with_user = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.share_with_user),
    description: SHARE_WITH_USER_DESCRIPTION,
    inputSchema: zodSchema(ShareWithUserInputSchema),
    execute: async (input) => {
      const orgId = ctx.organization?.id;
      const storage = ctx.objectStorage;
      if (!orgId || !storage) {
        throw new Error("Object storage is not configured for this org");
      }
      const requestedFilename = sanitizeFilename(
        input.name ?? path.basename(input.source),
      );
      if (!requestedFilename) {
        throw new Error(`Invalid filename: ${input.name ?? input.source}`);
      }
      const baseKey = `model-outputs/${threadId}/${requestedFilename}`;
      // Dedupe key on collision so a regenerated artifact lands as
      // `report-1.csv` instead of silently clobbering `report.csv`. The
      // chip UI picks both up. The response surfaces the actual key /
      // filename used so the model can mention the right name in its reply.
      const key = await findFreeKey(storage, baseKey);
      const filename = key.split("/").pop() ?? requestedFilename;
      const presignedPutUrl = await storage.presignedPutUrl(key);
      await call("/_decopilot_vm/upload_to_url", {
        path: input.source,
        url: presignedPutUrl,
      });
      return {
        key,
        filename,
        downloadUrl: toFileDownloadUrl(ctx.baseUrl, orgId, key),
      };
    },
  });

  return {
    read,
    write,
    edit,
    grep,
    glob,
    bash,
    copy_to_sandbox,
    share_with_user,
  };
}
