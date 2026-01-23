/**
 * Virtual MCP Storage Implementation
 *
 * This is now a FACADE over the connections table.
 * Virtual MCPs are stored as connections with connection_type = 'VIRTUAL'.
 * The aggregations (which child connections are included) are stored in
 * the connection_aggregations table.
 */

import type { Kysely } from "kysely";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import type {
  VirtualMCPCreateData,
  VirtualMCPEntity,
  VirtualMCPStoragePort,
  VirtualMCPUpdateData,
} from "./ports";
import type { ToolSelectionMode } from "../tools/virtual-mcp/schema";
import type { Database } from "./types";

/** Raw database row type for connections (VIRTUAL type) */
type RawConnectionRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  status: "active" | "inactive" | "error";
  created_at: Date | string;
  updated_at: Date | string;
  created_by: string;
  metadata: string | null;
};

/** Raw database row type for connection_aggregations */
type RawAggregationRow = {
  id: string;
  parent_connection_id: string;
  child_connection_id: string;
  selected_tools: string | string[] | null;
  selected_resources: string | string[] | null;
  selected_prompts: string | string[] | null;
  created_at: Date | string;
};

export class VirtualMCPStorage implements VirtualMCPStoragePort {
  constructor(private db: Kysely<Database>) {}

  async create(
    organizationId: string,
    userId: string,
    data: VirtualMCPCreateData,
  ): Promise<VirtualMCPEntity> {
    const id = generatePrefixedId("vir");
    const now = new Date().toISOString();

    // Insert as a VIRTUAL connection
    await this.db
      .insertInto("connections")
      .values({
        id,
        organization_id: organizationId,
        created_by: userId,
        title: data.title,
        description: data.description ?? null,
        icon: data.icon ?? null,
        app_name: null,
        app_id: null,
        connection_type: "VIRTUAL",
        connection_url: `virtual://${id}`,
        connection_token: null,
        connection_headers: null,
        oauth_config: null,
        configuration_state: null,
        configuration_scopes: null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        tools: null,
        bindings: null,
        status: data.status ?? "active",
        created_at: now,
        updated_at: now,
      })
      .execute();

    // Insert connection aggregations
    if (data.connections.length > 0) {
      await this.db
        .insertInto("connection_aggregations")
        .values(
          data.connections.map((conn) => ({
            id: generatePrefixedId("agg"),
            parent_connection_id: id,
            child_connection_id: conn.connection_id,
            selected_tools: conn.selected_tools
              ? JSON.stringify(conn.selected_tools)
              : null,
            selected_resources: conn.selected_resources
              ? JSON.stringify(conn.selected_resources)
              : null,
            selected_prompts: conn.selected_prompts
              ? JSON.stringify(conn.selected_prompts)
              : null,
            created_at: now,
          })),
        )
        .execute();
    }

    const virtualMcp = await this.findById(id);
    if (!virtualMcp) {
      throw new Error(`Failed to create virtual MCP with id: ${id}`);
    }

    return virtualMcp;
  }

  async findById(id: string): Promise<VirtualMCPEntity | null> {
    return this.findByIdInternal(this.db, id);
  }

  private async findByIdInternal(
    db: Kysely<Database>,
    id: string,
  ): Promise<VirtualMCPEntity | null> {
    const row = await db
      .selectFrom("connections")
      .selectAll()
      .where("id", "=", id)
      .where("connection_type", "=", "VIRTUAL")
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    const aggregationRows = await db
      .selectFrom("connection_aggregations")
      .selectAll()
      .where("parent_connection_id", "=", id)
      .execute();

    return this.deserializeVirtualMCPEntity(
      row as unknown as RawConnectionRow,
      aggregationRows as RawAggregationRow[],
    );
  }

  async list(organizationId: string): Promise<VirtualMCPEntity[]> {
    const rows = await this.db
      .selectFrom("connections")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("connection_type", "=", "VIRTUAL")
      .execute();

    const virtualMcpIds = rows.map((r) => r.id);

    if (virtualMcpIds.length === 0) {
      return [];
    }

    // Fetch all aggregations for all virtual MCPs in one query
    const aggregationRows = await this.db
      .selectFrom("connection_aggregations")
      .selectAll()
      .where("parent_connection_id", "in", virtualMcpIds)
      .execute();

    // Group aggregations by parent_connection_id
    const aggregationsByParent = new Map<string, RawAggregationRow[]>();
    for (const agg of aggregationRows as RawAggregationRow[]) {
      const existing = aggregationsByParent.get(agg.parent_connection_id) ?? [];
      existing.push(agg);
      aggregationsByParent.set(agg.parent_connection_id, existing);
    }

    return rows.map((row) =>
      this.deserializeVirtualMCPEntity(
        row as unknown as RawConnectionRow,
        aggregationsByParent.get(row.id) ?? [],
      ),
    );
  }

