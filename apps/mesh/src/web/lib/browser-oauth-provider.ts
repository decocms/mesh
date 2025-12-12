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
      clientName: options?.clientName || "MCP Client",
      clientUri: options?.clientUri || window.location.origin,
      callbackUrl:
        options?.callbackUrl || `${window.location.origin}/oauth/callback`,
    });

    const isOauthNecessaryResult = await isOauthNecessary(serverUrl);
    if (!isOauthNecessaryResult) {
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

async function isOauthNecessary(serverUrl: string): Promise<boolean> {
  try {
    const metadataUrl = new URL(
      "/.well-known/oauth-protected-resource",
      serverUrl,
    );
    const metadataResponse = await fetch(metadataUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    if (metadataResponse.status === 404 || !metadataResponse.ok) {
      console.log(
        `[authenticateMcp] Server does not require OAuth (status: ${metadataResponse.status})`,
      );
      return false;
    }

    const contentType = metadataResponse.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.log(
        "[authenticateMcp] Server does not return OAuth metadata, assuming no auth required",
      );
      return false;
    }
  } catch (metadataError) {
    console.log(
      "[authenticateMcp] Error checking OAuth metadata, assuming no auth required:",
      metadataError,
    );
    return true;
  }
  return true;
}

export async function isOAuthTokenValid(
  serverUrl: string,
  token: string | null,
): Promise<boolean> {
  const isOauthNecessaryResult = await isOauthNecessary(serverUrl);
  if (isOauthNecessaryResult && !token) {
    return false;
  }

  try {
    const metadataUrl = new URL(
      "/.well-known/oauth-protected-resource",
      serverUrl,
    );

    const response = await fetch(metadataUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      console.log(
        `[isOAuthTokenValid] Token is invalid (status: ${response.status})`,
      );
      return false;
    }

    if (response.ok) {
      console.log("[isOAuthTokenValid] Token is valid");
      return true;
    }

    console.log(
      `[isOAuthTokenValid] Unexpected status ${response.status}, assuming token might be valid`,
    );
    return true;
  } catch (error) {
    console.error(
      "[isOAuthTokenValid] Error validating token, assuming invalid:",
      error,
    );
    return false;
  }
}
