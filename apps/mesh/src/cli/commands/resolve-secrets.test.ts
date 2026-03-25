import { describe, expect, it } from "bun:test";
import { resolveSecrets, type SecretsFile } from "./resolve-secrets";

describe("resolveSecrets", () => {
  const emptyEnv = {};

  describe("ENCRYPTION_KEY: truthy env check + != null saved check", () => {
    // ⚠️ These tests document the critical resolution behavior.
    // Env check is TRUTHY: empty-string env vars fall through to saved.
    // Saved check is != null: empty-string in secrets.json is PRESERVED.
    // The old CLI saved ENCRYPTION_KEY="" — all existing data is encrypted
    // with SHA-256(""). Discarding "" would break decryption.
    // See PRs #2785, #2790, #2862, #2868 for history.

    it("should ignore empty-string ENCRYPTION_KEY env and use saved value", () => {
      const saved: SecretsFile = { ENCRYPTION_KEY: "saved-key" };
      const env = { ENCRYPTION_KEY: "" };
      const { secrets } = resolveSecrets(saved, env);

      expect(secrets.ENCRYPTION_KEY).toBe("saved-key");
    });

    it("should preserve empty-string saved ENCRYPTION_KEY (critical for old deployments)", () => {
      const saved: SecretsFile = {
        ENCRYPTION_KEY: "",
        BETTER_AUTH_SECRET: "auth",
        LOCAL_ADMIN_PASSWORD: "pass",
      };
      const env = { ENCRYPTION_KEY: "" };
      const { secrets, modified } = resolveSecrets(saved, env);

      // Saved "" must be preserved — data is encrypted with SHA-256("")
      expect(secrets.ENCRYPTION_KEY).toBe("");
      expect(modified).toBe(false);
    });

    it("should preserve empty-string saved ENCRYPTION_KEY when env is unset", () => {
      const saved: SecretsFile = {
        ENCRYPTION_KEY: "",
        BETTER_AUTH_SECRET: "auth",
        LOCAL_ADMIN_PASSWORD: "pass",
      };
      const { secrets, modified } = resolveSecrets(saved, emptyEnv);

      // Saved "" must be preserved — data is encrypted with SHA-256("")
      expect(secrets.ENCRYPTION_KEY).toBe("");
      expect(modified).toBe(false);
    });

    it("should use truthy env ENCRYPTION_KEY over saved value", () => {
      const saved: SecretsFile = { ENCRYPTION_KEY: "saved-key" };
      const env = { ENCRYPTION_KEY: "env-key" };
      const { secrets } = resolveSecrets(saved, env);

      expect(secrets.ENCRYPTION_KEY).toBe("env-key");
    });

    it("should use saved ENCRYPTION_KEY when env is not set", () => {
      const saved: SecretsFile = { ENCRYPTION_KEY: "saved-key" };
      const { secrets } = resolveSecrets(saved, emptyEnv);

      expect(secrets.ENCRYPTION_KEY).toBe("saved-key");
    });

    it("should use truthy env ENCRYPTION_KEY over empty-string saved value", () => {
      const saved: SecretsFile = { ENCRYPTION_KEY: "" };
      const env = { ENCRYPTION_KEY: "explicit-key" };
      const { secrets } = resolveSecrets(saved, env);

      expect(secrets.ENCRYPTION_KEY).toBe("explicit-key");
    });
  });

  describe("BETTER_AUTH_SECRET", () => {
    it("should use env over saved value", () => {
      const saved: SecretsFile = { BETTER_AUTH_SECRET: "saved-value" };
      const env = { BETTER_AUTH_SECRET: "env-value" };
      const { secrets } = resolveSecrets(saved, env);

      expect(secrets.BETTER_AUTH_SECRET).toBe("env-value");
    });

    it("should use saved value when env is not set", () => {
      const saved: SecretsFile = { BETTER_AUTH_SECRET: "saved-value" };
      const { secrets } = resolveSecrets(saved, emptyEnv);

      expect(secrets.BETTER_AUTH_SECRET).toBe("saved-value");
    });

    it("should preserve empty-string saved value", () => {
      const saved: SecretsFile = {
        BETTER_AUTH_SECRET: "",
        ENCRYPTION_KEY: "enc",
        LOCAL_ADMIN_PASSWORD: "pass",
      };
      const { secrets, modified } = resolveSecrets(saved, emptyEnv);

      expect(secrets.BETTER_AUTH_SECRET).toBe("");
      expect(modified).toBe(false);
    });

    it("should generate when missing from both", () => {
      const { secrets, modified } = resolveSecrets({}, emptyEnv);

      expect(secrets.BETTER_AUTH_SECRET).toBeTruthy();
      expect(Buffer.from(secrets.BETTER_AUTH_SECRET, "base64").length).toBe(32);
      expect(modified).toBe(true);
    });
  });

  describe("generation of missing secrets", () => {
    it("should generate ENCRYPTION_KEY when missing from both env and file", () => {
      const { secrets, modified } = resolveSecrets({}, emptyEnv);

      expect(secrets.ENCRYPTION_KEY).toBeTruthy();
      expect(Buffer.from(secrets.ENCRYPTION_KEY, "base64").length).toBe(32);
      expect(modified).toBe(true);
    });

    it("should generate LOCAL_ADMIN_PASSWORD when missing", () => {
      const { secrets, modified } = resolveSecrets({}, emptyEnv);

      expect(secrets.LOCAL_ADMIN_PASSWORD).toBeTruthy();
      expect(modified).toBe(true);
    });
  });

  describe("no modification when all secrets exist", () => {
    it("should not modify when all secrets are present in file", () => {
      const saved: SecretsFile = {
        BETTER_AUTH_SECRET: "auth-secret",
        ENCRYPTION_KEY: "enc-key",
        LOCAL_ADMIN_PASSWORD: "admin-pass",
      };
      const { secrets, modified } = resolveSecrets(saved, emptyEnv);

      expect(secrets.BETTER_AUTH_SECRET).toBe("auth-secret");
      expect(secrets.ENCRYPTION_KEY).toBe("enc-key");
      expect(secrets.LOCAL_ADMIN_PASSWORD).toBe("admin-pass");
      expect(modified).toBe(false);
    });

    it("should not modify when secrets come from env", () => {
      const env = {
        BETTER_AUTH_SECRET: "env-auth",
        ENCRYPTION_KEY: "env-enc",
      };
      const saved: SecretsFile = { LOCAL_ADMIN_PASSWORD: "admin-pass" };
      const { modified } = resolveSecrets(saved, env);

      expect(modified).toBe(false);
    });
  });
});
