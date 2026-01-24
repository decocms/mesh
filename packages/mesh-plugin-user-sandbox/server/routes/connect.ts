/**
 * User Sandbox Plugin - Connect API Routes
 *
 * Public API routes for the brandless connect flow.
 * These routes do NOT require Mesh authentication - the session ID is the credential.
 *
 * Routes:
 * - GET  /api/user-sandbox/sessions/:sessionId - Get session status and apps
 * - POST /api/user-sandbox/sessions/:sessionId/provision - Create connection for an app
 * - POST /api/user-sandbox/sessions/:sessionId/configure - Mark app as configured
 * - POST /api/user-sandbox/sessions/:sessionId/complete - Complete the session
 */

import { Hono } from "hono";
import type { ServerPluginContext } from "@decocms/bindings/server-plugin";
import type { Kysely } from "kysely";
import { UserSandboxStorage } from "../storage/user-sandbox";
import { UserSandboxSessionStorage } from "../storage/user-sandbox-session";
import type {
  UserSandboxDatabase,
  AppStatus,
  RequiredApp,
} from "../storage/types";
import {
  validateSessionAccess,
  SessionAccessError,
  createConnectionMetadata,
} from "../security";
import { completeSession } from "../services";

/**
 * Generate a prefixed ID for connections using crypto-grade randomness
 */
function generateConnectionId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, "").substring(0, 8);
  return `conn_${timestamp}${random}`;
}

/**
 * Create a connection from app configuration
 */
async function createConnectionFromApp(
  db: Kysely<unknown>,
  organizationId: string,
  createdBy: string,
  sessionId: string,
  externalUserId: string,
  templateId: string,
  app: RequiredApp,
): Promise<string> {
  const connectionId = generateConnectionId();
  const now = new Date().toISOString();

  // Validate required fields
  if (!app.title) {
    throw new Error(`App "${app.app_name}" is missing required field: title`);
  }
  if (!app.connection_type) {
    throw new Error(
      `App "${app.app_name}" is missing required field: connection_type`,
    );
  }
  if (!app.connection_url && app.connection_type !== "STDIO") {
    throw new Error(
      `App "${app.app_name}" is missing required field: connection_url`,
    );
  }

  const connectionData = {
    id: connectionId,
    organization_id: organizationId,
    created_by: createdBy, // User who created the template
    title: app.title,
    description: app.description ?? null,
    icon: app.icon ?? null,
    app_name: app.app_name,
    app_id: null,
    connection_type: app.connection_type,
    connection_url: app.connection_url ?? "", // Empty string for STDIO
    connection_token: null,
    connection_headers: app.connection_headers
      ? JSON.stringify(app.connection_headers)
      : null,
    oauth_config: app.oauth_config ? JSON.stringify(app.oauth_config) : null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: JSON.stringify(
      createConnectionMetadata(sessionId, externalUserId, templateId),
    ),
    tools: null,
    bindings: null,
    status: "active",
    created_at: now,
    updated_at: now,
  };

  // Insert into connections table
  await (db as Kysely<{ connections: typeof connectionData }>)
    .insertInto("connections")
    .values(connectionData)
    .execute();

  return connectionId;
}

/**
 * Error response helper
 */
function errorResponse(
  c: { json: (data: unknown, status: number) => Response },
  error: unknown,
) {
  if (error instanceof SessionAccessError) {
    const statusMap: Record<string, number> = {
      SESSION_NOT_FOUND: 404,
      SESSION_EXPIRED: 410,
      SESSION_COMPLETED: 409,
      ACCESS_DENIED: 403,
      CONNECTION_ACCESS_DENIED: 403,
    };
    return c.json(
      { error: error.message, code: error.code },
      statusMap[error.code] ?? 400,
    );
  }

  console.error("[UserSandbox] Connect API error:", error);
  return c.json(
    { error: error instanceof Error ? error.message : "Internal error" },
    500,
  );
}

/**
 * Create the connect routes for the plugin.
 */
