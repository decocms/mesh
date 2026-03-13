/**
 * Build Stream Request
 *
 * Converts a stored Automation row into a StreamCoreInput suitable
 * for passing to streamCore(). JSON columns are parsed back into objects.
 */

import type { StreamCoreInput } from "@/api/routes/decopilot/stream-core";
import type { Automation } from "@/storage/types";

export function buildStreamRequest(
  automation: Automation,
  triggerId: string | null,
  threadId: string,
): StreamCoreInput {
  const messages = JSON.parse(automation.messages);
  console.info(
    `[Automation:buildRequest] Thread ${threadId}: automation ${automation.id} has ${messages.length} stored messages (roles: [${messages.map((m: { role: string }) => m.role).join(", ")}])`,
  );
  return {
    messages,
    models: JSON.parse(automation.models),
    agent: JSON.parse(automation.agent),
    temperature: automation.temperature ?? 0.5,
    toolApprovalLevel: "yolo",
    organizationId: automation.organization_id,
    userId: automation.created_by,
    triggerId: triggerId ?? undefined,
    threadId,
  };
}
