/**
 * MCP Mesh API Server
 *
 * Main Hono application with:
 * - Better Auth integration
 * - Context injection middleware
 * - Error handling
 * - CORS support
 */

import { applyAssetServerRoutes } from "@decocms/runtime/asset-server";
import { PrometheusSerializer } from "@opentelemetry/exporter-prometheus";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "../auth";
import {
  ContextFactory,
  createMeshContextFactory,
} from "../core/context-factory";
import type { MeshContext } from "../core/mesh-context";
import { getDb, type MeshDatabase } from "../database";
import { createEventBus, type EventBus } from "../event-bus";
import { meter, prometheusExporter, tracer } from "../observability";
import authRoutes from "./routes/auth";
import gatewayRoutes from "./routes/gateway";
import managementRoutes from "./routes/management";
import modelsRoutes from "./routes/models";
import proxyRoutes, {
  mcp2App as mcp2ProxyRoutes,
  getConnectionUrl,
} from "./routes/proxy";

// Track current event bus instance for cleanup during HMR
let currentEventBus: EventBus | null = null;

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
  /** Skip asset server routes (for testing) */
  skipAssetServer?: boolean;
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

  // Request logging
  app.use("*", logger());

  // ============================================================================
  // Health Check & Metrics
  // ============================================================================

  // Health check endpoint (no auth required)
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });

  // Prometheus metrics endpoint
  app.get("/metrics", async (c) => {
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

  // ============================================================================
  // MCP2 OAuth Proxy (passthrough to origin)
  // These routes MUST be defined BEFORE the wildcard mesh OAuth routes
  // ============================================================================

  // Helper to get the original authorization server URL from connection
  const getOriginAuthServer = async (
    connectionId: string,
    ctx: MeshContext,
  ): Promise<string | null> => {
    const connectionUrl = await getConnectionUrl(connectionId, ctx);
    if (!connectionUrl) return null;

    try {
      const originUrl = new URL(connectionUrl);
      originUrl.pathname = "/.well-known/oauth-protected-resource";

      const response = await fetch(originUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        authorization_servers?: string[];
      };
      return data.authorization_servers?.[0] ?? null;
    } catch {
      return null;
    }
  };

  // Route: /.well-known/oauth-authorization-server/mcp2-oauth/:connectionId
  // Proxy authorization server metadata to avoid CORS issues
  // MUST be before the wildcard route below
  app.get("/.well-known/oauth-authorization-server/mcp2-oauth/:connectionId", async (c) => {
    const connectionId = c.req.param("connectionId");
    let ctx = c.get("meshContext");

    if (!ctx) {
      const meshCtx = await ContextFactory.create(c.req.raw);
      c.set("meshContext", meshCtx);
      ctx = meshCtx;
    }

    const originAuthServer = await getOriginAuthServer(connectionId, ctx);
    if (!originAuthServer) {
      return c.json({ error: "Connection not found or no auth server" }, 404);
    }

    try {
      // Build the origin's well-known URL for auth server metadata
      const originUrl = new URL(originAuthServer);
      const authServerPath = originUrl.pathname;
      originUrl.pathname = `/.well-known/oauth-authorization-server${authServerPath}`;

      const response = await fetch(originUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Parse and rewrite URLs to point to our proxy
      const data = (await response.json()) as Record<string, unknown>;
      const requestUrl = new URL(c.req.url);
      const proxyBase = `${requestUrl.origin}/mcp2-oauth/${connectionId}`;

      // Rewrite OAuth endpoint URLs to go through our proxy
      const rewrittenData = {
        ...data,
        authorization_endpoint: data.authorization_endpoint
          ? `${proxyBase}/authorize`
          : undefined,
        token_endpoint: data.token_endpoint
          ? `${proxyBase}/token`
          : undefined,
        registration_endpoint: data.registration_endpoint
          ? `${proxyBase}/register`
          : undefined,
      };

      return new Response(JSON.stringify(rewrittenData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const err = error as Error;
      console.error("[mcp2-oauth] Failed to proxy auth server metadata:", err);
      return c.json(
        { error: "Failed to proxy auth server metadata", message: err.message },
        502,
      );
    }
  });

  // Helper to get OAuth endpoint URLs from auth server metadata
  const getOriginOAuthEndpoints = async (
    connectionId: string,
    ctx: MeshContext,
  ): Promise<{
    authorization_endpoint?: string;
    token_endpoint?: string;
    registration_endpoint?: string;
  } | null> => {
    const originAuthServer = await getOriginAuthServer(connectionId, ctx);
    if (!originAuthServer) return null;

    try {
      const originUrl = new URL(originAuthServer);
      const authServerPath = originUrl.pathname;
      originUrl.pathname = `/.well-known/oauth-authorization-server${authServerPath}`;

      const response = await fetch(originUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        authorization_endpoint?: string;
        token_endpoint?: string;
        registration_endpoint?: string;
      };
      return data;
    } catch {
      return null;
    }
  };

  // Route: /mcp2-oauth/:connectionId/* - Proxy OAuth endpoints (authorize, token, register)
  app.all("/mcp2-oauth/:connectionId/:endpoint{.+}", async (c) => {
    const connectionId = c.req.param("connectionId");
    const endpoint = c.req.param("endpoint");
    let ctx = c.get("meshContext");

    if (!ctx) {
      const meshCtx = await ContextFactory.create(c.req.raw);
      c.set("meshContext", meshCtx);
      ctx = meshCtx;
    }

    const endpoints = await getOriginOAuthEndpoints(connectionId, ctx);
    if (!endpoints) {
      return c.json({ error: "Connection not found or no auth server" }, 404);
    }

    try {
      // Map our endpoint name to the actual origin endpoint URL
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

      // Build the full URL with query string
      const originUrl = new URL(originEndpointUrl);
      const reqUrl = new URL(c.req.url);
      originUrl.search = reqUrl.search;

      // Build headers to forward
      const headers: Record<string, string> = {
        Accept: c.req.header("Accept") || "application/json",
      };
      const contentType = c.req.header("Content-Type");
      if (contentType) {
        headers["Content-Type"] = contentType;
      }
      const authorization = c.req.header("Authorization");
      if (authorization) {
        headers["Authorization"] = authorization;
      }

      // Proxy the request
      const response = await fetch(originUrl.toString(), {
        method: c.req.method,
        headers,
        body: c.req.method !== "GET" && c.req.method !== "HEAD" 
          ? c.req.raw.body 
          : undefined,
        // @ts-expect-error - duplex needed for streaming
        duplex: "half",
        redirect: "manual",
      });

      // Copy response headers
      const responseHeaders = new Headers();
      for (const [key, value] of response.headers.entries()) {
        if (!["connection", "keep-alive", "transfer-encoding"].includes(key.toLowerCase())) {
          responseHeaders.set(key, value);
        }
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      const err = error as Error;
      console.error(`[mcp2-oauth] Failed to proxy ${endpoint}:`, err);
      return c.json(
        { error: `Failed to proxy ${endpoint}`, message: err.message },
        502,
      );
    }
  });

  // Mesh OAuth authorization server metadata (wildcard - catches everything else)
  app.get(
    "/.well-known/oauth-authorization-server/*/:gateway?/:connectionId?",
    authorizationServerHandler,
  );

  // ============================================================================
  // MCP2 Protected Resource Metadata Proxy
  // ============================================================================

  // Proxy OAuth protected resource metadata to origin MCP server
  // This allows clients to discover the origin's authorization server
  // MCP clients request: /.well-known/oauth-protected-resource/{resource-path}
  const mcp2OAuthProxyHandler = async (c: {
    req: { param: (key: string) => string; raw: Request; url: string };
    get: (key: "meshContext") => MeshContext | undefined;
    set: (key: "meshContext", value: MeshContext) => void;
    json: (data: unknown, status?: number) => Response;
  }) => {
    const connectionId = c.req.param("connectionId");
    let ctx = c.get("meshContext");

    if (!ctx) {
      // Need to create context for this request
      const meshCtx = await ContextFactory.create(c.req.raw);
      c.set("meshContext", meshCtx);
      ctx = meshCtx;
    }

    const connectionUrl = await getConnectionUrl(connectionId, ctx);

    if (!connectionUrl) {
      return c.json({ error: "Connection not found" }, 404);
    }

    try {
      // Build the origin's well-known URL
      const originUrl = new URL(connectionUrl);
      originUrl.pathname = "/.well-known/oauth-protected-resource";

      // Fetch from origin and proxy response
      const response = await fetch(originUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Parse the response and rewrite URLs to point to our proxy
      // The MCP client expects the resource to match the proxy URL, not the origin
      const data = (await response.json()) as Record<string, unknown>;

      // Build our proxy resource URL
      const requestUrl = new URL(c.req.url);
      const proxyResourceUrl = `${requestUrl.origin}/mcp2/${connectionId}`;

      // Rewrite authorization_servers to point to our proxy
      // We'll proxy the auth server metadata through our server to avoid CORS issues
      const proxyAuthServer = `${requestUrl.origin}/mcp2-oauth/${connectionId}`;

      // Rewrite the resource and authorization_servers fields
      const rewrittenData = {
        ...data,
        resource: proxyResourceUrl,
        authorization_servers: [proxyAuthServer],
      };

      return new Response(JSON.stringify(rewrittenData), {
        status: response.status,
        statusText: response.statusText,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const err = error as Error;
      console.error(
        "[mcp2] Failed to proxy OAuth protected resource metadata:",
        err,
      );
      return c.json(
        { error: "Failed to proxy OAuth metadata", message: err.message },
        502,
      );
    }
  };

  // Route 1: /.well-known/oauth-protected-resource/mcp2/:connectionId
  // This is the URL pattern MCP clients use when discovering OAuth metadata
  app.get(
    "/.well-known/oauth-protected-resource/mcp2/:connectionId",
    // @ts-expect-error - Hono context typing
    mcp2OAuthProxyHandler,
  );

  // Route 2: /mcp2/:connectionId/.well-known/oauth-protected-resource
  // Alternative pattern (resource-relative)
  app.get(
    "/mcp2/:connectionId/.well-known/oauth-protected-resource",
    // @ts-expect-error - Hono context typing
    mcp2OAuthProxyHandler,
  );

  // ============================================================================
  // MeshContext Injection Middleware
  // ============================================================================

  // Create context factory with the provided database and event bus
  // Context factory only needs the Kysely instance, not the full MeshDatabase
  ContextFactory.set(
    createMeshContextFactory({
      db: database.db,
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
    const path = c.req.path;

    // Skip MeshContext for auth endpoints, static pages, health check, and metrics
    if (
      path.startsWith("/api/auth/") ||
      path === "/" ||
      path === "/health" ||
      path === "/metrics" ||
      path.startsWith("/.well-known") ||
      path.match(/\.(html|css|js|ico|svg|png|jpg|woff2?)$/)
    ) {
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

  // MCP2 Passthrough Proxy routes (origin OAuth - no mesh auth)
  // These routes do NOT have mcpAuth middleware applied
  app.route("/mcp2", mcp2ProxyRoutes);

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
    console.error("Server error:", err);

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

  // ============================================================================
  // Static Asset Server
  // ============================================================================

  if (!options.skipAssetServer) {
    applyAssetServerRoutes(app, {
      env: process.env.NODE_ENV as "development" | "production" | "test",
    });
  }

  return app;
}
