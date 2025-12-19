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
 * Storage interface for OAuth data.
 * Allows plugging in different storage backends.
 */
export interface OAuthStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * In-memory storage (default, non-persistent)
 */
export class MemoryStorage implements OAuthStorage {
  private data = new Map<string, string>();

  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.data.set(key, value);
  }

  remove(key: string): void {
    this.data.delete(key);
  }
}

/**
 * SessionStorage wrapper (persists for browser session only)
 */
export class SessionStorageWrapper implements OAuthStorage {
  get(key: string): string | null {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem(key);
  }

  set(key: string, value: string): void {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(key, value);
    }
  }

  remove(key: string): void {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(key);
    }
  }
}

/**
 * Global in-memory store for active OAuth sessions.
 * This allows the callback page to access the provider.
 */
const activeOAuthSessions = new Map<string, McpOAuthProvider>();

/**
 * Get an active OAuth session by server URL hash
 */
export function getActiveOAuthSession(
  serverUrl: string,
): McpOAuthProvider | undefined {
  const key = hashServerUrl(serverUrl);
  return activeOAuthSessions.get(key);
}

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
  /** Custom storage backend (defaults to MemoryStorage) */
  storage?: OAuthStorage;
}

/**
 * Custom OAuth client provider for MCP that doesn't use localStorage.
 * Uses in-memory storage by default, or any custom storage backend.
 */
export class McpOAuthProvider implements OAuthClientProvider {
  private serverUrl: string;
  private storage: OAuthStorage;
  private _clientMetadata: OAuthClientMetadata;
  private _redirectUrl: string;
  private storageKeyPrefix: string;

  constructor(options: McpOAuthProviderOptions) {
    this.serverUrl = options.serverUrl;
    this.storage = options.storage ?? new MemoryStorage();
    this._redirectUrl =
      options.callbackUrl ?? `${window.location.origin}/oauth/callback`;

    this.storageKeyPrefix = `mcp_oauth_${hashServerUrl(this.serverUrl)}`;

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
    // Generate a random state for CSRF protection
    const state = crypto.randomUUID();
    this.storage.set(`${this.storageKeyPrefix}_state`, state);
    return state;
  }

