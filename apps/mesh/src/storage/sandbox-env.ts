/**
 * Sandbox Env Vars Storage
 *
 * Persists user-defined env vars keyed by sandbox_ref. Values are encrypted
 * at rest via the credential vault and only decrypted when the runner
 * provisions a container (`docker run -e KEY=VALUE`) — they never leave the
 * server in plaintext over the network.
 */

import type { Kysely } from "kysely";
import type { CredentialVault } from "../encryption/credential-vault";
import type { Database } from "./types";

export interface SandboxEnvEntry {
  key: string;
  updatedAt: Date | string;
}

export interface SandboxEnvStorage {
  /** List keys (no values) for display in the UI. */
  listKeys(sandboxRef: string): Promise<SandboxEnvEntry[]>;
  /** Decrypted key/value map — used at container provision time. */
  resolve(sandboxRef: string): Promise<Record<string, string>>;
  /** Upsert a single key. */
  set(
    sandboxRef: string,
    userId: string,
    key: string,
    value: string,
  ): Promise<void>;
  /** Remove a single key. */
  remove(sandboxRef: string, key: string): Promise<void>;
}

export class KyselySandboxEnvStorage implements SandboxEnvStorage {
  constructor(
    private db: Kysely<Database>,
    private vault: CredentialVault,
  ) {}

  async listKeys(sandboxRef: string): Promise<SandboxEnvEntry[]> {
    const rows = await this.db
      .selectFrom("sandbox_env")
      .select(["key", "updated_at"])
      .where("sandbox_ref", "=", sandboxRef)
      .orderBy("key")
      .execute();
    return rows.map((r) => ({ key: r.key, updatedAt: r.updated_at as Date }));
  }

  async resolve(sandboxRef: string): Promise<Record<string, string>> {
    const rows = await this.db
      .selectFrom("sandbox_env")
      .select(["key", "value_encrypted"])
      .where("sandbox_ref", "=", sandboxRef)
      .execute();
    const out: Record<string, string> = {};
    for (const r of rows) {
      out[r.key] = await this.vault.decrypt(r.value_encrypted);
    }
    return out;
  }

  async set(
    sandboxRef: string,
    userId: string,
    key: string,
    value: string,
  ): Promise<void> {
    const encrypted = await this.vault.encrypt(value);
    const now = new Date().toISOString();
    await this.db
      .insertInto("sandbox_env")
      .values({
        sandbox_ref: sandboxRef,
        user_id: userId,
        key,
        value_encrypted: encrypted,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(["sandbox_ref", "key"]).doUpdateSet({
          value_encrypted: encrypted,
          updated_at: now,
        }),
      )
      .execute();
  }

  async remove(sandboxRef: string, key: string): Promise<void> {
    await this.db
      .deleteFrom("sandbox_env")
      .where("sandbox_ref", "=", sandboxRef)
      .where("key", "=", key)
      .execute();
  }
}
