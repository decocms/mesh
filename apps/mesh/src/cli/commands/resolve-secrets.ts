/**
 * Resolve Secrets
 *
 * Pure function that resolves BETTER_AUTH_SECRET, ENCRYPTION_KEY, and
 * LOCAL_ADMIN_PASSWORD from a saved secrets file, generating new values
 * only when a key is truly missing.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  WARNING — ENCRYPTION_KEY RESOLUTION IS LOAD-BEARING               ║
 * ║                                                                    ║
 * ║  The ENCRYPTION_KEY logic below uses TRUTHY checks (not != null).  ║
 * ║  This is intentional and critical for production correctness.      ║
 * ║                                                                    ║
 * ║  Many deployments pass ENCRYPTION_KEY="" (empty string) via env    ║
 * ║  vars. A truthy check treats "" as "not set", which falls through  ║
 * ║  to the saved secrets.json — where the real random key lives.      ║
 * ║  Changing to != null would make "" win over the saved key,         ║
 * ║  producing SHA-256("") instead of the saved random key, instantly  ║
 * ║  breaking decryption of all existing data in production.           ║
 * ║                                                                    ║
 * ║  DO NOT "fix" the truthy checks to != null. This was tried in     ║
 * ║  PRs #2785 and #2790 and broke production AES-GCM decryption.     ║
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
 *   1. Truthy env var (non-empty string)
 *   2. Truthy saved value from secrets.json (non-empty string)
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

  // BETTER_AUTH_SECRET — truthy check (empty string = not set)
  let betterAuthSecret: string;
  if (env.BETTER_AUTH_SECRET) {
    betterAuthSecret = env.BETTER_AUTH_SECRET;
  } else if (saved.BETTER_AUTH_SECRET) {
    betterAuthSecret = saved.BETTER_AUTH_SECRET;
  } else {
    betterAuthSecret = crypto.randomBytes(32).toString("base64");
    modified = true;
  }

  // ── ENCRYPTION_KEY ──────────────────────────────────────────────────
  // TRUTHY checks here are INTENTIONAL. See the big warning at the top.
  // An empty-string env var ("") must fall through so the saved random
  // key from secrets.json is used. Do NOT change to != null.
  let encryptionKey: string;
  if (env.ENCRYPTION_KEY) {
    encryptionKey = env.ENCRYPTION_KEY;
  } else if (saved.ENCRYPTION_KEY) {
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
