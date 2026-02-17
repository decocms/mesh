/**
 * Dirty State — Module-level pending save tracker
 *
 * Simple boolean store that tracks whether the page composer has unsaved changes.
 * Used by the site switcher to detect unsaved changes before switching sites.
 */

let _dirty = false;

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
