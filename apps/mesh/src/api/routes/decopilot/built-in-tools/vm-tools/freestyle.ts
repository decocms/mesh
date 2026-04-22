/**
 * Freestyle transport for VM tools. Posts to the in-VM daemon at
 * `<vmBaseUrl>/_decopilot_vm/<endpoint>`; payload is base64-encoded to dodge
 * Cloudflare WAF matching on shell-looking JSON bodies.
 */

import { tool, zodSchema } from "ai";
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
import type { FreestyleVmToolsParams } from "./types";

async function daemonPost(
  baseUrl: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `${baseUrl}/_decopilot_vm/${endpoint}`;
  const serialized = JSON.stringify(body);
  // Base64-encode the payload to avoid Cloudflare WAF triggering on
  // shell commands and other sensitive-looking content in the JSON body.
  const encoded = btoa(
    encodeURIComponent(serialized).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: encoded,
    });
  } catch {
    throw new Error(
      "The server is not running. Ask the user to start it by clicking the server button (left side of the header bar).",
    );
  }
  const rawText = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    console.error(
      "[vm-tools:freestyle] Failed to parse JSON response endpoint=%s status=%d rawText=%s",
      endpoint,
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
      `Daemon ${endpoint} returned invalid JSON (HTTP ${res.status}${statusHint}): ${rawText.slice(0, 800)}`,
    );
  }
  if (!res.ok) {
    console.error(
      "[vm-tools:freestyle] Non-OK response endpoint=%s status=%d body=%s",
      endpoint,
      res.status,
      rawText.slice(0, 2000),
    );
    throw new Error(
      (json as { error?: string }).error ??
        `Daemon ${endpoint} failed (${res.status})`,
    );
  }
  return json;
}

export function createFreestyleVmTools(params: FreestyleVmToolsParams) {
  const { vmBaseUrl, toolOutputMap, needsApproval } = params;
  const approvalFor = (mutating: boolean) => (mutating ? needsApproval : false);

  const read = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.read),
    description: READ_DESCRIPTION,
    inputSchema: zodSchema(ReadInputSchema),
    execute: async (input) => {
      const result = await daemonPost(vmBaseUrl, "read", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const write = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.write),
    description: WRITE_DESCRIPTION,
    inputSchema: zodSchema(WriteInputSchema),
    execute: async (input) => daemonPost(vmBaseUrl, "write", input),
  });

  const edit = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.edit),
    description: EDIT_DESCRIPTION,
    inputSchema: zodSchema(EditInputSchema),
    execute: async (input) => daemonPost(vmBaseUrl, "edit", input),
  });

  const grep = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.grep),
    description: GREP_DESCRIPTION,
    inputSchema: zodSchema(GrepInputSchema),
    execute: async (input) => {
      const result = await daemonPost(vmBaseUrl, "grep", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const glob = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.glob),
    description: GLOB_DESCRIPTION,
    inputSchema: zodSchema(GlobInputSchema),
    execute: async (input) => {
      const result = await daemonPost(vmBaseUrl, "glob", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const bash = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.bash),
    description: BASH_DESCRIPTION,
    inputSchema: zodSchema(BashInputSchema),
    execute: async (input) => {
      const result = await daemonPost(vmBaseUrl, "bash", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  return { read, write, edit, grep, glob, bash };
}
