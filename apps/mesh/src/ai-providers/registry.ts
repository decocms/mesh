import { anthropicAdapter } from "./adapters/anthropic";
import { decoAiGatewayAdapter } from "./adapters/deco-ai-gateway";
import { openrouterAdapter } from "./adapters/openrouter";
import type { ProviderId } from "./provider-ids";
import type { ProviderAdapter } from "./types";

export const PROVIDERS: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openrouter: openrouterAdapter,
  deco: decoAiGatewayAdapter,
};
