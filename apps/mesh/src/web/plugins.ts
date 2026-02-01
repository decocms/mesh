import type { AnyClientPlugin } from "@decocms/bindings/plugins";
import { objectStoragePlugin } from "mesh-plugin-object-storage";
import { clientPlugin as userSandboxPlugin } from "mesh-plugin-user-sandbox/client";
import { taskRunnerPlugin } from "mesh-plugin-task-runner";
import { siteBuilderPlugin } from "mesh-plugin-site-builder";

// Registered plugins
export const sourcePlugins: AnyClientPlugin[] = [
  objectStoragePlugin,
  userSandboxPlugin,
  taskRunnerPlugin,
  siteBuilderPlugin,
];