  clientInformation(): OAuthClientInformation | undefined {
    const stored = this.storage.get(`${this.storageKeyPrefix}_client_info`);
    if (stored) {
      try {
        return JSON.parse(stored) as OAuthClientInformation;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  saveClientInformation(clientInfo: OAuthClientInformationFull): void {
    this.storage.set(
      `${this.storageKeyPrefix}_client_info`,
      JSON.stringify(clientInfo),
    );
  }

  tokens(): OAuthTokens | undefined {
    const stored = this.storage.get(`${this.storageKeyPrefix}_tokens`);
    if (stored) {
      try {
        return JSON.parse(stored) as OAuthTokens;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.storage.set(
      `${this.storageKeyPrefix}_tokens`,
      JSON.stringify(tokens),
    );
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    // Open in a popup window
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
    this.storage.set(`${this.storageKeyPrefix}_code_verifier`, codeVerifier);
  }

  codeVerifier(): string {
    const verifier = this.storage.get(`${this.storageKeyPrefix}_code_verifier`);
    if (!verifier) {
      throw new Error("Code verifier not found");
    }
    return verifier;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier"): void {
    if (scope === "all" || scope === "client") {
      this.storage.remove(`${this.storageKeyPrefix}_client_info`);
    }
    if (scope === "all" || scope === "tokens") {
      this.storage.remove(`${this.storageKeyPrefix}_tokens`);
    }
    if (scope === "all" || scope === "verifier") {
      this.storage.remove(`${this.storageKeyPrefix}_code_verifier`);
      this.storage.remove(`${this.storageKeyPrefix}_state`);
    }
  }

  /**
   * Get the stored state for validation
   */
  getStoredState(): string | null {
    return this.storage.get(`${this.storageKeyPrefix}_state`);
  }

  /**
   * Get the server URL for this provider
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Cleanup this session from the active sessions map
   */
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
  /** The provider instance (can be used for token refresh) */
  provider: McpOAuthProvider | null;
}

/**
 * Authenticate with an MCP server using OAuth
 */
export async function authenticateMcp(
  connectionId: string,
  options?: {
    clientName?: string;
    clientUri?: string;
    callbackUrl?: string;
    timeout?: number;
    storage?: OAuthStorage;
  },
): Promise<AuthenticateMcpResult> {
  const serverUrl = `${window.location.origin}/mcp2/${connectionId}`;

  const provider = new McpOAuthProvider({
    serverUrl,
    clientName: options?.clientName,
    clientUri: options?.clientUri,
    callbackUrl: options?.callbackUrl,
    storage: options?.storage,
  });

  try {
    // Check if already authenticated
    const existingTokens = provider.tokens();
    if (existingTokens?.access_token) {
      // Verify token still works
      const isValid = await isConnectionAuthenticated({
        url: serverUrl,
        token: existingTokens.access_token,
      });
      if (isValid) {
        return {
          token: existingTokens.access_token,
          error: null,
          provider,
        };
      }
    }

    // Wait for OAuth completion message from popup
    const oauthCompletePromise = new Promise<void>((resolve, reject) => {
      const timeout = options?.timeout || 120000;

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (
          event.data?.type === "mcp:oauth:complete" ||
          event.data?.type === "mcp_auth_callback"
        ) {
          window.removeEventListener("message", handleMessage);
          if (event.data.success) {
            resolve();
          } else {
            reject(
              new Error(event.data.error || "OAuth authentication failed"),
            );
          }
        }
      };

      window.addEventListener("message", handleMessage);

      setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        reject(new Error("OAuth authentication timeout"));
      }, timeout);
    });

    // Start the auth flow
    const result: AuthResult = await auth(provider, { serverUrl });

    if (result === "REDIRECT") {
      // Wait for callback
      await oauthCompletePromise;
    }

    const tokens = provider.tokens();
    return {
      token: tokens?.access_token || null,
      error: null,
      provider,
    };
  } catch (error) {
    provider.cleanup();
    return {
      token: null,
      error: error instanceof Error ? error.message : String(error),
      provider: null,
    };
  }
}

/**
 * Handle the OAuth callback (to be called from the callback page)
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
    return {
      success: false,
      error: errorDescription || errorParam,
    };
  }

  if (!code || !state) {
    return {
      success: false,
      error: "Missing code or state parameter",
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

  // Find the active session that matches this state
  let matchedProvider: McpOAuthProvider | undefined;
  for (const provider of activeOAuthSessions.values()) {
    const storedState = provider.getStoredState();
    if (storedState === state) {
      matchedProvider = provider;
      break;
    }
  }

  if (!matchedProvider) {
    return {
      success: false,
      error: "No matching OAuth session found. Please try again.",
    };
  }

  try {
    const serverUrl = matchedProvider.getServerUrl();

    // Discover metadata for token exchange
    const resourceMetadata =
      await discoverOAuthProtectedResourceMetadata(serverUrl);
    const authServerUrl =
      resourceMetadata?.authorization_servers?.[0] || serverUrl;
    const authServerMetadata =
      await discoverAuthorizationServerMetadata(authServerUrl);

    // Get client information
    const clientInfo = matchedProvider.clientInformation();
    if (!clientInfo) {
      return {
        success: false,
        error: "Client information not found",
      };
    }

    // Get code verifier
    const codeVerifier = matchedProvider.codeVerifier();

    // Exchange code for tokens
    const tokens = await exchangeAuthorization(authServerUrl, {
      metadata: authServerMetadata,
      clientInformation: clientInfo,
      authorizationCode: code,
      codeVerifier,
      redirectUri: matchedProvider.redirectUrl,
      resource: new URL(serverUrl),
    });

    // Save tokens
    matchedProvider.saveTokens(tokens);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

