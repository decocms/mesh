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
