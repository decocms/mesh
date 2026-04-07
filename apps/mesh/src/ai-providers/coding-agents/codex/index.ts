import { createCodexAppServer } from "ai-sdk-provider-codex-cli";
import type { ToolApprovalLevel } from "@/api/routes/decopilot/helpers";

/**
 * Create a Codex language model with MCP servers attached.
 * This mirrors createClaudeCodeModel() — it needs runtime config
 * (mcpServers, approvalPolicy) that varies per request.
 *
 * IMPORTANT: The caller MUST call provider.close() when done to
 * terminate the persistent codex app-server process.
 */
export function createCodexModel(
  modelId: string,
  options?: {
    mcpServers?: Record<
      string,
      {
        transport: "http";
        url: string;
        headers?: Record<string, string>;
      }
    >;
    toolApprovalLevel?: ToolApprovalLevel;
  },
) {
  const mcpServers = options?.mcpServers
    ? Object.fromEntries(
        Object.entries(options.mcpServers).map(([name, config]) => [
          name,
          {
            transport: config.transport as "http",
            url: config.url,
            httpHeaders: config.headers,
          },
        ]),
      )
    : undefined;

  let approvalPolicy: "never" | "on-failure";
  switch (options?.toolApprovalLevel) {
    case "plan":
    case "readonly":
      approvalPolicy = "on-failure";
      break;
    default:
      approvalPolicy = "never";
      break;
  }

  const provider = createCodexAppServer({
    defaultSettings: {
      mcpServers,
      approvalPolicy,
      rmcpClient: true,
      sandboxPolicy: "workspace-write",
      connectionTimeoutMs: 30_000,
      requestTimeoutMs: 300_000,
      idleTimeoutMs: 60_000,
    },
  });

  return { model: provider(modelId), provider };
}
