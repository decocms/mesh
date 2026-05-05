import { describe, expect, test } from "bun:test";
import { computePreviewState } from "./preview-state";
import type { PreviewStateInput } from "./preview-state";

const base: PreviewStateInput = {
  previewUrl: "http://localhost:5173",
  responded: false,
  htmlSupport: false,
  suspended: false,
  appPaused: false,
  vmStartPending: false,
  lastStartError: null,
  claimPhase: null,
  notFound: false,
  bootEverReady: false,
};

describe("computePreviewState", () => {
  test("error wins over everything", () => {
    expect(
      computePreviewState({
        ...base,
        lastStartError: "boom",
        responded: true,
        htmlSupport: true,
      }),
    ).toEqual({ kind: "error", error: "boom" });
  });

  test("suspended wins over content states", () => {
    expect(
      computePreviewState({
        ...base,
        suspended: true,
        responded: true,
        htmlSupport: true,
      }),
    ).toEqual({ kind: "suspended" });
  });

  test("appPaused wins over content states", () => {
    expect(
      computePreviewState({
        ...base,
        appPaused: true,
        responded: true,
        htmlSupport: true,
      }),
    ).toEqual({ kind: "suspended" });
  });

  test("notFound triggers booting overlay", () => {
    expect(
      computePreviewState({
        ...base,
        notFound: true,
      }),
    ).toEqual({ kind: "booting" });
  });

  test("vmStartPending without previewUrl → booting", () => {
    expect(
      computePreviewState({
        ...base,
        previewUrl: null,
        vmStartPending: true,
      }),
    ).toEqual({ kind: "booting" });
  });

  test("previewUrl set, responded but not html → no-html empty state", () => {
    expect(
      computePreviewState({
        ...base,
        responded: true,
        htmlSupport: false,
      }),
    ).toEqual({ kind: "no-html", previewUrl: "http://localhost:5173" });
  });

  test("previewUrl set, responded and html → iframe", () => {
    expect(
      computePreviewState({
        ...base,
        responded: true,
        htmlSupport: true,
      }),
    ).toEqual({ kind: "iframe", previewUrl: "http://localhost:5173" });
  });

  test("previewUrl set, never responded yet → booting", () => {
    expect(
      computePreviewState({
        ...base,
        responded: false,
      }),
    ).toEqual({ kind: "booting" });
  });

  test("bootEverReady persists iframe across transient probe-down (htmlSupport snapshot=true)", () => {
    expect(
      computePreviewState({
        ...base,
        responded: false,
        htmlSupport: true,
        bootEverReady: true,
      }),
    ).toEqual({ kind: "iframe", previewUrl: "http://localhost:5173" });
  });

  test("bootEverReady persists no-html across transient probe-down (htmlSupport snapshot=false)", () => {
    expect(
      computePreviewState({
        ...base,
        responded: false,
        htmlSupport: false,
        bootEverReady: true,
      }),
    ).toEqual({ kind: "no-html", previewUrl: "http://localhost:5173" });
  });

  test("no previewUrl, no startError, no pending, no lifecycle → idle", () => {
    expect(
      computePreviewState({
        ...base,
        previewUrl: null,
      }),
    ).toEqual({ kind: "idle" });
  });

  test("lifecycleActive with no previewUrl → booting", () => {
    expect(
      computePreviewState({
        ...base,
        previewUrl: null,
        claimPhase: { kind: "claiming" },
      }),
    ).toEqual({ kind: "booting" });
  });
});
