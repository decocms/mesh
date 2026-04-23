import { beforeAll, describe, expect, it } from "bun:test";

const TEST_TOKEN = "test-token-0123456789";

let authorized;

beforeAll(async () => {
  // config.mjs calls process.exit(1) if DAEMON_TOKEN is unset, and auth.mjs
  // captures the expected `Bearer <TOKEN>` buffer at import time — so we must
  // set the env var BEFORE the dynamic import.
  process.env.DAEMON_TOKEN = TEST_TOKEN;
  ({ authorized } = await import("./auth.mjs"));
});

const req = (authorization) => ({
  headers: authorization === undefined ? {} : { authorization },
});

describe("authorized()", () => {
  it("accepts a correct `Bearer <TOKEN>` header", () => {
    expect(authorized(req(`Bearer ${TEST_TOKEN}`))).toBe(true);
  });

  it("rejects a missing authorization header", () => {
    expect(authorized(req(undefined))).toBe(false);
  });

  it("rejects an empty-string header", () => {
    expect(authorized(req(""))).toBe(false);
  });

  it("rejects a wrong token of the same length", () => {
    const wrong = "x".repeat(TEST_TOKEN.length);
    expect(wrong.length).toBe(TEST_TOKEN.length);
    expect(authorized(req(`Bearer ${wrong}`))).toBe(false);
  });

  it("rejects the right token under the wrong scheme", () => {
    // "Token " and "Bearer" are the same length (6), so this hits
    // timingSafeEqual, not the length-mismatch early return.
    expect(authorized(req(`Token  ${TEST_TOKEN}`))).toBe(false);
  });

  it("rejects a right-prefix header longer than expected (length mismatch)", () => {
    expect(authorized(req(`Bearer ${TEST_TOKEN}extra`))).toBe(false);
  });

  it("rejects a lowercase scheme (case-sensitive)", () => {
    expect(authorized(req(`bearer ${TEST_TOKEN}`))).toBe(false);
  });
});
