import { createClaudeCode } from "ai-sdk-provider-claude-code";
import type { ToolApprovalLevel } from "@/api/routes/decopilot/helpers";
import { createClaudeCodeSandboxModel } from "./sandbox-model";
import type { DaemonTarget } from "./remote-spawn";
import type { McpServer } from "./mcp-urls";

export { createClaudeCodeSandboxModel } from "./sandbox-model";
export type { DaemonTarget } from "./remote-spawn";

/**
 * Model factory that picks between the local-spawn path and the sandbox
 * path. Callers in the decopilot stream-core always go through this — the
 * choice is keyed off the presence of a `sandbox` target, not an env flag,
 * so the decision lives at the call site where the sandbox was just
 * provisioned (or wasn't).
 */
export function createClaudeCodeModelForRequest(
  modelId: string,
  options: {
    mcpServers?: Record<string, McpServer>;
    toolApprovalLevel?: ToolApprovalLevel;
    isPlanMode?: boolean;
    resume?: string;
    /**
     * When set, the model runs inside the mesh sandbox container via the
     * daemon's /claude-code/query endpoint. When null/undefined, the model
     * spawns claude locally on the mesh host (legacy behavior).
     */
    sandbox?: {
      daemon: DaemonTarget;
      /**
       * True when the runner settled on `--add-host` host access (the
       * default on Docker Desktop / modern Linux Docker). Used to toggle
       * the localhost→host.docker.internal MCP URL rewrite.
       */
      rewriteLocalhost: boolean;
    } | null;
  },
) {
  if (options.sandbox) {
    return createClaudeCodeSandboxModel(modelId, {
      daemon: options.sandbox.daemon,
      mcpServers: options.mcpServers,
      toolApprovalLevel: options.toolApprovalLevel,
      isPlanMode: options.isPlanMode,
      resume: options.resume,
      rewriteLocalhost: options.sandbox.rewriteLocalhost,
    });
  }
  return createClaudeCodeModel(modelId, {
    mcpServers: options.mcpServers,
    toolApprovalLevel: options.toolApprovalLevel,
    isPlanMode: options.isPlanMode,
    resume: options.resume,
  });
}

/**
 * Create a Claude Code language model with MCP servers attached.
 * This is separate from the adapter's create() because it needs
 * runtime config (mcpServers, permissionMode, resume) that varies per request.
 */
export function createClaudeCodeModel(
  modelId: string,
  options?: {
    mcpServers?: Record<
      string,
      {
        type: "sse" | "http";
        url: string;
        headers?: Record<string, string>;
      }
    >;
    toolApprovalLevel?: ToolApprovalLevel;
    /** Chat mode plan — same tool restrictions as readonly for headless CLI */
    isPlanMode?: boolean;
    resume?: string;
  },
) {
  // Tools that require a TTY, manage local state, or are not useful in headless mode
  const HEADLESS_DISALLOWED_TOOLS = [
    "AskUserQuestion",
    "ExitPlanMode",
    "EnterWorktree",
    "ExitWorktree",
    "Config",
  ];

  const settings: NonNullable<
    NonNullable<Parameters<typeof createClaudeCode>[0]>["defaultSettings"]
  > = {
    mcpServers: options?.mcpServers,
    cwd: process.cwd(),
  };

  const restrictWrites =
    options?.isPlanMode || options?.toolApprovalLevel === "readonly";

  if (restrictWrites) {
    settings.permissionMode = "bypassPermissions";
    settings.disallowedTools = [
      ...HEADLESS_DISALLOWED_TOOLS,
      "Write",
      "Edit",
      "Bash",
      "NotebookEdit",
    ];
  } else {
    settings.permissionMode = "bypassPermissions";
    settings.disallowedTools = [...HEADLESS_DISALLOWED_TOOLS];
  }

  if (options?.resume) {
    settings.resume = options.resume;
  }

  const provider = createClaudeCode({
    defaultSettings: settings,
  });
  return provider(modelId);
}
