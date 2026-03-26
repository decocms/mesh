import { anthropicAdapter } from "./adapters/anthropic";
import { claudeCodeAdapter } from "./adapters/claude-code";
import { googleAdapter } from "./adapters/google";
import { openrouterAdapter } from "./adapters/openrouter";
import type { ProviderId } from "./provider-ids";
import type { ProviderAdapter } from "./types";
import { decoAiGatewayAdapter } from "./adapters/deco-ai-gateway";
import { getSettings } from "../settings";

const isDecoAiGatewayEnabled = getSettings().aiGatewayEnabled;

export const PROVIDERS: Partial<Record<ProviderId, ProviderAdapter>> = {
  ...(isDecoAiGatewayEnabled && { deco: decoAiGatewayAdapter }),
  "claude-code": claudeCodeAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  openrouter: openrouterAdapter,
};
