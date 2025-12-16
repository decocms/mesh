import { describe, it, expect } from "bun:test";
import { auth } from "./index";

describe("Better Auth Setup", () => {
  it("should export auth instance", () => {
    expect(auth).toBeDefined();
    expect(auth.api).toBeDefined();
  });

  it("should have MCP plugin methods", () => {
    expect(auth.api.getMcpSession).toBeDefined();
  });

  it("should have API Key plugin methods", () => {
    expect(auth.api.createApiKey).toBeDefined();
    expect(auth.api.verifyApiKey).toBeDefined();
    expect(auth.api.listApiKeys).toBeDefined();
    expect(auth.api.deleteApiKey).toBeDefined();
  });

  it("should have Admin plugin methods", () => {
    expect(auth.api.setRole).toBeDefined();
    expect(auth.api.userHasPermission).toBeDefined();
  });
});
