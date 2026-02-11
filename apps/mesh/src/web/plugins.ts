import type { AnyClientPlugin } from "@decocms/bindings/plugins";
import { objectStoragePlugin } from "mesh-plugin-object-storage";
import { clientPlugin as privateRegistryPlugin } from "mesh-plugin-private-registry/client";
import { clientPlugin as userSandboxPlugin } from "mesh-plugin-user-sandbox/client";

// Registered plugins
export const sourcePlugins: AnyClientPlugin[] = [
  objectStoragePlugin,
  userSandboxPlugin,
  privateRegistryPlugin,
];
