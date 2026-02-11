export interface RegistryRemote {
  type?: string;
  url?: string;
  name?: string;
  title?: string;
  description?: string;
}

export interface RegistryServerDefinition {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  icons?: Array<{ src: string }>;
  remotes?: RegistryRemote[];
  repository?: {
    url?: string;
    source?: string;
    subfolder?: string;
  };
  [key: string]: unknown;
}

export interface RegistryToolMeta {
  name: string;
  description?: string | null;
}

export interface RegistryMeshMeta {
  verified?: boolean;
  tags?: string[];
  categories?: string[];
  friendly_name?: string | null;
  short_description?: string | null;
  owner?: string | null;
  readme?: string | null;
  readme_url?: string | null;
  has_remote?: boolean;
  has_oauth?: boolean;
  tools?: RegistryToolMeta[];
  [key: string]: unknown;
}

export interface RegistryItem {
  id: string;
  name?: string;
  title: string;
  description?: string | null;
  _meta?: {
    "mcp.mesh"?: RegistryMeshMeta;
    [key: string]: unknown;
  };
  server: RegistryServerDefinition;
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

export interface RegistryFilters {
  tags: Array<{ value: string; count: number }>;
  categories: Array<{ value: string; count: number }>;
}

export interface RegistryListResponse {
  items: RegistryItem[];
  totalCount: number;
  hasMore?: boolean;
  nextCursor?: string;
}

export interface RegistryCreateInput {
  id: string;
  title: string;
  description?: string | null;
  _meta?: RegistryItem["_meta"];
  server: RegistryServerDefinition;
  is_public?: boolean;
}

export interface RegistryUpdateInput {
  title?: string;
  description?: string | null;
  _meta?: RegistryItem["_meta"];
  server?: RegistryServerDefinition;
  is_public?: boolean;
}

export interface RegistryBulkCreateResult {
  created: number;
  errors: Array<{ id: string; error: string }>;
}

export type PublishRequestStatus = "pending" | "approved" | "rejected";

export interface PublishRequest {
  id: string;
  organization_id: string;
  status: PublishRequestStatus;
  title: string;
  description?: string | null;
  _meta?: RegistryItem["_meta"];
  server: RegistryServerDefinition;
  requester_name?: string | null;
  requester_email?: string | null;
  reviewer_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublishRequestListResponse {
  items: PublishRequest[];
  totalCount: number;
}

export type TestMode = "health_check" | "tool_call" | "full_agent";
export type TestFailureAction =
  | "none"
  | "remove_public"
  | "remove_private"
  | "remove_all";
export type TestRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type TestResultStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "error"
  | "needs_auth";
export type TestConnectionAuthStatus = "none" | "needs_auth" | "authenticated";

export interface RegistryTestConfig {
  testMode: TestMode;
  onFailure: TestFailureAction;
  agentPrompt?: string;
  schedule?: "manual" | "cron";
  cronExpression?: string;
  perMcpTimeoutMs: number;
  perToolTimeoutMs: number;
  testPublicOnly: boolean;
  testPrivateOnly: boolean;
  llmConnectionId?: string;
  llmModelId?: string;
}

export interface TestToolResult {
  toolName: string;
  success: boolean;
  durationMs: number;
  input?: Record<string, unknown>;
  outputPreview?: string | null;
  error?: string | null;
}

export interface TestRun {
  id: string;
  organization_id: string;
  status: TestRunStatus;
  config_snapshot: RegistryTestConfig | null;
  total_items: number;
  tested_items: number;
  passed_items: number;
  failed_items: number;
  skipped_items: number;
  current_item_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface TestResult {
  id: string;
  run_id: string;
  organization_id: string;
  item_id: string;
  item_title: string;
  status: TestResultStatus;
  error_message: string | null;
  connection_ok: boolean;
  tools_listed: boolean;
  tool_results: TestToolResult[];
  agent_summary: string | null;
  duration_ms: number;
  action_taken: string;
  tested_at: string;
}

export interface TestRunListResponse {
  items: TestRun[];
  totalCount: number;
}

export interface TestResultListResponse {
  items: TestResult[];
  totalCount: number;
}

export interface TestConnectionMapping {
  id: string;
  organization_id: string;
  item_id: string;
  connection_id: string;
  auth_status: TestConnectionAuthStatus;
  created_at: string;
  updated_at: string;
}

export interface TestConnectionListItem {
  mapping: TestConnectionMapping;
  item: RegistryItem | null;
  remoteUrl: string | null;
}

export interface TestConnectionListResponse {
  items: TestConnectionListItem[];
}
