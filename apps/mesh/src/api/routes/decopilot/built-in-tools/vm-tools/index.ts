/**
 * VM File Tools — runner-agnostic.
 *
 * Registers the six LLM-visible tools (read/write/edit/grep/glob/bash) on
 * top of any `SandboxRunner.proxyDaemonRequest`. All runners speak the
 * unified `/_decopilot_vm/*` surface with base64-wrapped JSON bodies
 * (Cloudflare WAF bypass; harmless 33% overhead on non-CF paths).
 */

import { tool, zodSchema } from "ai";
import type { SandboxRunner } from "@decocms/sandbox/runner";
import { maybeTruncate } from "./common";
import {
  BASH_DESCRIPTION,
  BashInputSchema,
  EDIT_DESCRIPTION,
  EditInputSchema,
  GLOB_DESCRIPTION,
  GREP_DESCRIPTION,
  GlobInputSchema,
  GrepInputSchema,
  READ_DESCRIPTION,
  ReadInputSchema,
  TOOL_APPROVAL,
  WRITE_DESCRIPTION,
  WriteInputSchema,
} from "./schemas";
import type { VmToolsParams } from "./types";

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
    threadId,
  } = params;
  const approvalFor = (mutating: boolean) => (mutating ? needsApproval : false);
  const call = async (path: string, input: Record<string, unknown>) => {
    const handle = await ensureHandle();
    return daemonRequest(runner, handle, path, input);
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
      // Inject THREAD_ID for skills like user-data-share. Thread ids are
      // alphanumeric/dashes/underscores (nanoid- or uuid-shaped), so they
      // need no shell quoting; reject anything that would break the
      // prefix injection rather than build a half-correct quoter.
      const safeThreadId =
        threadId && /^[a-zA-Z0-9_-]+$/.test(threadId) ? threadId : null;
      const command = safeThreadId
        ? `export THREAD_ID=${safeThreadId}; ${input.command}`
        : input.command;
      const result = await call("/_decopilot_vm/bash", { ...input, command });
      return maybeTruncate(result, toolOutputMap);
    },
  });

  return { read, write, edit, grep, glob, bash };
}
