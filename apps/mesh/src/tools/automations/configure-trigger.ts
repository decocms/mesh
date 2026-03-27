/**
 * Shared helper for configuring triggers on MCP connections.
 *
 * Calls TRIGGER_CONFIGURE on the target connection to enable/disable
 * an event trigger. When enabling, generates a callback token and URL
 * so the external MCP can call back to Mesh when the trigger fires.
 */

import type { MeshContext } from "@/core/mesh-context";
import { clientFromConnection } from "@/mcp-clients";
import { toServerClient } from "@/api/routes/proxy";
import type { AutomationTrigger } from "@/storage/types";
import type { TriggerCallbackTokenStorage } from "@/storage/trigger-callback-tokens";
import { TriggerBinding } from "@decocms/bindings/trigger";

export async function configureTriggerOnMcp(
  ctx: MeshContext,
  trigger: AutomationTrigger,
  enabled: boolean,
  tokenStorage?: TriggerCallbackTokenStorage,
): Promise<{ success: boolean; error?: string }> {
  if (trigger.type !== "event" || !trigger.connection_id)
    return { success: true };

  const connection = await ctx.storage.connections.findById(
    trigger.connection_id,
  );
  if (!connection) return { success: true }; // Connection may have been deleted

  const organizationId = ctx.organization?.id;

  try {
    const mcpClient = await clientFromConnection(connection, ctx, true);
    const client = TriggerBinding.forClient(toServerClient(mcpClient));

    // Generate token pair (plaintext + hash) without persisting to DB
    let callbackUrl: string | undefined;
    let callbackToken: string | undefined;
    let tokenHash: string | undefined;
    if (enabled && tokenStorage && organizationId) {
      const pair = await tokenStorage.generateTokenPair();
      callbackToken = pair.plaintext;
      tokenHash = pair.hash;
      callbackUrl = `${ctx.baseUrl}/api/trigger-callback`;
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TRIGGER_CONFIGURE timeout")), 5000),
    );

    // Call TRIGGER_CONFIGURE on the MCP first — if this fails, no DB state changes
    await Promise.race([
      client.TRIGGER_CONFIGURE({
        type: trigger.event_type!,
        params: JSON.parse(trigger.params ?? "{}"),
        enabled,
        callbackUrl,
        callbackToken,
      }),
      timeoutPromise,
    ]);

    // MCP confirmed — now persist token or clean up
    if (enabled && tokenStorage && organizationId && tokenHash) {
      await tokenStorage.persistTokenHash(
        organizationId,
        trigger.connection_id,
        tokenHash,
      );
    }
    if (!enabled && tokenStorage && organizationId) {
      await tokenStorage.deleteByConnection(
        trigger.connection_id,
        organizationId,
      );
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
