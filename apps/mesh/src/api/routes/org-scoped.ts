import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { EventTriggerEngine } from "@/automations/event-trigger-engine";
import type { KVStorage } from "@/storage/kv";
import type { TriggerCallbackTokenStorage } from "@/storage/trigger-callback-tokens";
import { resolveOrgFromPath } from "../middleware/resolve-org-from-path";
import type { Env } from "../hono-env";

import { createDecoSitesOrgRoutes } from "./deco-sites";
import { createDevAssetsRoutes } from "./dev-assets";
import { createDownstreamTokenRoutes } from "./downstream-token";
import { createKVRoutes } from "./kv";
import { createSsoRoutes } from "./org-sso";
import { createProxyRoutes } from "./proxy";
import { createSelfRoutes } from "./self";
import { createThreadOutputsRoutes } from "./thread-outputs";
import { createTriggerCallbackRoutes } from "./trigger-callback";
import { createVirtualMcpRoutes } from "./virtual-mcp";
import { createVmEventsRoutes } from "./vm-events";

interface OrgScopedDeps {
  kvStorage: KVStorage;
  tokenStorage: TriggerCallbackTokenStorage;
  eventTriggerEngine: EventTriggerEngine;
  /** Whether dev-only routes should be mounted (no S3 → DevObjectStorage). */
  mountDevAssets: boolean;
  /** mcpAuth middleware (defined in app.ts; must be applied under the new MCP prefixes). */
  mcpAuth: MiddlewareHandler<Env>;
  /**
   * OAuth-proxy handler (defined in app.ts). Mounted under
   * `/api/:org/oauth-proxy/:connectionId/*` and inherits cross-org enforcement
   * from `resolveOrgFromPath` (the handler additionally checks that the
   * connection's `organization_id` matches the resolved org).
   */
  oauthProxyHandler: MiddlewareHandler<Env>;
  /**
   * Public events handler (defined in app.ts). Mounted at
   * `POST /api/:org/events/:type`.
   */
  eventsHandler: MiddlewareHandler<Env>;
  /**
   * SSE watch handler (defined in app.ts). Mounted at
   * `GET /api/:org/watch`.
   */
  watchHandler: MiddlewareHandler<Env>;
}

export const createOrgScopedApi = (deps: OrgScopedDeps) => {
  const app = new Hono<Env>();

  // EVERY route in this sub-app gets org resolved from :org path param
  app.use("*", resolveOrgFromPath);

  // --- Routes that don't need extra middleware ---
  app.route("/", createDownstreamTokenRoutes()); // /api/:org/connections/:connectionId/oauth-token
  app.route("/", createThreadOutputsRoutes()); // /api/:org/threads/:threadId/outputs
  app.route("/", createKVRoutes({ kvStorage: deps.kvStorage }));
  app.route("/vm-events", createVmEventsRoutes()); // /api/:org/vm-events
  app.route("/deco-sites", createDecoSitesOrgRoutes()); // /api/:org/deco-sites
  app.route("/sso", createSsoRoutes()); // /api/:org/sso/* (renamed from /api/org-sso)
  app.route(
    "/",
    createTriggerCallbackRoutes({
      tokenStorage: deps.tokenStorage,
      eventTriggerEngine: deps.eventTriggerEngine,
    }),
  ); // /api/:org/trigger-callback

  if (deps.mountDevAssets) {
    app.route("/dev-assets", createDevAssetsRoutes({ orgFromPath: true }));
  }

  // --- MCP routes need mcpAuth in addition to resolveOrgFromPath ---
  // Order matters (preserve from legacy): virtual-mcp → self → proxy
  app.use("/mcp/:connectionId?", deps.mcpAuth);
  app.use("/mcp/gateway/:virtualMcpId?", deps.mcpAuth);
  app.use("/mcp/virtual-mcp/:virtualMcpId?", deps.mcpAuth);
  app.use("/mcp/self", deps.mcpAuth);

  app.route("/mcp", createVirtualMcpRoutes());
  app.route("/mcp/self", createSelfRoutes());
  app.route("/mcp", createProxyRoutes());

  // --- Inline routes migrated from app.ts (Task 15) ---
  // OAuth proxy under the org-scoped prefix; resolveOrgFromPath has run, so
  // the handler can enforce cross-org access (connection.organization_id
  // must match the resolved org).
  app.all("/oauth-proxy/:connectionId/*", deps.oauthProxyHandler);

  // Public events publish + SSE watch.
  app.post("/events/:type", deps.eventsHandler);
  app.get("/watch", deps.watchHandler);

  return app;
};
