/**
 * Monitoring Dashboard Storage Implementation
 *
 * Handles CRUD operations for monitoring dashboards using Kysely (database-agnostic).
 * All dashboards are organization-scoped.
 */

import type { Kysely } from "kysely";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import type {
  Database,
  DashboardFilters,
  DashboardWidget,
  MonitoringDashboard,
} from "./types";

// ============================================================================
// Dashboard Storage Port Interface
// ============================================================================

export interface MonitoringDashboardStoragePort {
  create(
    organizationId: string,
    userId: string,
    data: {
      name: string;
      description?: string;
      filters?: DashboardFilters;
      widgets: DashboardWidget[];
    },
  ): Promise<MonitoringDashboard>;

  get(id: string): Promise<MonitoringDashboard | null>;

  list(organizationId: string): Promise<MonitoringDashboard[]>;

  update(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      filters: DashboardFilters | null;
      widgets: DashboardWidget[];
    }>,
  ): Promise<MonitoringDashboard>;

  delete(id: string): Promise<void>;
}

// ============================================================================
// Dashboard Storage Implementation
// ============================================================================

export class SqlMonitoringDashboardStorage
  implements MonitoringDashboardStoragePort
{
  constructor(private db: Kysely<Database>) {}

  async create(
    organizationId: string,
    userId: string,
    data: {
      name: string;
      description?: string;
      filters?: DashboardFilters;
      widgets: DashboardWidget[];
    },
  ): Promise<MonitoringDashboard> {
    const id = generatePrefixedId("dash");
    const now = new Date().toISOString();

    await this.db
      .insertInto("monitoring_dashboards")
      .values({
        id,
        organization_id: organizationId,
        name: data.name,
        description: data.description ?? null,
        filters: data.filters ? JSON.stringify(data.filters) : null,
        widgets: JSON.stringify(data.widgets),
        created_by: userId,
        created_at: now,
        updated_at: now,
      })
      .execute();

    return {
      id,
      organizationId,
      name: data.name,
      description: data.description ?? null,
      filters: data.filters ?? null,
      widgets: data.widgets,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
  }

  async get(id: string): Promise<MonitoringDashboard | null> {
    const row = await this.db
      .selectFrom("monitoring_dashboards")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.fromDbRow(row);
  }

  async list(organizationId: string): Promise<MonitoringDashboard[]> {
    const rows = await this.db
      .selectFrom("monitoring_dashboards")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("created_at", "desc")
      .execute();

    return rows.map((row) => this.fromDbRow(row));
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      filters: DashboardFilters | null;
      widgets: DashboardWidget[];
    }>,
  ): Promise<MonitoringDashboard> {
    const now = new Date().toISOString();

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.filters !== undefined) {
      updateData.filters = data.filters ? JSON.stringify(data.filters) : null;
    }
    if (data.widgets !== undefined) {
      updateData.widgets = JSON.stringify(data.widgets);
    }

    await this.db
      .updateTable("monitoring_dashboards")
      .set(updateData)
      .where("id", "=", id)
      .execute();

    const updated = await this.get(id);
    if (!updated) {
      throw new Error(`Dashboard ${id} not found after update`);
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db
      .deleteFrom("monitoring_dashboards")
      .where("id", "=", id)
      .execute();
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private fromDbRow(row: {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    filters: string | DashboardFilters | null;
    widgets: string | DashboardWidget[];
    created_by: string;
    created_at: string | Date;
    updated_at: string | Date;
  }): MonitoringDashboard {
    const filters = row.filters
      ? typeof row.filters === "string"
        ? (JSON.parse(row.filters) as DashboardFilters)
        : row.filters
      : null;

    const widgets =
      typeof row.widgets === "string"
        ? (JSON.parse(row.widgets) as DashboardWidget[])
        : row.widgets;

    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      filters,
      widgets,
      createdBy: row.created_by,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at,
    };
  }
}
