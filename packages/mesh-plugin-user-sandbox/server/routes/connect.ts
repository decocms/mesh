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

      // Validate session (allow completed so users can add more apps later)
      const session = await validateSessionAccess(sessionId, storage, {
        allowCompleted: true,
      });

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

      // Validate session (allow completed so users can add more apps later)
      const session = await validateSessionAccess(sessionId, storage, {
        allowCompleted: true,
      });

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
  // POST /api/user-sandbox/sessions/:sessionId/oauth-token - Save OAuth token for a connection
  // ============================================================================
  app.post("/api/user-sandbox/sessions/:sessionId/oauth-token", async (c) => {
    try {
      const sessionId = c.req.param("sessionId");
      const body = await c.req.json<{
        connection_id: string;
        access_token: string;
        refresh_token?: string | null;
        expires_in?: number | null;
        scope?: string | null;
        client_id?: string | null;
        client_secret?: string | null;
        token_endpoint?: string | null;
      }>();

      if (!body.connection_id) {
        return c.json({ error: "connection_id is required" }, 400);
      }
      if (!body.access_token) {
        return c.json({ error: "access_token is required" }, 400);
      }

      // Validate session (allow completed so users can add more apps later)
      const session = await validateSessionAccess(sessionId, storage, {
        allowCompleted: true,
      });

      // Verify the connection belongs to this session
      const connectionBelongsToSession = Object.values(
        session.app_statuses,
      ).some((status) => status.connection_id === body.connection_id);
      if (!connectionBelongsToSession) {
        return c.json(
          { error: "Connection does not belong to this session" },
          403,
        );
      }

      // Calculate expiry time
      const expiresAt = body.expires_in
        ? new Date(Date.now() + body.expires_in * 1000)
        : null;

      const now = new Date().toISOString();

      // Encrypt sensitive fields using the context vault
      const encryptedAccessToken = await ctx.vault.encrypt(body.access_token);
      const encryptedRefreshToken = body.refresh_token
        ? await ctx.vault.encrypt(body.refresh_token)
        : null;
      const encryptedClientSecret = body.client_secret
        ? await ctx.vault.encrypt(body.client_secret)
        : null;

      // Use raw SQL to avoid type issues with downstream_tokens table
      // which is defined in the main app, not in this plugin's types
      const anyDb = db as unknown as Kysely<{
        downstream_tokens: {
          id: string;
          connectionId: string;
          accessToken: string;
          refreshToken: string | null;
          scope: string | null;
          expiresAt: string | null;
          clientId: string | null;
          clientSecret: string | null;
          tokenEndpoint: string | null;
          createdAt: string;
          updatedAt: string;
        };
      }>;

      // Check for existing token
      const existing = await anyDb
        .selectFrom("downstream_tokens")
        .select(["id"])
        .where("connectionId", "=", body.connection_id)
        .executeTakeFirst();

      if (existing) {
        // Update existing token
        await anyDb
          .updateTable("downstream_tokens")
          .set({
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            scope: body.scope ?? null,
            expiresAt: expiresAt?.toISOString() ?? null,
            clientId: body.client_id ?? null,
            clientSecret: encryptedClientSecret,
            tokenEndpoint: body.token_endpoint ?? null,
            updatedAt: now,
          })
          .where("id", "=", existing.id)
          .execute();
      } else {
        // Create new token
        const tokenId = `dtok_${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").substring(0, 8)}`;

        await anyDb
          .insertInto("downstream_tokens")
          .values({
            id: tokenId,
            connectionId: body.connection_id,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            scope: body.scope ?? null,
            expiresAt: expiresAt?.toISOString() ?? null,
            clientId: body.client_id ?? null,
            clientSecret: encryptedClientSecret,
            tokenEndpoint: body.token_endpoint ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      return c.json({ success: true, expiresAt });
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

      // Validate session (allow completed so users can re-complete after adding more apps)
      const session = await validateSessionAccess(sessionId, storage, {
        allowCompleted: true,
      });

      // Get template
      const template = await templates.findById(session.template_id);
      if (!template) {
        return c.json({ error: "Template not found" }, 404);
      }

      // Check at least one app is configured (allow partial configuration)
      const configuredApps = template.required_apps.filter((app) => {
        const status = session.app_statuses[app.app_name];
        return status?.configured;
      });

      if (configuredApps.length === 0) {
        return c.json(
          {
            error: "At least one app must be configured",
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
