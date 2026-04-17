import { describe, expect, test } from "bun:test";
import {
  canToggle,
  computeDefaultSizes,
  resolveDefaultPanelState,
  resolveDefaultTabId,
} from "./use-layout-state";

// ---------------------------------------------------------------------------
// resolveDefaultPanelState
// ---------------------------------------------------------------------------

describe("resolveDefaultPanelState", () => {
  test("no tasks, no metadata → tasks closed, main closed, chat open", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: null,
        hasMainParam: false,
        taskCount: 0,
      }),
    ).toEqual({ tasksOpen: false, mainOpen: false, chatOpen: true });
  });

  test("has tasks → tasks open", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: null,
        hasMainParam: false,
        taskCount: 3,
      }),
    ).toEqual({ tasksOpen: true, mainOpen: false, chatOpen: true });
  });

  test("entity declares defaultMainView → main open", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: { defaultMainView: { type: "automation" } },
        hasMainParam: false,
        taskCount: 0,
      }),
    ).toEqual({ tasksOpen: false, mainOpen: true, chatOpen: true });
  });

  test("?main param present → main open even without metadata", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: null,
        hasMainParam: true,
        taskCount: 0,
      }),
    ).toEqual({ tasksOpen: false, mainOpen: true, chatOpen: true });
  });

  test("chatDefaultOpen = false → chat closed", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: {
          defaultMainView: { type: "automation" },
          chatDefaultOpen: false,
        },
        hasMainParam: false,
        taskCount: 0,
      }),
    ).toEqual({ tasksOpen: false, mainOpen: true, chatOpen: false });
  });

  test("chatDefaultOpen = true (explicit) → chat open", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: {
          defaultMainView: { type: "automation" },
          chatDefaultOpen: true,
        },
        hasMainParam: false,
        taskCount: 0,
      }),
    ).toEqual({ tasksOpen: false, mainOpen: true, chatOpen: true });
  });

  test("has tasks + defaultMainView → all three open", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: { defaultMainView: { type: "settings" } },
        hasMainParam: false,
        taskCount: 2,
      }),
    ).toEqual({ tasksOpen: true, mainOpen: true, chatOpen: true });
  });

  test("defaultMainView = null explicitly → main closed", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: { defaultMainView: null },
        hasMainParam: false,
        taskCount: 0,
      }),
    ).toEqual({ tasksOpen: false, mainOpen: false, chatOpen: true });
  });
});

// ---------------------------------------------------------------------------
// resolveDefaultTabId
// ---------------------------------------------------------------------------

describe("resolveDefaultTabId", () => {
  test("null metadata → null", () => {
    expect(resolveDefaultTabId(null)).toBeNull();
  });

  test("defaultMainView null → null", () => {
    expect(resolveDefaultTabId({ defaultMainView: null })).toBeNull();
  });

  test("ext-app with id → tab = id", () => {
    expect(
      resolveDefaultTabId({
        defaultMainView: { type: "ext-app", id: "analytics" },
      }),
    ).toBe("analytics");
  });

  test("ext-apps (plural legacy) with id → tab = id", () => {
    expect(
      resolveDefaultTabId({
        defaultMainView: { type: "ext-apps", id: "analytics" },
      }),
    ).toBe("analytics");
  });

  test("settings without id → 'instructions'", () => {
    expect(resolveDefaultTabId({ defaultMainView: { type: "settings" } })).toBe(
      "instructions",
    );
  });

  test("settings with id → uses id", () => {
    expect(
      resolveDefaultTabId({
        defaultMainView: { type: "settings", id: "connections" },
      }),
    ).toBe("connections");
  });

  test("unknown type falls back to first declared tab", () => {
    expect(
      resolveDefaultTabId({
        defaultMainView: { type: "automation" },
        tabs: [{ id: "tab-1" }, { id: "tab-2" }],
      }),
    ).toBe("tab-1");
  });

  test("unknown type with no tabs → null", () => {
    expect(
      resolveDefaultTabId({ defaultMainView: { type: "automation" } }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// canToggle
// ---------------------------------------------------------------------------

describe("canToggle", () => {
  test("panel open, expandedCount = 1 → no-op (false)", () => {
    expect(canToggle(true, 1)).toBe(false);
  });

  test("panel open, expandedCount = 2 → allow (true)", () => {
    expect(canToggle(true, 2)).toBe(true);
  });

  test("panel open, expandedCount = 3 → allow (true)", () => {
    expect(canToggle(true, 3)).toBe(true);
  });

  test("panel closed, expandedCount = 1 → allow (true)", () => {
    expect(canToggle(false, 1)).toBe(true);
  });

  test("panel closed, expandedCount = 0 → allow (true)", () => {
    expect(canToggle(false, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeDefaultSizes
// ---------------------------------------------------------------------------

describe("computeDefaultSizes", () => {
  test("all open → 22/43/35", () => {
    expect(
      computeDefaultSizes({ tasksOpen: true, mainOpen: true, chatOpen: true }),
    ).toEqual({ tasks: 22, main: 43, chat: 35 });
  });

  test("tasks closed → 0/65/35", () => {
    expect(
      computeDefaultSizes({ tasksOpen: false, mainOpen: true, chatOpen: true }),
    ).toEqual({ tasks: 0, main: 65, chat: 35 });
  });

  test("main closed → 22/0/78", () => {
    expect(
      computeDefaultSizes({ tasksOpen: true, mainOpen: false, chatOpen: true }),
    ).toEqual({ tasks: 22, main: 0, chat: 78 });
  });

  test("chat closed → 22/78/0", () => {
    expect(
      computeDefaultSizes({ tasksOpen: true, mainOpen: true, chatOpen: false }),
    ).toEqual({ tasks: 22, main: 78, chat: 0 });
  });

  test("only chat → 0/0/100", () => {
    expect(
      computeDefaultSizes({
        tasksOpen: false,
        mainOpen: false,
        chatOpen: true,
      }),
    ).toEqual({ tasks: 0, main: 0, chat: 100 });
  });

  test("only main → 0/100/0", () => {
    expect(
      computeDefaultSizes({
        tasksOpen: false,
        mainOpen: true,
        chatOpen: false,
      }),
    ).toEqual({ tasks: 0, main: 100, chat: 0 });
  });

  test("only tasks → 100/0/0", () => {
    expect(
      computeDefaultSizes({
        tasksOpen: true,
        mainOpen: false,
        chatOpen: false,
      }),
    ).toEqual({ tasks: 100, main: 0, chat: 0 });
  });
});
