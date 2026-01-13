/**
 * Gateway Storage Implementation
 *
 * Handles CRUD operations for MCP virtual gateways using Kysely (database-agnostic).
 * Gateways aggregate tools from multiple connections with selective tool exposure.
 */

import type { Kysely } from "kysely";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import type {
  GatewayCreateData,
  GatewayStoragePort,
  GatewayUpdateData,
} from "./ports";
import type {
  Database,
  Gateway,
  GatewayWithConnections,
  ToolSelectionMode,
} from "./types";

/** Raw database row type for gateways */
type RawGatewayRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  tool_selection_mode: ToolSelectionMode | string;
  icon: string | null;
  status: "active" | "inactive";
  created_at: Date | string;
  updated_at: Date | string;
  created_by: string;
  updated_by: string | null;
};

/** Raw database row type for gateway_connections */
type RawGatewayConnectionRow = {
  id: string;
  gateway_id: string;
  connection_id: string;
  selected_tools: string | string[] | null;
  selected_resources: string | string[] | null;
  selected_prompts: string | string[] | null;
  created_at: Date | string;
};

export class GatewayStorage implements GatewayStoragePort {
  constructor(private db: Kysely<Database>) {}

  async create(
    organizationId: string,
    userId: string,
    data: GatewayCreateData,
  ): Promise<GatewayWithConnections> {
    const id = generatePrefixedId("gw");
    const now = new Date().toISOString();

    // Insert gateway
    await this.db
      .insertInto("gateways")
      .values({
        id,
        organization_id: organizationId,
        title: data.title,
        description: data.description ?? null,
        tool_selection_mode: data.toolSelectionMode ?? "inclusion",
        icon: data.icon ?? null,
        status: data.status ?? "active",
        created_at: now,
        updated_at: now,
        created_by: userId,
        updated_by: null,
      })
      .execute();

    // Insert gateway connections
    if (data.connections.length > 0) {
      await this.db
        .insertInto("gateway_connections")
        .values(
          data.connections.map((conn) => ({
            id: generatePrefixedId("gwc"),
            gateway_id: id,
            connection_id: conn.connectionId,
            selected_tools: conn.selectedTools
              ? JSON.stringify(conn.selectedTools)
              : null,
            selected_resources: conn.selectedResources
              ? JSON.stringify(conn.selectedResources)
              : null,
            selected_prompts: conn.selectedPrompts
              ? JSON.stringify(conn.selectedPrompts)
              : null,
            created_at: now,
          })),
        )
        .execute();
    }

    const gateway = await this.findById(id);
    if (!gateway) {
      throw new Error(`Failed to create gateway with id: ${id}`);
    }

    return gateway;
  }

  async findById(id: string): Promise<GatewayWithConnections | null> {
    return this.findByIdInternal(this.db, id);
  }

  private async findByIdInternal(
    db: Kysely<Database>,
    id: string,
  ): Promise<GatewayWithConnections | null> {
    const row = await db
      .selectFrom("gateways")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    const connectionRows = await db
      .selectFrom("gateway_connections")
      .selectAll()
      .where("gateway_id", "=", id)
      .execute();

    return this.deserializeGatewayWithConnections(
      row as unknown as RawGatewayRow,
      connectionRows as RawGatewayConnectionRow[],
    );
  }

  async list(organizationId: string): Promise<GatewayWithConnections[]> {
    const rows = await this.db
      .selectFrom("gateways")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .execute();

    const gatewayIds = rows.map((r) => r.id);

    if (gatewayIds.length === 0) {
      return [];
    }

    // Fetch all connections for all gateways in one query
    const connectionRows = await this.db
      .selectFrom("gateway_connections")
      .selectAll()
      .where("gateway_id", "in", gatewayIds)
      .execute();

    // Group connections by gateway_id
    const connectionsByGateway = new Map<string, RawGatewayConnectionRow[]>();
    for (const conn of connectionRows as RawGatewayConnectionRow[]) {
      const existing = connectionsByGateway.get(conn.gateway_id) ?? [];
      existing.push(conn);
      connectionsByGateway.set(conn.gateway_id, existing);
    }

    return rows.map((row) =>
      this.deserializeGatewayWithConnections(
        row as unknown as RawGatewayRow,
        connectionsByGateway.get(row.id) ?? [],
      ),
    );
  }

