/**
 * Store Types
 *
 * Centralized types for store discovery and registry items.
 */

/**
 * MCP Registry Server icon structure
 */
export interface MCPRegistryServerIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: "light" | "dark";
}

/**
 * MCP Registry Server metadata structure
 */
export interface MCPRegistryServerMeta {
  "mcp.mesh"?: {
    id: string;
    verified?: boolean;
    scopeName?: string;
    appName?: string;
    publishedAt?: string;
    updatedAt?: string;
    friendly_name?: string;
    short_description?: string;
    mesh_description?: string;
    tags?: string[];
    categories?: string[];
  };
  "mcp.mesh/publisher-provided"?: {
    friendlyName?: string | null;
    metadata?: Record<string, unknown> | null;
    tools?: Array<{
      id: string;
      name: string;
      description?: string | null;
    }>;
    models?: unknown[];
    emails?: unknown[];
    analytics?: unknown;
    cdn?: unknown;
  };
  [key: string]: unknown;
}

/**
 * MCP Registry Server structure from LIST response
 */
export interface MCPRegistryServer {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  _meta?: MCPRegistryServerMeta;
  server: {
    $schema?: string;
    _meta?: MCPRegistryServerMeta;
    name: string;
    title?: string;
    description?: string;
    icons?: MCPRegistryServerIcon[];
    remotes?: Array<{
      type: "http" | "stdio" | "sse";
      url?: string;
    }>;
    version?: string;
    repository?: {
      url?: string;
      source?: string;
      subfolder?: string;
    };
  };
}

/**
 * Generic registry item that can come from various JSON structures.
 * Different registries may use different property names for similar concepts.
 */
export interface RegistryItem {
  /** Unique identifier for the item */
  id: string;
  /** Primary name of the item */
  name?: string;
  /** Alternative name field used by some registries */
  title?: string;
  /** Primary description of the item */
  description?: string;
  /** Alternative description field used by some registries */
  summary?: string;
  /** Icon URL */
  icon?: string;
  /** Alternative icon field */
  image?: string;
  /** Alternative icon field */
  logo?: string;
  /** Whether the item is verified */
  verified?: boolean;
  /** Publisher name */
  publisher?: string;
  /** Publisher logo URL */
  publisher_logo?: string;
  /** Number of published apps */
  published_apps_count?: number;
  /** Available tools */
  tools?: Array<{
    id?: string;
    name?: string;
    description?: string | null;
  }>;
  /** Available models */
  models?: unknown[];
  /** Available emails */
  emails?: unknown[];
  /** Analytics configuration */
  analytics?: unknown;
  /** CDN configuration */
  cdn?: unknown;
  /** Metadata with various provider-specific information */
  _meta?: MCPRegistryServerMeta;
  /** Alternative metadata field */
  meta?: {
    verified?: boolean;
    [key: string]: unknown;
  };
  /** Nested server object (used by MCPRegistryServer format) - always present */
  server: {
    $schema?: string;
    name: string;
    title?: string;
    description?: string;
    version?: string;
    websiteUrl?: string;
    repository?: {
      url?: string;
      source?: string;
      subfolder?: string;
    };
    remotes?: Array<{
      type?: string;
      url?: string;
      headers?: Array<{
        name?: string;
        value?: string;
        description?: string;
      }>;
    }>;
    icons?: Array<{ src: string }>;
    tools?: unknown[];
    models?: unknown[];
    emails?: unknown[];
    analytics?: unknown;
    cdn?: unknown;
    _meta?: MCPRegistryServerMeta;
  };
  /** When the item was last updated */
  updated_at?: string | Date;
}

/** Filter item with value and count */
export interface FilterItem {
  value: string;
  count: number;
}

/** Response from COLLECTION_REGISTRY_APP_FILTERS tool */
export interface RegistryFiltersResponse {
  tags?: FilterItem[];
  categories?: FilterItem[];
}

/** Active filters state */
export interface ActiveFilters {
  tags: string[];
  categories: string[];
}
