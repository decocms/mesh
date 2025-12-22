import {
  auth,
  exchangeAuthorization,
  discoverOAuthProtectedResourceMetadata,
  discoverAuthorizationServerMetadata,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientProvider,
  AuthResult,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * Simple hash function for server URLs
 */
function hashServerUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Global in-memory store for active OAuth sessions.
 */
const activeOAuthSessions = new Map<string, McpOAuthProvider>();

/**
 * Options for the MCP OAuth provider
 */
export interface McpOAuthProviderOptions {
  /** MCP server URL */
  serverUrl: string;
  /** OAuth client name */
  clientName?: string;
  /** OAuth client URI */
  clientUri?: string;
  /** OAuth callback URL */
  callbackUrl?: string;
}

/**
 * MCP OAuth client provider using in-memory storage only.
 * No localStorage or sessionStorage - everything is ephemeral.
 */
class McpOAuthProvider implements OAuthClientProvider {
  private serverUrl: string;
  private _clientMetadata: OAuthClientMetadata;
  private _redirectUrl: string;

  // In-memory storage for OAuth flow data
  private _state: string | null = null;
  private _codeVerifier: string | null = null;
  private _clientInfo: OAuthClientInformation | null = null;
  private _tokens: OAuthTokens | null = null;

  constructor(options: McpOAuthProviderOptions) {
    this.serverUrl = options.serverUrl;
    this._redirectUrl =
      options.callbackUrl ?? `${window.location.origin}/oauth/callback`;

    this._clientMetadata = {
      redirect_uris: [this._redirectUrl],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: options.clientName ?? "@decocms/mesh MCP client",
      scope: "mcp",
    };

    // Register this session for callback handling
    activeOAuthSessions.set(hashServerUrl(this.serverUrl), this);
  }

  get redirectUrl(): string {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this._clientMetadata;
  }

  state(): string {
    this._state = crypto.randomUUID();
    return this._state;
  }

  getStoredState(): string | null {
    return this._state;
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInfo ?? undefined;
  }

  saveClientInformation(clientInfo: OAuthClientInformationFull): void {
    this._clientInfo = clientInfo;
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens ?? undefined;
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    window.open(
      authorizationUrl.toString(),
      "mcp-oauth",
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    );
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error("Code verifier not found");
    }
    return this._codeVerifier;
  }

  invalidateCredentials(): void {
    this._clientInfo = null;
    this._tokens = null;
    this._codeVerifier = null;
    this._state = null;
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  cleanup(): void {
    activeOAuthSessions.delete(hashServerUrl(this.serverUrl));
  }
}

/**
 * Result from authenticateMcp
 */
export interface AuthenticateMcpResult {
  token: string | null;
  error: string | null;
}

/**
 * Authenticate with an MCP server using OAuth
 * @param serverUrl - Full MCP server URL to authenticate with
 */
export async function authenticateMcp(
  serverUrl: string,
  options?: {
    clientName?: string;
    clientUri?: string;
    callbackUrl?: string;
    timeout?: number;
  },
): Promise<AuthenticateMcpResult> {
  const provider = new McpOAuthProvider({
    serverUrl,
    clientName: options?.clientName,
    clientUri: options?.clientUri,
    callbackUrl: options?.callbackUrl,
  });

  try {
    // Wait for OAuth callback message from popup and handle token exchange
    const oauthCompletePromise = new Promise<OAuthTokens>((resolve, reject) => {
      const timeout = options?.timeout || 120000;
      let timeoutId: ReturnType<typeof setTimeout>;

      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === "mcp:oauth:callback") {
          window.removeEventListener("message", handleMessage);
          clearTimeout(timeoutId);

          if (!event.data.success) {
            reject(
              new Error(event.data.error || "OAuth authentication failed"),
            );
            return;
          }

          const { code, state } = event.data;

          // Verify state matches
          const storedState = provider.getStoredState();
          if (storedState !== state) {
            reject(new Error("OAuth state mismatch - possible CSRF attack"));
            return;
          }

          try {
            // Do token exchange in parent window (we have provider in memory)
            const resourceMetadata =
              await discoverOAuthProtectedResourceMetadata(serverUrl);
            const authServerUrl =
              resourceMetadata?.authorization_servers?.[0] || serverUrl;
            const authServerMetadata =
              await discoverAuthorizationServerMetadata(authServerUrl);

            const clientInfo = provider.clientInformation();
            if (!clientInfo) {
              reject(new Error("Client information not found"));
              return;
            }

            const codeVerifier = provider.codeVerifier();

            const tokens = await exchangeAuthorization(authServerUrl, {
              metadata: authServerMetadata,
              clientInformation: clientInfo,
              authorizationCode: code,
              codeVerifier,
              redirectUri: provider.redirectUrl,
              resource: new URL(serverUrl),
            });

            resolve(tokens);
          } catch (err) {
            reject(err);
          }
        }
      };

      window.addEventListener("message", handleMessage);

      timeoutId = setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        reject(new Error("OAuth authentication timeout"));
      }, timeout);
    });

    // Start the auth flow
    const result: AuthResult = await auth(provider, { serverUrl });

    if (result === "REDIRECT") {
      const tokens = await oauthCompletePromise;
      return {
        token: tokens.access_token,
        error: null,
      };
    }

    // If we got here without redirect, check for tokens
    const tokens = provider.tokens();
    return {
      token: tokens?.access_token || null,
      error: null,
    };
  } catch (error) {
    return {
      token: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    provider.cleanup();
  }
}

/**
 * Handle the OAuth callback (to be called from the callback page)
 *
 * Forwards the authorization code to the parent window via postMessage.
 * The parent window handles the token exchange.
 */
export async function handleOAuthCallback(): Promise<{
  success: boolean;
  error?: string;
}> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  let state = params.get("state");
  const errorParam = params.get("error");
  const errorDescription = params.get("error_description");

  if (errorParam) {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: "mcp:oauth:callback",
          success: false,
          error: errorDescription || errorParam,
        },
        window.location.origin,
      );
    }
    return {
      success: false,
      error: errorDescription || errorParam,
    };
  }

  if (!code || !state) {
    const error = "Missing code or state parameter";
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: "mcp:oauth:callback",
          success: false,
          error,
        },
        window.location.origin,
      );
    }
    return {
      success: false,
      error,
    };
  }

  // Try to decode wrapped state from deco.cx
  try {
    const decodedState = atob(state);
    const stateObj = JSON.parse(decodedState);
    if (stateObj.clientState) {
      state = stateObj.clientState;
    }
  } catch {
    // Use state as-is
  }

  // Forward code and state to parent window for token exchange
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(
      {
        type: "mcp:oauth:callback",
        success: true,
        code,
        state,
      },
      window.location.origin,
    );
    return { success: true };
  }

  return {
    success: false,
    error: "Parent window not available",
  };
}

/**
 * Check if an MCP connection is authenticated
 */
export async function isConnectionAuthenticated({
  url,
  token,
}: {
  url: string;
  token: string | null;
}): Promise<boolean> {
  try {
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json, text/event-stream");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: {
            name: "@decocms/mesh MCP client",
            version: "1.0.0",
          },
        },
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("[isConnectionAuthenticated] Error:", error);
    return false;
  }
}
