/**
 * MCP Mesh API Server
 *
 * Main Hono application with:
 * - Better Auth integration
 * - Context injection middleware
 * - Error handling
 * - CORS support
 */

import { PrometheusSerializer } from "@opentelemetry/exporter-prometheus";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { auth } from "../auth";
import {
  ContextFactory,
  createMeshContextFactory,
} from "../core/context-factory";
import { getDb, type MeshDatabase } from "../database";
import { shouldSkipMeshContext, SYSTEM_PATHS } from "./utils/paths";
import { createEventBus, type EventBus } from "../event-bus";
import { meter, prometheusExporter, tracer } from "../observability";
import authRoutes from "./routes/auth";
import gatewayRoutes from "./routes/gateway";
import managementRoutes from "./routes/management";
import modelsRoutes from "./routes/models";
import oauthProxyRoutes, {
  fetchAuthorizationServerMetadata,
  fetchProtectedResourceMetadata,
} from "./routes/oauth-proxy";
import proxyRoutes from "./routes/proxy";
import { isDecoHostedMcp, DECO_STORE_URL } from "../core/well-known-mcp";
import type { MeshContext } from "../core/mesh-context";

// Track current event bus instance for cleanup during HMR
let currentEventBus: EventBus | null = null;

// ============================================================================
// Deco Store OAuth Helpers
// ============================================================================

/**
 * Get project_locator from the Deco Store registry connection.
 * Returns the locator string or null if not found/configured.
 *
 * @param ctx - The mesh context
 * @param organizationId - The organization ID to search for the registry connection
 */
async function getDecoStoreProjectLocator(
  ctx: MeshContext,
  organizationId: string,
): Promise<string | null> {
  // Find registry connection by URL within the organization
  const connections = await ctx.storage.connections.list(organizationId);
  const registryConn = connections.find((c) =>
    c.connection_url?.startsWith(DECO_STORE_URL),
  );

  if (!registryConn?.configuration_state) {
    return null;
  }

  return (registryConn.configuration_state as Record<string, unknown>)
    .project_locator as string | null;
}

/**
 * Build OAuth query params for deco-hosted MCPs.
 * Uses project_locator from Deco Store registry or falls back to auto_personal.
 */
function buildDecoOAuthParams(projectLocator: string | null): URLSearchParams {
  const params = new URLSearchParams();

  if (projectLocator) {
    const [org, project] = projectLocator.split("/");
    if (org) params.set("workspace_hint", org);
    if (project) params.set("project_hint", project);
  } else {
    params.set("auto_personal", "true");
  }

  return params;
}

// Create serializer for Prometheus text format (shared across instances)
const prometheusSerializer = new PrometheusSerializer();

// Mount OAuth discovery metadata endpoints (shared across instances)
import {
  oAuthDiscoveryMetadata,
  oAuthProtectedResourceMetadata,
} from "better-auth/plugins";
import { MiddlewareHandler } from "hono/types";
import { getToolsByCategory, MANAGEMENT_TOOLS } from "../tools/registry";
import { Env } from "./env";
import { devLogger } from "./utils/dev-logger";
const getHandleOAuthProtectedResourceMetadata = () =>
  oAuthProtectedResourceMetadata(auth);
const getHandleOAuthDiscoveryMetadata = () => oAuthDiscoveryMetadata(auth);

/**
 * Resource server metadata type
 */
interface ResourceServerMetadata {
  resource: string;
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_signing_alg_values_supported: string[];
}

/**
 * App configuration options
 */
export interface CreateAppOptions {
  /** Custom database instance (for testing) */
  database?: MeshDatabase;
  /** Custom event bus instance (for testing) */
  eventBus?: EventBus;
}

/**
 * Create a configured Hono app instance
 * Allows injecting a custom database for testing
 */
