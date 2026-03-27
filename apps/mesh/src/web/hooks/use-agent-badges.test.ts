import { describe, expect, test } from "bun:test";
import { computeAgentBadges } from "./use-agent-badges";

describe("computeAgentBadges", () => {
  test("returns false for agents with no updates", () => {
    const result = computeAgentBadges(["agent-1"], {}, {});
    expect(result).toEqual({ "agent-1": false });
  });

  test("returns true when update is newer than last seen", () => {
    const result = computeAgentBadges(
      ["agent-1"],
      { "agent-1": "2026-01-02T00:00:00Z" },
      { "agent-1": "2026-01-01T00:00:00Z" },
    );
    expect(result).toEqual({ "agent-1": true });
  });

  test("returns false when last seen is newer than update", () => {
    const result = computeAgentBadges(
      ["agent-1"],
      { "agent-1": "2026-01-01T00:00:00Z" },
      { "agent-1": "2026-01-02T00:00:00Z" },
    );
    expect(result).toEqual({ "agent-1": false });
  });

  test("returns true when updated but never seen", () => {
    const result = computeAgentBadges(
      ["agent-1"],
      { "agent-1": "2026-01-01T00:00:00Z" },
      {},
    );
    expect(result).toEqual({ "agent-1": true });
  });

  test("handles multiple agents independently", () => {
    const result = computeAgentBadges(
      ["agent-1", "agent-2", "agent-3"],
      {
        "agent-1": "2026-01-02T00:00:00Z",
        "agent-2": "2026-01-01T00:00:00Z",
      },
      {
        "agent-1": "2026-01-01T00:00:00Z",
        "agent-2": "2026-01-03T00:00:00Z",
      },
    );
    expect(result).toEqual({
      "agent-1": true,
      "agent-2": false,
      "agent-3": false,
    });
  });

  test("returns false when update equals last seen", () => {
    const result = computeAgentBadges(
      ["agent-1"],
      { "agent-1": "2026-01-01T00:00:00Z" },
      { "agent-1": "2026-01-01T00:00:00Z" },
    );
    expect(result).toEqual({ "agent-1": false });
  });
});
