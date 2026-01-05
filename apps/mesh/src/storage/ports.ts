/**
 * Storage Port Interfaces
 *
 * These interfaces define the contracts for storage adapters.
 * Following the Ports & Adapters (Hexagonal Architecture) pattern.
 */

import type { ConnectionEntity } from "../tools/connection/schema";
import type {
  Folder,
  Gateway,
  GatewayWithConnections,
  MonitoringLog,
  OrganizationSettings,
} from "./types";

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
    data?: Partial<Pick<OrganizationSettings, "sidebar_items">>,
  ): Promise<OrganizationSettings>;
}

// ============================================================================
// Monitoring Storage Interface
// ============================================================================

export interface MonitoringStorage {
  log(event: MonitoringLog): Promise<void>;
  logBatch(events: MonitoringLog[]): Promise<void>;
  query(filters: {
    organizationId?: string;
    connectionId?: string;
    toolName?: string;
    isError?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
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

/**
 * Data for creating a gateway
 */
export interface GatewayCreateData {
  title: string;
  description?: string | null;
  toolSelectionStrategy?: Gateway["toolSelectionStrategy"];
  toolSelectionMode?: Gateway["toolSelectionMode"];
  icon?: string | null;
  status?: Gateway["status"];
  isDefault?: boolean;
  folderId?: string | null;
  connections: Array<{
    connectionId: string;
    selectedTools?: string[] | null;
    selectedResources?: string[] | null;
    selectedPrompts?: string[] | null;
  }>;
}

/**
 * Data for updating a gateway
 */
export interface GatewayUpdateData {
  title?: string;
  description?: string | null;
  toolSelectionStrategy?: Gateway["toolSelectionStrategy"];
  toolSelectionMode?: Gateway["toolSelectionMode"];
  icon?: string | null;
  status?: Gateway["status"];
  isDefault?: boolean;
  folderId?: string | null;
  connections?: Array<{
    connectionId: string;
    selectedTools?: string[] | null;
    selectedResources?: string[] | null;
    selectedPrompts?: string[] | null;
  }>;
}

export interface GatewayStoragePort {
  create(
    organizationId: string,
    userId: string,
    data: GatewayCreateData,
  ): Promise<GatewayWithConnections>;
  findById(id: string): Promise<GatewayWithConnections | null>;
  list(organizationId: string): Promise<GatewayWithConnections[]>;
  listByConnectionId(
    organizationId: string,
    connectionId: string,
  ): Promise<GatewayWithConnections[]>;
  update(
    id: string,
    userId: string,
    data: GatewayUpdateData,
  ): Promise<GatewayWithConnections>;
  delete(id: string): Promise<void>;
  getDefaultByOrgId(
    organizationId: string,
  ): Promise<GatewayWithConnections | null>;
  getDefaultByOrgSlug(orgSlug: string): Promise<GatewayWithConnections | null>;
  setDefault(
    gatewayId: string,
    userId: string,
  ): Promise<GatewayWithConnections>;
}

// ============================================================================
// Folder Storage Port
// ============================================================================

import type { FolderType } from "./types";

/**
 * Data for creating a folder
 */
export interface FolderCreateData {
  type: FolderType;
  title: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
}

/**
 * Data for updating a folder
 */
export interface FolderUpdateData {
  title?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
}

export interface FolderStoragePort {
  create(
    organizationId: string,
    userId: string,
    data: FolderCreateData,
  ): Promise<Folder>;
  findById(id: string): Promise<Folder | null>;
  list(organizationId: string, type: FolderType): Promise<Folder[]>;
  update(id: string, data: FolderUpdateData): Promise<Folder>;
  delete(id: string): Promise<void>;
}
