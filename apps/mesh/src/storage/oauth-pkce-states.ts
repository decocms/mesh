import type { Kysely } from "kysely";
import type { Database } from "./types";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class OAuthPkceStateStorage {
  constructor(private db: Kysely<Database>) {}

  async create(codeVerifier: string): Promise<string> {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);

    await this.db
      .insertInto("oauth_pkce_states")
      .values({
        id,
        code_verifier: codeVerifier,
        expires_at: expiresAt,
        created_at: new Date(),
      })
      .execute();

    return id;
  }

  /** Retrieve and delete the verifier in a single operation (single-use). */
  async consume(stateToken: string): Promise<string> {
    const row = await this.db
      .selectFrom("oauth_pkce_states")
      .where("id", "=", stateToken)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      throw new Error("Invalid or expired OAuth state token");
    }

    const expiresAt =
      row.expires_at instanceof Date
        ? row.expires_at
        : new Date(row.expires_at);

    if (expiresAt < new Date()) {
      await this.db
        .deleteFrom("oauth_pkce_states")
        .where("id", "=", stateToken)
        .execute();
      throw new Error("OAuth state token has expired");
    }

    await this.db
      .deleteFrom("oauth_pkce_states")
      .where("id", "=", stateToken)
      .execute();

    return row.code_verifier;
  }
}
