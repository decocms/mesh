import type { RegistryItem } from "@/web/components/store/types";

/**
 * Protocol types for MCP connections
 */
export type Protocol = "http" | "sse" | "stdio";

/**
 * Remote type from RegistryItem server.remotes
 */
export type Remote = NonNullable<RegistryItem["server"]["remotes"]>[number];

/**
 * Unified server entry that can be either a remote or a package
 */
export interface UnifiedServerEntry {
  type?: string;
  url?: string;
  name?: string;
  title?: string;
  description?: string;
  /** Source type: 'remote' for HTTP/SSE remotes, 'package' for STDIO packages */
  _type: "remote" | "package";
  /** Original index in the source array (remotes or packages) */
  _index: number;
}

/**
 * Data for a server card in the servers list
 */
export interface ServerCardData {
  /** Index in the unified servers array */
  index: number;
  /** Connection protocol */
  protocol: Protocol;
  /** Remote URL */
  url?: string;
  /** Hostname extracted from URL */
  hostname: string;
  /** Service name extracted from subdomain */
  serviceName: string;
  /** Friendly display name */
  displayName: string;
  /** Original remote name */
  name?: string;
  /** Original remote title */
  title?: string;
  /** Original remote description */
  description?: string;
  /** Source type: 'remote' for HTTP/SSE remotes, 'package' for STDIO packages */
  _type: "remote" | "package";
  /** Original index in the source array (remotes or packages) */
  _index: number;
}

/**
 * Protocol filter options
 */
export interface ProtocolFilterOption {
  value: Protocol | "all";
  label: string;
}

export interface MCPServerData {
  name: string;
  description: string;
  shortDescription: string | null;
  icon: string | null;
  verified?: boolean;
  publisher: string;
  version: string | null;
  websiteUrl: string | null;
  repository: { url?: string; source?: string; subfolder?: string } | null;
  schemaVersion: string | null;
  connectionType: string | null;
  connectionUrl: string | null;
  remoteUrl: string | null;
  tags: string[];
  categories: string[];
  tools: unknown[];
  models: unknown[];
  emails: unknown[];
  analytics: unknown;
  cdn: unknown;
}

export interface PublisherInfo {
  logo?: string;
  count: number;
}

export interface TabItem {
  id: string;
  label: string;
  visible: boolean;
  count?: number;
}

export interface MCPServerDetailProps {
  data: MCPServerData;
  selectedItem: RegistryItem;
  itemVersions: RegistryItem[];
  publisherInfo: PublisherInfo;
  availableTabs: TabItem[];
  effectiveActiveTabId: string;
  effectiveTools: unknown[];
  isLoadingRemoteTools: boolean;
  isInstalling: boolean;
  onInstall: (versionIndex?: number) => void;
  onBackClick: () => void;
  onTabChange: (tabId: string) => void;
}
