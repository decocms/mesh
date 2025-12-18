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
  GatewayMode,
  GatewayWithConnections,
} from "./types";

/** Raw database row type for gateways */
type RawGatewayRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  mode: string | GatewayMode;
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

    // Insert the gateway
    await this.db
      .insertInto("gateways")
      .values({
        id,
        organization_id: organizationId,
        title: data.title,
        description: data.description ?? null,
        mode: JSON.stringify(data.mode ?? { type: "deduplicate" }),
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
    const row = await this.db
      .selectFrom("gateways")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    const connectionRows = await this.db
      .selectFrom("gateway_connections")
      .selectAll()
      .where("gateway_id", "=", id)
      .execute();

    return this.deserializeGatewayWithConnections(
      row as RawGatewayRow,
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
    if (data.mode !== undefined) {
      updateData.mode = JSON.stringify(data.mode);
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    await this.db
      .updateTable("gateways")
      .set(updateData)
      .where("id", "=", id)
      .execute();

    // Update connections if provided
    if (data.connections !== undefined) {
      // Delete existing connections
      await this.db
        .deleteFrom("gateway_connections")
        .where("gateway_id", "=", id)
        .execute();

      // Insert new connections
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
      mode: this.parseJson<GatewayMode>(row.mode) ?? { type: "deduplicate" },
      status: row.status,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
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
