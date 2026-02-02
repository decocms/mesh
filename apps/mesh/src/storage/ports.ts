/**
 * Storage Port Interfaces
 *
 * These interfaces define the contracts for storage adapters.
 * Following the Ports & Adapters (Hexagonal Architecture) pattern.
 */

import type { ConnectionEntity } from "../tools/connection/schema";
import type {
  VirtualMCPEntity,
  VirtualMCPCreateData,
  VirtualMCPUpdateData,
} from "../tools/virtual/schema";
import type {
  MonitoringLog,
  OrganizationSettings,
  OrganizationTag,
  Thread,
  ThreadMessage,
} from "./types";

export interface ThreadStoragePort {
  create(data: Partial<Thread>): Promise<Thread>;
  get(id: string): Promise<Thread | null>;
  update(id: string, data: Partial<Thread>): Promise<Thread>;
  delete(id: string): Promise<void>;
  list(
    organizationId: string,
    createdBy?: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ threads: Thread[]; total: number }>;
  // Message operations
  saveMessages(data: ThreadMessage[]): Promise<void>;
  listMessages(
    threadId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ messages: ThreadMessage[]; total: number }>;
}

// ============================================================================
// Connection Storage Port
// ============================================================================

export interface ConnectionStoragePort {
  create(data: Partial<ConnectionEntity>): Promise<ConnectionEntity>;
  findById(id: string): Promise<ConnectionEntity | null>;
  list(organizationId: string): Promise<ConnectionEntity[]>;
  update(
    id: string,
    data: Partial<ConnectionEntity>,
  ): Promise<ConnectionEntity>;
  delete(id: string): Promise<void>;
  testConnection(
    id: string,
    headers?: Record<string, string>,
  ): Promise<{ healthy: boolean; latencyMs: number }>;
}

// ============================================================================
// Organization Settings Storage Port
// ============================================================================

export interface OrganizationSettingsStoragePort {
  get(organizationId: string): Promise<OrganizationSettings | null>;
  upsert(
    organizationId: string,
    data?: Partial<
      Pick<OrganizationSettings, "sidebar_items" | "enabled_plugins">
    >,
  ): Promise<OrganizationSettings>;
}

// ============================================================================
// Monitoring Storage Interface
// ============================================================================

/**
 * Property filter options for querying monitoring logs
 */
export interface PropertyFilters {
  /** Exact match: filter logs where property key equals value */
  properties?: Record<string, string>;
  /** Exists: filter logs that have these property keys */
  propertyKeys?: string[];
  /** Pattern match: filter logs where property value matches pattern (SQL LIKE) */
  propertyPatterns?: Record<string, string>;
  /** In match: filter logs where property value (comma-separated) contains the specified value */
  propertyInValues?: Record<string, string>;
}

export interface MonitoringStorage {
  log(event: MonitoringLog): Promise<void>;
  logBatch(events: MonitoringLog[]): Promise<void>;
  query(filters: {
    organizationId?: string;
    connectionId?: string;
    virtualMcpId?: string;
    toolName?: string;
    isError?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    propertyFilters?: PropertyFilters;
  }): Promise<{ logs: MonitoringLog[]; total: number }>;
  getStats(filters: {
    organizationId: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    totalCalls: number;
    errorRate: number;
    avgDurationMs: number;
  }>;
}

// ============================================================================
// Virtual MCP Storage Port
// ============================================================================

// Re-export types from schema for convenience
export type {
  VirtualMCPEntity,
  VirtualMCPCreateData,
  VirtualMCPUpdateData,
} from "../tools/virtual/schema";

export interface VirtualMCPStoragePort {
  create(
    organizationId: string,
    userId: string,
    data: VirtualMCPCreateData,
  ): Promise<VirtualMCPEntity>;
  findById(
    id: string,
    organizationId?: string,
  ): Promise<VirtualMCPEntity | null>;
  list(organizationId: string): Promise<VirtualMCPEntity[]>;
  listByConnectionId(
    organizationId: string,
    connectionId: string,
  ): Promise<VirtualMCPEntity[]>;
  update(
    id: string,
    userId: string,
    data: VirtualMCPUpdateData,
  ): Promise<VirtualMCPEntity>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Tag Storage Port
// ============================================================================

export interface TagStoragePort {
  // Organization tags
  listOrgTags(organizationId: string): Promise<OrganizationTag[]>;
  getTag(tagId: string): Promise<OrganizationTag | null>;
  getTagByName(
    organizationId: string,
    name: string,
  ): Promise<OrganizationTag | null>;
  createTag(organizationId: string, name: string): Promise<OrganizationTag>;
  deleteTag(tagId: string): Promise<void>;

  // Member tags
  getMemberTags(memberId: string): Promise<OrganizationTag[]>;
  setMemberTags(memberId: string, tagIds: string[]): Promise<void>;
  addMemberTag(memberId: string, tagId: string): Promise<void>;
  removeMemberTag(memberId: string, tagId: string): Promise<void>;

  // Bulk operations for monitoring
  getUserTagsInOrg(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationTag[]>;
  getMembersWithTags(organizationId: string): Promise<Map<string, string[]>>;
}
