import { describe, expect, test } from "bun:test";
import { computeAgentBadges } from "./use-agent-badges";
import type { Task } from "@/web/components/chat/task/types";

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: "Task",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("computeAgentBadges", () => {
  test("returns all false when there are no tasks", () => {
    const result = computeAgentBadges([], ["s1", "s2"], {
      s1: "2025-01-01T00:00:00Z",
    });
    expect(result).toEqual({ s1: false, s2: false });
  });

  test("returns false when all tasks are older than lastSeen", () => {
    const tasks = [
      makeTask({
        id: "t1",
        agent_ids: ["s1"],
        updated_at: "2025-01-01T00:00:00Z",
      }),
    ];
    const result = computeAgentBadges(tasks, ["s1"], {
      s1: "2025-01-02T00:00:00Z",
    });
    expect(result).toEqual({ s1: false });
  });

  test("returns true when task updated_at is newer than lastSeen", () => {
    const tasks = [
      makeTask({
        id: "t1",
        agent_ids: ["s1"],
        updated_at: "2025-01-03T00:00:00Z",
      }),
    ];
    const result = computeAgentBadges(tasks, ["s1"], {
      s1: "2025-01-02T00:00:00Z",
    });
    expect(result).toEqual({ s1: true });
  });

  test("excludes hidden tasks", () => {
    const tasks = [
      makeTask({
        id: "t1",
        agent_ids: ["s1"],
        updated_at: "2025-01-03T00:00:00Z",
        hidden: true,
      }),
    ];
    const result = computeAgentBadges(tasks, ["s1"], {
      s1: "2025-01-02T00:00:00Z",
    });
    expect(result).toEqual({ s1: false });
  });

  test("returns false when no lastSeen entry exists (cold start)", () => {
    const tasks = [
      makeTask({
        id: "t1",
        agent_ids: ["s1"],
        updated_at: "2025-01-03T00:00:00Z",
      }),
    ];
    const result = computeAgentBadges(tasks, ["s1"], {});
    expect(result).toEqual({ s1: false });
  });

  test("excludes tasks with no agent_ids", () => {
    const tasks = [makeTask({ id: "t1", updated_at: "2025-01-03T00:00:00Z" })];
    const result = computeAgentBadges(tasks, ["s1"], {
      s1: "2025-01-02T00:00:00Z",
    });
    expect(result).toEqual({ s1: false });
  });

  test("handles multiple agents with mixed states", () => {
    const tasks = [
      makeTask({
        id: "t1",
        agent_ids: ["s1"],
        updated_at: "2025-01-03T00:00:00Z",
      }),
      makeTask({
        id: "t2",
        agent_ids: ["s2"],
        updated_at: "2025-01-01T00:00:00Z",
      }),
      makeTask({
        id: "t3",
        agent_ids: ["s3"],
        updated_at: "2025-01-05T00:00:00Z",
      }),
    ];
    const result = computeAgentBadges(tasks, ["s1", "s2", "s3"], {
      s1: "2025-01-02T00:00:00Z",
      s2: "2025-01-02T00:00:00Z",
      // s3 has no entry — cold start
    });
    expect(result).toEqual({ s1: true, s2: false, s3: false });
  });
});
