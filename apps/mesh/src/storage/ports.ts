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
  list(
    organizationId: string,
    options?: { includeVirtual?: boolean },
  ): Promise<ConnectionEntity[]>;
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

import type {
  VirtualToolEntity,
  VirtualToolCreateData,
  VirtualToolUpdateData,
} from "../tools/virtual-tool/schema";

// Re-export virtual tool types
export type { VirtualToolEntity, VirtualToolCreateData, VirtualToolUpdateData };

export interface VirtualMCPStoragePort {
  create(
    organizationId: string,
    userId: string,
    data: VirtualMCPCreateData,
  ): Promise<VirtualMCPEntity>;
  findById(
    id: string | null,
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

  // Virtual Tool CRUD methods
  listVirtualTools(virtualMcpId: string): Promise<VirtualToolEntity[]>;
  getVirtualTool(
    virtualMcpId: string,
    toolName: string,
  ): Promise<VirtualToolEntity | null>;
  createVirtualTool(
    virtualMcpId: string,
    data: VirtualToolCreateData,
    connectionDependencies: string[],
  ): Promise<VirtualToolEntity>;
  updateVirtualTool(
    virtualMcpId: string,
    toolName: string,
    data: VirtualToolUpdateData,
    connectionDependencies?: string[],
  ): Promise<VirtualToolEntity>;
  deleteVirtualTool(virtualMcpId: string, toolName: string): Promise<void>;

  // Indirect dependency management
  syncIndirectDependencies(
    virtualMcpId: string,
    connectionIds: string[],
  ): Promise<void>;
}
