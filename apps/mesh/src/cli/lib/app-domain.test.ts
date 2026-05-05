import { describe, expect, it } from "bun:test";
import { computeAppDomain, computeAppHash } from "./app-domain";

describe("computeAppHash", () => {
  it("is the first 8 hex chars of sha1(`${workspace}-${app}`)", () => {
    // Golden value computed once with: echo -n "tlgimenes-my-app" | shasum -a 1
    // sha1 = "eca5dde8..." — first 8 chars match legacy getAppUUID exactly.
    expect(computeAppHash("tlgimenes", "my-app")).toBe("eca5dde8");
  });

  it("is stable across calls", () => {
    expect(computeAppHash("ws", "app")).toBe(computeAppHash("ws", "app"));
  });

  it("differs for different workspaces", () => {
    expect(computeAppHash("a", "x")).not.toBe(computeAppHash("b", "x"));
  });

  it("differs for different apps", () => {
    expect(computeAppHash("a", "x")).not.toBe(computeAppHash("a", "y"));
  });
});

describe("computeAppDomain", () => {
  it("returns localhost-<hash>.deco.host", () => {
    expect(computeAppDomain("tlgimenes", "my-app")).toBe(
      "localhost-eca5dde8.deco.host",
    );
  });
});
