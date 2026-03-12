import { anthropicAdapter } from "./adapters/anthropic";
import { googleAdapter } from "./adapters/google";
import { openrouterAdapter } from "./adapters/openrouter";
import type { ProviderId } from "./provider-ids";
import type { ProviderAdapter } from "./types";
import { decoAiGatewayAdapter } from "./adapters/deco-ai-gateway";

const isDecoAiGatewayEnabled = !!process.env.DECO_AI_GATEWAY_ENABLED;

/**
 * Claude Code uses the local CLI — no API key or SDK adapter needed.
 * This placeholder satisfies the registry type; the actual chat path
 * bypasses the adapter entirely via the isClaudeCode branch.
 */
const claudeCodeAdapter: ProviderAdapter = {
  info: {
    id: "claude-code",
    name: "Claude Code",
    description: "Local Claude Code CLI",
    logo: "/logos/Claude Code.svg",
  },
  supportedMethods: [],
  create() {
    throw new Error("Claude Code uses the local CLI, not an API adapter");
  },
};

export const PROVIDERS: Partial<Record<ProviderId, ProviderAdapter>> = {
  ...(isDecoAiGatewayEnabled && { deco: decoAiGatewayAdapter }),
  anthropic: anthropicAdapter,
  google: googleAdapter,
  openrouter: openrouterAdapter,
  "claude-code": claudeCodeAdapter,
};