export function createApp(options: CreateAppOptions = {}) {
  const database = options.database ?? getDb();

  // Stop any existing event bus worker (cleanup during HMR)
  if (currentEventBus && currentEventBus.isRunning()) {
    console.log("[EventBus] Stopping previous worker (HMR cleanup)");
    // Fire and forget - don't block app creation
    // The stop is mostly synchronous, async part is just UNLISTEN cleanup
    Promise.resolve(currentEventBus.stop()).catch((error) => {
      console.error("[EventBus] Error stopping previous worker:", error);
    });
  }

  // Create event bus with a lazy context getter
  // The notify function needs a context, but the context needs the event bus
  // We resolve this by having notify create its own system context
  let eventBus: EventBus;

  if (options.eventBus) {
    eventBus = options.eventBus;
  } else {
    // Create notify function that uses the context factory
    // This is called by the worker to deliver events to subscribers
    // EventBus uses the full MeshDatabase (includes Pool for PostgreSQL)
    eventBus = createEventBus(database);
  }

  // Track for cleanup during HMR
  currentEventBus = eventBus;

  const app = new Hono<Env>();

  // ============================================================================
  // Middleware
  // ============================================================================

  // CORS middleware
  app.use(
    "/*",
    cors({
      origin: (origin) => {
        // Allow localhost and configured origins
        if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
          return origin;
        }
        // TODO: Configure allowed origins from environment
        return origin;
      },
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "mcp-protocol-version"],
    }),
  );

  if (process.env.NODE_ENV === "production") {
    app.use("*", logger());
  } else {
    app.use("*", devLogger());
  }

  // Log response body for 5xx errors
  app.use("*", async (c, next) => {
    await next();
    if (c.res.status >= 500) {
      const clonedRes = c.res.clone();
      const body = await clonedRes.text();
      console.error(
        `[5xx Response] ${c.req.method} ${c.req.path} - ${c.res.status}:`,
        body,
      );
    }
  });

  // ============================================================================
  // Health Check & Metrics
  // ============================================================================

  // Health check endpoint (no auth required)
  app.get(SYSTEM_PATHS.HEALTH, (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });

  // Prometheus metrics endpoint
  app.get(SYSTEM_PATHS.METRICS, async (c) => {
    try {
      // Force collection of metrics (optional, metrics are usually auto-collected)
      const result = await prometheusExporter.collect();

      // Serialize to Prometheus text format
      const text = prometheusSerializer.serialize(result.resourceMetrics);

      return c.text(text, 200, {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      });
    } catch (error) {
      console.error("Failed to collect metrics:", error);
      return c.text("# Error collecting metrics", 500);
    }
  });

  // ============================================================================
  // Better Auth Routes
  // ============================================================================

  // Auth routes (API key management via web UI)
  app.route("/api/auth/custom", authRoutes);

  // All Better Auth routes (OAuth, session management, etc.)
  app.all("/api/auth/*", async (c) => {
    return await auth.handler(c.req.raw);
  });

  // ============================================================================
  // OAuth Proxy Routes (for proxying OAuth to origin MCP servers)
  // MUST be defined BEFORE the wildcard OAuth routes below
  // ============================================================================
  app.route("/", oauthProxyRoutes);

  // OAuth endpoint proxy - defined directly here because app.route() doesn't work reliably
  // for this route pattern. Using wildcard pattern to capture endpoint.
  app.all("/oauth-proxy/:connectionId/*", async (c) => {
    const connectionId = c.req.param("connectionId");
    // Extract endpoint from path: /oauth-proxy/conn_xxx/register -> register
    // Filter empty parts to handle trailing slashes
    const pathParts = c.req.path.split("/").filter(Boolean);
    const endpoint = pathParts[pathParts.length - 1];

    // Get or create context
    let ctx = c.get("meshContext");
    if (!ctx) {
      ctx = await ContextFactory.create(c.req.raw);
      c.set("meshContext", ctx);
    }

    // Get connection URL
    const connection = await ctx.storage.connections.findById(connectionId);
    if (!connection?.connection_url) {
      return c.json({ error: "Connection not found" }, 404);
    }

    // Get origin auth server - tries Protected Resource Metadata first, then falls back to origin root
    const resourceRes = await fetchProtectedResourceMetadata(
      connection.connection_url,
    );

    let originAuthServer: string | undefined;
    const connUrl = new URL(connection.connection_url);

    if (resourceRes.ok) {
      // Origin has Protected Resource Metadata - use authorization_servers from it
      const resourceData = (await resourceRes.json()) as {
        authorization_servers?: string[];
      };
      originAuthServer = resourceData.authorization_servers?.[0];
    }

    // Fall back to origin root if:
    // - Origin doesn't have Protected Resource Metadata (like Apify)
    // - Or metadata exists but has empty/missing authorization_servers
    // Many servers expose /.well-known/oauth-authorization-server at the root even without RFC 9728
    if (!originAuthServer) {
      originAuthServer = connUrl.origin;
    }

    // Get OAuth endpoints from auth server metadata - uses shared function that tries all formats
    const authServerRes =
      await fetchAuthorizationServerMetadata(originAuthServer);
    if (!authServerRes.ok) {
      return c.json({ error: "Failed to get auth server metadata" }, 502);
    }
    const endpoints = (await authServerRes.json()) as {
      authorization_endpoint?: string;
      token_endpoint?: string;
      registration_endpoint?: string;
    };

    // Map endpoint name to URL
    let originEndpointUrl: string | undefined;
    if (endpoint === "authorize") {
      originEndpointUrl = endpoints.authorization_endpoint;
    } else if (endpoint === "token") {
      originEndpointUrl = endpoints.token_endpoint;
    } else if (endpoint === "register") {
      originEndpointUrl = endpoints.registration_endpoint;
    }

    if (!originEndpointUrl) {
      return c.json({ error: `Unknown OAuth endpoint: ${endpoint}` }, 404);
    }

    // Build URL with query string
    const targetUrl = new URL(originEndpointUrl);
    const reqUrl = new URL(c.req.url);
    targetUrl.search = reqUrl.search;

    // For authorize endpoint, REDIRECT instead of proxying
    // The browser needs to navigate directly to the auth server so that:
    // 1. CSS/JS loads correctly from the origin
    // 2. Cookies are set on the correct domain
    // 3. The user can interact with the consent screen
    if (endpoint === "authorize") {
      // IMPORTANT: Rewrite the 'resource' parameter to point to the origin MCP endpoint
      // Some auth servers (like Supabase) validate that the resource is their actual endpoint,
      // not our proxy. We keep the proxy URL for redirect_uri since that's where we handle the callback.
      if (targetUrl.searchParams.has("resource")) {
        targetUrl.searchParams.set("resource", connection.connection_url);
      }

      // Add smart OAuth params for deco-hosted MCPs to skip org/project selection
      // Wrapped in try-catch to ensure OAuth redirect proceeds even if smart params fail
      if (isDecoHostedMcp(connection.connection_url)) {
        try {
          const projectLocator = await getDecoStoreProjectLocator(
            ctx,
            connection.organization_id,
          );
          const smartParams = buildDecoOAuthParams(projectLocator);
          for (const [key, value] of smartParams) {
            targetUrl.searchParams.set(key, value);
          }
        } catch (error) {
          console.warn(
            "[oauth-proxy] Failed to get smart OAuth params, proceeding without:",
            error,
          );
        }
      }

      return c.redirect(targetUrl.toString(), 302);
    }

    // Forward headers for token/register endpoints
    const headers: Record<string, string> = {
      Accept: c.req.header("Accept") || "application/json",
    };
    const contentType = c.req.header("Content-Type");
    if (contentType) headers["Content-Type"] = contentType;
    const authorization = c.req.header("Authorization");
    if (authorization) headers["Authorization"] = authorization;

    // For token endpoint, we may need to rewrite the 'resource' parameter in the body
    // (same reason as authorize: auth servers validate it's their actual endpoint)
    let requestBody: BodyInit | undefined;
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      if (
        endpoint === "token" &&
        contentType?.includes("application/x-www-form-urlencoded")
      ) {
        // Parse form body and rewrite resource if present
        const formData = await c.req.formData();
        if (formData.has("resource")) {
          formData.set("resource", connection.connection_url);
        }
        // Convert back to URLSearchParams for form-urlencoded
        const params = new URLSearchParams();
        for (const [key, value] of formData.entries()) {
          params.append(key, value.toString());
        }
        requestBody = params.toString();
      } else {
        // For other content types, pass through as-is
        requestBody = c.req.raw.body ?? undefined;
      }
    }

    // Proxy the request (token and register endpoints only)
    const response = await fetch(targetUrl.toString(), {
      method: c.req.method,
      headers,
      body: requestBody,
      // @ts-expect-error - duplex needed for streaming
      duplex: "half",
      redirect: "manual",
    });

    // Copy response headers, excluding hop-by-hop and encoding headers
    // Note: Node.js fetch auto-decompresses, so content-encoding/content-length would be wrong
    const responseHeaders = new Headers();
    const excludedHeaders = [
      "connection",
      "keep-alive",
      "transfer-encoding",
      "content-encoding",
      "content-length",
    ];
    for (const [key, value] of response.headers.entries()) {
      if (!excludedHeaders.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  });

  // Mount OAuth discovery metadata endpoints
  app.get(
    "/mcp/:gateway?/:connectionId/.well-known/oauth-protected-resource/*",
    async (c) => {
      const handleOAuthProtectedResourceMetadata =
        getHandleOAuthProtectedResourceMetadata();
      const res = await handleOAuthProtectedResourceMetadata(c.req.raw);
      const data = (await res.json()) as ResourceServerMetadata;
      return Response.json(data, res);
    },
  );
  const authorizationServerHandler: MiddlewareHandler<Env> = async (c) => {
    const handleOAuthDiscoveryMetadata = getHandleOAuthDiscoveryMetadata();
    const res = await handleOAuthDiscoveryMetadata(c.req.raw);
    const data = await res.json();
    return Response.json(data, res);
  };

  app.get(
    "/.well-known/oauth-authorization-server/*/:gateway?/:connectionId?",
    authorizationServerHandler,
  );

  // ============================================================================
  // MeshContext Injection Middleware
  // ============================================================================

  // Create context factory with the provided database and event bus
  // Context factory only needs the Kysely instance, not the full MeshDatabase
  ContextFactory.set(
    createMeshContextFactory({
      db: database.db,
      databaseType: database.type,
      auth,
      encryption: {
        key: process.env.ENCRYPTION_KEY || "",
      },
      observability: {
        tracer,
        meter,
      },
      eventBus,
    }),
  );

  // Start the event bus worker (async - resets stuck deliveries from previous crashes)
  Promise.resolve(eventBus.start()).then(() => {
    console.log("[EventBus] Worker started");
  });

  // Inject MeshContext into requests
  // Skip auth routes, static files, health check, and metrics - they don't need MeshContext
  app.use("*", async (c, next) => {
    if (shouldSkipMeshContext(c.req.path)) {
      return next();
    }

    const meshCtx = await ContextFactory.create(c.req.raw);
    c.set("meshContext", meshCtx);
    return next();
  });

  // Get all management tools (for OAuth consent UI)
  app.get("/api/tools/management", (c) => {
    return c.json({
      tools: MANAGEMENT_TOOLS,
      grouped: getToolsByCategory(),
    });
  });

  // ============================================================================
  // API Routes
  // ============================================================================

  const mcpAuth: MiddlewareHandler<Env> = async (c, next) => {
    const meshContext = c.var.meshContext;
    // Require either user or API key authentication
    if (!meshContext.auth.user?.id && !meshContext.auth.apiKey?.id) {
      const url = new URL(c.req.url);
      return (c.res = new Response(null, {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer realm="mcp",resource_metadata="${url.origin}${url.pathname}/.well-known/oauth-protected-resource"`,
        },
      }));
    }
    return await next();
  };
  app.use("/mcp/:connectionId?", mcpAuth);
  app.use("/mcp/gateway/:gatewayId?", mcpAuth);

  // MCP Gateway routes (must be before proxy to match /mcp/gateway and /mcp/mesh before /mcp/:connectionId)
  // Virtual gateway: /mcp/gateway/:gatewayId
  // Legacy mesh: /mcp/mesh/:organizationSlug (deprecated)
  app.route("/mcp", gatewayRoutes);
  // Management MCP routes
  app.route("/mcp", managementRoutes);

  // MCP Proxy routes (connection-specific)
  app.route("/mcp", proxyRoutes);

  // LLM API routes (OpenAI-compatible)
  app.route("/api", modelsRoutes);

  // ============================================================================
  // 404 Handler
  // ============================================================================

  app.notFound((c) => {
    return c.json({ error: "Not Found", path: c.req.path }, 404);
  });

  // ============================================================================
  // Error Handler
  // ============================================================================

  app.onError((err, c) => {
    console.error("Server error :", err);

    // If error is Error, provide message
    const message = err instanceof Error ? err.message : "Unknown error";

    return c.json(
      {
        error: "Internal Server Error",
        message,
      },
      500,
    );
  });

  return app;
}
