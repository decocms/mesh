import type { OAuthClient, OAuthConfig, OAuthParams } from "./tools.ts";

/**
 * Generate a cryptographically secure random token
 */
function generateRandomToken(length = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}

/**
 * Validate redirect URI format per OAuth 2.1
 */
function isValidRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    return (
      url.protocol === "https:" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      // Allow custom schemes for native apps (e.g., cursor://, vscode://)
      !url.protocol.startsWith("http")
    );
  } catch {
    return false;
  }
}

/**
 * Encode data as base64url JSON
 */
function encodeState<T>(data: T): string {
  return btoa(JSON.stringify(data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode base64url JSON data
 */
function decodeState<T>(encoded: string): T | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as T;
  } catch {
    return null;
  }
}

interface PendingAuthState {
  redirectUri: string;
  clientState?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  /** The clean callback URL used for OAuth (without state param) - used in token exchange */
  oauthCallbackUri?: string;
}

/**
 * Generate a beautiful success page with capybara animation
 * Auto-redirects to the client callback after a brief delay
 */
function generateSuccessPage(redirectUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Successful</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      background: #0a0a0a;
      color: #fafafa;
      overflow-x: hidden;
    }

    .layout {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .animation-panel {
      flex: 1;
      min-height: 40vh;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .animation-container {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .callback-frame {
      position: relative;
      z-index: 10;
      width: 90%;
      max-width: 600px;
      height: 300px;
      border: 1px solid #27272a;
      border-radius: 1rem;
      background: #18181b;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      opacity: 0;
      animation: fadeSlideUp 0.6s ease-out 1.2s forwards;
    }

    .callback-frame iframe {
      width: 100%;
      height: 100%;
      border: none;
      border-radius: 1rem;
    }

    .content-panel {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3rem 2rem;
      background: #111111;
      border-top: 1px solid #262626;
    }

    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.5rem;
      padding: 3rem;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .logo {
      width: 140px;
      height: auto;
      margin-bottom: 2rem;
      opacity: 0;
      animation: fadeSlideUp 0.6s ease-out 0.2s forwards;
    }

    .success-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.25);
      color: #4ade80;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-size: 0.8125rem;
      font-weight: 500;
      margin-bottom: 1.5rem;
      opacity: 0;
      animation: fadeSlideUp 0.6s ease-out 0.4s forwards;
    }

    .success-badge svg {
      width: 14px;
      height: 14px;
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      letter-spacing: -0.025em;
      text-align: center;
      opacity: 0;
      animation: fadeSlideUp 0.6s ease-out 0.6s forwards;
    }

    p {
      color: #71717a;
      font-size: 0.875rem;
      line-height: 1.5;
      text-align: center;
      opacity: 0;
      animation: fadeSlideUp 0.6s ease-out 0.8s forwards;
    }

    .redirect-text {
      margin-top: 1rem;
      font-size: 0.75rem;
      color: #52525b;
      opacity: 0;
      animation: fadeSlideUp 0.6s ease-out 1s forwards;
    }

    @keyframes fadeSlideUp {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (min-width: 768px) {
      .layout {
        flex-direction: row;
      }

      .animation-panel {
        flex: 1;
        min-height: 100vh;
      }

      .content-panel {
        flex: 0 0 480px;
        border-top: none;
        border-left: 1px solid #262626;
        padding: 2rem;
      }

      .card {
        padding: 3.5rem;
      }

      h1 {
        font-size: 2rem;
      }
    }

    @media (min-width: 1200px) {
      .content-panel {
        flex: 0 0 540px;
      }
    }
  </style>
</head>
<body>
  <div class="layout">
    <div class="animation-panel">
      <div class="animation-container">
        <div
          data-us-project="3u9H2SGWSifD8DQZHG4X"
          data-us-production="true"
          style="width: 100%; height: 100%;"
        ></div>
      </div>
      <div class="callback-frame" id="callback-container"></div>
    </div>

    <div class="content-panel">
      <div class="card">
        <img
          src="https://assets.decocache.com/decocms/4869c863-d677-4e5b-b3fd-4b3913a56034/deco-logo.png"
          alt="MCP Mesh"
          class="logo"
        />
        <div class="success-badge">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          Authenticated
        </div>
        <h1>Connection Successful</h1>
        <p>Your MCP connection has been authenticated successfully.</p>
        <p class="redirect-text">Completing authentication...</p>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/gh/nicholashamilton/unicorn-studio-embed-player@v1.5.2/dist/player.umd.js"></script>
  <script>
    (function() {
      if (window.UnicornStudio) {
        window.UnicornStudio.init().catch(console.error);
      }

      var callbackUrl = ${JSON.stringify(redirectUrl)};
      var container = document.getElementById('callback-container');

      // Create a visible iframe to show the client callback
      // This lets the user see both our animation and the client's response
      var iframe = document.createElement('iframe');
      iframe.src = callbackUrl;
      container.appendChild(iframe);

      // Update the message after the callback is sent
      setTimeout(function() {
        var p = document.querySelector('.redirect-text');
        if (p) {
          p.textContent = 'You can close this window now.';
          p.style.color = '#4ade80';
        }
      }, 1500);
    })();
  </script>
</body>
</html>`;
}

interface CodePayload {
  accessToken: string;
  tokenType: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

const forceHttps = (url: URL) => {
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!isLocal) {
    // force http if not local
    url.protocol = "https:";
  }
  return url;
};

/**
 * Create OAuth endpoint handlers for MCP servers
 * The MCP server acts as an OAuth Authorization Server proxy
 * Stateless implementation - no persistence required
 * Per MCP Authorization spec: https://modelcontextprotocol.io/specification/draft/basic/authorization
 */
export function createOAuthHandlers(oauth: OAuthConfig) {
  /**
   * Build OAuth 2.0 Protected Resource Metadata (RFC9728)
   * Points to THIS server as the authorization server
   */
  const handleProtectedResourceMetadata = (req: Request): Response => {
    const url = forceHttps(new URL(req.url));
    const resourceUrl = `${url.origin}/mcp`;

    return Response.json({
      resource: resourceUrl,
      // Point to ourselves - we are the authorization server proxy
      authorization_servers: [url.origin],
      scopes_supported: ["*"],
      bearer_methods_supported: ["header"],
      resource_signing_alg_values_supported: ["RS256", "none"],
    });
  };

  /**
   * Build OAuth 2.0 Authorization Server Metadata (RFC8414)
   * Exposes our endpoints for authorization, token exchange, and registration
   */
  const handleAuthorizationServerMetadata = (req: Request): Response => {
    const url = forceHttps(new URL(req.url));
    const baseUrl = url.origin;

    return Response.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      registration_endpoint: `${baseUrl}/register`,
      scopes_supported: ["*"],
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      code_challenge_methods_supported: ["S256", "plain"],
    });
  };

  /**
   * Handle authorization request - redirects to external OAuth provider
   * Stateless: encodes all needed info in the state parameter
   */
  const handleAuthorize = (req: Request): Response => {
    const url = forceHttps(new URL(req.url));
    const redirectUri = url.searchParams.get("redirect_uri");
    const responseType = url.searchParams.get("response_type");
    const clientState = url.searchParams.get("state");
    const codeChallenge = url.searchParams.get("code_challenge");
    const codeChallengeMethod = url.searchParams.get("code_challenge_method");

    // Validate required params
    if (!redirectUri) {
      return Response.json(
        {
          error: "invalid_request",
          error_description: "redirect_uri required",
        },
        { status: 400 },
      );
    }

    if (responseType !== "code") {
      return Response.json(
        {
          error: "unsupported_response_type",
          error_description: "Only 'code' is supported",
        },
        { status: 400 },
      );
    }

    // Build callback URL pointing to our internal callback (without state yet)
    const callbackUrl = forceHttps(new URL(`${url.origin}/oauth/callback`));
    // Store the clean callback URL for token exchange
    const oauthCallbackUri = callbackUrl.toString();

    // Encode pending auth state (including the clean callback URL)
    const pendingState: PendingAuthState = {
      redirectUri,
      clientState: clientState ?? undefined,
      codeChallenge: codeChallenge ?? undefined,
      codeChallengeMethod: codeChallengeMethod ?? undefined,
      oauthCallbackUri,
    };
    const encodedState = encodeState(pendingState);

    // Add state to callback URL
    callbackUrl.searchParams.set("state", encodedState);

    // Get the external authorization URL from the config
    const externalAuthUrl = oauth.authorizationUrl(callbackUrl.toString());

    // Redirect to external OAuth provider
    return Response.redirect(externalAuthUrl, 302);
  };

  /**
   * Handle OAuth callback from external provider
   * Stateless: decodes state to get redirect info, encodes token in code
   */
  const handleOAuthCallback = async (req: Request): Promise<Response> => {
    const url = forceHttps(new URL(req.url));
    const code = url.searchParams.get("code");
    const encodedState = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    // Decode state
    const pending = encodedState
      ? decodeState<PendingAuthState>(encodedState)
      : null;

    if (error) {
      const errorDescription =
        url.searchParams.get("error_description") ?? "Authorization failed";
      if (pending?.redirectUri) {
        const redirectUrl = forceHttps(new URL(pending.redirectUri));
        redirectUrl.searchParams.set("error", error);
        redirectUrl.searchParams.set("error_description", errorDescription);
        if (pending.clientState)
          redirectUrl.searchParams.set("state", pending.clientState);
        return Response.redirect(redirectUrl.toString(), 302);
      }
      return Response.json(
        { error, error_description: errorDescription },
        { status: 400 },
      );
    }

    if (!code || !pending) {
      return Response.json(
        {
          error: "invalid_request",
          error_description: "Missing code or state",
        },
        { status: 400 },
      );
    }

    try {
      // Use the clean redirect_uri from the state (same URL used in authorization request)
      // This ensures the exact same URL is used for token exchange
      const cleanRedirectUri =
        pending.oauthCallbackUri ??
        forceHttps(new URL(`${url.origin}/oauth/callback`)).toString();

      // Exchange code with external provider
      const oauthParams: OAuthParams = {
        code,
        redirect_uri: cleanRedirectUri,
      };
      const tokenResponse = await oauth.exchangeCode(oauthParams);

      // Encode the token in our own code (stateless)
      const codePayload: CodePayload = {
        accessToken: tokenResponse.access_token,
        tokenType: tokenResponse.token_type,
        refreshToken: tokenResponse.refresh_token,
        expiresIn: tokenResponse.expires_in,
        scope: tokenResponse.scope,
        codeChallenge: pending.codeChallenge,
        codeChallengeMethod: pending.codeChallengeMethod,
      };
      const ourCode = encodeState(codePayload);

      // Redirect back to client with our code
      const redirectUrl = forceHttps(new URL(pending.redirectUri));
      redirectUrl.searchParams.set("code", ourCode);
      if (pending.clientState) {
        redirectUrl.searchParams.set("state", pending.clientState);
      }

      // Return a beautiful success page that auto-redirects
      const finalRedirectUrl = redirectUrl.toString();
      return new Response(generateSuccessPage(finalRedirectUrl), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    } catch (err) {
      console.error("OAuth callback error:", err);

      // Redirect back to client with error
      const redirectUrl = forceHttps(new URL(pending.redirectUri));
      redirectUrl.searchParams.set("error", "server_error");
      redirectUrl.searchParams.set(
        "error_description",
        "Failed to exchange authorization code",
      );
      if (pending.clientState)
        redirectUrl.searchParams.set("state", pending.clientState);

      return Response.redirect(redirectUrl.toString(), 302);
    }
  };

  /**
   * Handle token exchange - decodes our code to get the actual token
   * Supports both authorization_code and refresh_token grant types
   * Stateless: token is encoded in the code
   */
  const handleToken = async (req: Request): Promise<Response> => {
    try {
      const contentType = req.headers.get("content-type") ?? "";
      let body: Record<string, string>;

      if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await req.formData();
        body = Object.fromEntries(formData.entries()) as Record<string, string>;
      } else {
        body = await req.json();
      }

      const { code, code_verifier, grant_type, refresh_token } = body;

      // Handle refresh_token grant type
      if (grant_type === "refresh_token") {
        if (!refresh_token) {
          return Response.json(
            {
              error: "invalid_request",
              error_description: "refresh_token is required",
            },
            { status: 400 },
          );
        }

        if (!oauth.refreshToken) {
          return Response.json(
            {
              error: "unsupported_grant_type",
              error_description: "refresh_token grant not supported",
            },
            { status: 400 },
          );
        }

        // Call the external provider to refresh the token
        const newTokenResponse = await oauth.refreshToken(refresh_token);

        const tokenResponse: Record<string, unknown> = {
          access_token: newTokenResponse.access_token,
          token_type: newTokenResponse.token_type,
        };

        if (newTokenResponse.refresh_token) {
          tokenResponse.refresh_token = newTokenResponse.refresh_token;
        }
        if (newTokenResponse.expires_in !== undefined) {
          tokenResponse.expires_in = newTokenResponse.expires_in;
        }
        if (newTokenResponse.scope) {
          tokenResponse.scope = newTokenResponse.scope;
        }

        return Response.json(tokenResponse, {
          headers: {
            "Cache-Control": "no-store",
            Pragma: "no-cache",
          },
        });
      }

      // Handle authorization_code grant type
      if (grant_type !== "authorization_code") {
        return Response.json(
          {
            error: "unsupported_grant_type",
            error_description:
              "Only authorization_code and refresh_token supported",
          },
          { status: 400 },
        );
      }

      if (!code) {
        return Response.json(
          { error: "invalid_request", error_description: "code is required" },
          { status: 400 },
        );
      }

      // Decode the code to get the token
      const payload = decodeState<CodePayload>(code);
      if (!payload || !payload.accessToken) {
        return Response.json(
          {
            error: "invalid_grant",
            error_description: "Invalid or expired code",
          },
          { status: 400 },
        );
      }

      // Verify PKCE if code challenge was provided
      if (payload.codeChallenge) {
        if (!code_verifier) {
          return Response.json(
            {
              error: "invalid_grant",
              error_description: "code_verifier required",
            },
            { status: 400 },
          );
        }

        // Verify the code verifier
        let computedChallenge: string;
        if (payload.codeChallengeMethod === "S256") {
          const encoder = new TextEncoder();
          const data = encoder.encode(code_verifier);
          const hash = await crypto.subtle.digest("SHA-256", data);
          computedChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        } else {
          computedChallenge = code_verifier;
        }

        if (computedChallenge !== payload.codeChallenge) {
          return Response.json(
            {
              error: "invalid_grant",
              error_description: "Invalid code_verifier",
            },
            { status: 400 },
          );
        }
      }

      // Return the actual token with all fields
      const tokenResponse: Record<string, unknown> = {
        access_token: payload.accessToken,
        token_type: payload.tokenType,
      };

      // Include optional fields if present
      if (payload.refreshToken) {
        tokenResponse.refresh_token = payload.refreshToken;
      }
      if (payload.expiresIn !== undefined) {
        tokenResponse.expires_in = payload.expiresIn;
      }
      if (payload.scope) {
        tokenResponse.scope = payload.scope;
      }

      return Response.json(tokenResponse, {
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      });
    } catch (err) {
      console.error("Token exchange error:", err);
      return Response.json(
        {
          error: "server_error",
          error_description: "Failed to process token request",
        },
        { status: 500 },
      );
    }
  };

  /**
   * Handle dynamic client registration (RFC7591)
   * Stateless: just generates a client_id and returns it, no storage needed
   */
  const handleClientRegistration = async (req: Request): Promise<Response> => {
    try {
      const body = (await req.json()) as {
        redirect_uris?: string[];
        client_name?: string;
        grant_types?: string[];
        response_types?: string[];
        token_endpoint_auth_method?: string;
        scope?: string;
        client_uri?: string;
      };

      // Validate redirect URIs
      if (!body.redirect_uris || body.redirect_uris.length === 0) {
        return Response.json(
          {
            error: "invalid_redirect_uri",
            error_description: "At least one redirect_uri is required",
          },
          { status: 400 },
        );
      }

      for (const uri of body.redirect_uris) {
        if (!isValidRedirectUri(uri)) {
          return Response.json(
            {
              error: "invalid_redirect_uri",
              error_description: `Invalid redirect URI: ${uri}`,
            },
            { status: 400 },
          );
        }
      }

      const clientId = generateRandomToken(32);
      const clientSecret =
        body.token_endpoint_auth_method !== "none"
          ? generateRandomToken(32)
          : undefined;
      const now = Math.floor(Date.now() / 1000);

      const client: OAuthClient = {
        client_id: clientId,
        client_secret: clientSecret,
        client_name: body.client_name,
        redirect_uris: body.redirect_uris,
        grant_types: body.grant_types ?? ["authorization_code"],
        response_types: body.response_types ?? ["code"],
        token_endpoint_auth_method:
          body.token_endpoint_auth_method ?? "client_secret_post",
        scope: body.scope,
        client_id_issued_at: now,
        client_secret_expires_at: 0,
      };

      // Save client if persistence is provided
      if (oauth.persistence) {
        await oauth.persistence.saveClient(client);
      }

      return new Response(JSON.stringify(client), {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      });
    } catch (err) {
      console.error("Client registration error:", err);
      return Response.json(
        {
          error: "invalid_client_metadata",
          error_description: "Invalid client registration request",
        },
        { status: 400 },
      );
    }
  };

  /**
   * Return 401 with WWW-Authenticate header for unauthenticated MCP requests
   * Per MCP spec: MUST include resource_metadata URL
   */
  const createUnauthorizedResponse = (req: Request): Response => {
    const url = forceHttps(new URL(req.url));
    const resourceMetadataUrl = `${url.origin}/.well-known/oauth-protected-resource`;
    const wwwAuthenticateValue = `Bearer resource_metadata="${resourceMetadataUrl}", scope="*"`;

    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Unauthorized: Authentication required",
        },
        id: null,
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": wwwAuthenticateValue,
          "Access-Control-Expose-Headers": "WWW-Authenticate",
        },
      },
    );
  };

  /**
   * Check if request has authentication token
   */
  const hasAuth = (req: Request) => req.headers.has("Authorization");

  return {
    handleProtectedResourceMetadata,
    handleAuthorizationServerMetadata,
    handleAuthorize,
    handleOAuthCallback,
    handleToken,
    handleClientRegistration,
    createUnauthorizedResponse,
    hasAuth,
  };
}
