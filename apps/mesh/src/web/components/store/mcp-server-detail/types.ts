import type { RegistryItem } from "@/web/components/store/types";

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

