import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { BrowserOAuthClientProvider } from "use-mcp";

export async function authenticateMcp(
  connectionId: string,
  options?: {
    clientName?: string;
    clientUri?: string;
    callbackUrl?: string;
    timeout?: number;
  },
): Promise<{ token: string | null; error: string | null }> {
  try {
    const serverUrl = `${window.location.origin}/mcp2/${connectionId}`;
    const authProvider = new BrowserOAuthClientProvider(serverUrl, {
      clientName: options?.clientName || "@decocms/mesh MCP inspector",
      clientUri: options?.clientUri || window.location.origin,
      callbackUrl:
        options?.callbackUrl || `${window.location.origin}/oauth/callback`,
    });

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

    await auth(authProvider, { serverUrl });

    await oauthCompletePromise;

    const tokens = await authProvider.tokens();

    return {
      token: tokens?.access_token || null,
      error: null,
    };
  } catch (error) {
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
