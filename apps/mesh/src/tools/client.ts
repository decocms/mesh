/**
 * Mesh client typing helpers.
 */

import type { ToolBinder } from "@/core/define-tool";
import type z from "zod";
import type { MCPMeshTools } from "./index.ts";

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
