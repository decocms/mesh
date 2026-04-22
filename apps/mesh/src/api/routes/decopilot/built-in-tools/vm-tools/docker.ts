/**
 * Docker transport for VM tools. Proxies to the sandbox daemon's
 * `/_daemon/fs/*` and `/_daemon/bash` endpoints via
 * `DockerSandboxRunner.proxyDaemonRequest` — the bearer token stays
 * inside the runner, never visible here.
 */

import { tool, zodSchema } from "ai";
import type { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";
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
import type { DockerVmToolsParams } from "./types";

async function daemonRequest(
  runner: DockerSandboxRunner,
  handle: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  let res: Response;
  try {
    res = await runner.proxyDaemonRequest(handle, path, {
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      body: JSON.stringify(body),
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
      "[vm-tools:docker] Failed to parse JSON response path=%s status=%d rawText=%s",
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
      "[vm-tools:docker] Non-OK response path=%s status=%d body=%s",
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

export function createDockerVmTools(params: DockerVmToolsParams) {
  const { dockerRunner, ensureHandle, toolOutputMap, needsApproval } = params;
  const approvalFor = (mutating: boolean) => (mutating ? needsApproval : false);
  const call = async (path: string, input: Record<string, unknown>) => {
    const handle = await ensureHandle();
    return daemonRequest(dockerRunner, handle, path, input);
  };

  const read = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.read),
    description: READ_DESCRIPTION,
    inputSchema: zodSchema(ReadInputSchema),
    execute: async (input) => {
      const result = await call("/_daemon/fs/read", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const write = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.write),
    description: WRITE_DESCRIPTION,
    inputSchema: zodSchema(WriteInputSchema),
    execute: async (input) => call("/_daemon/fs/write", input),
  });

  const edit = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.edit),
    description: EDIT_DESCRIPTION,
    inputSchema: zodSchema(EditInputSchema),
    execute: async (input) => call("/_daemon/fs/edit", input),
  });

  const grep = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.grep),
    description: GREP_DESCRIPTION,
    inputSchema: zodSchema(GrepInputSchema),
    execute: async (input) => {
      const result = await call("/_daemon/fs/grep", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const glob = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.glob),
    description: GLOB_DESCRIPTION,
    inputSchema: zodSchema(GlobInputSchema),
    execute: async (input) => {
      const result = await call("/_daemon/fs/glob", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const bash = tool({
    needsApproval: approvalFor(TOOL_APPROVAL.bash),
    description: BASH_DESCRIPTION,
    inputSchema: zodSchema(BashInputSchema),
    execute: async (input) => {
      const result = await call("/_daemon/bash", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  return { read, write, edit, grep, glob, bash };
}
