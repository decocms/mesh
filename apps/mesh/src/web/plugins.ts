import type { AnyPlugin } from "@decocms/bindings/plugins";
import { objectStoragePlugin } from "mesh-plugin-object-storage";

// Registered plugins
export const sourcePlugins: AnyPlugin[] = [objectStoragePlugin];
