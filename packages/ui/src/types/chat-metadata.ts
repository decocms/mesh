export interface ChatModelConfig {
  id: string;
  connectionId: string;
  provider?: string | null;
}

export interface ChatGatewayConfig {
  id: string;
}

export interface ChatUserConfig {
  name?: string;
  avatar?: string;
}

export interface Metadata {
  model?: ChatModelConfig;
  gateway?: ChatGatewayConfig;
  user?: ChatUserConfig;
  created_at?: string | Date;
  thread_id?: string;
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
