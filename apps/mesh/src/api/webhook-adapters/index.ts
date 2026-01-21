/**
 * Webhook Adapter Registry
 *
 * Provides the Slack webhook adapter for the Universal Webhook Proxy.
 */

import type { WebhookAdapter, WebhookAdapterType } from "./types";
import { slackAdapter } from "./slack";

export * from "./types";

/**
 * Registry of available webhook adapters
 */
const adapters: Map<string, WebhookAdapter> = new Map([
  ["slack", slackAdapter],
]);

/**
 * Get an adapter by type
 */
export function getAdapter(type: WebhookAdapterType): WebhookAdapter {
  const adapter = adapters.get(type);
  if (!adapter) {
    throw new Error(`Unknown webhook adapter type: ${type}`);
  }
  return adapter;
}

/**
 * Detect the appropriate adapter based on the request
 * Currently only supports Slack
 */
export function detectAdapter(req: Request, body: unknown): WebhookAdapter | null {
  if (slackAdapter.matches(req, body)) {
    return slackAdapter;
  }
  return null;
}

// Re-export the Slack adapter
export { slackAdapter } from "./slack";