export function connectRoutes(app: Hono, ctx: ServerPluginContext): void {
  const db = ctx.db as Kysely<UserSandboxDatabase>;
  const templates = new UserSandboxStorage(db);
  const sessions = new UserSandboxSessionStorage(db);
  const storage = { templates, sessions };

  // ============================================================================
  // GET /api/user-sandbox/sessions/:sessionId - Get session and app statuses
  // ============================================================================
  app.get("/api/user-sandbox/sessions/:sessionId", async (c) => {
    try {
      const sessionId = c.req.param("sessionId");

      // Validate session (allow completed for read access)
      const session = await validateSessionAccess(sessionId, storage, {
        allowCompleted: true,
      });

      // Get template for app list
      const template = await templates.findById(session.template_id);
      if (!template) {
        return c.json({ error: "Template not found" }, 404);
      }

      return c.json({
        session: {
          id: session.id,
          status: session.status,
          external_user_id: session.external_user_id,
          expires_at: session.expires_at,
          redirect_url: session.redirect_url,
          created_agent_id: session.created_agent_id,
        },
        template: {
          id: template.id,
          title: template.title,
          description: template.description,
          icon: template.icon,
        },
        apps: template.required_apps.map((app) => ({
          app_name: app.app_name,
          title: app.title,
          description: app.description,
          icon: app.icon,
          connection_type: app.connection_type,
          requires_oauth: !!app.oauth_config,
          selected_tools: app.selected_tools,
          selected_resources: app.selected_resources,
          selected_prompts: app.selected_prompts,
          status: session.app_statuses[app.app_name] ?? {
            configured: false,
            connection_id: null,
            error: null,
          },
        })),
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  // ============================================================================
  // POST /api/user-sandbox/sessions/:sessionId/provision - Create connection for an app
  // ============================================================================
  app.post("/api/user-sandbox/sessions/:sessionId/provision", async (c) => {
    try {
      const sessionId = c.req.param("sessionId");
      const body = await c.req.json<{ app_name: string }>();

      if (!body.app_name) {
        return c.json({ error: "app_name is required" }, 400);
      }

      // Validate session
      const session = await validateSessionAccess(sessionId, storage);

      // Get template to find app configuration
      const template = await templates.findById(session.template_id);
      if (!template) {
        return c.json({ error: "Template not found" }, 404);
      }

      const requiredApp = template.required_apps.find(
        (app) => app.app_name === body.app_name,
      );
      if (!requiredApp) {
        return c.json(
          {
            error: `App "${body.app_name}" is not required by this template`,
          },
          400,
        );
      }

      // Check if connection already exists for this app
      const existingStatus = session.app_statuses[body.app_name];
      if (existingStatus?.connection_id) {
        // Return existing connection ID
        return c.json({
          success: true,
          connection_id: existingStatus.connection_id,
          already_provisioned: true,
          requires_oauth: !!requiredApp.oauth_config,
        });
      }

      // Ensure template has a creator (required for FK constraint)
      if (!template.created_by) {
        return c.json(
          {
            error: "Template is missing created_by - cannot create connections",
          },
          500,
        );
      }

      // Create the connection
      const connectionId = await createConnectionFromApp(
        db as Kysely<unknown>,
        session.organization_id,
        template.created_by,
        sessionId,
        session.external_user_id,
        session.template_id,
        requiredApp,
      );

      // Update session with connection ID
      const updatedStatuses = {
        ...session.app_statuses,
        [body.app_name]: {
          configured: false, // Not fully configured until OAuth/config complete
          connection_id: connectionId,
          error: null,
        },
      };

      await sessions.update(sessionId, {
        status: "in_progress",
        app_statuses: updatedStatuses,
      });

      return c.json({
        success: true,
        connection_id: connectionId,
        already_provisioned: false,
        requires_oauth: !!requiredApp.oauth_config,
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  // ============================================================================
  // POST /api/user-sandbox/sessions/:sessionId/configure - Mark app as configured
  // ============================================================================
  app.post("/api/user-sandbox/sessions/:sessionId/configure", async (c) => {
    try {
      const sessionId = c.req.param("sessionId");
      const body = await c.req.json<{
        app_name: string;
        connection_id?: string;
      }>();

      if (!body.app_name) {
        return c.json({ error: "app_name is required" }, 400);
      }

      // Validate session
      const session = await validateSessionAccess(sessionId, storage);

      // Get template to verify app is required
      const template = await templates.findById(session.template_id);
      if (!template) {
        return c.json({ error: "Template not found" }, 404);
      }

      const requiredApp = template.required_apps.find(
        (app) => app.app_name === body.app_name,
      );
      if (!requiredApp) {
        return c.json(
          {
            error: `App "${body.app_name}" is not required by this template`,
          },
          400,
        );
      }

      // Get existing connection ID from session
      const existingStatus = session.app_statuses[body.app_name];
      const connectionId = body.connection_id ?? existingStatus?.connection_id;

      // Update app status
      const newStatus: AppStatus = {
        configured: true,
        connection_id: connectionId ?? null,
        error: null,
      };

      // Update session with new app status
      const updatedStatuses = {
        ...session.app_statuses,
        [body.app_name]: newStatus,
      };

      await sessions.update(sessionId, {
        status: "in_progress",
        app_statuses: updatedStatuses,
      });

      return c.json({
        success: true,
        app_name: body.app_name,
        status: newStatus,
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  // ============================================================================
  // POST /api/user-sandbox/sessions/:sessionId/complete - Finalize setup
  // ============================================================================
  app.post("/api/user-sandbox/sessions/:sessionId/complete", async (c) => {
    try {
      const sessionId = c.req.param("sessionId");

      // Validate session
      const session = await validateSessionAccess(sessionId, storage);

      // Get template
      const template = await templates.findById(session.template_id);
      if (!template) {
        return c.json({ error: "Template not found" }, 404);
      }

      // Check all required apps are configured
      const unconfiguredApps = template.required_apps.filter((app) => {
        const status = session.app_statuses[app.app_name];
        return !status?.configured;
      });

      if (unconfiguredApps.length > 0) {
        return c.json(
          {
            error: "Not all required apps are configured",
            unconfigured: unconfiguredApps.map((a) => a.app_name),
          },
          400,
        );
      }

      // Run completion flow
      const result = await completeSession(session, template, storage, {
        organizationId: session.organization_id,
        db: db as unknown,
        // eventBus would be passed from the main app context if available
      });

      return c.json({
        success: result.success,
        completed: true,
        agentId: result.agentId,
        redirectUrl: result.redirectUrl,
        eventEmitted: result.eventEmitted,
        webhookCalled: result.webhookCalled,
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });
}
