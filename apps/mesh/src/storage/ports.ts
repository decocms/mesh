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
    options?: { limit?: number; offset?: number },
  ): Promise<{ threads: Thread[]; total: number }>;
  listByUserId(userId: string): Promise<{ threads: Thread[]; total: number }>;
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
