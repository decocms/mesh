/**
 * Branded presets that wrap the generic "openai-compatible" provider with a
 * first-class card (logo, name, description, sensible base-URL placeholder).
 *
 * All presets store as providerId="openai-compatible" with the preset id
 * captured in the ai_provider_keys.preset_id column, so multiple configs of
 * the same preset can coexist (e.g. two LiteLLM instances) and the model
 * selector can show the branded logo + name instead of "OpenAI Compatible".
 */
export interface OpenAICompatiblePreset {
  id: string;
  name: string;
  description: string;
  logo: string;
  baseUrlPlaceholder: string;
  /** When true, the form hints that an API key is typically required. */
  apiKeyRecommended: boolean;
  /** Short copy shown in the form's helper area. */
  helpText?: string;
}

export const OPENAI_COMPATIBLE_PRESETS: OpenAICompatiblePreset[] = [
  {
    id: "litellm",
    name: "LiteLLM",
    description: "Connect a LiteLLM proxy as an OpenAI-compatible endpoint",
    logo: "https://raw.githubusercontent.com/BerriAI/litellm/main/docs/my-website/img/logo.svg",
    baseUrlPlaceholder: "http://localhost:4000",
    apiKeyRecommended: true,
    helpText:
      "Point at your LiteLLM proxy. The base URL should be the root of the proxy (we'll append /v1).",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Run local models via Ollama's OpenAI-compatible API",
    logo: "https://ollama.com/public/ollama.png",
    baseUrlPlaceholder: "http://localhost:11434",
    apiKeyRecommended: false,
    helpText:
      "Ollama exposes /v1 by default — no API key required for local use.",
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    description: "Local models served by LM Studio",
    logo: "https://lmstudio.ai/favicon.ico",
    baseUrlPlaceholder: "http://localhost:1234",
    apiKeyRecommended: false,
    helpText:
      "Start the local server in LM Studio, then paste its base URL here.",
  },
  {
    id: "vllm",
    name: "vLLM",
    description: "High-throughput inference server with OpenAI-compatible API",
    logo: "https://raw.githubusercontent.com/vllm-project/vllm/main/docs/source/assets/logos/vllm-logo-only-light.png",
    baseUrlPlaceholder: "http://localhost:8000",
    apiKeyRecommended: false,
  },
];

export function getPreset(
  presetId: string | null | undefined,
): OpenAICompatiblePreset | undefined {
  if (!presetId) return undefined;
  return OPENAI_COMPATIBLE_PRESETS.find((p) => p.id === presetId);
}
