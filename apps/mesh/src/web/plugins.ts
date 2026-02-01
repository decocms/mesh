import type { AnyClientPlugin } from "@decocms/bindings/plugins";
import { objectStoragePlugin } from "mesh-plugin-object-storage";
import { clientPlugin as userSandboxPlugin } from "mesh-plugin-user-sandbox/client";
import { taskRunnerPlugin } from "mesh-plugin-task-runner";

// Registered plugins
export const sourcePlugins: AnyClientPlugin[] = [
  objectStoragePlugin,
  userSandboxPlugin,
  taskRunnerPlugin,
];
