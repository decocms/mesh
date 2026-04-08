import { EmailOtpConfig } from "@/auth/email-otp";
import { EmailProviderConfig } from "@/auth/email-providers";
import { MagicLinkConfig } from "@/auth/magic-link";
import { SSOConfig } from "@/auth/sso";
import {
  DEFAULT_MONITORING_CONFIG,
  type MonitoringConfig,
} from "@/monitoring/types";
import { BetterAuthOptions } from "better-auth";
import { existsSync, readFileSync } from "fs";
import { z } from "zod";
import { getSettings } from "../settings";

/**
 * Theme configuration for customizing the UI appearance.
 * Allows overriding CSS variables for light and dark modes.
 *
 * @example
 * ```json
 * {
 *   "theme": {
 *     "light": {
 *       "--primary": "oklch(0.6 0.2 250)",
 *       "--brand-green-light": "#00ff00"
 *     },
 *     "dark": {
 *       "--primary": "oklch(0.5 0.2 250)"
 *     }
 *   }
 * }
 * ```
 */
export interface ThemeConfig {
  /** CSS variable overrides for light mode */
  light?: Record<string, string>;
  /** CSS variable overrides for dark mode */
  dark?: Record<string, string>;
}

export interface Config {
  auth: Partial<BetterAuthOptions> & {
    ssoConfig?: SSOConfig;
    magicLinkConfig?: MagicLinkConfig;
    emailOtpConfig?: EmailOtpConfig;
    emailProviders?: EmailProviderConfig[];
    inviteEmailProviderId?: string;
    resetPasswordEmailProviderId?: string;
    jwt?: { secret?: string };
  };
  monitoring?: Partial<MonitoringConfig>;
  /**
   * Theme customization for the UI.
   * Allows overriding CSS variables for light and dark modes.
   */
  theme?: ThemeConfig;
  /**
   * Product logo shown in the sidebar.
   * Defaults to the Deco logo. Override for white-label deployments.
   * Can be a single URL (used for both modes) or per-mode URLs.
   */
  logo?: string | { light: string; dark: string };
  /**
   * Whether to automatically create an organization when a new user signs up.
   * @default true
   */
  autoCreateOrganizationOnSignup?: boolean;
}

/**
 * Zod helper: use the file value if non-empty, otherwise fall back to an env var.
 */
const envFallback = (envKey: string) =>
  z
    .string()
    .optional()
    .transform((val) => val || process.env[envKey] || "");

/**
 * Zod schema for auth config secrets.
 *
 * Values are resolved with file-first, env-fallback semantics:
 *   1. JSON.parse the file → use the value if present
 *   2. If the value is missing or empty → read from env var
 *
 * Supported env vars:
 * - AUTH_GOOGLE_CLIENT_ID / AUTH_GOOGLE_CLIENT_SECRET
 * - AUTH_GITHUB_CLIENT_ID / AUTH_GITHUB_CLIENT_SECRET
 * - AUTH_RESEND_API_KEY (applies to the "resend-primary" email provider)
 */
const authConfigSchema = z
  .object({
    emailAndPassword: z
      .object({ enabled: z.boolean().default(true) })
      .passthrough()
      .default({ enabled: true }),
    socialProviders: z
      .object({
        google: z
          .object({
            clientId: envFallback("AUTH_GOOGLE_CLIENT_ID"),
            clientSecret: envFallback("AUTH_GOOGLE_CLIENT_SECRET"),
          })
          .passthrough()
          .optional(),
        github: z
          .object({
            clientId: envFallback("AUTH_GITHUB_CLIENT_ID"),
            clientSecret: envFallback("AUTH_GITHUB_CLIENT_SECRET"),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    emailProviders: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough()
  .transform((config) => {
    // If env vars are set but the provider block wasn't in the file, create it
    const socialProviders = { ...config.socialProviders };
    if (
      !socialProviders.google &&
      (process.env.AUTH_GOOGLE_CLIENT_ID ||
        process.env.AUTH_GOOGLE_CLIENT_SECRET)
    ) {
      socialProviders.google = {
        clientId: process.env.AUTH_GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET ?? "",
      };
    }
    if (
      !socialProviders.github &&
      (process.env.AUTH_GITHUB_CLIENT_ID ||
        process.env.AUTH_GITHUB_CLIENT_SECRET)
    ) {
      socialProviders.github = {
        clientId: process.env.AUTH_GITHUB_CLIENT_ID ?? "",
        clientSecret: process.env.AUTH_GITHUB_CLIENT_SECRET ?? "",
      };
    }

    // Apply resend API key env override
    const resendApiKey = process.env.AUTH_RESEND_API_KEY;
    let emailProviders = config.emailProviders;
    if (resendApiKey && emailProviders) {
      emailProviders = emailProviders.map((p) =>
        p.id === "resend-primary"
          ? { ...p, config: { ...(p.config as object), apiKey: resendApiKey } }
          : p,
      );
    }

    return {
      ...config,
      ...(Object.keys(socialProviders).length > 0 && { socialProviders }),
      ...(emailProviders && { emailProviders }),
    };
  });

/**
 * Read raw JSON from the config file or auth-config file.
 * Returns the parsed object, or null if no file exists / parse fails.
 */
function readConfigFile(): {
  raw: Record<string, unknown>;
  isFullConfig: boolean;
} | null {
  const configPath = getSettings().configPath;
  const authConfigPath = getSettings().authConfigPath;

  if (existsSync(configPath)) {
    try {
      return {
        raw: JSON.parse(readFileSync(configPath, "utf-8")),
        isFullConfig: true,
      };
    } catch {
      return null;
    }
  }

  if (existsSync(authConfigPath)) {
    try {
      return {
        raw: JSON.parse(readFileSync(authConfigPath, "utf-8")),
        isFullConfig: false,
      };
    } catch {
      return null;
    }
  }

  return null;
}

function loadConfig(): Config {
  const file = readConfigFile();

  if (file?.isFullConfig) {
    // config.json: full config with auth nested under "auth" key
    const auth = authConfigSchema.parse(file.raw.auth ?? {});
    return {
      monitoring: DEFAULT_MONITORING_CONFIG,
      ...file.raw,
      auth,
    } as Config;
  }

  // auth-config.json or no file: parse as auth config directly
  const auth = authConfigSchema.parse(file?.raw ?? {});
  return { auth, monitoring: DEFAULT_MONITORING_CONFIG } as Config;
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/**
 * Get monitoring configuration with defaults
 */
export function getMonitoringConfig(): MonitoringConfig {
  return {
    ...DEFAULT_MONITORING_CONFIG,
    ...getConfig().monitoring,
  };
}

/**
 * Get theme configuration
 */
export function getThemeConfig(): ThemeConfig | undefined {
  return getConfig().theme;
}
