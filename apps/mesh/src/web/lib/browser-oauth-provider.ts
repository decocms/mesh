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
    const metadataUrl = new URL("/.well-known/oauth-protected-resource", url);

    const headers: HeadersInit = { Accept: "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(metadataUrl.toString(), {
      method: "GET",
      headers,
    });

    const serverDoesNotSupportOAuth = response.status === 404;
    const contentType = response.headers.get("content-type");
    const responseIsNotJson = !contentType?.includes("application/json");
    const oauthNotRequired = serverDoesNotSupportOAuth || responseIsNotJson;

    if (oauthNotRequired) {
      return true;
    }

    const tokenNotProvided = !token;
    if (tokenNotProvided) {
      return false;
    }

    const tokenIsInvalid = response.status === 401 || response.status === 403;
    if (tokenIsInvalid) {
      return false;
    }

    return response.ok;
  } catch (error) {
    console.error(
      "[isConnectionAuthenticated] Error checking authentication:",
      error,
    );
    return false;
  }
}