  async listByConnectionId(
    organizationId: string,
    connectionId: string,
  ): Promise<VirtualMCPEntity[]> {
    // Find virtual MCP IDs that include this connection as a child
    const aggregationRows = await this.db
      .selectFrom("connection_aggregations")
      .select("parent_connection_id")
      .where("child_connection_id", "=", connectionId)
      .execute();

    const virtualMcpIds = aggregationRows.map((r) => r.parent_connection_id);

    if (virtualMcpIds.length === 0) {
      return [];
    }

    // Fetch the virtual MCPs (filtered by organization and VIRTUAL type)
    const rows = await this.db
      .selectFrom("connections")
      .selectAll()
      .where("id", "in", virtualMcpIds)
      .where("organization_id", "=", organizationId)
      .where("connection_type", "=", "VIRTUAL")
      .execute();

    if (rows.length === 0) {
      return [];
    }

    const resultVirtualMcpIds = rows.map((r) => r.id);

    // Fetch all aggregations for these virtual MCPs
    const allAggregationRows = await this.db
      .selectFrom("connection_aggregations")
      .selectAll()
      .where("parent_connection_id", "in", resultVirtualMcpIds)
      .execute();

    // Group aggregations by parent_connection_id
    const aggregationsByParent = new Map<string, RawAggregationRow[]>();
    for (const agg of allAggregationRows as RawAggregationRow[]) {
      const existing = aggregationsByParent.get(agg.parent_connection_id) ?? [];
      existing.push(agg);
      aggregationsByParent.set(agg.parent_connection_id, existing);
    }

    return rows.map((row) =>
      this.deserializeVirtualMCPEntity(
        row as RawConnectionRow,
        aggregationsByParent.get(row.id) ?? [],
      ),
    );
  }

  async update(
    id: string,
    _userId: string,
    data: VirtualMCPUpdateData,
  ): Promise<VirtualMCPEntity> {
    const now = new Date().toISOString();

    // Build update object for connections table
    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.icon !== undefined) {
      updateData.icon = data.icon;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.metadata !== undefined) {
      updateData.metadata = data.metadata ? JSON.stringify(data.metadata) : null;
    }
    // Note: tool_selection_mode is no longer stored in DB, ignored

    // Update the connection
    await this.db
      .updateTable("connections")
      .set(updateData)
      .where("id", "=", id)
      .where("connection_type", "=", "VIRTUAL")
      .execute();

    // Update aggregations if provided
    if (data.connections !== undefined) {
      await this.db
        .deleteFrom("connection_aggregations")
        .where("parent_connection_id", "=", id)
        .execute();

      if (data.connections.length > 0) {
        await this.db
          .insertInto("connection_aggregations")
          .values(
            data.connections.map((conn) => ({
              id: generatePrefixedId("agg"),
              parent_connection_id: id,
              child_connection_id: conn.connection_id,
              selected_tools: conn.selected_tools
                ? JSON.stringify(conn.selected_tools)
                : null,
              selected_resources: conn.selected_resources
                ? JSON.stringify(conn.selected_resources)
                : null,
              selected_prompts: conn.selected_prompts
                ? JSON.stringify(conn.selected_prompts)
                : null,
              created_at: now,
            })),
          )
          .execute();
      }
    }

    const virtualMcp = await this.findById(id);
    if (!virtualMcp) {
      throw new Error("Virtual MCP not found after update");
    }

    return virtualMcp;
  }

  async delete(id: string): Promise<void> {
    // First delete aggregations (no cascade since it's a different relationship)
    await this.db
      .deleteFrom("connection_aggregations")
      .where("parent_connection_id", "=", id)
      .execute();

    // Then delete the connection
    await this.db
      .deleteFrom("connections")
      .where("id", "=", id)
      .where("connection_type", "=", "VIRTUAL")
      .execute();
  }

  /**
   * Deserialize connection row with aggregations to VirtualMCPEntity
   */
  private deserializeVirtualMCPEntity(
    row: RawConnectionRow,
    aggregationRows: RawAggregationRow[],
  ): VirtualMCPEntity {
    // Convert Date to ISO string if needed
    const createdAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at;
    const updatedAt =
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at;

    // Map status - connections can have 'error' but VirtualMCPEntity only has 'active' | 'inactive'
    const status: "active" | "inactive" =
      row.status === "active" ? "active" : "inactive";

    return {
      id: row.id,
      organization_id: row.organization_id,
      title: row.title,
      description: row.description,
      // tool_selection_mode is no longer stored - always default to inclusion
      tool_selection_mode: "inclusion" as ToolSelectionMode,
      icon: row.icon,
      status,
      created_at: createdAt,
      updated_at: updatedAt,
      created_by: row.created_by,
      updated_by: undefined, // connections table doesn't have updated_by
      metadata: this.parseJson<{ instructions?: string }>(row.metadata),
      connections: aggregationRows.map((agg) => ({
        connection_id: agg.child_connection_id,
        selected_tools: this.parseJson<string[]>(agg.selected_tools),
        selected_resources: this.parseJson<string[]>(agg.selected_resources),
        selected_prompts: this.parseJson<string[]>(agg.selected_prompts),
      })),
    };
  }

  /**
   * Parse JSON value safely
   */
  private parseJson<T>(value: string | T | null): T | null {
    if (value === null) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    }
    return value as T;
  }
}
