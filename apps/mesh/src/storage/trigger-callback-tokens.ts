/**
 * Trigger Callback Tokens Storage
 *
 * Manages opaque callback tokens that external MCPs use to authenticate
 * trigger callbacks to Mesh. Tokens are stored as SHA-256 hashes;
 * plaintext is only returned once at creation time.
 */

import type { Kysely } from "kysely";
import type { Database } from "./types";

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface TriggerCallbackTokenStorage {
  /**
   * Create or rotate a callback token for a connection+organization pair.
   * Returns the plaintext token (only available at creation time).
   */
  createOrRotateToken(
    organizationId: string,
    connectionId: string,
  ): Promise<string>;

  /**
   * Validate a callback token.
   * Returns connection and org context if valid, null otherwise.
   */
  validateToken(
    token: string,
  ): Promise<{ organizationId: string; connectionId: string } | null>;

  /**
   * Delete callback token for a connection+organization pair.
   */
  deleteByConnection(
    connectionId: string,
    organizationId: string,
  ): Promise<void>;
}

export class KyselyTriggerCallbackTokenStorage
  implements TriggerCallbackTokenStorage
{
  constructor(private db: Kysely<Database>) {}

  async createOrRotateToken(
    organizationId: string,
    connectionId: string,
  ): Promise<string> {
    const plaintext = generateToken();
    const tokenHash = await hashToken(plaintext);
    const id = crypto.randomUUID();

    // Delete existing token for this connection+org, then insert new one
    await this.db
      .deleteFrom("trigger_callback_tokens")
      .where("connection_id", "=", connectionId)
      .where("organization_id", "=", organizationId)
      .execute();

    await this.db
      .insertInto("trigger_callback_tokens")
      .values({
        id,
        organization_id: organizationId,
        connection_id: connectionId,
        token_hash: tokenHash,
        created_at: new Date().toISOString(),
      })
      .execute();

    return plaintext;
  }

  async validateToken(
    token: string,
  ): Promise<{ organizationId: string; connectionId: string } | null> {
    const tokenHash = await hashToken(token);

    const row = await this.db
      .selectFrom("trigger_callback_tokens")
      .select(["organization_id", "connection_id"])
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();

    if (!row) return null;

    return {
      organizationId: row.organization_id,
      connectionId: row.connection_id,
    };
  }

  async deleteByConnection(
    connectionId: string,
    organizationId: string,
  ): Promise<void> {
    await this.db
      .deleteFrom("trigger_callback_tokens")
      .where("connection_id", "=", connectionId)
      .where("organization_id", "=", organizationId)
      .execute();
  }
}
