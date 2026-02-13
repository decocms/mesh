import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";
import { migration as migration001 } from "./001-private-registry";

export const migrations: ServerPluginMigration[] = [migration001];
