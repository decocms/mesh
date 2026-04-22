import { describe, expect, test } from "bun:test";
import {
  parseAutomationTabId,
  resolveDefaultTabId,
  resolveActiveTabAndOpen,
  resolveTabClickTarget,
  isAutomationsPillActive,
  resolveAutomationsPillClickTarget,
} from "./tab-id";

describe("parseAutomationTabId", () => {
  test("automation:<uuid> → { id }", () => {
    expect(parseAutomationTabId("automation:abc-123")).toEqual({
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

  test("ext-app id not in declared tabs → first declared tab id", () => {
    expect(
      resolveDefaultTabId({
        defaultMainView: { type: "ext-app", id: "stale" },
        tabs: [{ id: "t1" }, { id: "t2" }],
      }),
    ).toBe("t1");
  });

  test("ext-app id not in declared tabs and no tabs → 'instructions'", () => {
    expect(
      resolveDefaultTabId({
        defaultMainView: { type: "ext-app", id: "stale" },
        tabs: [],
      }),
    ).toBe("instructions");
  });

  test("ext-apps with id + toolName → pinned-view tab id", () => {
    expect(
      resolveDefaultTabId({
        defaultMainView: {
          type: "ext-apps",
          id: "conn-abc",
          toolName: "hello_world",
        },
        tabs: [],
      }),
    ).toBe("app:conn-abc:hello_world");
  });

  test("instructions → 'instructions'", () => {
    expect(
      resolveDefaultTabId({ defaultMainView: { type: "instructions" } }),
    ).toBe("instructions");
  });

  test("connections → 'connections'", () => {
    expect(
      resolveDefaultTabId({ defaultMainView: { type: "connections" } }),
    ).toBe("connections");
  });

  test("layout → 'layout'", () => {
    expect(resolveDefaultTabId({ defaultMainView: { type: "layout" } })).toBe(
      "layout",
    );
  });

  test("env → 'env'", () => {
    expect(resolveDefaultTabId({ defaultMainView: { type: "env" } })).toBe(
      "env",
    );
  });

  test("legacy settings → 'layout'", () => {
    expect(resolveDefaultTabId({ defaultMainView: { type: "settings" } })).toBe(
      "layout",
    );
  });

  test("preview → 'preview'", () => {
    expect(resolveDefaultTabId({ defaultMainView: { type: "preview" } })).toBe(
      "preview",
    );
  });

  test("unknown type falls back to 'instructions'", () => {
    expect(
      resolveDefaultTabId({ defaultMainView: { type: "automation" } }),
    ).toBe("instructions");
  });

  test("hasActiveGithubRepo coerces null metadata fallback to 'git'", () => {
    expect(resolveDefaultTabId(null, true)).toBe("git");
  });

  test("hasActiveGithubRepo coerces instructions defaultMainView to 'git'", () => {
    expect(
      resolveDefaultTabId({ defaultMainView: { type: "instructions" } }, true),
    ).toBe("git");
  });

  test("hasActiveGithubRepo leaves non-instructions system tabs unchanged", () => {
    expect(
      resolveDefaultTabId({ defaultMainView: { type: "connections" } }, true),
    ).toBe("connections");
  });
});

describe("resolveActiveTabAndOpen", () => {
  const meta = {
    defaultMainView: { type: "ext-app", id: "analytics" },
    tabs: [{ id: "analytics" }],
  };

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

  test("?main absent + defaultMainView.type === 'chat' → closed (aligns with resolveDefaultPanelState)", () => {
    expect(
      resolveActiveTabAndOpen({
        mainParam: undefined,
        metadata: { defaultMainView: { type: "chat" } },
      }),
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

  test("hasActiveGithubRepo + ?main absent + no metadata → tab = 'git'", () => {
    expect(
      resolveActiveTabAndOpen({
        mainParam: undefined,
        metadata: null,
        hasActiveGithubRepo: true,
      }),
    ).toEqual({ mainOpen: false, activeTab: "git" });
  });

  test("hasActiveGithubRepo + ?main=instructions → tab coerced to 'git'", () => {
    expect(
      resolveActiveTabAndOpen({
        mainParam: "instructions",
        metadata: null,
        hasActiveGithubRepo: true,
      }),
    ).toEqual({ mainOpen: true, activeTab: "git" });
  });
});

describe("resolveTabClickTarget", () => {
  test("clicking active tab while panel open → close ('0')", () => {
    expect(
      resolveTabClickTarget({
        clickedId: "layout",
        activeTab: "layout",
        mainOpen: true,
      }),
    ).toBe("0");
  });

  test("clicking non-active tab while panel open → clicked id", () => {
    expect(
      resolveTabClickTarget({
        clickedId: "connections",
        activeTab: "layout",
        mainOpen: true,
      }),
    ).toBe("connections");
  });

  test("clicking any tab while panel closed → clicked id (open it)", () => {
    expect(
      resolveTabClickTarget({
        clickedId: "layout",
        activeTab: "layout",
        mainOpen: false,
      }),
    ).toBe("layout");
    expect(
      resolveTabClickTarget({
        clickedId: "instructions",
        activeTab: "layout",
        mainOpen: false,
      }),
    ).toBe("instructions");
  });
});

describe("isAutomationsPillActive", () => {
  test("activeTab='automations' and panel open → true", () => {
    expect(
      isAutomationsPillActive({ activeTab: "automations", mainOpen: true }),
    ).toBe(true);
  });

  test("activeTab='automation:abc' and panel open → true", () => {
    expect(
      isAutomationsPillActive({ activeTab: "automation:abc", mainOpen: true }),
    ).toBe(true);
  });

  test("activeTab='automation:new' and panel open → true", () => {
    expect(
      isAutomationsPillActive({ activeTab: "automation:new", mainOpen: true }),
    ).toBe(true);
  });

  test("panel closed → false even when activeTab matches", () => {
    expect(
      isAutomationsPillActive({ activeTab: "automations", mainOpen: false }),
    ).toBe(false);
    expect(
      isAutomationsPillActive({ activeTab: "automation:abc", mainOpen: false }),
    ).toBe(false);
  });

  test("non-automation tab → false", () => {
    expect(
      isAutomationsPillActive({ activeTab: "instructions", mainOpen: true }),
    ).toBe(false);
    expect(
      isAutomationsPillActive({ activeTab: "connections", mainOpen: true }),
    ).toBe(false);
  });
});

describe("resolveAutomationsPillClickTarget", () => {
  test("panel closed → open the list", () => {
    expect(
      resolveAutomationsPillClickTarget({
        activeTab: "automations",
        mainOpen: false,
      }),
    ).toBe("automations");
  });

  test("on detail (automation:<id>) → navigate up to list", () => {
    expect(
      resolveAutomationsPillClickTarget({
        activeTab: "automation:abc",
        mainOpen: true,
      }),
    ).toBe("automations");
  });

  test("on detail (automation:new) → navigate up to list", () => {
    expect(
      resolveAutomationsPillClickTarget({
        activeTab: "automation:new",
        mainOpen: true,
      }),
    ).toBe("automations");
  });

  test("on list while panel open → close ('0')", () => {
    expect(
      resolveAutomationsPillClickTarget({
        activeTab: "automations",
        mainOpen: true,
      }),
    ).toBe("0");
  });

  test("on unrelated tab → open list", () => {
    expect(
      resolveAutomationsPillClickTarget({
        activeTab: "instructions",
        mainOpen: true,
      }),
    ).toBe("automations");
  });
});
