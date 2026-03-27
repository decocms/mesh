import type { MeshProvider, ModelInfo, ProviderAdapter } from "../types";

export { createCodexModel } from "../coding-agents/codex";

export const CODEX_MODELS: ModelInfo[] = [
  {
    providerId: "codex",
    modelId: "codex:gpt-5.2-codex-mini",
    title: "Codex Mini",
    description: "Fast and lightweight",
    capabilities: ["text"],
    limits: null,
    costs: null,
  },
  {
    providerId: "codex",
    modelId: "codex:gpt-5.3-codex",
    title: "Codex",
    description: "Most capable",
    capabilities: ["text", "reasoning"],
    limits: null,
    costs: null,
  },
];

/** Map composite model IDs (e.g. "codex:gpt-5.3-codex") to SDK model names. */
const CODEX_SDK_MODELS: Record<string, string> = {
  "codex:gpt-5.2-codex-mini": "gpt-5.2-codex-mini",
  "codex:gpt-5.3-codex": "gpt-5.3-codex",
};

/** Resolve a composite codex model ID to the SDK model name. */
export function resolveCodexModelId(modelId: string): string {
  const resolved = CODEX_SDK_MODELS[modelId];
  if (!resolved) {
    throw new Error(`Unknown Codex model ID: ${modelId}`);
  }
  return resolved;
}

export const codexAdapter: ProviderAdapter = {
  info: {
    id: "codex",
    name: "Codex",
    description: "Autonomous coding agent via OpenAI Codex CLI",
    logo: "https://assets.decocache.com/decocms/6ac44f1c-c0cf-4480-84b5-2ae6fe742d0b/codex-app.png.png",
  },
  supportedMethods: ["cli-activate"],
  create(_apiKey): MeshProvider {
    return {
      info: codexAdapter.info,
      aiSdk: {} as any,
      async listModels(): Promise<ModelInfo[]> {
        return CODEX_MODELS;
      },
    };
  },
};
