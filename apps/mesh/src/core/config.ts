import { EmailProviderConfig } from "@/auth/email-providers";
import { MagicLinkConfig } from "@/auth/magic-link";
import { SSOConfig } from "@/auth/sso";
import {
  DEFAULT_MONITORING_CONFIG,
  type MonitoringConfig,
} from "@/monitoring/types";
import { BetterAuthOptions } from "better-auth";
import { existsSync, readFileSync } from "fs";

const DEFAULT_AUTH_CONFIG: Partial<BetterAuthOptions> = {
  emailAndPassword: {
    enabled: true,
  },
};
export interface Config {
  auth: Partial<BetterAuthOptions> & {
    ssoConfig?: SSOConfig;
    magicLinkConfig?: MagicLinkConfig;
    emailProviders?: EmailProviderConfig[];
    inviteEmailProviderId?: string;
    jwt?: { secret?: string };
  };
  monitoring?: Partial<MonitoringConfig>;
  /**
   * Whether to automatically create an organization when a new user signs up.
   * @default true
   */
  autoCreateOrganizationOnSignup?: boolean;
}

const configPath = "./config.json";
const authConfigPath = "./auth-config.json";
/**
 * Load optional configuration from file
 */
function loadConfig(): Config {
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(content);
      return {
        auth: DEFAULT_AUTH_CONFIG,
        monitoring: DEFAULT_MONITORING_CONFIG,
        ...parsed,
      };
    } catch {
      return {
        auth: DEFAULT_AUTH_CONFIG,
        monitoring: DEFAULT_MONITORING_CONFIG,
      };
    }
  }

  if (existsSync(authConfigPath)) {
    try {
      const content = readFileSync(authConfigPath, "utf-8");
      return {
        auth: JSON.parse(content),
        monitoring: DEFAULT_MONITORING_CONFIG,
      };
    } catch {
      return {
        auth: DEFAULT_AUTH_CONFIG,
        monitoring: DEFAULT_MONITORING_CONFIG,
      };
    }
  }

  return {
    auth: DEFAULT_AUTH_CONFIG,
    monitoring: DEFAULT_MONITORING_CONFIG,
  };
}

export const config = loadConfig();

/**
 * Get monitoring configuration with defaults
 */
export function getMonitoringConfig(): MonitoringConfig {
  return {
    ...DEFAULT_MONITORING_CONFIG,
    ...config.monitoring,
  };
}
