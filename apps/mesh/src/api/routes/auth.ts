/**
 * Custom Auth Routes
 *
 * Provides custom authentication endpoints that work better with OAuth flows
 * by returning callback URLs in response body instead of using 302 redirects.
 */

import { Hono } from "hono";
import { authConfig } from "../../auth";
import { KNOWN_OAUTH_PROVIDERS, OAuthProvider } from "@/auth/oauth-providers";
import { ContextFactory } from "../../core/context-factory";
import { z } from "zod";

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

const updateUserProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  image: z.string().optional().nullable(),
});

/**
 * Update User Profile Endpoint
 *
 * Updates the authenticated user's profile information
 *
 * Route: PUT /api/auth/custom/profile
 */
app.put("/profile", async (c) => {
  try {
    // Create context for this request
    const ctx = await ContextFactory.create(c.req.raw);

    // Require user authentication
    if (!ctx.auth.user?.id) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const data = updateUserProfileSchema.parse(body);

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.email !== undefined) {
      updateData.email = data.email;
    }
    if (data.image !== undefined) {
      updateData.image = data.image || null;
    }

    // Update user in database
    await ctx.db
      .updateTable("user")
      .set(updateData)
      .where("id", "=", ctx.auth.user.id)
      .execute();

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: "Invalid request data",
          details: error.issues,
        },
        400,
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Failed to update profile";

    return c.json(
      {
        success: false,
        error: errorMessage,
      },
      500,
    );
  }
});

export default app;
