import type { UIMessage } from "ai";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";

export type ContextItemType = "rule" | "file" | "toolset" | "resource";

export interface BaseContextItem {
  id: string;
  type: ContextItemType;
}

export interface RuleContextItem extends BaseContextItem {
  type: "rule";
  text: string;
}

// Files are difficult to store in IndexedDB if they are File objects (blobs).
// We might need to store them as metadata or ensure they are serializable.
// For now, we'll keep the interface but be aware of serialization issues.
export interface FileContextItem extends BaseContextItem {
  type: "file";
  file?: File; // Optional for persistence
  file_name?: string; // snake_case
  file_type?: string; // snake_case
  url?: string;
  status: "uploading" | "success" | "error";
  error?: string; // Error object is not serializable
}

export interface ToolsetContextItem extends BaseContextItem {
  type: "toolset";
  integration_id: string; // snake_case
  enabled_tools: string[]; // snake_case
}

export interface ResourceContextItem extends BaseContextItem {
  type: "resource";
  uri: string;
  name?: string;
  resource_type?: string; // snake_case
  icon?: string;
}

export type ContextItem =
  | RuleContextItem
  | FileContextItem
  | ToolsetContextItem
  | ResourceContextItem;

export interface Thread {
  id: string;
  title: string;
  created_at: string; // ISO string
  updated_at: string; // ISO string
  hidden?: boolean;
  virtualMcpId?: string; // Associate thread with specific virtual MCP (agent)
}

export type Message = UIMessage<Metadata>;
