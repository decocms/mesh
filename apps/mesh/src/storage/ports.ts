/**
 * Storage Port Interfaces
 *
 * These interfaces define the contracts for storage adapters.
 * Following the Ports & Adapters (Hexagonal Architecture) pattern.
 */

import type { ConnectionEntity } from "../tools/connection/schema";
import type {
  GatewayEntity,
  GatewayCreateData,
  GatewayUpdateData,
} from "../tools/gateway/schema";
import type {
  ToolCreateData,
  ToolEntity,
  ToolUpdateData,
} from "../tools/tool/schema";
import type {
  ResourceCreateData,
  ResourceEntity,
  ResourceUpdateData,
} from "../tools/resource/schema";
import type {
  PromptCreateData,
  PromptEntity,
  PromptUpdateData,
} from "../tools/prompt/schema";
import type { MonitoringLog, OrganizationSettings } from "./types";

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
}

export interface MonitoringStorage {
  log(event: MonitoringLog): Promise<void>;
  logBatch(events: MonitoringLog[]): Promise<void>;
  query(filters: {
    organizationId?: string;
    connectionId?: string;
    gatewayId?: string;
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
// Gateway Storage Port
// ============================================================================

// Re-export types from schema for convenience
export type {
  GatewayEntity,
  GatewayCreateData,
  GatewayUpdateData,
  ToolSelectionMode,
} from "../tools/gateway/schema";

export interface GatewayStoragePort {
  create(
    organizationId: string,
    userId: string,
    data: GatewayCreateData,
  ): Promise<GatewayEntity>;
  findById(id: string): Promise<GatewayEntity | null>;
  list(organizationId: string): Promise<GatewayEntity[]>;
  listByConnectionId(
    organizationId: string,
    connectionId: string,
  ): Promise<GatewayEntity[]>;
  update(
    id: string,
    userId: string,
    data: GatewayUpdateData,
  ): Promise<GatewayEntity>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Tool Storage Port
// ============================================================================

export interface ToolStoragePort {
  create(
    organizationId: string,
    userId: string,
    data: ToolCreateData,
  ): Promise<ToolEntity>;
  findById(id: string, organizationId?: string): Promise<ToolEntity | null>;
  list(organizationId: string): Promise<ToolEntity[]>;
  update(id: string, userId: string, data: ToolUpdateData): Promise<ToolEntity>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Resource Storage Port
// ============================================================================

export interface ResourceStoragePort {
  create(
    organizationId: string,
    userId: string,
    data: ResourceCreateData,
  ): Promise<ResourceEntity>;
  findById(id: string, organizationId?: string): Promise<ResourceEntity | null>;
  list(organizationId: string): Promise<ResourceEntity[]>;
  update(
    id: string,
    userId: string,
    data: ResourceUpdateData,
  ): Promise<ResourceEntity>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Prompt Storage Port
// ============================================================================

export interface PromptStoragePort {
  create(
    organizationId: string,
    userId: string,
    data: PromptCreateData,
  ): Promise<PromptEntity>;
  findById(id: string, organizationId?: string): Promise<PromptEntity | null>;
  list(organizationId: string): Promise<PromptEntity[]>;
  update(
    id: string,
    userId: string,
    data: PromptUpdateData,
  ): Promise<PromptEntity>;
  delete(id: string): Promise<void>;
}
