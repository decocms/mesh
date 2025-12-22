/**
 * OAuth Proxy Routes
 *
 * Proxies OAuth discovery and token flows to origin MCP servers.
 * This avoids CORS issues when the frontend needs to authenticate
 * with downstream MCPs that require OAuth.
 *
 * Routes:
 * - /.well-known/oauth-protected-resource/mcp/:connectionId
 * - /mcp/:connectionId/.well-known/oauth-protected-resource
 * - /.well-known/oauth-authorization-server/oauth-proxy/:connectionId
 * - /oauth-proxy/:connectionId/:endpoint (authorize, token, register)
 */

import { Hono } from "hono";
import { ContextFactory } from "../../core/context-factory";
import type { MeshContext } from "../../core/mesh-context";

// Define Hono variables type
type Variables = {
  meshContext: MeshContext;
};

type HonoEnv = { Variables: Variables };

const app = new Hono<HonoEnv>();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get connection URL from storage by connection ID
 * Does not require organization ID - connections are globally unique
 */
async function getConnectionUrl(
  connectionId: string,
  ctx: MeshContext,
): Promise<string | null> {
  const connection = await ctx.storage.connections.findById(connectionId);
  return connection?.connection_url ?? null;
}

/**
 * Fetch protected resource metadata, trying both well-known URL formats
 * Format 1: {resource}/.well-known/oauth-protected-resource (resource-relative)
 * Format 2: /.well-known/oauth-protected-resource{resource-path} (well-known prefix, e.g. Smithery)
 *
 * Returns the response (even if error) so caller can handle/pass-through error status
 */
async function fetchProtectedResourceMetadata(
  connectionUrl: string,
): Promise<Response> {
  const connUrl = new URL(connectionUrl);
  const resourcePath = connUrl.pathname;

  // Try format 1 first (most common)
  const format1Url = new URL(connectionUrl);
  format1Url.pathname = `${resourcePath}/.well-known/oauth-protected-resource`;

  let response = await fetch(format1Url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (response.ok) return response;

  // If format 1 returns 404, try format 2 (Smithery-style: well-known prefix)
  // For other errors (401, 500, etc.), return immediately to preserve error info
  if (response.status !== 404) return response;

  const format2Url = new URL(connectionUrl);
  format2Url.pathname = `/.well-known/oauth-protected-resource${resourcePath}`;

  response = await fetch(format2Url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return response;
}

/**
 * Get the origin authorization server URL from connection's protected resource metadata
 */
async function getOriginAuthServer(
  connectionId: string,
  ctx: MeshContext,
): Promise<string | null> {
  const connectionUrl = await getConnectionUrl(connectionId, ctx);
  if (!connectionUrl) return null;

  try {
    const response = await fetchProtectedResourceMetadata(connectionUrl);
    if (!response.ok) return null;

    const data = (await response.json()) as {
      authorization_servers?: string[];
    };
    return data.authorization_servers?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Ensure MeshContext is available, creating it if necessary
 */
async function ensureContext(c: {
  req: { raw: Request };
  get: (key: "meshContext") => MeshContext | undefined;
  set: (key: "meshContext", value: MeshContext) => void;
}): Promise<MeshContext> {
  let ctx = c.get("meshContext");
  if (!ctx) {
    ctx = await ContextFactory.create(c.req.raw);
    c.set("meshContext", ctx);
  }
  return ctx;
}

// ============================================================================
// Protected Resource Metadata Proxy
// ============================================================================

/**
 * Handler for proxying OAuth protected resource metadata
 * Rewrites resource to /mcp/:connectionId and authorization_servers to /oauth-proxy/:connectionId
 */
const protectedResourceMetadataHandler = async (c: {
  req: { param: (key: string) => string; raw: Request; url: string };
  get: (key: "meshContext") => MeshContext | undefined;
  set: (key: "meshContext", value: MeshContext) => void;
  json: (data: unknown, status?: number) => Response;
}) => {
  const connectionId = c.req.param("connectionId");
  const ctx = await ensureContext(c);

  const connectionUrl = await getConnectionUrl(connectionId, ctx);
  if (!connectionUrl) {
    return c.json({ error: "Connection not found" }, 404);
  }

  try {
    // Fetch from origin, trying both well-known URL formats
    const response = await fetchProtectedResourceMetadata(connectionUrl);

    // Pass through error responses from origin (e.g., 401, 500)
    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse the response and rewrite URLs to point to our proxy
    const data = (await response.json()) as Record<string, unknown>;

    // Build our proxy resource URL (matches the MCP proxy endpoint)
    const requestUrl = new URL(c.req.url);
    const proxyResourceUrl = `${requestUrl.origin}/mcp/${connectionId}`;

    // Rewrite authorization_servers to point to our proxy
    const proxyAuthServer = `${requestUrl.origin}/oauth-proxy/${connectionId}`;

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
      "[oauth-proxy] Failed to proxy OAuth protected resource metadata:",
      err,
    );
    return c.json(
      { error: "Failed to proxy OAuth metadata", message: err.message },
      502,
    );
  }
};

// Route 1: /.well-known/oauth-protected-resource/mcp/:connectionId
app.get("/.well-known/oauth-protected-resource/mcp/:connectionId", (c) =>
  protectedResourceMetadataHandler(c),
);

// Route 2: /mcp/:connectionId/.well-known/oauth-protected-resource
app.get("/mcp/:connectionId/.well-known/oauth-protected-resource", (c) =>
  protectedResourceMetadataHandler(c),
);

// ============================================================================
// Authorization Server Metadata Proxy
// ============================================================================

/**
 * Proxy authorization server metadata to avoid CORS issues
 * Rewrites OAuth endpoint URLs to go through our proxy
 */
app.get(
  "/.well-known/oauth-authorization-server/oauth-proxy/:connectionId",
  async (c) => {
    const connectionId = c.req.param("connectionId");
    const ctx = await ensureContext(c);

    const originAuthServer = await getOriginAuthServer(connectionId, ctx);
    if (!originAuthServer) {
      return c.json({ error: "Connection not found or no auth server" }, 404);
    }

    try {
      // Build the origin's well-known URL for auth server metadata
      const originUrl = new URL(originAuthServer);
      // If auth server is at root ("/"), don't append the path (avoid trailing slash)
      const authServerPath =
        originUrl.pathname === "/" ? "" : originUrl.pathname;
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
      const proxyBase = `${requestUrl.origin}/oauth-proxy/${connectionId}`;

      // Rewrite OAuth endpoint URLs to go through our proxy
      const rewrittenData = {
        ...data,
        authorization_endpoint: data.authorization_endpoint
          ? `${proxyBase}/authorize`
          : undefined,
        token_endpoint: data.token_endpoint ? `${proxyBase}/token` : undefined,
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
      console.error("[oauth-proxy] Failed to proxy auth server metadata:", err);
      return c.json(
        { error: "Failed to proxy auth server metadata", message: err.message },
        502,
      );
    }
  },
);

// Note: The /oauth-proxy/:connectionId/:endpoint route is defined directly in app.ts
// because app.route() doesn't properly register routes with dynamic segments at root level

export default app;
