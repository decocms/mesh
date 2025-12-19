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
import managementRoutes from "./routes/management";
import modelsRoutes from "./routes/models";
import proxyRoutes from "./routes/proxy";
import {
  getCursorRedirectTemplate,
  isCustomUriScheme,
} from "./cursor-redirect-template";

// Define Hono variables type
type Variables = {
  meshContext: MeshContext;
};

// Track current event bus instance for cleanup during HMR
let currentEventBus: EventBus | null = null;

// Create serializer for Prometheus text format (shared across instances)
const prometheusSerializer = new PrometheusSerializer();

// Mount OAuth discovery metadata endpoints (shared across instances)
import { WellKnownMCPId } from "@/core/well-known-mcp";
import {
  oAuthDiscoveryMetadata,
  oAuthProtectedResourceMetadata,
} from "better-auth/plugins";
import { getToolsByCategory, MANAGEMENT_TOOLS } from "../tools/registry";
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

  const app = new Hono<{ Variables: Variables }>();

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

  // OAuth state store (in-memory for now, could be Redis/DB for production)
  const oauthStateStore = new Map<
    string,
    { createdAt: number; clientId: string }
  >();

  // Cleanup expired states every 10 minutes
  setInterval(
    () => {
      const now = Date.now();
      const expiredStates: string[] = [];
      for (const [state, data] of oauthStateStore.entries()) {
        // States expire after 10 minutes
        if (now - data.createdAt > 10 * 60 * 1000) {
          expiredStates.push(state);
        }
      }
      for (const state of expiredStates) {
        oauthStateStore.delete(state);
      }
    },
    10 * 60 * 1000,
  );

  // Fix for Better Auth MCP plugin: Generate state if client doesn't provide one
  // This is important for CSRF protection in OAuth 2.0
  app.get("/api/auth/mcp/authorize", async (c) => {
    const url = new URL(c.req.url);
    const params = url.searchParams;
    const clientId = params.get("client_id");
    const originalState = params.get("state");

    // If client didn't send state (like Cursor), generate one
    if (!originalState && clientId) {
      const generatedState = crypto.randomUUID();
      console.log(
        "[OAuth] Client didn't provide state, generating:",
        generatedState,
      );

      // Store the generated state for validation later
      oauthStateStore.set(generatedState, {
        createdAt: Date.now(),
        clientId,
      });

      // Add state to the request URL
      url.searchParams.set("state", generatedState);

      // Create a new request with the modified URL
      const modifiedRequest = new Request(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
      });

      const response = await auth.handler(modifiedRequest);

      // Intercept redirects to custom URI schemes (cursor://, vscode://, etc.)
      if (response.status === 302) {
        const location = response.headers.get("location");
        if (location && isCustomUriScheme(location)) {
          console.log("[OAuth] Intercepting custom URI redirect:", location);
          return c.html(getCursorRedirectTemplate(location));
        }
      }

      return response;
    }

    // Client sent state, pass through normally
    const response = await auth.handler(c.req.raw);

    // Also intercept custom URI redirects for clients that sent state
    if (response.status === 302) {
      const location = response.headers.get("location");
      if (location && isCustomUriScheme(location)) {
        console.log("[OAuth] Intercepting custom URI redirect:", location);
        return c.html(getCursorRedirectTemplate(location));
      }
    }

    return response;
  });

  // Validate state in token endpoint
  app.post("/api/auth/mcp/token", async (c) => {
    // Let Better Auth handle the token exchange
    // We're just adding logging here for debugging
    const body = await c.req.text();
    console.log("[OAuth] Token exchange request");

    const response = await auth.handler(
      new Request(c.req.url, {
        method: "POST",
        headers: c.req.raw.headers,
        body,
      }),
    );

    return response;
  });

  // All Better Auth routes (OAuth, session management, etc.)
  app.all("/api/auth/*", async (c) => {
    return await auth.handler(c.req.raw);
  });

  // Mount OAuth discovery metadata endpoints
  app.get(
    "/mcp/:connectionId/.well-known/oauth-protected-resource/*",
    async (c) => {
      const handleOAuthProtectedResourceMetadata =
        getHandleOAuthProtectedResourceMetadata();
      const res = await handleOAuthProtectedResourceMetadata(c.req.raw);
      const data = (await res.json()) as ResourceServerMetadata;
      return Response.json(
        {
          ...data,
          scopes_supported: [
            ...data.scopes_supported,
            `${c.req.param("connectionId")}:*`,
          ],
        },
        res,
      );
    },
  );
  app.get(
    "/.well-known/oauth-authorization-server/*/:connectionId?",
    async (c) => {
      const connectionId = c.req.param("connectionId") ?? WellKnownMCPId.SELF;
      const handleOAuthDiscoveryMetadata = getHandleOAuthDiscoveryMetadata();
      const res = await handleOAuthDiscoveryMetadata(c.req.raw);
      const data = await res.json();
      return Response.json(
        { ...data, scopes_supported: [`${connectionId}:*`] },
        res,
      );
    },
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
      path.startsWith("/oauth/callback") ||
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

  app.use("/mcp/:connectionId?", async (c, next) => {
    const meshContext = c.var.meshContext;
    const connectionId = c.req.param("connectionId") ?? WellKnownMCPId.SELF;
    // Require either user or API key authentication
    if (!meshContext.auth.user?.id && !meshContext.auth.apiKey?.id) {
      const origin = new URL(c.req.url).origin;
      return (c.res = new Response(null, {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer realm="mcp",resource_metadata="${origin}/mcp/${connectionId}/.well-known/oauth-protected-resource"`,
        },
      }));
    }
    return await next();
  });

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
