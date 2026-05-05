/**
 * Pure preview-state decision: maps the ~10 conditional inputs from
 * preview.tsx into a discriminated state union. Extracted so it can be
 * unit-tested without DOM/auth/SSE scaffolding.
 *
 * Priority order (highest first):
 *   error → suspended → booting → no-html → iframe → idle
 *
 * `bootEverReady` is the latch that keeps the iframe (or no-html) state
 * mounted across transient probe-down events (e.g. brief network hiccup
 * after the server has already proved it's up). Once the active port has
 * responded at least once, we trust the last-known `htmlSupport` rather
 * than dropping back into "booting" on every probe miss.
 */

export type ClaimPhaseLike = { kind: string };

export interface PreviewStateInput {
  previewUrl: string | null;
  responded: boolean;
  htmlSupport: boolean;
  suspended: boolean;
  appPaused: boolean;
  vmStartPending: boolean;
  lastStartError: string | null;
  claimPhase: ClaimPhaseLike | null;
  notFound: boolean;
  bootEverReady: boolean;
}

export type PreviewState =
  | { kind: "idle" }
  | { kind: "booting" }
  | { kind: "error"; error: string }
  | { kind: "suspended" }
  | { kind: "no-html"; previewUrl: string }
  | { kind: "iframe"; previewUrl: string };

export function computePreviewState(input: PreviewStateInput): PreviewState {
  if (input.lastStartError) {
    return { kind: "error", error: input.lastStartError };
  }
  if (input.suspended || input.appPaused) {
    return { kind: "suspended" };
  }
  if (input.notFound) {
    return { kind: "booting" };
  }
  // VM_START in flight before previewUrl populates → boot overlay.
  if (!input.previewUrl && input.vmStartPending) {
    return { kind: "booting" };
  }
  // Pre-daemon lifecycle (capacity wait, image pull, etc.) without previewUrl yet.
  if (
    !input.previewUrl &&
    input.claimPhase &&
    input.claimPhase.kind !== "failed"
  ) {
    return { kind: "booting" };
  }
  if (!input.previewUrl) {
    return { kind: "idle" };
  }
  // previewUrl set: decide between iframe / no-html / booting.
  // Latch on `bootEverReady`: once port has responded, trust last-known htmlSupport.
  if (input.responded || input.bootEverReady) {
    if (input.htmlSupport) {
      return { kind: "iframe", previewUrl: input.previewUrl };
    }
    return { kind: "no-html", previewUrl: input.previewUrl };
  }
  return { kind: "booting" };
}
