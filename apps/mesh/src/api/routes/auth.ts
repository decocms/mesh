/**
 * Custom Auth Routes
 *
 * Provides custom authentication endpoints that work better with OAuth flows
 * by returning callback URLs in response body instead of using 302 redirects.
 */

import { Hono } from "hono";
import { auth, authConfig } from "../../auth";
import { KNOWN_OAUTH_PROVIDERS, OAuthProvider } from "@/auth/oauth-providers";

const app = new Hono();

export type AuthConfig = {
  emailAndPassword: {
    enabled: boolean;
  };
  magicLink: {
    enabled: boolean;
  };
  socialProviders: {
    enabled: boolean;
    providers: {
      name: string;
      icon?: string;
    }[];
  };
  sso:
    | {
        enabled: true;
        providerId: string;
      }
    | {
        enabled: false;
      };
  /**
   * Whether STDIO connections are allowed.
   * Disabled by default in production unless UNSAFE_ALLOW_STDIO_TRANSPORT=true
   */
  stdioEnabled: boolean;
};

/**
 * Auth Configuration Endpoint
 *
 * Returns information about available authentication methods
 *
 * Route: GET /api/auth/custom/config
 */
app.get("/config", async (c) => {
  try {
    const socialProviders = Object.keys(authConfig.socialProviders ?? {});
    const hasSocialProviders = socialProviders.length > 0;
    const providers = socialProviders.map((name) => ({
      name,
      icon: KNOWN_OAUTH_PROVIDERS[name as OAuthProvider].icon,
    }));

    // STDIO is disabled in production unless explicitly allowed
    const stdioEnabled =
      process.env.NODE_ENV !== "production" ||
      process.env.UNSAFE_ALLOW_STDIO_TRANSPORT === "true";

    const config: AuthConfig = {
      emailAndPassword: {
        enabled: authConfig.emailAndPassword?.enabled ?? false,
      },
      magicLink: {
        enabled: authConfig.magicLinkConfig?.enabled ?? false,
      },
      socialProviders: {
        enabled: hasSocialProviders,
        providers: providers,
      },
      sso: authConfig.ssoConfig
        ? {
            enabled: true,
            providerId: authConfig.ssoConfig.providerId,
          }
        : {
            enabled: false,
          },
      stdioEnabled,
    };

    return c.json({ success: true, config });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to load auth config";

    return c.json(
      {
        success: false,
        error: errorMessage,
      },
      500,
    );
  }
});

/**
 * CLI Token Endpoint
 *
 * Creates an API key for CLI use.
 * This endpoint is called after the user logs in via browser.
 * It validates the session cookie and creates a long-lived API key.
 *
 * Route: GET /api/auth/custom/cli-token
 */
app.get("/cli-token", async (c) => {
  try {
    // Get session from cookie using the global auth instance
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.session || !session?.user) {
      return c.json({ success: false, error: "Not authenticated" }, 401);
    }

    // Create an API key for CLI use
    // Use unique name with timestamp to avoid race conditions
    const cliKeyName = `deco-cli-${Date.now()}`;

    // Create a new API key for CLI (90 day expiration)
    // expiresIn is in SECONDS (90 days = 90 * 24 * 60 * 60)
    const ninetyDaysInSeconds = 90 * 24 * 60 * 60;

    const newKey = await auth.api.createApiKey({
      headers: c.req.raw.headers,
      body: {
        name: cliKeyName,
        expiresIn: ninetyDaysInSeconds,
        metadata: {
          source: "cli-login",
          createdAt: new Date().toISOString(),
        },
      },
    });

    const apiKey = newKey?.key || "";

    if (!apiKey) {
      return c.json({ success: false, error: "Failed to create API key" }, 500);
    }

    // Return the API key for CLI use
    return c.json({
      success: true,
      token: apiKey,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      expiresAt: new Date(
        Date.now() + ninetyDaysInSeconds * 1000,
      ).toISOString(),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get CLI token";
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

export default app;
