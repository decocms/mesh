import { describe, expect, test } from "bun:test";
import {
  canToggle,
  computeDefaultSizes,
  resolveDefaultPanelState,
} from "./use-layout-state";

describe("resolveDefaultPanelState", () => {
  test("no metadata → tasks open, main closed, chat open", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: null,
        mainParamPresent: false,
      }),
    ).toEqual({ tasksOpen: true, mainOpen: false, chatOpen: true });
  });

  test("entity declares defaultMainView → main open", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: { defaultMainView: { type: "ext-app", id: "x" } },
        mainParamPresent: false,
      }),
    ).toEqual({ tasksOpen: true, mainOpen: true, chatOpen: true });
  });

  test("?main=0 → main closed regardless of default", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: { defaultMainView: { type: "settings" } },
        mainParamPresent: true,
        mainParamValue: "0",
      }),
    ).toEqual({ tasksOpen: true, mainOpen: false, chatOpen: true });
  });

  test("?main=<tabId> → main open", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: null,
        mainParamPresent: true,
        mainParamValue: "layout",
      }),
    ).toEqual({ tasksOpen: true, mainOpen: true, chatOpen: true });
  });

  test("chatDefaultOpen = false → chat closed", () => {
    expect(
      resolveDefaultPanelState({
        entityMetadata: {
          defaultMainView: { type: "settings" },
          chatDefaultOpen: false,
        },
        mainParamPresent: false,
      }),
    ).toEqual({ tasksOpen: true, mainOpen: true, chatOpen: false });
  });
});

describe("canToggle", () => {
  test("panel open, expandedCount = 1 → false", () => {
    expect(canToggle(true, 1)).toBe(false);
  });
  test("panel open, expandedCount = 2 → true", () => {
    expect(canToggle(true, 2)).toBe(true);
  });
  test("panel closed → true", () => {
    expect(canToggle(false, 0)).toBe(true);
    expect(canToggle(false, 3)).toBe(true);
  });
});

describe("computeDefaultSizes", () => {
  test("all open → 22/43/35", () => {
    expect(
      computeDefaultSizes({ tasksOpen: true, mainOpen: true, chatOpen: true }),
    ).toEqual({ tasks: 22, main: 43, chat: 35 });
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
});
