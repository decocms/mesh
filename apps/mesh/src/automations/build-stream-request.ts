/**
 * Build Stream Request
 *
 * Converts a stored Automation row into a StreamCoreInput suitable
 * for passing to streamCore(). JSON columns are parsed back into objects.
 *
 * When the persisted models payload carries a Simple Mode `tier`, the
 * stored credential/model are treated as a stale snapshot and the live
 * tier slot from the org's `simple_mode` config wins. This keeps dormant
 * automations in sync with the org's current Simple Mode tiers without
 * requiring a UI visit to reconcile.
 */

import type { StreamCoreInput } from "@/api/routes/decopilot/stream-core";
import type { Automation, SimpleModeConfig } from "@/storage/types";

type AutomationModels = {
  credentialId: string;
  thinking: { id: string; [key: string]: unknown };
  tier?: "fast" | "smart" | "thinking";
  [key: string]: unknown;
};

export function buildStreamRequest(
  automation: Automation,
  triggerId: string | null,
  taskId: string,
  simpleMode?: SimpleModeConfig | null,
): StreamCoreInput {
  const rawMessages = JSON.parse(automation.messages);
  // Generate fresh ids for each run so concurrent automation runs don't
  // collide on the same message id (ON CONFLICT in saveMessages would
  // silently keep the message in the first thread, making it invisible
  // in subsequent threads).
  const messages = rawMessages.map((m: { id?: string; role: string }) => ({
    ...m,
    id: crypto.randomUUID(),
  }));

  const models = JSON.parse(automation.models) as AutomationModels;
  const tier = models.tier;
  const slot =
    tier && simpleMode?.enabled ? (simpleMode.chat?.[tier] ?? null) : null;
  const resolvedModels: AutomationModels = slot
    ? {
        ...models,
        credentialId: slot.keyId,
        thinking: { ...models.thinking, id: slot.modelId },
      }
    : models;

  const request: StreamCoreInput = {
    messages,
    models: resolvedModels,
    agent: { id: automation.virtual_mcp_id },
    temperature: automation.temperature ?? 0.5,
    toolApprovalLevel: "auto",
    mode: "default",
    organizationId: automation.organization_id,
    userId: automation.created_by,
    triggerId: triggerId ?? undefined,
    taskId,
  };

  return request;
}
