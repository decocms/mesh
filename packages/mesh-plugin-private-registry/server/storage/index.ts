import type { Kysely } from "kysely";
import type { ServerPluginContext } from "@decocms/bindings/server-plugin";
import { setPluginStorage } from "../tools/utils";
import { RegistryItemStorage } from "./registry-item";
import { PublishRequestStorage } from "./publish-request";
import { PublishApiKeyStorage } from "./publish-api-key";
import type { PrivateRegistryDatabase } from "./types";

export * from "./types";

export interface PrivateRegistryPluginStorage {
  items: RegistryItemStorage;
  publishRequests: PublishRequestStorage;
  publishApiKeys: PublishApiKeyStorage;
}

export function createStorage(
  ctx: ServerPluginContext,
): PrivateRegistryPluginStorage {
  const db = ctx.db as Kysely<PrivateRegistryDatabase>;
  const storage: PrivateRegistryPluginStorage = {
    items: new RegistryItemStorage(db),
    publishRequests: new PublishRequestStorage(db),
    publishApiKeys: new PublishApiKeyStorage(db),
  };
  setPluginStorage(storage);
  return storage;
}
