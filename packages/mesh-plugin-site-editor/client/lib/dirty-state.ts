/**
 * Dirty State — Module-level pending save tracker
 *
 * Simple boolean store that tracks whether the page composer has unsaved changes.
 * Used by the site switcher to detect unsaved changes before switching sites.
 */

let _dirty = false;
let _flushFn: (() => Promise<void>) | null = null;

/** Mark the page as having unsaved changes. */
export function markDirty(): void {
  _dirty = true;
}

/** Mark the page as clean (saved or discarded). */
export function markClean(): void {
  _dirty = false;
}

/** Check whether there are pending unsaved changes. */
export function hasPendingSave(): boolean {
  return _dirty;
}

/** Register a flush callback (called by page-composer to wire up immediate save). */
export function registerFlush(fn: () => Promise<void>): void {
  _flushFn = fn;
}

/** Flush pending save immediately (calls the registered callback), then mark clean. */
export async function flushPendingSave(): Promise<void> {
  if (_flushFn) await _flushFn();
  markClean();
}

/** Cancel pending save and mark clean (for discard flow). */
export function cancelPendingSave(): void {
  markClean();
}
