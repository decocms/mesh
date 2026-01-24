/**
 * User Sandbox Plugin - Completion Service
 *
 * Handles the completion flow:
 * 1. Link configured connections to the existing Virtual MCP (agent)
 * 2. Mark session as completed
 * 3. Emit completion event to event bus
 * 4. Call webhook if configured
 * 5. Build redirect URL
 *
 * NOTE: The Virtual MCP is created at session creation time, not here.
 * This ensures one Virtual MCP per (template, external_user_id).
 */

import type { Kysely } from "kysely";
import type { UserSandboxPluginStorage } from "../storage";
import type {
  UserSandboxEntity,
  UserSandboxSessionEntity,
} from "../storage/types";

/**
 * Generate a prefixed ID using crypto-grade randomness
 */
function generatePrefixedId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, "").substring(0, 8);
  return `${prefix}_${timestamp}${random}`;
}

/**
 * Completion result
 */
export interface CompletionResult {
  success: boolean;
  agentId: string | null;
  connectionIds: string[];
  redirectUrl: string | null;
  eventEmitted: boolean;
  webhookCalled: boolean;
}

/**
 * Database types for linking connections
 */
interface ConnectionAggregationsTable {
  id: string;
  parent_connection_id: string;
  child_connection_id: string;
  selected_tools: string | null;
  selected_resources: string | null;
  selected_prompts: string | null;
  created_at: string;
}

interface CompletionDatabase {
  connection_aggregations: ConnectionAggregationsTable;
}

/**
 * Context for completion operations
 * This interface represents what we need from the main Mesh context
 */
export interface CompletionContext {
  /** Organization ID from the session */
  organizationId: string;
  /** Database for linking connections */
  db: unknown;
  /** Event bus for publishing completion events */
  eventBus?: {
    publish: (
      organizationId: string,
      source: string,
      event: {
        type: string;
        data: unknown;
        subject?: string;
      },
    ) => Promise<void>;
  };
}

/**
 * Complete a user sandbox session.
 *
 * This is called when all required apps have been configured.
 * It links connections to the existing Virtual MCP and notifies the platform.
 */
export async function completeSession(
  session: UserSandboxSessionEntity,
  template: UserSandboxEntity,
  storage: UserSandboxPluginStorage,
  ctx: CompletionContext,
): Promise<CompletionResult> {
  const result: CompletionResult = {
    success: false,
    agentId: session.created_agent_id, // Already created at session creation
    connectionIds: [],
    redirectUrl: null,
    eventEmitted: false,
    webhookCalled: false,
  };

  try {
    const db = ctx.db as Kysely<CompletionDatabase>;
    const now = new Date().toISOString();

    // The Virtual MCP was already created at session creation time
    const agentId = session.created_agent_id;
    if (!agentId) {
      throw new Error("Session has no agent - this should not happen");
    }

    // 1. Collect connection IDs from configured apps
    const connectionIds: string[] = [];
    const appConnections: Array<{
      appName: string;
      connectionId: string;
      selectedTools: string[] | null;
      selectedResources: string[] | null;
      selectedPrompts: string[] | null;
    }> = [];

    for (const [appName, status] of Object.entries(session.app_statuses)) {
      if (status.configured && status.connection_id) {
        connectionIds.push(status.connection_id);

        // Find the app config to get selected tools/resources/prompts
        const appConfig = template.required_apps.find(
          (a) => a.app_name === appName,
        );

        appConnections.push({
          appName,
          connectionId: status.connection_id,
          selectedTools: appConfig?.selected_tools ?? null,
          selectedResources: appConfig?.selected_resources ?? null,
          selectedPrompts: appConfig?.selected_prompts ?? null,
        });
      }
    }
    result.connectionIds = connectionIds;

    // 2. Link connections to the existing Virtual MCP
    // First, remove any existing aggregations for this agent
    // (in case user is re-configuring their integrations)
    await db
      .deleteFrom("connection_aggregations")
      .where("parent_connection_id", "=", agentId)
      .execute();

    // Then add the new aggregations
    if (appConnections.length > 0) {
      await db
        .insertInto("connection_aggregations")
        .values(
          appConnections.map((conn) => ({
            id: generatePrefixedId("agg"),
            parent_connection_id: agentId,
            child_connection_id: conn.connectionId,
            selected_tools: conn.selectedTools
              ? JSON.stringify(conn.selectedTools)
              : null,
            selected_resources: conn.selectedResources
              ? JSON.stringify(conn.selectedResources)
              : null,
            selected_prompts: conn.selectedPrompts
              ? JSON.stringify(conn.selectedPrompts)
              : null,
            created_at: now,
          })),
        )
        .execute();
    }

    // 3. Update session as completed
    await storage.sessions.update(session.id, {
      status: "completed",
    });

    // 4. Emit completion event
    const eventData = {
      type: template.event_type,
      data: {
        externalUserId: session.external_user_id,
        agentId,
        templateId: template.id,
        sessionId: session.id,
        connections: connectionIds.map((id) => {
          const appName = Object.entries(session.app_statuses).find(
            ([_, status]) => status.connection_id === id,
          )?.[0];
          return { id, appName: appName ?? "unknown" };
        }),
      },
    };

    if (ctx.eventBus) {
      try {
        await ctx.eventBus.publish(
          ctx.organizationId,
          "user-sandbox",
          eventData,
        );
        result.eventEmitted = true;
      } catch (err) {
        console.error("[UserSandbox] Failed to emit completion event:", err);
      }
    }

    // 5. Call webhook if configured
    if (template.webhook_url) {
      try {
        const webhookResponse = await fetch(template.webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Sandbox-Event": template.event_type,
          },
          body: JSON.stringify(eventData.data),
        });

        if (!webhookResponse.ok) {
          console.error(
            "[UserSandbox] Webhook returned error:",
            webhookResponse.status,
          );
        } else {
          result.webhookCalled = true;
        }
      } catch (err) {
        console.error("[UserSandbox] Failed to call webhook:", err);
      }
    }

    // 6. Build redirect URL
    const redirectUrl = session.redirect_url ?? template.redirect_url;
    if (redirectUrl) {
      const url = new URL(redirectUrl);
      url.searchParams.set("sessionId", session.id);
      url.searchParams.set("externalUserId", session.external_user_id);
      url.searchParams.set("agentId", agentId);
      result.redirectUrl = url.toString();
    }

    result.success = true;
    return result;
  } catch (err) {
    console.error("[UserSandbox] Completion failed:", err);
    throw err;
  }
}
