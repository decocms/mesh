import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { BrowserOAuthClientProvider } from "use-mcp";
import { createOAuthMessageListener } from "./oauth-messaging";

export async function authenticateMcp(
  serverUrl: string,
  options?: {
    clientName?: string;
    clientUri?: string;
    callbackUrl?: string;
    timeout?: number;
  },
): Promise<{ token: string | null; error: string | null }> {
  try {
    // Don't override callbackUrl if not provided - let use-mcp use its default
    const providerOptions: {
      clientName?: string;
      clientUri?: string;
      callbackUrl?: string;
    } = {
      clientName: options?.clientName || "@decocms/mesh MCP inspector",
      clientUri: options?.clientUri || window.location.origin,
    };

    // Only set callbackUrl if explicitly provided
    if (options?.callbackUrl) {
      providerOptions.callbackUrl = options.callbackUrl;
    } else {
      // Use default from use-mcp (which is /oauth/callback)
      providerOptions.callbackUrl = `${window.location.origin}/oauth/callback`;
    }

    const authProvider = new BrowserOAuthClientProvider(
      serverUrl,
      providerOptions,
    );

    const isAlreadyAuthenticated = await isConnectionAuthenticated({
      url: serverUrl,
      token: null,
    });
    if (isAlreadyAuthenticated) {
      return {
        token: null,
        error: null,
      };
    }

    const oauthCompletePromise = new Promise<void>((resolve, reject) => {
      const timeout = options?.timeout || 120000;

      // Use the centralized OAuth message listener
      const cleanup = createOAuthMessageListener(
        (message) => {
          if (message.success) {
            cleanup();
            resolve();
          } else {
            cleanup();
            reject(new Error(message.error || "OAuth authentication failed"));
          }
        },
        {
          strictOriginCheck: false, // Accept messages from any origin for Cursor compatibility
          timeout,
        },
      );
    });

    // This will open a popup with the authorization URL
    console.log("[OAuth] Starting auth flow for:", serverUrl);
    await auth(authProvider, { serverUrl });

    // Wait for the popup to complete the OAuth flow and send a message back
    await oauthCompletePromise;

    const tokens = await authProvider.tokens();

    return {
      token: tokens?.access_token || null,
      error: null,
    };
  } catch (error) {
    console.error("[OAuth] Authentication error:", error);
    return {
      token: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

interface MCPRequestParams {
  url: string;
  token: string | null;
}

const performMCPInitializeRequest = async ({
  url,
  token,
}: MCPRequestParams) => {
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
          name: "@decocms/mesh MCP inspector",
          version: "1.0.0",
        },
      },
    }),
  });
  return response;
};

export async function isConnectionAuthenticated({
  url,
  token,
}: MCPRequestParams): Promise<boolean> {
  try {
    const response = await performMCPInitializeRequest({ url, token });
    return response.ok;
  } catch (error) {
    console.error(
      "[isConnectionAuthenticated] Error checking authentication:",
      error,
    );
    return false;
  }
}
