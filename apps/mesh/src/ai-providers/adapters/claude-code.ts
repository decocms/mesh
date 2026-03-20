import { createClaudeCode } from "ai-sdk-provider-claude-code";
import type { ToolApprovalLevel } from "../../api/routes/decopilot/helpers";
import type { MeshProvider, ModelInfo, ProviderAdapter } from "../types";

export const CLAUDE_CODE_MODELS: ModelInfo[] = [
  {
    providerId: "claude-code",
    modelId: "haiku",
    title: "Claude Haiku",
    description: "Fast and lightweight",
    capabilities: ["text"],
    limits: null,
    costs: null,
  },
  {
    providerId: "claude-code",
    modelId: "sonnet",
    title: "Claude Sonnet",
    description: "Balanced performance",
    capabilities: ["text", "reasoning"],
    limits: null,
    costs: null,
  },
  {
    providerId: "claude-code",
    modelId: "opus",
    title: "Claude Opus",
    description: "Most capable",
    capabilities: ["text", "reasoning"],
    limits: null,
    costs: null,
  },
];

/**
 * Create a Claude Code language model with MCP servers attached.
 * This is separate from the adapter's create() because it needs
 * runtime config (mcpServers, permissionMode) that varies per request.
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
  };

  switch (options?.toolApprovalLevel) {
    case "plan":
      settings.permissionMode = "plan";
      settings.disallowedTools = [...HEADLESS_DISALLOWED_TOOLS];
      break;
    case "readonly":
      settings.permissionMode = "bypassPermissions";
      settings.disallowedTools = [
        ...HEADLESS_DISALLOWED_TOOLS,
        "Write",
        "Edit",
        "Bash",
        "NotebookEdit",
      ];
      break;
    default:
      settings.permissionMode = "bypassPermissions";
      settings.disallowedTools = [...HEADLESS_DISALLOWED_TOOLS];
      break;
  }

  const provider = createClaudeCode({
    defaultSettings: settings,
  });
  return provider(modelId);
}

export const claudeCodeAdapter: ProviderAdapter = {
  info: {
    id: "claude-code",
    name: "Claude Code",
    description: "Autonomous coding agent via Claude CLI",
  },
  supportedMethods: ["cli-activate"],
  create(_apiKey): MeshProvider {
    // Claude Code doesn't use API keys, but we need to conform to the interface.
    // The real model creation happens via createClaudeCodeModel() with mcpServers.
    const provider = createClaudeCode({
      defaultSettings: {
        permissionMode: "bypassPermissions",
        disallowedTools: [
          "AskUserQuestion",
          "ExitPlanMode",
          "EnterWorktree",
          "ExitWorktree",
          "Config",
        ],
      },
    });
    return {
      info: claudeCodeAdapter.info,
      aiSdk: provider as any,
      async listModels(): Promise<ModelInfo[]> {
        return CLAUDE_CODE_MODELS;
      },
    };
  },
};
