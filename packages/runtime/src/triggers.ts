import {
  TriggerConfigureInputSchema,
  TriggerListOutputSchema,
  type TriggerDefinition,
} from "@decocms/bindings/trigger";
import { z, type ZodObject, type ZodRawShape } from "zod";
import type { DefaultEnv } from "./index.ts";
import { createTool, type CreatedTool } from "./tools.ts";

interface CallbackCredentials {
  callbackUrl: string;
  callbackToken: string;
}

interface TriggerDef<
  TType extends string = string,
  TParams extends ZodObject<ZodRawShape> = ZodObject<ZodRawShape>,
> {
  type: TType;
  description: string;
  params: TParams;
}

interface Triggers<TDefs extends TriggerDef[]> {
  /**
   * Returns TRIGGER_LIST and TRIGGER_CONFIGURE tools
   * ready to be spread into your `withRuntime({ tools })` array.
   */
  tools(): CreatedTool[];

  /**
   * Notify Mesh that an event occurred.
   * The SDK matches it to stored callback credentials and POSTs to Mesh.
   * Fire-and-forget — errors are logged, not thrown.
   */
  notify<T extends TDefs[number]["type"]>(
    connectionId: string,
    type: T,
    data: Record<string, unknown>,
  ): void;
}

/**
 * Create a trigger SDK for your MCP.
 *
 * @example
 * ```typescript
 * import { createTriggers } from "@decocms/runtime/triggers";
 * import { z } from "zod";
 *
 * const triggers = createTriggers([
 *   {
 *     type: "github.push",
 *     description: "Triggered when code is pushed to a repository",
 *     params: z.object({
 *       repo: z.string().describe("Repository full name (owner/repo)"),
 *     }),
 *   },
 * ]);
 *
 * // In withRuntime:
 * export default withRuntime({
 *   tools: [() => triggers.tools()],
 * });
 *
 * // In webhook handler:
 * triggers.notify(connectionId, "github.push", payload);
 * ```
 */
export function createTriggers<const TDefs extends TriggerDef[]>(
  definitions: TDefs,
): Triggers<TDefs> {
  const callbackCredentials = new Map<string, CallbackCredentials>();
  // Track active trigger types per connection to know when to clean up credentials
  const activeTriggers = new Map<string, Set<string>>();

  const triggerDefinitions: TriggerDefinition[] = definitions.map((def) => {
    const shape = def.params.shape;
    const paramsSchema: Record<
      string,
      { type: "string"; description?: string; enum?: string[] }
    > = {};

    for (const [key, value] of Object.entries(shape)) {
      const zodField = value as z.ZodTypeAny;
      const entry: {
        type: "string";
        description?: string;
        enum?: string[];
      } = {
        type: "string" as const,
        description: zodField.description,
      };

      // Extract enum values from z.enum() schemas
      if ("options" in zodField && Array.isArray(zodField.options)) {
        entry.enum = zodField.options as string[];
      }

      paramsSchema[key] = entry;
    }

    return {
      type: def.type,
      description: def.description,
      paramsSchema,
    };
  });

  const TRIGGER_LIST = createTool({
    id: "TRIGGER_LIST" as const,
    description: "List available trigger definitions",
    inputSchema: z.object({}),
    outputSchema: TriggerListOutputSchema,
    execute: async () => {
      return { triggers: triggerDefinitions };
    },
  });

  const TRIGGER_CONFIGURE = createTool({
    id: "TRIGGER_CONFIGURE" as const,
    description: "Configure a trigger with parameters",
    inputSchema: TriggerConfigureInputSchema,
    outputSchema: z.object({ success: z.boolean() }),
    execute: async ({ context, runtimeContext }) => {
      const connectionId = (runtimeContext?.env as unknown as DefaultEnv)
        ?.MESH_REQUEST_CONTEXT?.connectionId;

      if (!connectionId) {
        throw new Error("Connection ID not available");
      }

      if (context.callbackUrl && context.callbackToken) {
        callbackCredentials.set(connectionId, {
          callbackUrl: context.callbackUrl,
          callbackToken: context.callbackToken,
        });
      }

      // Track active triggers per connection
      if (context.enabled) {
        const types = activeTriggers.get(connectionId) ?? new Set();
        types.add(context.type);
        activeTriggers.set(connectionId, types);
      } else {
        const types = activeTriggers.get(connectionId);
        if (types) {
          types.delete(context.type);
          if (types.size === 0) {
            activeTriggers.delete(connectionId);
            callbackCredentials.delete(connectionId);
          }
        }
      }

      return { success: true };
    },
  });

  return {
    tools() {
      return [TRIGGER_LIST, TRIGGER_CONFIGURE] as CreatedTool[];
    },

    notify(connectionId, type, data) {
      const credentials = callbackCredentials.get(connectionId);
      if (!credentials) {
        console.log(
          `[Triggers] No callback credentials for connection=${connectionId}, skipping notify`,
        );
        return;
      }

      fetch(credentials.callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credentials.callbackToken}`,
        },
        body: JSON.stringify({ type, data }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error(
              `[Triggers] Callback delivery failed for ${type}: ${res.status} ${res.statusText}`,
            );
          }
        })
        .catch((err) => {
          console.error(
            `[Triggers] Failed to deliver callback for ${type}:`,
            err,
          );
        });
    },
  };
}
