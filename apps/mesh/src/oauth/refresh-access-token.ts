/**
 * OAuth Token Refresh Primitive
 *
 * Pure fetch-based refresh of an OAuth access token via the refresh_token
 * grant. Kept in its own module so tests can mock the primitive — callers
 * that route through `refreshAndStore` (in `./token-refresh`) pick up the
 * mock through the module resolver, unlike same-module references which
 * `mock.module` cannot intercept.
 */

import type { DownstreamToken } from "../storage/types";

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  error?: string;
}

export async function refreshAccessToken(
  token: DownstreamToken,
): Promise<TokenRefreshResult> {
  if (!token.refreshToken) {
    return { success: false, error: "No refresh token available" };
  }

  if (!token.tokenEndpoint) {
    return { success: false, error: "No token endpoint available" };
  }

  if (!token.clientId) {
    return { success: false, error: "No client ID available" };
  }

  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      client_id: token.clientId,
    });

    if (token.clientSecret) {
      params.set("client_secret", token.clientSecret);
    }

    if (token.scope) {
      params.set("scope", token.scope);
    }

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
