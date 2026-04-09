/**
 * Custom Auth Routes
 *
 * Provides custom authentication endpoints that work better with OAuth flows
 * by returning callback URLs in response body instead of using 302 redirects.
 */

import { Hono } from "hono";
import { getConnInfo } from "hono/bun";
import { getSettings } from "../../settings";
import {
  auth,
  authConfig,
  GENERIC_EMAIL_DOMAINS,
  resetPasswordEnabled,
} from "../../auth";
import { getDb } from "../../database";
import { OrganizationDomainStorage } from "../../storage/organization-domains";
import { KNOWN_OAUTH_PROVIDERS, OAuthProvider } from "@/auth/oauth-providers";
import {
  getLocalAdminUser,
  getLocalAdminPassword,
  isLocalMode,
} from "@/auth/local-mode";

const app = new Hono();

export type AuthConfig = {
  emailAndPassword: {
    enabled: boolean;
  };
  magicLink: {
    enabled: boolean;
  };
  emailOtp: {
    enabled: boolean;
  };
  socialProviders: {
    enabled: boolean;
    providers: {
      name: string;
      icon?: string;
    }[];
  };
  resetPassword: {
    enabled: boolean;
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
  /**
   * Whether local mode is active (zero-ceremony developer experience).
   * When true, the frontend should auto-login and skip org selection.
   */
  localMode: boolean;
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

    // STDIO is enabled in local mode, in non-production environments,
    // or when explicitly allowed via UNSAFE_ALLOW_STDIO_TRANSPORT
    const settings = getSettings();
    const stdioEnabled =
      settings.localMode ||
      settings.nodeEnv !== "production" ||
      settings.unsafeAllowStdioTransport;

    const config: AuthConfig = {
      emailAndPassword: {
        enabled: authConfig.emailAndPassword?.enabled ?? false,
      },
      magicLink: {
        enabled: authConfig.magicLinkConfig?.enabled ?? false,
      },
      emailOtp: {
        enabled: authConfig.emailOtpConfig?.enabled ?? false,
      },
      resetPassword: {
        enabled: resetPasswordEnabled,
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
      localMode: isLocalMode(),
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
 * Local Mode Auto-Session Endpoint
 *
 * When local mode is active, this endpoint signs in the admin user
 * and returns the session. The frontend calls this to skip the login form.
 *
 * Route: POST /api/auth/custom/local-session
 */
app.post("/local-session", async (c) => {
  if (!isLocalMode()) {
    return c.json({ success: false, error: "Local mode is not active" }, 403);
  }

  // Only allow from loopback to prevent LAN access when bound to 0.0.0.0
  // Uses Bun's socket-level requestIP — not spoofable via headers
  let remoteAddr: string | undefined;
  try {
    const info = getConnInfo(c);
    remoteAddr = info.remote.address;
  } catch {
    // getConnInfo may fail in test environments without a real server
  }
  const isLoopback =
    remoteAddr === "127.0.0.1" ||
    remoteAddr === "::1" ||
    remoteAddr === "::ffff:127.0.0.1";
  if (!isLoopback) {
    return c.json({ success: false, error: "Forbidden" }, 403);
  }

  try {
    // Wait for local-mode seeding to complete before attempting login
    const { waitForSeed } = await import("@/auth/local-mode");
    await waitForSeed();

    const { auth } = await import("../../auth");
    const adminUser = await getLocalAdminUser();
    if (!adminUser) {
      return c.json(
        { success: false, error: "Local admin user not found" },
        500,
      );
    }

    // Sign in as the local admin user
    const password = await getLocalAdminPassword();
    const result = await auth.api.signInEmail({
      body: {
        email: adminUser.email,
        password,
      },
      asResponse: true,
    });

    // Forward the response (includes Set-Cookie headers)
    return result;
  } catch (error) {
    console.error("Failed to create local session:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create local session",
      },
      500,
    );
  }
});

/**
 * Domain Lookup Endpoint (authenticated, verified email required)
 *
 * For the onboarding flow: checks if the authenticated user's email domain
 * has a claimed organization. Derives the domain from the session — no
 * query params needed.
 *
 * Route: GET /api/auth/custom/domain-lookup
 */
app.get("/domain-lookup", async (c) => {
  const session = (await auth.api.getSession({
    headers: c.req.raw.headers,
  })) as {
    user?: { id: string; email: string; emailVerified: boolean };
  } | null;
  if (!session?.user) {
    return c.json({ success: false, error: "Authentication required" }, 401);
  }
  if (!session.user.emailVerified) {
    return c.json({ found: false });
  }

  const domain = session.user.email?.split("@")[1]?.toLowerCase();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) {
    return c.json({ found: false });
  }

  try {
    const domainStorage = new OrganizationDomainStorage(getDb().db);
    const record = await domainStorage.getByDomain(domain);

    if (!record) {
      return c.json({ found: false });
    }

    const org = await getDb()
      .db.selectFrom("organization")
      .select(["name", "slug"])
      .where("id", "=", record.organizationId)
      .executeTakeFirst();

    return c.json({
      found: true,
      autoJoinEnabled: record.autoJoinEnabled,
      organization: org ? { name: org.name, slug: org.slug } : null,
    });
  } catch (error) {
    console.error("[Auth] Domain lookup failed:", error);
    return c.json({ success: false, error: "Domain lookup failed" }, 500);
  }
});

/**
 * Domain Auto-Join Endpoint (authenticated, verified email required)
 *
 * Adds the authenticated user to the organization that claimed their
 * email domain, provided auto_join_enabled is true. Everything is
 * derived from the session — no request body needed.
 *
 * Route: POST /api/auth/custom/domain-join
 */
app.post("/domain-join", async (c) => {
  const session = (await auth.api.getSession({
    headers: c.req.raw.headers,
  })) as {
    user?: { id: string; email: string; emailVerified: boolean };
  } | null;
  if (!session?.user) {
    return c.json({ success: false, error: "Authentication required" }, 401);
  }
  if (!session.user.emailVerified) {
    return c.json(
      { success: false, error: "Email must be verified to join" },
      403,
    );
  }

  const emailDomain = session.user.email?.split("@")[1]?.toLowerCase();
  if (!emailDomain || GENERIC_EMAIL_DOMAINS.has(emailDomain)) {
    return c.json(
      { success: false, error: "Generic email domains cannot auto-join" },
      403,
    );
  }

  try {
    const domainStorage = new OrganizationDomainStorage(getDb().db);
    const domainRecord = await domainStorage.getByDomain(emailDomain);
    if (!domainRecord || !domainRecord.autoJoinEnabled) {
      return c.json(
        {
          success: false,
          error: "Auto-join is not available for this domain",
        },
        403,
      );
    }

    const org = await getDb()
      .db.selectFrom("organization")
      .select(["id", "slug"])
      .where("id", "=", domainRecord.organizationId)
      .executeTakeFirst();
    if (!org) {
      return c.json({ success: false, error: "Organization not found" }, 404);
    }

    // Add the user as a member — if they're already a member
    // (e.g. the signup hook already auto-joined them), treat as success.
    try {
      await auth.api.addMember({
        body: {
          userId: session.user.id,
          role: "user",
          organizationId: org.id,
        },
      } as any);
    } catch (addError) {
      const msg =
        addError instanceof Error ? addError.message.toLowerCase() : "";
      if (!msg.includes("already a member")) {
        console.error("[Auth] Domain join addMember failed:", addError);
        return c.json(
          { success: false, error: "Failed to join organization" },
          500,
        );
      }
    }

    return c.json({ success: true, slug: org.slug });
  } catch (error) {
    console.error("[Auth] Domain join failed:", error);
    return c.json(
      { success: false, error: "Failed to join organization" },
      500,
    );
  }
});

export default app;
