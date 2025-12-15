import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { BrowserOAuthClientProvider } from "use-mcp";

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

export async function isConnectionAuthenticated({
  url,
  token,
}: {
  url: string;
  token: string | null;
}): Promise<boolean> {
  try {
    const response = await fetch("/api/mcp-oauth/check-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, token }),
    });

    if (!response.ok) {
      console.error(
        "[isConnectionAuthenticated] Proxy request failed with status:",
        response.status,
      );
      return false;
    }

    const data = await response.json();

    switch (data.status) {
      case "no_oauth":
        return true;

      case "authenticated":
        return true;

      case "needs_auth":
        return false;

      case "network_error":
        console.warn(
          "[isConnectionAuthenticated] Network error checking OAuth status:",
          data.error,
        );
        return true;

      default:
        console.warn(
          "[isConnectionAuthenticated] Unknown status:",
          data.status,
          "- using authenticated flag",
        );
        return data.authenticated;
    }
  } catch (error) {
    console.error(
      "[isConnectionAuthenticated] Error checking authentication:",
      error,
    );
    return false;
  }
}
