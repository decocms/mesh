import type { Metadata } from "@deco/ui/types/chat-metadata.ts";

interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

type ProviderCostExtractor = (
  providerMetadata: NonNullable<Metadata["usage"]>["providerMetadata"],
) => number | null;

/**
 * Provider-specific cost extractors
 * Each extractor attempts to get the cost from provider metadata
 */
const PROVIDER_COST_EXTRACTORS: Record<string, ProviderCostExtractor> = {
  openrouter: (providerMetadata) => {
    const openrouter = providerMetadata?.openrouter;
    if (
      typeof openrouter === "object" &&
      openrouter !== null &&
      "usage" in openrouter &&
      typeof openrouter.usage === "object" &&
      openrouter.usage !== null &&
      "cost" in openrouter.usage &&
      typeof openrouter.usage.cost === "number"
    ) {
      return openrouter.usage.cost;
    }
    return null;
  },
};

/**
 * Extract cost from usage metadata by checking all known provider formats
 */
function getCostFromUsage(usage: Metadata["usage"]): number | null {
  if (!usage?.providerMetadata) {
    return null;
  }

  for (const extractor of Object.values(PROVIDER_COST_EXTRACTORS)) {
    const cost = extractor(usage.providerMetadata);
    if (cost !== null) {
      return cost;
    }
  }

  return null;
}

/**
 * Calculate aggregated usage stats from an array of messages
 */
export function calculateUsageStats(
  messages: Array<{ metadata?: Metadata }>,
): UsageStats {
  return messages.reduce<UsageStats>(
    (acc, message) => {
      const usage = message.metadata?.usage;
      if (!usage) return acc;

      return {
        inputTokens: acc.inputTokens + (usage.inputTokens ?? 0),
        outputTokens: acc.outputTokens + (usage.outputTokens ?? 0),
        totalTokens: acc.totalTokens + (usage.totalTokens ?? 0),
        cost: acc.cost + (getCostFromUsage(usage) ?? 0),
      };
    },
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 },
  );
}
