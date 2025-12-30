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
 * Per RFC 9728: strip trailing slash before inserting /.well-known/
 * Returns the response (even if error) so caller can handle/pass-through error status
 */
export async function fetchProtectedResourceMetadata(
  connectionUrl: string,
): Promise<Response> {
  const connUrl = new URL(connectionUrl);
  // Normalize: strip trailing slash per RFC 9728
  let resourcePath = connUrl.pathname;
  if (resourcePath.endsWith("/")) {
    resourcePath = resourcePath.slice(0, -1);
  }

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
  if (response.status !== 404 && response.status !== 401) return response;

  const format2Url = new URL(connectionUrl);
  format2Url.pathname = `/.well-known/oauth-protected-resource${resourcePath}`;

  response = await fetch(format2Url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (response.status !== 404 && response.status !== 401) return response;

  const format3Url = new URL(connectionUrl);
  format3Url.pathname = `/.well-known/oauth-protected-resource`;

  response = await fetch(format3Url.toString(), {
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

export interface HandleAuthErrorOptions {
  /** The error from the MCP client connection attempt */
  error: Error & { status?: number; code?: number };
  /** The request URL (used to build the OAuth proxy URL) */
  reqUrl: URL;
  /** The connection ID */
  connectionId: string;
  /** The origin MCP server URL */
  connectionUrl: string;
  /** Headers to use when checking the origin server */
  headers: Record<string, string>;
}

/**
 * Handles 401 auth errors from MCP origin servers.
 *
 * Checks if the origin server supports OAuth by looking for WWW-Authenticate header.
 * - If origin supports OAuth: returns 401 with WWW-Authenticate pointing to our proxy
 * - If origin doesn't support OAuth: returns plain 401 with JSON error
 * - If not an auth error: returns null (caller should handle)
 */
export async function handleAuthError({
  error,
  reqUrl,
  connectionId,
  connectionUrl,
  headers,
}: HandleAuthErrorOptions): Promise<Response | null> {
  const message = error.message?.toLowerCase() ?? "";
  const isAuthError =
    error.status === 401 ||
    error.code === 401 ||
    error.message?.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("invalid_token") ||
    message.includes("api key required") ||
    message.includes("api-key required");

  if (!isAuthError) {
    return null;
  }

  // Check if origin supports OAuth by looking for WWW-Authenticate header
  const originSupportsOAuth = await fetch(connectionUrl, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "mcp-mesh-proxy", version: "1.0.0" },
      },
    }),
  })
    .then((response) => response.headers.has("WWW-Authenticate"))
    .catch(() => false);

  if (originSupportsOAuth) {
    return new Response(null, {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer realm="mcp",resource_metadata="${reqUrl.origin}/mcp/${connectionId}/.well-known/oauth-protected-resource"`,
      },
    });
  }

  return new Response(
    JSON.stringify({
      error: "unauthorized",
      message: "Authentication required but server does not support OAuth",
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
}

// force https if not localhost
export const fixProtocol = (url: URL) => {
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!isLocal) {
    // force http if not local
    url.protocol = "https:";
  }
  return url;
};

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
    const requestUrl = fixProtocol(new URL(c.req.url));
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
 * Fetch authorization server metadata, trying multiple well-known URL formats per spec.
 *
 * For issuer URLs with path components (e.g., https://auth.example.com/tenant1):
 * 1. OAuth 2.0 Authorization Server Metadata with path insertion:
 *    https://auth.example.com/.well-known/oauth-authorization-server/tenant1
 * 2. OpenID Connect 1.0 Discovery with path insertion:
 *    https://auth.example.com/.well-known/openid-configuration/tenant1
 * 3. OpenID Connect 1.0 Discovery with path append:
 *    https://auth.example.com/tenant1/.well-known/openid-configuration
 *
 * For issuer URLs without path components (e.g., https://auth.example.com):
 * 1. OAuth 2.0 Authorization Server Metadata:
 *    https://auth.example.com/.well-known/oauth-authorization-server
 * 2. OpenID Connect 1.0 Discovery:
 *    https://auth.example.com/.well-known/openid-configuration
 *
 * Returns the response (even if error) so caller can handle/pass-through error status
 */
export async function fetchAuthorizationServerMetadata(
  authServerUrl: string,
): Promise<Response> {
  const url = new URL(authServerUrl);
  // Normalize: strip trailing slash
  let authServerPath = url.pathname;
  if (authServerPath.endsWith("/")) {
    authServerPath = authServerPath.slice(0, -1);
  }

  // Check if URL has a path component
  const hasPath = authServerPath !== "" && authServerPath !== "/";

  // Build list of URLs to try in priority order
  const urlsToTry: URL[] = [];

  if (hasPath) {
    // Format 1: OAuth 2.0 with path insertion
    const format1 = new URL(authServerUrl);
    format1.pathname = `/.well-known/oauth-authorization-server${authServerPath}`;
    urlsToTry.push(format1);

    // Format 2: OpenID Connect with path insertion
    const format2 = new URL(authServerUrl);
    format2.pathname = `/.well-known/openid-configuration${authServerPath}`;
    urlsToTry.push(format2);

    // Format 3: OpenID Connect with path append
    const format3 = new URL(authServerUrl);
    format3.pathname = `${authServerPath}/.well-known/openid-configuration`;
    urlsToTry.push(format3);
  } else {
    // Format 1: OAuth 2.0 at root
    const format1 = new URL(authServerUrl);
    format1.pathname = "/.well-known/oauth-authorization-server";
    urlsToTry.push(format1);

    // Format 2: OpenID Connect at root
    const format2 = new URL(authServerUrl);
    format2.pathname = "/.well-known/openid-configuration";
    urlsToTry.push(format2);
  }

  // Try each URL in order
  let response: Response | null = null;
  for (const tryUrl of urlsToTry) {
    response = await fetch(tryUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    // If successful, return immediately
    if (response.ok) return response;

    // For 404/401, try next format
    // For other errors (500, etc.), return immediately to preserve error info
    if (response.status !== 404 && response.status !== 401) {
      return response;
    }
  }

  // Return the last response (will be an error)
  return response!;
}

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
      // Fetch auth server metadata, trying all well-known URL formats
      const response = await fetchAuthorizationServerMetadata(originAuthServer);

      if (!response.ok) {
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Parse and rewrite URLs to point to our proxy
      const data = (await response.json()) as Record<string, unknown>;
      const requestUrl = fixProtocol(new URL(c.req.url));
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
