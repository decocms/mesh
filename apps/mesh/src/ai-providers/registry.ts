import { anthropicAdapter } from "./adapters/anthropic";
import { googleAdapter } from "./adapters/google";
import { openrouterAdapter } from "./adapters/openrouter";
import type { ProviderId } from "./provider-ids";
import type { ProviderAdapter } from "./types";
import { decoAiGatewayAdapter } from "./adapters/deco-ai-gateway";

export const PROVIDERS: Record<ProviderId, ProviderAdapter> = {
  deco: decoAiGatewayAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  openrouter: openrouterAdapter,
};
