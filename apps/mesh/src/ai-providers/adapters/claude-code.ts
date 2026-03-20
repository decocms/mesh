import { createClaudeCode } from "ai-sdk-provider-claude-code";
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
      { type: "sse"; url: string; headers?: Record<string, string> }
    >;
  },
) {
  const provider = createClaudeCode({
    defaultSettings: {
      mcpServers: options?.mcpServers,
      permissionMode: "bypassPermissions",
    },
  });
  return provider(modelId);
}

export const claudeCodeAdapter: ProviderAdapter = {
  info: {
    id: "claude-code",
    name: "Claude Code",
    description: "Autonomous coding agent via Claude CLI",
  },
  supportedMethods: ["api-key"],
  create(_apiKey): MeshProvider {
    // Claude Code doesn't use API keys, but we need to conform to the interface.
    // The real model creation happens via createClaudeCodeModel() with mcpServers.
    const provider = createClaudeCode({
      defaultSettings: {
        permissionMode: "bypassPermissions",
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
