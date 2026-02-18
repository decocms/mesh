import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";
import { migration as migration001 } from "./001-private-registry";
import { migration as migration002 } from "./002-publish-requests";
import { migration as migration003 } from "./003-publish-api-keys";
import { migration as migration004 } from "./004-publish-request-requested-id";
import { migration as migration005 } from "./005-test-runs";
import { migration as migration006 } from "./006-unlisted";

export const migrations: ServerPluginMigration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
];
