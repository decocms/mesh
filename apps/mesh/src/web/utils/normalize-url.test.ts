import { describe, expect, test } from "bun:test";
import { normalizeUrl } from "./normalize-url";

describe("normalizeUrl", () => {
  test("removes /i: prefix from UUID in pathname", () => {
    const url =
      "https://example.com/i:550e8400-e29b-41d4-a716-446655440000/path";
    const expected =
      "https://example.com/550e8400-e29b-41d4-a716-446655440000/path";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("handles multiple /i: prefixes in pathname", () => {
    const url =
      "https://example.com/i:550e8400-e29b-41d4-a716-446655440000/i:abc123-def4-5678-90ab-cdef12345678";
    const expected =
      "https://example.com/550e8400-e29b-41d4-a716-446655440000/abc123-def4-5678-90ab-cdef12345678";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("is case insensitive for UUID hex characters", () => {
    const url = "https://example.com/i:550E8400-E29B-41D4-A716-446655440000";
    const expected = "https://example.com/550E8400-E29B-41D4-A716-446655440000";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("handles mixed case in /i: prefix", () => {
    const url = "https://example.com/I:550e8400-e29b-41d4-a716-446655440000";
    const expected = "https://example.com/550e8400-e29b-41d4-a716-446655440000";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("returns unchanged URL when no /i: prefix exists", () => {
    const url = "https://example.com/550e8400-e29b-41d4-a716-446655440000/path";
    expect(normalizeUrl(url)).toBe(url);
  });

  test("returns unchanged URL when no UUID follows /i: prefix", () => {
    const url = "https://example.com/i:notauuid/path";
    expect(normalizeUrl(url)).toBe(url);
  });

  test("preserves query parameters", () => {
    const url =
      "https://example.com/i:550e8400-e29b-41d4-a716-446655440000?param=value";
    const expected =
      "https://example.com/550e8400-e29b-41d4-a716-446655440000?param=value";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("preserves hash fragments", () => {
    const url =
      "https://example.com/i:550e8400-e29b-41d4-a716-446655440000#section";
    const expected =
      "https://example.com/550e8400-e29b-41d4-a716-446655440000#section";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("preserves query parameters and hash fragments", () => {
    const url =
      "https://example.com/i:550e8400-e29b-41d4-a716-446655440000?foo=bar#section";
    const expected =
      "https://example.com/550e8400-e29b-41d4-a716-446655440000?foo=bar#section";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("handles different protocols (http)", () => {
    const url = "http://example.com/i:550e8400-e29b-41d4-a716-446655440000";
    const expected = "http://example.com/550e8400-e29b-41d4-a716-446655440000";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("handles localhost URLs", () => {
    const url = "http://localhost:3000/i:550e8400-e29b-41d4-a716-446655440000";
    const expected =
      "http://localhost:3000/550e8400-e29b-41d4-a716-446655440000";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("handles URLs with ports", () => {
    const url =
      "https://example.com:8080/i:550e8400-e29b-41d4-a716-446655440000";
    const expected =
      "https://example.com:8080/550e8400-e29b-41d4-a716-446655440000";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("handles URLs with authentication", () => {
    const url =
      "https://user:pass@example.com/i:550e8400-e29b-41d4-a716-446655440000";
    const expected =
      "https://user:pass@example.com/550e8400-e29b-41d4-a716-446655440000";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("returns original string for invalid URLs", () => {
    const invalidUrl = "not-a-valid-url";
    expect(normalizeUrl(invalidUrl)).toBe(invalidUrl);
  });

  test("returns original string for relative paths", () => {
    const relativePath = "/i:550e8400-e29b-41d4-a716-446655440000";
    expect(normalizeUrl(relativePath)).toBe(relativePath);
  });

  test("handles empty string", () => {
    expect(normalizeUrl("")).toBe("");
  });

  test("handles root path with /i: prefix", () => {
    const url = "https://example.com/i:550e8400-e29b-41d4-a716-446655440000";
    const expected = "https://example.com/550e8400-e29b-41d4-a716-446655440000";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("handles trailing slashes", () => {
    const url = "https://example.com/i:550e8400-e29b-41d4-a716-446655440000/";
    const expected =
      "https://example.com/550e8400-e29b-41d4-a716-446655440000/";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("handles UUIDs with different formats (shorter hex strings)", () => {
    const url = "https://example.com/i:abc123/path";
    const expected = "https://example.com/abc123/path";
    expect(normalizeUrl(url)).toBe(expected);
  });

  test("does not modify /i: when not followed by valid hex pattern", () => {
    const url = "https://example.com/i:xyz123/path";
    expect(normalizeUrl(url)).toBe(url);
  });

  test("handles nested paths with /i: in the middle", () => {
    const url =
      "https://example.com/api/v1/i:550e8400-e29b-41d4-a716-446655440000/resource";
    const expected =
      "https://example.com/api/v1/550e8400-e29b-41d4-a716-446655440000/resource";
    expect(normalizeUrl(url)).toBe(expected);
  });
});
