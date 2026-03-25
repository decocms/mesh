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
 * ║  Both the env var check AND the saved value check use != null      ║
 * ║  so that ENCRYPTION_KEY="" is PRESERVED regardless of source.      ║
 * ║  The old CLI (pre-#2776) saved ENCRYPTION_KEY as "" —              ║
 * ║  CredentialVault hashes this via SHA-256("") and all existing      ║
 * ║  data is encrypted with that key. Cloud deployments that set       ║
 * ║  ENCRYPTION_KEY="" as an env var (no secrets.json) also need       ║
 * ║  the empty string forwarded, not discarded.                        ║
 * ║                                                                    ║
 * ║  Summary:  env check = != null  |  saved check = != null          ║
 * ║  See PRs #2785, #2790, #2862, #2871 for the history.              ║
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
  sources: {
    ENCRYPTION_KEY: "env" | "saved" | "generated";
    BETTER_AUTH_SECRET: "env" | "saved" | "generated";
  };
}

/**
 * Resolve secrets from saved file and environment.
 *
 * Priority for each secret:
 *   1. Env var (including "" — checked with != null, not truthy)
 *   2. Saved value from secrets.json (including "" via != null check)
 *   3. Generate a new random value and mark modified=true
 *
 * The generated ENCRYPTION_KEY is saved to secrets.json so that subsequent
 * boots (and all replicas sharing the same volume) reuse the same key.
 * If you need a stable key across pods without a shared volume, set
 * ENCRYPTION_KEY as an env var (even "" is valid — derives key via SHA-256).
 */
export function resolveSecrets(
  saved: SecretsFile,
  env: { BETTER_AUTH_SECRET?: string; ENCRYPTION_KEY?: string },
): ResolvedSecrets {
  let modified = false;

  // BETTER_AUTH_SECRET — != null env check, != null saved check
  let betterAuthSecret: string;
  let betterAuthSecretSource: string;
  if (env.BETTER_AUTH_SECRET != null) {
    betterAuthSecret = env.BETTER_AUTH_SECRET;
    betterAuthSecretSource = "env";
  } else if (saved.BETTER_AUTH_SECRET != null) {
    betterAuthSecret = saved.BETTER_AUTH_SECRET;
    betterAuthSecretSource = "saved";
  } else {
    betterAuthSecret = crypto.randomBytes(32).toString("base64");
    betterAuthSecretSource = "generated";
    modified = true;
  }

  // ── ENCRYPTION_KEY ──────────────────────────────────────────────────
  // Both env and saved checks use != null so "" is preserved from either
  // source. See the big warning at the top of this file.
  let encryptionKey: string;
  let encryptionKeySource: string;
  if (env.ENCRYPTION_KEY != null) {
    encryptionKey = env.ENCRYPTION_KEY;
    encryptionKeySource = "env";
  } else if (saved.ENCRYPTION_KEY != null) {
    encryptionKey = saved.ENCRYPTION_KEY;
    encryptionKeySource = "saved";
  } else {
    encryptionKey = crypto.randomBytes(32).toString("base64");
    encryptionKeySource = "generated";
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
    sources: {
      ENCRYPTION_KEY: encryptionKeySource as "env" | "saved" | "generated",
      BETTER_AUTH_SECRET: betterAuthSecretSource as
        | "env"
        | "saved"
        | "generated",
    },
  };
}
