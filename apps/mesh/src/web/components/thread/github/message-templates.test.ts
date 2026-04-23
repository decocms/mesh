import { describe, expect, test } from "bun:test";
import * as tpl from "./message-templates";

describe("message-templates", () => {
  test("commitAndPush mentions commit and push", () => {
    const out = tpl.commitAndPush();
    expect(out.toLowerCase()).toContain("commit");
    expect(out.toLowerCase()).toContain("push");
  });

  test("createPr mentions pull request", () => {
    const out = tpl.createPr();
    expect(out.toLowerCase()).toContain("pull request");
  });

  test("reopenPr is a single imperative", () => {
    const out = tpl.reopenPr();
    expect(out.toLowerCase()).toContain("reopen");
  });

  test("rebaseOnBase mentions rebase and force-push", () => {
    const out = tpl.rebaseOnBase();
    expect(out.toLowerCase()).toContain("rebase");
    expect(out.toLowerCase()).toContain("force-push");
  });

  test("fixChecks lists failing checks and mentions fix/commit/push", () => {
    const out = tpl.fixChecks({ failingChecks: ["lint", "unit-test"] });
    expect(out).toContain("lint");
    expect(out).toContain("unit-test");
    expect(out.toLowerCase()).toContain("commit");
    expect(out.toLowerCase()).toContain("push");
  });

  test("markReadyForReview mentions ready for review", () => {
    const out = tpl.markReadyForReview();
    expect(out.toLowerCase()).toContain("ready for review");
  });

  test("resolveReviewComments instructs code change + push + resolve", () => {
    const out = tpl.resolveReviewComments();
    expect(out.toLowerCase()).toContain("resolve");
    expect(out.toLowerCase()).toContain("push");
  });

  test("reviewPr instructs a read-and-comment pass", () => {
    const out = tpl.reviewPr();
    expect(out.toLowerCase()).toContain("review");
    expect(out.toLowerCase()).toContain("not modify");
  });

  test("mergeSquash mentions squash-merge", () => {
    const out = tpl.mergeSquash();
    expect(out.toLowerCase()).toContain("squash-merge");
  });

  test("rerunCheck references the check name", () => {
    const out = tpl.rerunCheck({ checkName: "lint" });
    expect(out).toContain("lint");
    expect(out.toLowerCase()).toContain("re-run");
  });
});
