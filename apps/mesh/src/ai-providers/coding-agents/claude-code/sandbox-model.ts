import { createClaudeCode } from "ai-sdk-provider-claude-code";
import type { ToolApprovalLevel } from "@/api/routes/decopilot/helpers";
import { rewriteMcpUrlsForContainer, type McpServer } from "./mcp-urls";
import { createRemoteSpawnedProcess, type DaemonTarget } from "./remote-spawn";

/**
 * Same shape as `createClaudeCodeModel` + a `daemon` target. Everything the
 * local-spawn variant accepts works here; the only new piece is the daemon
 * handle that tells us where to ship spawn requests.
 */
export interface SandboxClaudeCodeOptions {
  daemon: DaemonTarget;
  mcpServers?: Record<string, McpServer>;
  toolApprovalLevel?: ToolApprovalLevel;
  isPlanMode?: boolean;
  resume?: string;
  /**
   * Set when the sandbox runner resolved host access as `"add-host"`. In
   * that mode container-bound URLs to localhost services need rewriting to
   * `host.docker.internal`. When false (runner chose `--network=host`),
   * `localhost` already resolves to the host loopback and URLs pass through.
   */
  rewriteLocalhost: boolean;
}

// Tools the local-spawn model already disallows in headless. Kept in sync
// here — if the host gains a new "requires TTY" tool, both lists bump.
const HEADLESS_DISALLOWED_TOOLS = [
  "AskUserQuestion",
  "ExitPlanMode",
  "EnterWorktree",
  "ExitWorktree",
  "Config",
];

/**
 * Build a Claude Code language model that runs inside the mesh sandbox
 * container. Interchangeable with `createClaudeCodeModel` at call sites —
 * only the transport differs.
 *
 * Implementation is a thin layer: we reuse `ai-sdk-provider-claude-code` +
 * `@anthropic-ai/claude-agent-sdk`, and plug `spawnClaudeCodeProcess` with
 * a remote-spawn adapter that proxies stdin/stdout through the sandbox
 * daemon's `/claude-code/query` endpoint. The SDK handles stream-json
 * parsing, session resumption, tool-call serialization — we don't
 * reimplement any of it.
 */
export function createClaudeCodeSandboxModel(
  modelId: string,
  options: SandboxClaudeCodeOptions,
) {
  const mcpServers = options.rewriteLocalhost
    ? options.mcpServers
      ? rewriteMcpUrlsForContainer(options.mcpServers)
      : undefined
    : options.mcpServers;

  const restrictWrites =
    options.isPlanMode || options.toolApprovalLevel === "readonly";

  const settings: NonNullable<
    NonNullable<Parameters<typeof createClaudeCode>[0]>["defaultSettings"]
  > = {
    mcpServers,
    // No cwd: the SDK validates cwd with existsSync on the host, but we want
    // the container's WORKDIR. The daemon sets cwd itself on spawn; our
    // remote-spawn adapter ignores opts.cwd. Leaving this undefined skips
    // host-side validation.
    permissionMode: "bypassPermissions",
    disallowedTools: restrictWrites
      ? [...HEADLESS_DISALLOWED_TOOLS, "Write", "Edit", "Bash", "NotebookEdit"]
      : [...HEADLESS_DISALLOWED_TOOLS],
    // Belt-and-suspenders for the cross-thread filesystem leak: the daemon
    // wraps the spawn in a mount namespace where `/app` is bind-mounted to
    // the thread's worktree, so paths under `/app/*` stay isolated. This
    // appendix stops the agent from writing OUTSIDE `/app` (bare
    // `/CLAUDE.md`, `/etc/X`, etc.) which would still land on the shared
    // container rootfs. Appended — not replacing the default system
    // prompt — so model-specific instructions keep working.
    appendSystemPrompt:
      "Your project root is /app. Always work inside /app using relative " +
      "paths or absolute paths under /app/. Never read or write files " +
      "outside /app/ (no /CLAUDE.md, /etc/*, /root/*, /tmp/* writes unless " +
      "explicitly required). Do not reference or display any path like " +
      "/app/workspaces/thread-* — treat /app as the project root in all " +
      "output.",
    // Keep the command the SDK emits as bare "claude" so the daemon can
    // resolve it via CLAUDE_BIN regardless of mesh-side paths.
    pathToClaudeCodeExecutable: "claude",
    spawnClaudeCodeProcess: (opts) =>
      createRemoteSpawnedProcess(opts, options.daemon),
  };

  if (options.resume) settings.resume = options.resume;

  const provider = createClaudeCode({ defaultSettings: settings });
  return provider(modelId);
}
