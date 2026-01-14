export interface ChatModelConfig {
  id: string;
  connectionId: string;
  provider?: string | null;
  limits?: {
    contextWindow?: number;
    maxOutputTokens?: number;
  };
}

export interface ChatGatewayConfig {
  id: string | null;
}

export interface ChatUserConfig {
  name?: string;
  avatar?: string;
}

export interface Metadata {
  reasoning_start_at?: string | Date;
  reasoning_end_at?: string | Date;
  model?: ChatModelConfig;
  additionalContext?: Record<string, unknown>;
  gateway?: ChatGatewayConfig;
  user?: ChatUserConfig;
  created_at?: string | Date;
  thread_id?: string;
  /** System prompt to prepend to messages at the transport layer */
  system?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    providerMetadata?: {
      [key: string]: unknown;
    };
  };
}
