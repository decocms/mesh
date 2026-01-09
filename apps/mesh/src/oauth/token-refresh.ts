/**
 * OAuth Token Refresh Utility
 *
 * Handles automatic token refresh for downstream MCP connections.
 * Uses the refresh_token grant to obtain new access tokens.
 */

import type { DownstreamToken } from "../storage/types";

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
