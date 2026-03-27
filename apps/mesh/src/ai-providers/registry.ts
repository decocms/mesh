import { anthropicAdapter } from "./adapters/anthropic";
import { claudeCodeAdapter } from "./adapters/claude-code";
import { codexAdapter } from "./adapters/codex";
import { googleAdapter } from "./adapters/google";
import { openrouterAdapter } from "./adapters/openrouter";
import type { ProviderId } from "./provider-ids";
import type { ProviderAdapter } from "./types";
import { decoAiGatewayAdapter } from "./adapters/deco-ai-gateway";
import { getSettings } from "../settings";

export function getProviders(): Partial<Record<ProviderId, ProviderAdapter>> {
  return {
    ...(getSettings().aiGatewayEnabled && { deco: decoAiGatewayAdapter }),
    "claude-code": claudeCodeAdapter,
    codex: codexAdapter,
    anthropic: anthropicAdapter,
    google: googleAdapter,
    openrouter: openrouterAdapter,
  };
}
