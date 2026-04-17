import { describe, expect, test } from "bun:test";
import {
  parseAutomationTabId,
  resolveDefaultTabId,
  resolveActiveTabAndOpen,
} from "./tab-id";

describe("parseAutomationTabId", () => {
  test("automation:new → { kind: 'new' }", () => {
    expect(parseAutomationTabId("automation:new")).toEqual({ kind: "new" });
  });

  test("automation:<uuid> → { kind: 'existing', id }", () => {
    expect(parseAutomationTabId("automation:abc-123")).toEqual({
      kind: "existing",
      id: "abc-123",
    });
  });

  test("non-automation tab → null", () => {
    expect(parseAutomationTabId("instructions")).toBeNull();
    expect(parseAutomationTabId("layout")).toBeNull();
    expect(parseAutomationTabId(undefined)).toBeNull();
    expect(parseAutomationTabId("0")).toBeNull();
  });

  test("automation: with empty id → null", () => {
    expect(parseAutomationTabId("automation:")).toBeNull();
  });
});

describe("resolveDefaultTabId", () => {
  test("null metadata → 'instructions'", () => {
    expect(resolveDefaultTabId(null)).toBe("instructions");
  });

  test("defaultMainView null → 'instructions'", () => {
    expect(resolveDefaultTabId({ defaultMainView: null })).toBe("instructions");
  });

  test("settings + id='instructions' → 'instructions'", () => {
    expect(
      resolveDefaultTabId({
        defaultMainView: { type: "settings", id: "instructions" },
      }),
    ).toBe("instructions");
  });

  test("settings + id='connections' → 'connections'", () => {
    expect(
      resolveDefaultTabId({
        defaultMainView: { type: "settings", id: "connections" },
      }),
    ).toBe("connections");
  });

  test("settings no id → 'instructions'", () => {
    expect(resolveDefaultTabId({ defaultMainView: { type: "settings" } })).toBe(
      "instructions",
    );
  });

  test("ext-app with id → id", () => {
    expect(
      resolveDefaultTabId({
        defaultMainView: { type: "ext-app", id: "analytics" },
        tabs: [{ id: "analytics" }],
      }),
    ).toBe("analytics");
  });

  test("ext-app no id → first declared tab id", () => {
    expect(
      resolveDefaultTabId({
        defaultMainView: { type: "ext-app" },
        tabs: [{ id: "t1" }, { id: "t2" }],
      }),
    ).toBe("t1");
  });

  test("unknown type falls back to 'instructions'", () => {
    expect(
      resolveDefaultTabId({ defaultMainView: { type: "automation" } }),
    ).toBe("instructions");
  });
});

describe("resolveActiveTabAndOpen", () => {
  const meta = { defaultMainView: { type: "ext-app", id: "analytics" } };

  test("?main absent + defaultMainView set → open, tab = default", () => {
    expect(
      resolveActiveTabAndOpen({ mainParam: undefined, metadata: meta }),
    ).toEqual({ mainOpen: true, activeTab: "analytics" });
  });

  test("?main absent + no defaultMainView → closed, tab = 'instructions'", () => {
    expect(
      resolveActiveTabAndOpen({ mainParam: undefined, metadata: null }),
    ).toEqual({ mainOpen: false, activeTab: "instructions" });
  });

  test("?main=0 → closed, tab = default", () => {
    expect(resolveActiveTabAndOpen({ mainParam: "0", metadata: meta })).toEqual(
      { mainOpen: false, activeTab: "analytics" },
    );
  });

  test("?main=layout → open, tab = 'layout'", () => {
    expect(
      resolveActiveTabAndOpen({ mainParam: "layout", metadata: meta }),
    ).toEqual({ mainOpen: true, activeTab: "layout" });
  });

  test("?main=automation:abc → open, tab = 'automation:abc'", () => {
    expect(
      resolveActiveTabAndOpen({
        mainParam: "automation:abc",
        metadata: meta,
      }),
    ).toEqual({ mainOpen: true, activeTab: "automation:abc" });
  });
});
