/**
 * Virtual MCP Storage Implementation
 *
 * Handles CRUD operations for Virtual MCPs using Kysely (database-agnostic).
 * Virtual MCPs aggregate tools from multiple connections with selective tool exposure.
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

/** Raw database row type for virtual_mcps */
type RawVirtualMCPRow = {
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

/** Raw database row type for virtual_mcp_connections */
type RawVirtualMCPConnectionRow = {
  id: string;
  virtual_mcp_id: string;
  connection_id: string;
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
    const id = generatePrefixedId("vmcp");
    const now = new Date().toISOString();

    // Insert virtual MCP
    await this.db
      .insertInto("virtual_mcps")
      .values({
        id,
        organization_id: organizationId,
        title: data.title,
        description: data.description ?? null,
        tool_selection_mode: data.tool_selection_mode ?? "inclusion",
        icon: data.icon ?? null,
        status: data.status ?? "active",
        created_at: now,
        updated_at: now,
        created_by: userId,
        updated_by: null,
      })
      .execute();

    // Insert virtual MCP connections
    if (data.connections.length > 0) {
      await this.db
        .insertInto("virtual_mcp_connections")
        .values(
          data.connections.map((conn) => ({
            id: generatePrefixedId("vmcpc"),
            virtual_mcp_id: id,
            connection_id: conn.connection_id,
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
      .selectFrom("virtual_mcps")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    const connectionRows = await db
      .selectFrom("virtual_mcp_connections")
      .selectAll()
      .where("virtual_mcp_id", "=", id)
      .execute();

    return this.deserializeVirtualMCPEntity(
      row as unknown as RawVirtualMCPRow,
      connectionRows as RawVirtualMCPConnectionRow[],
    );
  }

  async list(organizationId: string): Promise<VirtualMCPEntity[]> {
    const rows = await this.db
      .selectFrom("virtual_mcps")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .execute();

    const virtualMcpIds = rows.map((r) => r.id);

    if (virtualMcpIds.length === 0) {
      return [];
    }

    // Fetch all connections for all virtual MCPs in one query
    const connectionRows = await this.db
      .selectFrom("virtual_mcp_connections")
      .selectAll()
      .where("virtual_mcp_id", "in", virtualMcpIds)
      .execute();

    // Group connections by virtual_mcp_id
    const connectionsByVirtualMcp = new Map<
      string,
      RawVirtualMCPConnectionRow[]
    >();
    for (const conn of connectionRows as RawVirtualMCPConnectionRow[]) {
      const existing = connectionsByVirtualMcp.get(conn.virtual_mcp_id) ?? [];
      existing.push(conn);
      connectionsByVirtualMcp.set(conn.virtual_mcp_id, existing);
    }

    return rows.map((row) =>
      this.deserializeVirtualMCPEntity(
        row as unknown as RawVirtualMCPRow,
        connectionsByVirtualMcp.get(row.id) ?? [],
      ),
    );
  }

  async listByConnectionId(
    organizationId: string,
    connectionId: string,
  ): Promise<VirtualMCPEntity[]> {
    // Find virtual MCP IDs that include this connection
    const virtualMcpConnectionRows = await this.db
      .selectFrom("virtual_mcp_connections")
      .select("virtual_mcp_id")
      .where("connection_id", "=", connectionId)
      .execute();

    const virtualMcpIds = virtualMcpConnectionRows.map((r) => r.virtual_mcp_id);

    if (virtualMcpIds.length === 0) {
      return [];
    }

    // Fetch the virtual MCPs (filtered by organization)
    const rows = await this.db
      .selectFrom("virtual_mcps")
      .selectAll()
      .where("id", "in", virtualMcpIds)
      .where("organization_id", "=", organizationId)
      .execute();

    if (rows.length === 0) {
      return [];
    }

    const resultVirtualMcpIds = rows.map((r) => r.id);

    // Fetch all connections for these virtual MCPs
    const connectionRows = await this.db
      .selectFrom("virtual_mcp_connections")
      .selectAll()
      .where("virtual_mcp_id", "in", resultVirtualMcpIds)
      .execute();

    // Group connections by virtual_mcp_id
    const connectionsByVirtualMcp = new Map<
      string,
      RawVirtualMCPConnectionRow[]
    >();
    for (const conn of connectionRows as RawVirtualMCPConnectionRow[]) {
      const existing = connectionsByVirtualMcp.get(conn.virtual_mcp_id) ?? [];
      existing.push(conn);
      connectionsByVirtualMcp.set(conn.virtual_mcp_id, existing);
    }

    return rows.map((row) =>
      this.deserializeVirtualMCPEntity(
        row as RawVirtualMCPRow,
        connectionsByVirtualMcp.get(row.id) ?? [],
      ),
    );
  }

  async update(
    id: string,
    userId: string,
    data: VirtualMCPUpdateData,
  ): Promise<VirtualMCPEntity> {
    const now = new Date().toISOString();

    // Build update object for virtual_mcps table
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
    if (data.tool_selection_mode !== undefined) {
      updateData.tool_selection_mode = data.tool_selection_mode;
    }
    if (data.icon !== undefined) {
      updateData.icon = data.icon;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    await this.db
      .updateTable("virtual_mcps")
      .set(updateData)
      .where("id", "=", id)
      .execute();

    // Update connections if provided
    if (data.connections !== undefined) {
      await this.db
        .deleteFrom("virtual_mcp_connections")
        .where("virtual_mcp_id", "=", id)
        .execute();

      if (data.connections.length > 0) {
        await this.db
          .insertInto("virtual_mcp_connections")
          .values(
            data.connections.map((conn) => ({
              id: generatePrefixedId("vmcpc"),
              virtual_mcp_id: id,
              connection_id: conn.connection_id,
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
    // Connections are deleted automatically due to CASCADE DELETE
    await this.db.deleteFrom("virtual_mcps").where("id", "=", id).execute();
  }

  /**
   * Deserialize virtual MCP row with connections to VirtualMCPEntity (snake_case)
   */
  private deserializeVirtualMCPEntity(
    row: RawVirtualMCPRow,
    connectionRows: RawVirtualMCPConnectionRow[],
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

    return {
      id: row.id,
      organization_id: row.organization_id,
      title: row.title,
      description: row.description,
      tool_selection_mode: this.parseToolSelectionMode(row.tool_selection_mode),
      icon: row.icon,
      status: row.status,
      created_at: createdAt,
      updated_at: updatedAt,
      created_by: row.created_by,
      updated_by: row.updated_by ?? undefined,
      connections: connectionRows.map((conn) => ({
        connection_id: conn.connection_id,
        selected_tools: this.parseJson<string[]>(conn.selected_tools),
        selected_resources: this.parseJson<string[]>(conn.selected_resources),
        selected_prompts: this.parseJson<string[]>(conn.selected_prompts),
      })),
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

// Backward compatibility alias
/** @deprecated Use VirtualMCPStorage instead */
export { VirtualMCPStorage as GatewayStorage };
