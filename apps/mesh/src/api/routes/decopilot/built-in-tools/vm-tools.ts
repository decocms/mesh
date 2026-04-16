/**
 * VM File Tools
 *
 * Built-in decopilot tools that proxy to the in-VM daemon's file operation
 * endpoints. Registered when a Virtual MCP has an active Freestyle VM,
 * replacing the QuickJS sandbox tool.
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  MAX_RESULT_TOKENS,
  createOutputPreview,
  estimateJsonTokens,
} from "./read-tool-output";

export interface VmToolsParams {
  readonly vmBaseUrl: string;
  readonly toolOutputMap: Map<string, string>;
  readonly needsApproval: boolean;
}

async function daemonPost(
  baseUrl: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `${baseUrl}/_decopilot_vm/${endpoint}`;
  const serialized = JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serialized,
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
  } catch (e) {
    console.error(
      "[vm-tools:daemonPost] Failed to parse JSON response endpoint=%s status=%d rawText=%s",
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
      "[vm-tools:daemonPost] Non-OK response endpoint=%s status=%d body=%s",
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

function maybeTruncate(
  result: unknown,
  toolOutputMap: Map<string, string>,
): unknown {
  let serialized: string;
  try {
    serialized =
      typeof result === "string" ? result : JSON.stringify(result, null, 2);
  } catch {
    serialized = String(result);
  }
  const tokenCount = estimateJsonTokens(serialized);
  if (tokenCount > MAX_RESULT_TOKENS) {
    const toolCallId = `vm_${Date.now()}`;
    toolOutputMap.set(toolCallId, serialized);
    const preview = createOutputPreview(serialized);
    return {
      truncated: true,
      message: `Output too large (${tokenCount} tokens). Use read_tool_output with tool_call_id "${toolCallId}" to extract specific data.`,
      preview,
    };
  }
  return result;
}

export function createVmTools(params: VmToolsParams) {
  const { vmBaseUrl, toolOutputMap, needsApproval } = params;

  const read = tool({
    needsApproval: false,
    description:
      "Read a file from the VM's project directory. Returns content with line numbers. " +
      "Use offset and limit for large files.",

    inputSchema: zodSchema(
      z.object({
        path: z
          .string()
          .describe("File path relative to project root (e.g. 'src/index.ts')"),
        offset: z
          .number()
          .optional()
          .describe("Starting line number (1-based, default 1)"),
        limit: z
          .number()
          .optional()
          .describe("Max lines to return (default 2000)"),
      }),
    ),
    execute: async (input) => {
      const result = await daemonPost(vmBaseUrl, "read", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const write = tool({
    needsApproval,
    description:
      "Write content to a file in the VM's project directory. " +
      "Creates parent directories if needed. Overwrites existing files entirely.",

    inputSchema: zodSchema(
      z.object({
        path: z.string().describe("File path relative to project root"),
        content: z.string().describe("The full file content to write"),
      }),
    ),
    execute: async (input) => {
      return await daemonPost(vmBaseUrl, "write", input);
    },
  });

  const edit = tool({
    needsApproval,
    description:
      "Perform exact string replacement in a file in the VM. " +
      "old_string must be unique in the file unless replace_all is true.",

    inputSchema: zodSchema(
      z.object({
        path: z.string().describe("File path relative to project root"),
        old_string: z.string().describe("The exact text to find and replace"),
        new_string: z
          .string()
          .describe("The replacement text (must differ from old_string)"),
        replace_all: z
          .boolean()
          .optional()
          .describe("Replace all occurrences (default false)"),
      }),
    ),
    execute: async (input) => {
      return await daemonPost(vmBaseUrl, "edit", input);
    },
  });

  const grep = tool({
    needsApproval: false,
    description:
      "Search file contents in the VM using ripgrep. " +
      "Supports regex patterns, file type filtering via glob, and context lines.",

    inputSchema: zodSchema(
      z.object({
        pattern: z.string().describe("Regex pattern to search for"),
        path: z
          .string()
          .optional()
          .describe("Directory or file to search in (default: project root)"),
        glob: z
          .string()
          .optional()
          .describe("Glob pattern to filter files (e.g. '*.ts', '*.{js,jsx}')"),
        context: z
          .number()
          .optional()
          .describe("Lines of context around matches"),
        ignore_case: z.boolean().optional().describe("Case-insensitive search"),
        output_mode: z
          .enum(["content", "files", "count"])
          .optional()
          .describe("Output mode (default: 'files')"),
        limit: z.number().optional().describe("Max result lines (default 250)"),
      }),
    ),
    execute: async (input) => {
      console.log(
        "[vm-tools:grep] inputType=%s input=%s",
        typeof input,
        JSON.stringify(input).slice(0, 500),
      );
      const result = await daemonPost(vmBaseUrl, "grep", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const glob = tool({
    needsApproval: false,
    description:
      "Find files by name pattern in the VM's project directory. " +
      "Uses ripgrep for gitignore-aware matching. Returns relative file paths.",

    inputSchema: zodSchema(
      z.object({
        pattern: z
          .string()
          .describe(
            "Glob pattern to match files (e.g. '**/*.ts', 'src/**/*.test.tsx')",
          ),
        path: z
          .string()
          .optional()
          .describe("Directory to search in (default: project root)"),
      }),
    ),
    execute: async (input) => {
      const result = await daemonPost(vmBaseUrl, "glob", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  const bashSchema = z.object({
    command: z.string().describe("The bash command to execute"),
    timeout: z
      .number()
      .optional()
      .describe("Timeout in milliseconds (default 30000, max 120000)"),
  });
  const bash = tool({
    needsApproval,
    description:
      "Execute a shell command in the VM's project directory. " +
      "Working directory is the project root. Timeout default 30s, max 2min.",

    inputSchema: zodSchema(bashSchema),
    execute: async (input: z.infer<typeof bashSchema>) => {
      console.log(
        "[vm-tools:bash] inputType=%s input=%s",
        typeof input,
        JSON.stringify(input).slice(0, 500),
      );
      const result = await daemonPost(vmBaseUrl, "bash", input);
      return maybeTruncate(result, toolOutputMap);
    },
  });

  return { read, write, edit, grep, glob, bash };
}
