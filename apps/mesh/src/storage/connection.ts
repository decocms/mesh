/**
 * Connection Storage Implementation
 *
 * Handles CRUD operations for MCP connections using Kysely (database-agnostic).
 * All connections are organization-scoped.
 */

import type { Kysely, Insertable, Updateable } from "kysely";
import type { CredentialVault } from "../encryption/credential-vault";
import type { ConnectionStoragePort } from "./ports";
import type { Database } from "./types";
import type {
  ConnectionEntity,
  OAuthConfig,
  ToolDefinition,
} from "../tools/connection/schema";
import { generateConnectionId } from "@/shared/utils/generate-id";

/** JSON fields that need serialization/deserialization */
const JSON_FIELDS = [
  "connection_headers",
  "oauth_config",
  "configuration_scopes", // Added
  "metadata",
  "tools",
  "bindings",
] as const;

/** Raw database row type */
type RawConnectionRow = {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  description: string | null;
  icon: string | null;
  app_name: string | null;
  app_id: string | null;
  connection_type: "HTTP" | "SSE" | "Websocket";
  connection_url: string;
  connection_token: string | null;
  connection_headers: string | Record<string, string> | null;
  oauth_config: string | OAuthConfig | null;
  configuration_state: string | null; // Encrypted
  configuration_scopes: string | string[] | null;
  metadata: string | Record<string, unknown> | null;
  tools: string | ToolDefinition[] | null;
  bindings: string | string[] | null;
  status: "active" | "inactive" | "error";
  created_at: Date | string;
  updated_at: Date | string;
};
export class ConnectionStorage implements ConnectionStoragePort {
  constructor(
    private db: Kysely<Database>,
    private vault: CredentialVault,
  ) {}

  private isValidConnectionId(id?: string): boolean {
    if (!id) return false;
    return /^conn_[a-zA-Z0-9_-]+$/.test(id);
  }

  async create(data: Partial<ConnectionEntity>): Promise<ConnectionEntity> {
    if (data.id !== undefined && !this.isValidConnectionId(data.id)) {
      throw new Error(`Invalid connection ID format: ${data.id}.`);
    }
    const id = data.id ?? generateConnectionId();
    const now = new Date().toISOString();

    const existing = await this.findById(id);

    if (existing) {
      return this.update(id, data);
    }

    const serialized = await this.serializeConnection({
      ...data,
      id,
      status: "active",
      created_at: now,
      updated_at: now,
    });
    await this.db
      .insertInto("connections")
      .values(serialized as Insertable<Database["connections"]>)
      .execute();

    const connection = await this.findById(id);
    if (!connection) {
      throw new Error(`Failed to create connection with id: ${id}`);
    }

    return connection;
  }

  async findById(id: string): Promise<ConnectionEntity | null> {
    const row = await this.db
      .selectFrom("connections")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.deserializeConnection(row as RawConnectionRow) : null;
  }

  async list(organizationId: string): Promise<ConnectionEntity[]> {
    const rows = await this.db
      .selectFrom("connections")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .execute();

    return Promise.all(
      rows.map((row) => this.deserializeConnection(row as RawConnectionRow)),
    );
  }

  async update(
    id: string,
    data: Partial<ConnectionEntity>,
  ): Promise<ConnectionEntity> {
    if (Object.keys(data).length === 0) {
      const connection = await this.findById(id);
      if (!connection) throw new Error("Connection not found");
      return connection;
    }

    const serialized = await this.serializeConnection({
      ...data,
      updated_at: new Date().toISOString(),
    });

    await this.db
      .updateTable("connections")
      .set(serialized)
      .where("id", "=", id)
      .execute();

    const connection = await this.findById(id);
    if (!connection) {
      throw new Error("Connection not found after update");
    }

    return connection;
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("connections").where("id", "=", id).execute();
  }

  async testConnection(
    id: string,
    headers?: Record<string, string>,
  ): Promise<{ healthy: boolean; latencyMs: number }> {
    const connection = await this.findById(id);
    if (!connection) {
      throw new Error("Connection not found");
    }

    const startTime = Date.now();

    try {
      const response = await fetch(connection.connection_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(connection.connection_token && {
            Authorization: `Bearer ${connection.connection_token}`,
          }),
          ...headers,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "ping",
          id: 1,
        }),
      });

      return {
        healthy: response.ok || response.status === 404,
        latencyMs: Date.now() - startTime,
      };
    } catch {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Serialize entity data to database format
   */
  private async serializeConnection(
    data: Partial<ConnectionEntity>,
  ): Promise<Updateable<Database["connections"]>> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;

      if (key === "connection_token" && value) {
        result[key] = await this.vault.encrypt(value as string);
      } else if (key === "configuration_state" && value) {
        // Encrypt configuration state
        const stateJson = JSON.stringify(value);
        result[key] = await this.vault.encrypt(stateJson);
      } else if (JSON_FIELDS.includes(key as (typeof JSON_FIELDS)[number])) {
        result[key] = value ? JSON.stringify(value) : null;
      } else {
        result[key] = value;
      }
    }

    return result as Updateable<Database["connections"]>;
  }

  /**
   * Deserialize database row to entity
   */
  private async deserializeConnection(
    row: RawConnectionRow,
  ): Promise<ConnectionEntity> {
    let decryptedToken: string | null = null;
    if (row.connection_token) {
      try {
        decryptedToken = await this.vault.decrypt(row.connection_token);
      } catch (error) {
        console.error("Failed to decrypt connection token:", error);
      }
    }

    // Decrypt configuration state
    let decryptedConfigState: Record<string, unknown> | null = null;
    if (row.configuration_state) {
      try {
        const decryptedJson = await this.vault.decrypt(row.configuration_state);
        decryptedConfigState = JSON.parse(decryptedJson);
      } catch (error) {
        console.error("Failed to decrypt configuration state:", error);
      }
    }

    const parseJson = <T>(value: string | T | null): T | null => {
      if (value === null) return null;
      if (typeof value === "string") {
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      }
      return value as T;
    };

    return {
      id: row.id,
      organization_id: row.organization_id,
      created_by: row.created_by,
      title: row.title,
      description: row.description,
      icon: row.icon,
      app_name: row.app_name,
      app_id: row.app_id,
      connection_type: row.connection_type,
      connection_url: row.connection_url,
      connection_token: decryptedToken,
      connection_headers: parseJson<Record<string, string>>(
        row.connection_headers,
      ),
      oauth_config: parseJson<OAuthConfig>(row.oauth_config),
      configuration_state: decryptedConfigState,
      configuration_scopes: parseJson<string[]>(row.configuration_scopes),
      metadata: parseJson<Record<string, unknown>>(row.metadata),
      tools: parseJson<ToolDefinition[]>(row.tools),
      bindings: parseJson<string[]>(row.bindings),
      status: row.status,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
