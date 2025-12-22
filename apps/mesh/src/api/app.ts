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
import { cors } from "hono/cors";
import { logger } from "hono/logger";
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
import proxyRoutes from "./routes/proxy";

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
  // Static Asset Server (development only - production handled in index.ts)
  // ============================================================================

  if (!options.skipAssetServer && process.env.NODE_ENV === "development") {
    // In development, proxy to Vite dev server
    const { devServerProxy } = require("@decocms/runtime/asset-server/dev-server-proxy");
    app.use("*", devServerProxy("http://localhost:4000"));
  }

  // ============================================================================
  // 404 Handler (must be after all routes including static assets)
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

  return app;
}
