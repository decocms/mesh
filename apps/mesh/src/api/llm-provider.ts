import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
  ProviderV2,
} from "@ai-sdk/provider";
import type { LanguageModelBinding } from "@decocms/bindings/llm";
import { lazy } from "../common";

function parseStreamLineToPart(
  rawLine: string,
): LanguageModelV2StreamPart | null | undefined {
  const line = rawLine.trim();
  if (!line) return null;

  // Support SSE ("text/event-stream") and NDJSON.
  // SSE lines often look like:
  //   event: message
  //   data: {"type":"text-delta",...}
  // and terminate with:
  //   data: [DONE]
  if (line.startsWith("event:")) return null;
  if (line.startsWith("id:")) return null;
  if (line.startsWith("retry:")) return null;

  let payload = line;
  if (payload.startsWith("data:")) {
    payload = payload.slice("data:".length).trim();
    if (!payload) return null;
    if (payload === "[DONE]") return null;
  }

  try {
    return JSON.parse(payload) as LanguageModelV2StreamPart;
  } catch (error) {
    // Important: do NOT throw here; upstream providers can emit occasional
    // non-JSON lines (or partial lines) and Bun streaming can chunk oddly.
    // Throwing here errors the whole model stream and can cause the AI SDK
    // agent loop to restart mid-step (the "what the fuck is happening" symptom).
    console.warn(
      "[llm-provider] Failed to parse stream line as JSON. Skipping line.",
      { line: payload.slice(0, 200) },
      error,
    );
    return null;
  }
}

function responseToStream(
  response: Response,
): ReadableStream<LanguageModelV2StreamPart> {
  if (!response.body) {
    throw new Error("Response body is null");
  }

  let buffer = "";

  return response.body.pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream<string, LanguageModelV2StreamPart>({
      transform(chunk, controller) {
        buffer += chunk;
        const lines = buffer.split("\n");

        // Keep the last element in the buffer - it might be incomplete
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.trim()) {
            const parsed = parseStreamLineToPart(line);
            if (parsed) controller.enqueue(parsed);
          }
        }
      },
      flush(controller) {
        // Process any remaining data in the buffer when the stream ends
        if (buffer.trim()) {
          const parsed = parseStreamLineToPart(buffer);
          if (parsed) controller.enqueue(parsed);
        }
      },
    }),
  );
}

// Test-only export: allows verifying stream parsing behavior (NDJSON + SSE)
// without wiring a full LLM binding implementation.
export const __testOnly_responseToStream = responseToStream;

const toRegExp = (supportedUrls: Record<string, string[]>) => {
  return Object.fromEntries(
    Object.entries(supportedUrls).map(([key, values]) => [
      key,
      values.map((v) => new RegExp(v)),
    ]),
  );
};

type LLMBindingClient = ReturnType<
  (typeof LanguageModelBinding)["forConnection"]
>;

export interface LLMProvider extends ProviderV2 {
  listModels: LLMBindingClient["COLLECTION_LLM_LIST"];
}

/**
 * Convert AI SDK callOptions to LLM binding format.
 *
 * Key concerns:
 * 1. Tool-call/tool-result parts must NOT be re-serialized (the downstream
 *    provider handles its own serialization).
 * 2. Provider-specific metadata (`providerOptions`) must be stripped from
 *    prompt content parts. When the AI SDK runs multi-step tool loops, it
 *    copies `providerOptions` (including e.g. OpenRouter's encrypted
 *    `reasoning_details`) onto every part — reasoning, tool-call, AND
 *    tool-result. The downstream provider then accumulates these duplicated
 *    blobs and sends them to the LLM API, which rejects them (xAI 422).
 */
function convertCallOptionsForBinding(
  options: LanguageModelV2CallOptions,
): Parameters<LLMBindingClient["LLM_DO_GENERATE"]>[0]["callOptions"] {
  const { prompt, ...rest } = options;

  const cleanedPrompt = prompt.map((msg) => {
    if (
      (msg.role === "assistant" || msg.role === "tool") &&
      Array.isArray(msg.content)
    ) {
      return {
        ...msg,
        content: (msg.content as unknown as Record<string, unknown>[]).map(
          ({ providerOptions: _strip, ...part }) => part,
        ),
      };
    }
    return msg;
  });

  return {
    ...rest,
    prompt: cleanedPrompt,
  } as Parameters<LLMBindingClient["LLM_DO_GENERATE"]>[0]["callOptions"];
}

/**
 * Creates an AI SDK compatible provider for the given LLM binding
 * @param binding - The binding client to create the provider from
 * @returns The provider
 */
export const createLLMProvider = (binding: LLMBindingClient): LLMProvider => {
  return {
    imageModel: () => {
      throw new Error("Image models are not supported by this provider");
    },
    textEmbeddingModel: () => {
      throw new Error(
        "Text embedding models are not supported by this provider",
      );
    },
    listModels: async () => {
      return await binding.COLLECTION_LLM_LIST({});
    },
    languageModel: (modelId: string): LanguageModelV2 => {
      const supportedUrls = lazy(() =>
        binding
          .LLM_METADATA({ modelId })
          .then((metadata) => toRegExp(metadata.supportedUrls)),
      );

      return {
        specificationVersion: "v2" as const,
        provider: "llm-binding",
        modelId,
        supportedUrls,
        doGenerate: async (options: LanguageModelV2CallOptions) => {
          const response = await binding.LLM_DO_GENERATE({
            callOptions: convertCallOptionsForBinding(options),
            modelId,
          });
          const formattedTimestamp = response.response?.timestamp
            ? new Date(response.response.timestamp)
            : undefined;
          return {
            ...response,
            response: {
              ...response.response,
              timestamp: formattedTimestamp,
            },
            usage: {
              inputTokens: response.usage.inputTokens ?? undefined,
              outputTokens: response.usage.outputTokens ?? undefined,
              totalTokens: response.usage.totalTokens ?? undefined,
              reasoningTokens: response.usage.reasoningTokens ?? undefined,
            },
          };
        },
        doStream: async (options: LanguageModelV2CallOptions) => {
          const response = await binding.LLM_DO_STREAM({
            callOptions: convertCallOptionsForBinding(options) as Parameters<
              LLMBindingClient["LLM_DO_STREAM"]
            >[0]["callOptions"],
            modelId,
          });

          if (!response.ok) {
            throw new Error(
              `Streaming failed for model ${modelId} with the status code: ${response.status}\n${await response.text()}`,
            );
          }

          return {
            stream: responseToStream(response),
            response: {
              headers: Object.fromEntries(response.headers?.entries() ?? []),
            },
          };
        },
      };
    },
  };
};
