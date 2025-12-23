import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
  ProviderV2,
} from "@ai-sdk/provider";
import type { LanguageModelBinding } from "@decocms/bindings/llm";

/**
 * Lazy promise wrapper that defers execution until the promise is awaited.
 * The factory function is only called when .then() is invoked for the first time.
 */
class Lazy<T> implements PromiseLike<T> {
  private promise: Promise<T> | null = null;

  constructor(private factory: () => Promise<T>) {}

  private getOrCreatePromise(): Promise<T> {
    if (!this.promise) {
      this.promise = this.factory();
    }
    return this.promise;
  }

  // eslint-disable-next-line no-thenable
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ): PromiseLike<TResult1 | TResult2> {
    return this.getOrCreatePromise().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | null
      | undefined,
  ): Promise<T | TResult> {
    return this.getOrCreatePromise().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<T> {
    return this.getOrCreatePromise().finally(onfinally);
  }
}

function lazy<T>(factory: () => Promise<T>): Promise<T> {
  return new Lazy(factory) as unknown as Promise<T>;
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
            try {
              const parsed = JSON.parse(line) as LanguageModelV2StreamPart;
              controller.enqueue(parsed);
            } catch (error) {
              console.error("Failed to parse stream chunk:", error);
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
