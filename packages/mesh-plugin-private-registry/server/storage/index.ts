import type { Kysely } from "kysely";
import type { ServerPluginContext } from "@decocms/bindings/server-plugin";
import { setPluginStorage } from "../tools/utils";
import { RegistryItemStorage } from "./registry-item";
import { PublishRequestStorage } from "./publish-request";
import { PublishApiKeyStorage } from "./publish-api-key";
import { TestRunStorage, TestResultStorage } from "./test-run";
import { TestConnectionStorage } from "./test-connection";
import type { PrivateRegistryDatabase } from "./types";

export * from "./types";

export interface PrivateRegistryPluginStorage {
  items: RegistryItemStorage;
  publishRequests: PublishRequestStorage;
  publishApiKeys: PublishApiKeyStorage;
  testRuns: TestRunStorage;
  testResults: TestResultStorage;
  testConnections: TestConnectionStorage;
}

export function createStorage(
  ctx: ServerPluginContext,
): PrivateRegistryPluginStorage {
  const db = ctx.db as Kysely<PrivateRegistryDatabase>;
  const storage: PrivateRegistryPluginStorage = {
    items: new RegistryItemStorage(db),
    publishRequests: new PublishRequestStorage(db),
    publishApiKeys: new PublishApiKeyStorage(db),
    testRuns: new TestRunStorage(db),
    testResults: new TestResultStorage(db),
    testConnections: new TestConnectionStorage(db),
  };
  setPluginStorage(storage);
  return storage;
}
