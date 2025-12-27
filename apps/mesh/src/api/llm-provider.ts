import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
  ProviderV2,
} from "@ai-sdk/provider";
import type { LanguageModelBinding } from "@decocms/bindings/llm";
import { lazy } from "../common";

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
            try {
              const parsed = JSON.parse(line) as LanguageModelV2StreamPart;
              controller.enqueue(parsed);
            } catch (error) {
              console.error("Failed to parse stream chunk:", error, chunk);
              throw error;
            }
          }
        }
      },
      flush(controller) {
        // Process any remaining data in the buffer when the stream ends
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer) as LanguageModelV2StreamPart;
            controller.enqueue(parsed);
          } catch (error) {
            console.error("Failed to parse final stream chunk:", error);
            throw error;
          }
        }
      },
    }),
  );
}

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
            callOptions: options as Parameters<
              LLMBindingClient["LLM_DO_GENERATE"]
            >[0]["callOptions"],
            modelId,
          });
          return {
            ...response,
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
            callOptions: options as Parameters<
              LLMBindingClient["LLM_DO_STREAM"]
            >[0]["callOptions"],
            modelId,
          });

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
