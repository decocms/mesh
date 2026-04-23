/**
 * OAuth Token Refresh Utility
 *
 * Handles automatic token refresh for downstream MCP connections.
 * Uses the refresh_token grant to obtain new access tokens.
 */

import type { DownstreamToken } from "../storage/types";
import type { DownstreamTokenStorage } from "../storage/downstream-token";

/**
 * Result of a token refresh attempt
 */
export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  error?: string;
}

/**
 * Refresh an OAuth access token using the refresh_token grant
 *
 * @param token - The downstream token containing refresh info
 * @returns TokenRefreshResult with new tokens or error
 */
export async function refreshAccessToken(
  token: DownstreamToken,
): Promise<TokenRefreshResult> {
  // Check if we have the required info for refresh
  if (!token.refreshToken) {
    return {
      success: false,
      error: "No refresh token available",
    };
  }

  if (!token.tokenEndpoint) {
    return {
      success: false,
      error: "No token endpoint available",
    };
  }

  if (!token.clientId) {
    return {
      success: false,
      error: "No client ID available",
    };
  }

  try {
    // Build the token request
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      client_id: token.clientId,
    });

    // Add client_secret if we have it (some servers require it)
    if (token.clientSecret) {
      params.set("client_secret", token.clientSecret);
    }

    // Add scope if we have it
    if (token.scope) {
      params.set("scope", token.scope);
    }

    // Make the token request
    const response = await fetch(token.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[TokenRefresh] Failed to refresh token: ${response.status}`,
        errorBody,
      );

      // Try to parse error response
      try {
        const errorJson = JSON.parse(errorBody);
        return {
          success: false,
          error:
            errorJson.error_description ||
            errorJson.error ||
            `Token refresh failed: ${response.status}`,
        };
      } catch {
        return {
          success: false,
          error: `Token refresh failed: ${response.status}`,
        };
      }
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
    };

    return {
      success: true,
      accessToken: data.access_token,
      // Some servers return a new refresh token, some don't
      refreshToken: data.refresh_token || token.refreshToken,
      expiresIn: data.expires_in,
      scope: data.scope,
    };
  } catch (error) {
    console.error("[TokenRefresh] Error refreshing token:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Token refresh failed",
    };
  }
}

export const PROACTIVE_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export const RECONNECT_ERROR =
  "GitHub token refresh failed — reconnect the mcp-github integration.";

export function canRefresh(token: DownstreamToken): boolean {
  return !!token.refreshToken && !!token.tokenEndpoint && !!token.clientId;
}

export async function refreshAndStore(
  token: DownstreamToken,
  tokenStorage: DownstreamTokenStorage,
): Promise<string | null> {
  const result = await refreshAccessToken(token);
  if (!result.success || !result.accessToken) {
    await tokenStorage.delete(token.connectionId);
    return null;
  }
  await tokenStorage.upsert({
    connectionId: token.connectionId,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? token.refreshToken,
    scope: result.scope ?? token.scope,
    expiresAt: result.expiresIn
      ? new Date(Date.now() + result.expiresIn * 1000)
      : null,
    clientId: token.clientId,
    clientSecret: token.clientSecret,
    tokenEndpoint: token.tokenEndpoint,
  });
  return result.accessToken;
}
