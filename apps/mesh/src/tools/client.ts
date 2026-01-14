/**
 * Tool caller utilities re-exported from mesh-sdk for backwards compatibility.
 * New code should import from @decocms/mesh-sdk directly.
 */

import type { ToolBinder } from "@/core/define-tool";
import type z from "zod";
import type { MCPMeshTools } from "./index.ts";

// Re-export from mesh-sdk
export {
  createToolCaller,
  UNKNOWN_CONNECTION_ID,
  type ToolCaller,
} from "@decocms/mesh-sdk";

// Mesh-specific types that stay here
export type MCPClient<
  TDefinition extends readonly ToolBinder<z.ZodTypeAny, z.ZodTypeAny>[],
> = {
  [K in TDefinition[number] as K["name"]]: K extends ToolBinder<
    infer TInput,
    infer TReturn
  >
    ? (params: z.infer<TInput>, init?: RequestInit) => Promise<z.infer<TReturn>>
    : never;
};

export type MeshClient = MCPClient<MCPMeshTools>;
