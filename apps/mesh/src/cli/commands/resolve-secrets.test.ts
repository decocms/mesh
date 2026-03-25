import { describe, expect, it } from "bun:test";
import { resolveSecrets, type SecretsFile } from "./resolve-secrets";

describe("resolveSecrets", () => {
  const emptyEnv = {};

  describe("ENCRYPTION_KEY: != null env check + != null saved check", () => {
    // ⚠️ These tests document the critical resolution behavior.
    // Both env and saved checks use != null so "" is preserved from either source.
    // The old CLI saved ENCRYPTION_KEY="" — all existing data is encrypted
    // with SHA-256(""). Discarding "" would break decryption.
    // See PRs #2785, #2790, #2862, #2871 for history.

    it("should use empty-string ENCRYPTION_KEY from env (not fall through)", () => {
      const saved: SecretsFile = { ENCRYPTION_KEY: "saved-key" };
      const env = { ENCRYPTION_KEY: "" };
      const { secrets, sources } = resolveSecrets(saved, env);

      // "" from env must be used — cloud deployments set ENCRYPTION_KEY=""
      // as env var and have no secrets.json
      expect(secrets.ENCRYPTION_KEY).toBe("");
      expect(sources.ENCRYPTION_KEY).toBe("env");
    });

    it("should preserve empty-string ENCRYPTION_KEY from env even without saved (critical for cloud)", () => {
      const saved: SecretsFile = { LOCAL_ADMIN_PASSWORD: "pass" };
      const env = { ENCRYPTION_KEY: "", BETTER_AUTH_SECRET: "auth" };
      const { secrets, modified, sources } = resolveSecrets(saved, env);

      // "" from env must be used — not generate a random key
      expect(secrets.ENCRYPTION_KEY).toBe("");
      expect(modified).toBe(false);
      expect(sources.ENCRYPTION_KEY).toBe("env");
    });

    it("should preserve empty-string saved ENCRYPTION_KEY when env is unset", () => {
      const saved: SecretsFile = {
        ENCRYPTION_KEY: "",
        BETTER_AUTH_SECRET: "auth",
        LOCAL_ADMIN_PASSWORD: "pass",
      };
      const { secrets, modified, sources } = resolveSecrets(saved, emptyEnv);

      // Saved "" must be preserved — data is encrypted with SHA-256("")
      expect(secrets.ENCRYPTION_KEY).toBe("");
      expect(modified).toBe(false);
      expect(sources.ENCRYPTION_KEY).toBe("saved");
    });

    it("should use non-empty env ENCRYPTION_KEY over saved value", () => {
      const saved: SecretsFile = { ENCRYPTION_KEY: "saved-key" };
      const env = { ENCRYPTION_KEY: "env-key" };
      const { secrets, sources } = resolveSecrets(saved, env);

      expect(secrets.ENCRYPTION_KEY).toBe("env-key");
      expect(sources.ENCRYPTION_KEY).toBe("env");
    });

    it("should use saved ENCRYPTION_KEY when env is not set", () => {
      const saved: SecretsFile = { ENCRYPTION_KEY: "saved-key" };
      const { secrets, sources } = resolveSecrets(saved, emptyEnv);

      expect(secrets.ENCRYPTION_KEY).toBe("saved-key");
      expect(sources.ENCRYPTION_KEY).toBe("saved");
    });

    it("should use non-empty env ENCRYPTION_KEY over empty-string saved value", () => {
      const saved: SecretsFile = { ENCRYPTION_KEY: "" };
      const env = { ENCRYPTION_KEY: "explicit-key" };
      const { secrets, sources } = resolveSecrets(saved, env);

      expect(secrets.ENCRYPTION_KEY).toBe("explicit-key");
      expect(sources.ENCRYPTION_KEY).toBe("env");
    });
  });

  describe("BETTER_AUTH_SECRET", () => {
    it("should use env over saved value", () => {
      const saved: SecretsFile = { BETTER_AUTH_SECRET: "saved-value" };
      const env = { BETTER_AUTH_SECRET: "env-value" };
      const { secrets, sources } = resolveSecrets(saved, env);

      expect(secrets.BETTER_AUTH_SECRET).toBe("env-value");
      expect(sources.BETTER_AUTH_SECRET).toBe("env");
    });

    it("should use saved value when env is not set", () => {
      const saved: SecretsFile = { BETTER_AUTH_SECRET: "saved-value" };
      const { secrets, sources } = resolveSecrets(saved, emptyEnv);

      expect(secrets.BETTER_AUTH_SECRET).toBe("saved-value");
      expect(sources.BETTER_AUTH_SECRET).toBe("saved");
    });

    it("should preserve empty-string saved value", () => {
      const saved: SecretsFile = {
        BETTER_AUTH_SECRET: "",
        ENCRYPTION_KEY: "enc",
        LOCAL_ADMIN_PASSWORD: "pass",
      };
      const { secrets, modified, sources } = resolveSecrets(saved, emptyEnv);

      expect(secrets.BETTER_AUTH_SECRET).toBe("");
      expect(modified).toBe(false);
      expect(sources.BETTER_AUTH_SECRET).toBe("saved");
    });

    it("should preserve empty-string env value", () => {
      const saved: SecretsFile = { BETTER_AUTH_SECRET: "saved-value" };
      const env = { BETTER_AUTH_SECRET: "" };
      const { secrets, sources } = resolveSecrets(saved, env);

      expect(secrets.BETTER_AUTH_SECRET).toBe("");
      expect(sources.BETTER_AUTH_SECRET).toBe("env");
    });

    it("should generate when missing from both", () => {
      const { secrets, modified, sources } = resolveSecrets({}, emptyEnv);

      expect(secrets.BETTER_AUTH_SECRET).toBeTruthy();
      expect(Buffer.from(secrets.BETTER_AUTH_SECRET, "base64").length).toBe(32);
      expect(modified).toBe(true);
      expect(sources.BETTER_AUTH_SECRET).toBe("generated");
    });
  });

  describe("generation of missing secrets", () => {
    it("should generate ENCRYPTION_KEY when missing from both env and file", () => {
      const { secrets, modified, sources } = resolveSecrets({}, emptyEnv);

      expect(secrets.ENCRYPTION_KEY).toBeTruthy();
      expect(Buffer.from(secrets.ENCRYPTION_KEY, "base64").length).toBe(32);
      expect(modified).toBe(true);
      expect(sources.ENCRYPTION_KEY).toBe("generated");
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
