import { createOpenAI } from "@ai-sdk/openai";
import type { MeshProvider, ProviderAdapter, ModelInfo } from "../types";

function parseCredential(raw: string): { baseUrl: string; apiKey: string } {
  const parsed = JSON.parse(raw);
  if (!parsed.baseUrl || typeof parsed.baseUrl !== "string") {
    throw new Error(
      "Invalid OpenAI-compatible credential: missing baseUrl field",
    );
  }
  // Normalize: strip trailing slashes, ensure /v1 suffix.
  // The AI SDK appends /chat/completions directly to the baseURL,
  // so it must end with /v1 for standard OpenAI-compatible servers.
  let url = parsed.baseUrl.replace(/\/+$/, "");
  if (!url.endsWith("/v1")) url += "/v1";
  return { baseUrl: url, apiKey: parsed.apiKey ?? "" };
}

// Minimalist "brackets + slash" icon representing a generic API endpoint.
const OPENAI_COMPAT_LOGO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 8 4"/><polyline points="20 7 20 4 16 4"/><polyline points="4 17 4 20 8 20"/><polyline points="20 17 20 20 16 20"/><line x1="9" y1="17" x2="15" y2="7"/></svg>')}`;

export const openaiCompatibleAdapter: ProviderAdapter = {
  info: {
    id: "openai-compatible",
    name: "OpenAI Compatible",
    description: "Custom OpenAI-compatible endpoint",
    logo: OPENAI_COMPAT_LOGO,
  },

  supportedMethods: ["api-key"],

  create(rawCredential): MeshProvider {
    const { baseUrl, apiKey } = parseCredential(rawCredential);

    const openai = createOpenAI({
      baseURL: baseUrl,
      apiKey: apiKey || "not-needed",
      name: "openai-compatible",
    });

    // Wrap so that languageModel() uses the chat completions API
    // (/v1/chat/completions) instead of the OpenAI Responses API (/responses)
    // which most compatible servers don't support.
    const aiSdk: typeof openai = Object.assign(
      (...args: Parameters<typeof openai>) => openai.chat(...args),
      openai,
      { languageModel: openai.chat },
    );

    return {
      info: this.info,
      aiSdk,

      async listModels(): Promise<ModelInfo[]> {
        const headers: Record<string, string> = {};
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

        const res = await fetch(`${baseUrl}/models`, {
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          throw new Error(`OpenAI-compatible listModels failed: ${res.status}`);
        }
        const body: { data: Array<{ id: string; owned_by?: string }> } =
          await res.json();
        return body.data.map((m) => ({
          providerId: "openai-compatible",
          modelId: m.id,
          title: m.id,
          description: m.owned_by ? `Owned by ${m.owned_by}` : null,
          logo: null,
          capabilities: [],
          limits: null,
          costs: null,
        }));
      },
    };
  },
};
