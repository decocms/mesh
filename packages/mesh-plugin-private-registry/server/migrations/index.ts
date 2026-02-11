import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";
import { migration as migration001 } from "./001-private-registry";
import { migration as migration002 } from "./002-publish-requests";
import { migration as migration003 } from "./003-test-runs";

export const migrations: ServerPluginMigration[] = [
  migration001,
  migration002,
  migration003,
];
