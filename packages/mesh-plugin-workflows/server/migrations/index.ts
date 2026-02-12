/**
 * Workflows Plugin - Migrations Index
 *
 * Exports all plugin migrations for registration with the core migration system.
 */

import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";
import { migration as migration001 } from "./001-workflows";
import { migration as migration002 } from "./002-fix-bigint-timestamps";
import { migration as migration003 } from "./003-heartbeat";
import { migration as migration004 } from "./004-drop-heartbeat";
import { migration as migration005 } from "./005-raw-tool-output";

export const migrations: ServerPluginMigration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
];
