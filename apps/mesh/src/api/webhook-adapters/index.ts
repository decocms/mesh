/**
 * Webhook Adapter Registry
 */

import type { WebhookAdapter, WebhookAdapterType } from "./types";
import { slackAdapter } from "./slack";

export * from "./types";

const adapters = new Map<WebhookAdapterType, WebhookAdapter>([
  ["slack", slackAdapter],
]);

export function getAdapter(type: WebhookAdapterType): WebhookAdapter | null {
  return adapters.get(type) ?? null;
}
