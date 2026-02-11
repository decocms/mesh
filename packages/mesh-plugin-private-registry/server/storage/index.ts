import type { Kysely } from "kysely";
import type { ServerPluginContext } from "@decocms/bindings/server-plugin";
import { setPluginStorage } from "../tools/utils";
import { PublishRequestStorage } from "./publish-request";
import { RegistryItemStorage } from "./registry-item";
import { TestConnectionStorage } from "./test-connection";
import { TestResultStorage, TestRunStorage } from "./test-run";
import type { PrivateRegistryDatabase } from "./types";

export * from "./types";
export * from "./test-connection";
export * from "./test-run";

export interface PrivateRegistryPluginStorage {
  items: RegistryItemStorage;
  publishRequests: PublishRequestStorage;
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
    testRuns: new TestRunStorage(db),
    testResults: new TestResultStorage(db),
    testConnections: new TestConnectionStorage(db),
  };
  setPluginStorage(storage);
  return storage;
}
