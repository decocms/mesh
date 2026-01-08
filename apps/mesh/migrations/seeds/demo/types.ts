/**
 * Shared types for demo seed
 */

export interface DemoSeedResult {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  users: {
    adminId: string;
    adminEmail: string;
    developerId: string;
    developerEmail: string;
    analystId: string;
    analystEmail: string;
    billingId: string;
    billingEmail: string;
    viewerId: string;
    viewerEmail: string;
  };
  apiKeys: {
    admin: string;
    member: string;
  };
  connectionIds: string[];
  gatewayIds: string[];
}

export interface DemoUser {
  role: "admin" | "member";
  name: string;
  email: string;
}

export interface DemoConnection {
  title: string;
  description: string;
  icon: string;
  appName: string;
  connectionUrl: string;
  connectionToken: string | null;
  configurationState: "needs_auth" | null;
  metadata: {
    provider: string;
    requiresOAuth?: boolean;
    requiresApiKey?: boolean;
    official?: boolean;
    decoHosted?: boolean;
    demoToken?: boolean;
    demoNote?: string;
  };
}

export interface DemoGateway {
  title: string;
  description: string;
  toolSelectionStrategy: "passthrough" | "code_execution";
  toolSelectionMode: "inclusion" | "exclusion";
  icon: string | null;
  isDefault: boolean;
  connections: string[];
}

export interface DemoMonitoringLog {
  connectionKey: string;
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  isError: boolean;
  errorMessage?: string;
  durationMs: number;
  offsetMs: number; // Time offset from now in milliseconds
  userRole: "admin" | "developer" | "analyst" | "billing" | "viewer";
  userAgent: string;
  gatewayKey: string | null;
  properties?: Record<string, string>;
}
