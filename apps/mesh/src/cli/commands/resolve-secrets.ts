/**
 * Resolve Secrets
 *
 * Pure function that resolves BETTER_AUTH_SECRET, ENCRYPTION_KEY, and
 * LOCAL_ADMIN_PASSWORD from a saved secrets file, generating new values
 * only when a key is truly missing (undefined/null).
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  WARNING — ENCRYPTION_KEY RESOLUTION IS LOAD-BEARING               ║
 * ║                                                                    ║
 * ║  The env var check uses TRUTHY so that ENCRYPTION_KEY="" from the  ║
 * ║  environment falls through to the saved value.                     ║
 * ║                                                                    ║
 * ║  The saved value check uses != null so that ENCRYPTION_KEY=""      ║
 * ║  persisted in secrets.json is PRESERVED. The old CLI (pre-#2776)   ║
 * ║  saved ENCRYPTION_KEY as "" — CredentialVault hashes this via      ║
 * ║  SHA-256("") and all existing data is encrypted with that key.     ║
 * ║  Using a truthy check on the saved value would silently discard    ║
 * ║  the "" and generate a random key, breaking AES-GCM decryption.   ║
 * ║                                                                    ║
 * ║  Summary:  env check = TRUTHY  |  saved check = != null           ║
 * ║  See PRs #2785, #2790, #2862 for the history of this logic.       ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
import crypto from "crypto";

export interface SecretsFile {
  BETTER_AUTH_SECRET?: string;
  ENCRYPTION_KEY?: string;
  LOCAL_ADMIN_PASSWORD?: string;
}

export interface ResolvedSecrets {
  secrets: Required<SecretsFile>;
  modified: boolean;
}

/**
 * Resolve secrets from saved file and environment.
 *
 * Priority for each secret:
 *   1. Truthy env var (non-empty string) — env override wins
 *   2. Saved value from secrets.json (including "" via != null check)
 *   3. Generate a new random value and mark modified=true
 *
 * The generated ENCRYPTION_KEY is saved to secrets.json so that subsequent
 * boots (and all replicas sharing the same volume) reuse the same key.
 * If you need a stable key across pods without a shared volume, set a
 * non-empty ENCRYPTION_KEY env var explicitly.
 */
export function resolveSecrets(
  saved: SecretsFile,
  env: { BETTER_AUTH_SECRET?: string; ENCRYPTION_KEY?: string },
): ResolvedSecrets {
  let modified = false;

  // BETTER_AUTH_SECRET — truthy env check, != null saved check
  let betterAuthSecret: string;
  if (env.BETTER_AUTH_SECRET) {
    betterAuthSecret = env.BETTER_AUTH_SECRET;
  } else if (saved.BETTER_AUTH_SECRET != null) {
    betterAuthSecret = saved.BETTER_AUTH_SECRET;
  } else {
    betterAuthSecret = crypto.randomBytes(32).toString("base64");
    modified = true;
  }

  // ── ENCRYPTION_KEY ──────────────────────────────────────────────────
  // Env check is TRUTHY so "" from env falls through to the saved value.
  // Saved check is != null so "" persisted in secrets.json is preserved.
  // See the big warning at the top of this file.
  let encryptionKey: string;
  if (env.ENCRYPTION_KEY) {
    encryptionKey = env.ENCRYPTION_KEY;
  } else if (saved.ENCRYPTION_KEY != null) {
    encryptionKey = saved.ENCRYPTION_KEY;
  } else {
    encryptionKey = crypto.randomBytes(32).toString("base64");
    modified = true;
  }

  // LOCAL_ADMIN_PASSWORD — use != null so empty string is preserved
  let localAdminPassword: string;
  if (saved.LOCAL_ADMIN_PASSWORD != null) {
    localAdminPassword = saved.LOCAL_ADMIN_PASSWORD;
  } else {
    localAdminPassword = crypto.randomBytes(24).toString("base64");
    modified = true;
  }

  return {
    secrets: {
      BETTER_AUTH_SECRET: betterAuthSecret,
      ENCRYPTION_KEY: encryptionKey,
      LOCAL_ADMIN_PASSWORD: localAdminPassword,
    },
    modified,
  };
}
