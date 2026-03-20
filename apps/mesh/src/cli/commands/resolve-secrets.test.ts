import { describe, expect, it } from "bun:test";
import { resolveSecrets, type SecretsFile } from "./resolve-secrets";

describe("resolveSecrets", () => {
  const emptyEnv = {};

  describe("empty string preservation (regression test)", () => {
    it("should preserve ENCRYPTION_KEY empty string from secrets.json", () => {
      const saved: SecretsFile = { ENCRYPTION_KEY: "" };
      const { secrets } = resolveSecrets(saved, emptyEnv);

      expect(secrets.ENCRYPTION_KEY).toBe("");
    });

    it("should preserve BETTER_AUTH_SECRET empty string from secrets.json", () => {
      const saved: SecretsFile = { BETTER_AUTH_SECRET: "" };
      const { secrets } = resolveSecrets(saved, emptyEnv);

      expect(secrets.BETTER_AUTH_SECRET).toBe("");
    });

    it("should preserve both empty strings (pre-refactor secrets.json)", () => {
      const saved: SecretsFile = {
        BETTER_AUTH_SECRET: "",
        ENCRYPTION_KEY: "",
        LOCAL_ADMIN_PASSWORD: "existing-password",
      };
      const { secrets, modified } = resolveSecrets(saved, emptyEnv);

      expect(secrets.BETTER_AUTH_SECRET).toBe("");
      expect(secrets.ENCRYPTION_KEY).toBe("");
      expect(secrets.LOCAL_ADMIN_PASSWORD).toBe("existing-password");
      expect(modified).toBe(false);
    });
  });

  describe("env var precedence", () => {
    it("should use env BETTER_AUTH_SECRET over saved value", () => {
      const saved: SecretsFile = { BETTER_AUTH_SECRET: "saved-value" };
      const env = { BETTER_AUTH_SECRET: "env-value" };
      const { secrets } = resolveSecrets(saved, env);

      expect(secrets.BETTER_AUTH_SECRET).toBe("env-value");
    });

    it("should use env ENCRYPTION_KEY over saved value", () => {
      const saved: SecretsFile = { ENCRYPTION_KEY: "saved-value" };
      const env = { ENCRYPTION_KEY: "env-value" };
      const { secrets } = resolveSecrets(saved, env);

      expect(secrets.ENCRYPTION_KEY).toBe("env-value");
    });
  });

  describe("generation of missing secrets", () => {
    it("should generate BETTER_AUTH_SECRET when missing from both env and file", () => {
      const { secrets, modified } = resolveSecrets({}, emptyEnv);

      expect(secrets.BETTER_AUTH_SECRET).toBeTruthy();
      expect(Buffer.from(secrets.BETTER_AUTH_SECRET, "base64").length).toBe(32);
      expect(modified).toBe(true);
    });

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
