/**
 * MCP OAuth Proxy Routes
 *
 * Provides proxy endpoints for MCP OAuth operations to avoid CORS issues.
 * These endpoints allow the frontend to check OAuth requirements and validate
 * tokens for MCP servers without being blocked by CORS policies.
 */

import { Hono } from "hono";

const app = new Hono();

/**
 * MCP OAuth Authentication Check Proxy
 *
 * Proxies OAuth authentication checks to MCP servers to avoid CORS issues.
 * Checks if a connection requires OAuth and validates tokens.
 *
 * Route: POST /api/mcp-oauth/check-auth
 */
app.post("/check-auth", async (c) => {
  const { url, token } = await c.req.json<{
    url: string;
    token: string | null;
  }>();

  try {
    // Build URL preserving the MCP path
    const baseUrl = url.replace(/\/$/, "");
    const metadataUrl = new URL(
      `${baseUrl}/.well-known/oauth-protected-resource`,
    );

    const headers: HeadersInit = {
      Accept: "application/json, text/event-stream",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(metadataUrl.toString(), {
      method: "GET",
      headers,
    });

    // If the server doesn't have the endpoint, OAuth is not supported
    const serverDoesNotSupportOAuth = response.status === 404;
    const contentType = response.headers.get("content-type");
    const responseIsNotJson = !contentType?.includes("application/json");

    if (serverDoesNotSupportOAuth || responseIsNotJson) {
      return c.json({
        status: "no_oauth",
        authenticated: true,
        oauthRequired: false,
      });
    }

    // If we got here, server HAS OAuth (returned 200/401/403 + JSON)
    // If no token provided, needs authentication
    if (!token) {
      return c.json({
        status: "needs_auth",
        authenticated: false,
        oauthRequired: true,
      });
    }

    // If token provided, verify if it's valid
    const tokenIsInvalid = response.status === 401 || response.status === 403;
    if (tokenIsInvalid) {
      return c.json({
        status: "needs_auth",
        authenticated: false,
        oauthRequired: true,
      });
    }

    // Valid token
    return c.json({
      status: "authenticated",
      authenticated: response.ok,
      oauthRequired: false,
    });
  } catch (error) {
    console.error(
      "[mcp-oauth/check-auth] Error checking authentication:",
      error,
    );
    return c.json(
      {
        status: "network_error",
        authenticated: false,
        oauthRequired: null,
        error: error instanceof Error ? error.message : String(error),
      },
      200,
    );
  }
});

export default app;
