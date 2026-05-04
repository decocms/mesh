import { describe, expect, test } from "bun:test";
import type { ProbeResult } from "./probe";
import { selectActive } from "./probe";

const r = (overrides: Partial<ProbeResult>): ProbeResult => ({
  port: 3000,
  responded: false,
  ready: false,
  htmlSupport: false,
  score: 0,
  ...overrides,
});

describe("selectActive", () => {
  test("pinned port responded with 404 → responded=true, ready=false, htmlSupport=false, picks pin", () => {
    const result = selectActive(
      [
        r({
          port: 5173,
          responded: true,
          ready: false,
          htmlSupport: false,
          score: 10,
        }),
      ],
      5173,
    );
    expect(result).toEqual({
      port: 5173,
      ready: false,
      responded: true,
      htmlSupport: false,
    });
  });

  test("pinned port responded with 200 HTML → all three true, picks pin", () => {
    const result = selectActive(
      [
        r({
          port: 5173,
          responded: true,
          ready: true,
          htmlSupport: true,
          score: 100,
        }),
      ],
      5173,
    );
    expect(result).toEqual({
      port: 5173,
      ready: true,
      responded: true,
      htmlSupport: true,
    });
  });

  test("pinned port did not respond, descendant served HTML → falls back to descendant", () => {
    const result = selectActive(
      [
        r({
          port: 5173,
          responded: false,
          ready: false,
          htmlSupport: false,
          score: 0,
        }),
        r({
          port: 3001,
          responded: true,
          ready: true,
          htmlSupport: true,
          score: 100,
        }),
      ],
      5173,
    );
    expect(result).toEqual({
      port: 3001,
      ready: true,
      responded: true,
      htmlSupport: true,
    });
  });

  test("pinned port responded with 404, descendant served HTML → sticks with pin (existing behavior)", () => {
    const result = selectActive(
      [
        r({
          port: 5173,
          responded: true,
          ready: false,
          htmlSupport: false,
          score: 10,
        }),
        r({
          port: 3001,
          responded: true,
          ready: true,
          htmlSupport: true,
          score: 100,
        }),
      ],
      5173,
    );
    expect(result).toEqual({
      port: 5173,
      ready: false,
      responded: true,
      htmlSupport: false,
    });
  });

  test("no pin, single port responded with 404 → responded=true, ready=false", () => {
    const result = selectActive(
      [
        r({
          port: 3000,
          responded: true,
          ready: false,
          htmlSupport: false,
          score: 10,
        }),
      ],
      null,
    );
    expect(result).toEqual({
      port: 3000,
      ready: false,
      responded: true,
      htmlSupport: false,
    });
  });

  test("no pin, no probed ports → all null/false", () => {
    const result = selectActive([], null);
    expect(result).toEqual({
      port: null,
      ready: false,
      responded: false,
      htmlSupport: false,
    });
  });

  test("no pin, port did not respond → ready=false, responded=false", () => {
    const result = selectActive(
      [
        r({
          port: 3000,
          responded: false,
          ready: false,
          htmlSupport: false,
          score: 0,
        }),
      ],
      null,
    );
    expect(result).toEqual({
      port: 3000,
      ready: false,
      responded: false,
      htmlSupport: false,
    });
  });
});
