/**
 * Usage utilities tests
 */

import { describe, expect, test } from "bun:test";
import {
  addUsage,
  calculateUsageStats,
  emptyUsageStats,
  sanitizeProviderMetadata,
} from "./usage";

describe("sanitizeProviderMetadata", () => {
  test("allows only safe fields", () => {
    const metadata = {
      openrouter: {
        usage: { inputTokens: 10, outputTokens: 20, cost: 0.001 },
        cost: 0.001,
        model: "gpt-4",
        internal_id: "should-be-stripped",
        debug_info: "should-be-stripped",
      },
    };

    const result = sanitizeProviderMetadata(metadata);

    expect(result).toEqual({
      openrouter: {
        usage: { inputTokens: 10, outputTokens: 20, cost: 0.001 },
        cost: 0.001,
        model: "gpt-4",
      },
    });
  });

  test("strips sensitive fields", () => {
    const metadata = {
      provider: {
        api_key: "secret",
        user_id: "user_123",
        usage: { totalTokens: 100 },
      },
    };

    const result = sanitizeProviderMetadata(metadata);

    expect(result).toEqual({
      provider: {
        usage: { totalTokens: 100 },
      },
    });
  });

  test("handles nested objects", () => {
    const metadata = {
      openrouter: {
        usage: { inputTokens: 5, outputTokens: 10 },
        nested: { sensitive: "data" },
      },
    };

    const result = sanitizeProviderMetadata(metadata);

    expect(result).toEqual({
      openrouter: {
        usage: { inputTokens: 5, outputTokens: 10 },
      },
    });
  });

  test("returns undefined for empty input", () => {
    expect(sanitizeProviderMetadata(undefined)).toBeUndefined();
    expect(sanitizeProviderMetadata({})).toBeUndefined();
  });

  test("handles non-object provider data", () => {
    const metadata = {
      provider: "string-value",
      other: null,
    };

    const result = sanitizeProviderMetadata(metadata);

    expect(result).toBeUndefined();
  });
});

describe("calculateUsageStats", () => {
  test("sums message-level usage correctly", () => {
    const messages = [
      {
        metadata: {
          usage: { totalTokens: 1000, inputTokens: 500, outputTokens: 500 },
        },
      },
      {
        metadata: {
          usage: { totalTokens: 500, inputTokens: 200, outputTokens: 300 },
        },
      },
    ];

    const result = calculateUsageStats(messages);

    expect(result.totalTokens).toBe(1500);
    expect(result.inputTokens).toBe(700);
    expect(result.outputTokens).toBe(800);
  });

  test("handles missing metadata gracefully", () => {
    const messages = [
      { metadata: { usage: { totalTokens: 100 } } },
      { metadata: {} },
      { metadata: undefined },
      {},
    ];

    const result = calculateUsageStats(messages);

    expect(result.totalTokens).toBe(100);
  });

  test("returns empty stats for empty messages", () => {
    const result = calculateUsageStats([]);

    expect(result).toEqual(emptyUsageStats());
  });
});

describe("addUsage", () => {
  test("adds usage fields correctly", () => {
    const acc = emptyUsageStats();
    const step = {
      inputTokens: 100,
      outputTokens: 200,
      reasoningTokens: 50,
      totalTokens: 350,
    };

    const result = addUsage(acc, step);

    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(200);
    expect(result.reasoningTokens).toBe(50);
    expect(result.totalTokens).toBe(350);
  });

  test("handles undefined fields", () => {
    const acc = { ...emptyUsageStats(), inputTokens: 10 };
    const step = { outputTokens: 20 };

    const result = addUsage(acc, step);

    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);
  });

  test("returns accumulated when step is null", () => {
    const acc = { ...emptyUsageStats(), totalTokens: 100 };
    const result = addUsage(acc, null);
    expect(result).toBe(acc);
  });
});
