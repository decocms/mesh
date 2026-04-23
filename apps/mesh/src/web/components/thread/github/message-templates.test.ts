import { describe, expect, test } from "bun:test";
import * as tpl from "./message-templates";

describe("message-templates", () => {
  test("createPr renders owner/repo/branch/base", () => {
    const out = tpl.createPr({
      owner: "acme",
      repo: "web",
      branch: "feat/x",
      base: "main",
    });
    expect(out).toContain("acme/web");
    expect(out).toContain("feat/x");
    expect(out).toContain("main");
  });

  test("commitAndPush mentions commit and push", () => {
    const out = tpl.commitAndPush({
      owner: "acme",
      repo: "web",
      branch: "feat/x",
    });
    expect(out).toContain("acme/web");
    expect(out).toContain("feat/x");
    expect(out.toLowerCase()).toContain("commit");
    expect(out.toLowerCase()).toContain("push");
  });

  test("fixChecks lists failing checks and mentions fix/commit/push", () => {
    const out = tpl.fixChecks({
      owner: "acme",
      repo: "web",
      prNumber: 42,
      failingChecks: ["lint", "unit-test"],
    });
    expect(out).toContain("PR #42");
    expect(out).toContain("lint");
    expect(out).toContain("unit-test");
    expect(out.toLowerCase()).toContain("commit");
    expect(out.toLowerCase()).toContain("push");
  });

  test("markReadyForReview references PR number and uses GitHub tools", () => {
    const out = tpl.markReadyForReview({
      owner: "acme",
      repo: "web",
      prNumber: 7,
    });
    expect(out).toContain("PR #7");
    expect(out).toMatch(/github/i);
  });

  test("resolveReviewComments instructs code change + push + resolve", () => {
    const out = tpl.resolveReviewComments({
      owner: "acme",
      repo: "web",
      prNumber: 7,
    });
    expect(out).toContain("PR #7");
    expect(out.toLowerCase()).toContain("resolve");
    expect(out.toLowerCase()).toContain("push");
  });

  test("rebaseOnBase still works (regression)", () => {
    const out = tpl.rebaseOnBase({
      owner: "acme",
      repo: "web",
      branch: "feat/x",
      base: "main",
    });
    expect(out).toContain("feat/x");
    expect(out).toContain("main");
  });
});