  async listByConnectionId(
    organizationId: string,
    connectionId: string,
  ): Promise<GatewayWithConnections[]> {
    // Find gateway IDs that include this connection
    const gatewayConnectionRows = await this.db
      .selectFrom("gateway_connections")
      .select("gateway_id")
      .where("connection_id", "=", connectionId)
      .execute();

    const gatewayIds = gatewayConnectionRows.map((r) => r.gateway_id);

    if (gatewayIds.length === 0) {
      return [];
    }

    // Fetch the gateways (filtered by organization)
    const rows = await this.db
      .selectFrom("gateways")
      .selectAll()
      .where("id", "in", gatewayIds)
      .where("organization_id", "=", organizationId)
      .execute();

    if (rows.length === 0) {
      return [];
    }

    const resultGatewayIds = rows.map((r) => r.id);

    // Fetch all connections for these gateways
    const connectionRows = await this.db
      .selectFrom("gateway_connections")
      .selectAll()
      .where("gateway_id", "in", resultGatewayIds)
      .execute();

    // Group connections by gateway_id
    const connectionsByGateway = new Map<string, RawGatewayConnectionRow[]>();
    for (const conn of connectionRows as RawGatewayConnectionRow[]) {
      const existing = connectionsByGateway.get(conn.gateway_id) ?? [];
      existing.push(conn);
      connectionsByGateway.set(conn.gateway_id, existing);
    }

    return rows.map((row) =>
      this.deserializeGatewayWithConnections(
        row as RawGatewayRow,
        connectionsByGateway.get(row.id) ?? [],
      ),
    );
  }

  async update(
    id: string,
    userId: string,
    data: GatewayUpdateData,
  ): Promise<GatewayWithConnections> {
    const now = new Date().toISOString();

    // Build update object for gateway table
    const updateData: Record<string, unknown> = {
      updated_at: now,
      updated_by: userId,
    };

    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.toolSelectionMode !== undefined) {
      updateData.tool_selection_mode = data.toolSelectionMode;
    }
    if (data.icon !== undefined) {
      updateData.icon = data.icon;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    // Apply updates
    await this.db
      .updateTable("gateways")
      .set(updateData)
      .where("id", "=", id)
      .execute();

    // Update connections if provided
    if (data.connections !== undefined) {
      await this.db
        .deleteFrom("gateway_connections")
        .where("gateway_id", "=", id)
        .execute();

      if (data.connections.length > 0) {
        await this.db
          .insertInto("gateway_connections")
          .values(
            data.connections.map((conn) => ({
              id: generatePrefixedId("gwc"),
              gateway_id: id,
              connection_id: conn.connectionId,
              selected_tools: conn.selectedTools
                ? JSON.stringify(conn.selectedTools)
                : null,
              selected_resources: conn.selectedResources
                ? JSON.stringify(conn.selectedResources)
                : null,
              selected_prompts: conn.selectedPrompts
                ? JSON.stringify(conn.selectedPrompts)
                : null,
              created_at: now,
            })),
          )
          .execute();
      }
    }

    const gateway = await this.findById(id);
    if (!gateway) {
      throw new Error("Gateway not found after update");
    }

    return gateway;
  }

  async delete(id: string): Promise<void> {
    // Connections are deleted automatically due to CASCADE DELETE
    await this.db.deleteFrom("gateways").where("id", "=", id).execute();
  }

  /**
   * Deserialize gateway row with connections to entity
   */
  private deserializeGatewayWithConnections(
    row: RawGatewayRow,
    connectionRows: RawGatewayConnectionRow[],
  ): GatewayWithConnections {
    const gateway = this.deserializeGateway(row);

    return {
      ...gateway,
      connections: connectionRows.map((conn) => ({
        connectionId: conn.connection_id,
        selectedTools: this.parseJson<string[]>(conn.selected_tools),
        selectedResources: this.parseJson<string[]>(conn.selected_resources),
        selectedPrompts: this.parseJson<string[]>(conn.selected_prompts),
      })),
    };
  }

  /**
   * Deserialize gateway row to entity
   */
  private deserializeGateway(row: RawGatewayRow): Gateway {
    return {
      id: row.id,
      organizationId: row.organization_id,
      title: row.title,
      description: row.description,
      toolSelectionMode: this.parseToolSelectionMode(row.tool_selection_mode),
      icon: row.icon,
      status: row.status,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  /**
   * Parse tool selection mode value (inclusion/exclusion)
   */
  private parseToolSelectionMode(
    value: ToolSelectionMode | string | null,
  ): ToolSelectionMode {
    if (value === "exclusion") return "exclusion";
    // Default to inclusion for any other value (including null, "null", legacy JSON)
    return "inclusion";
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
