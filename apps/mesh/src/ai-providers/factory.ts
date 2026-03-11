import type { AIProviderKeyStorage } from "../storage/ai-provider-keys";
import type { MeshProvider } from "./types";
import { PROVIDERS } from "./registry";

export class AIProviderFactory {
  constructor(private storage: AIProviderKeyStorage) {}

  async activate(keyId: string, organizationId: string): Promise<MeshProvider> {
    const { keyInfo, apiKey } = await this.storage.resolve(
      keyId,
      organizationId,
    );
    const adapter = PROVIDERS[keyInfo.providerId];
    return adapter.create(apiKey);
  }
}
