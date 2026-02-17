/**
 * Site Store — Multi-site state management
 *
 * Module-level store following the useSyncExternalStore pattern (same as editor-client.ts).
 * Tracks multiple site connections and the active site ID with localStorage persistence.
 */

import { useSyncExternalStore } from "react";

export interface SiteConnection {
  connectionId: string;
  projectPath: string;
  displayName: string;
  status: "active" | "inactive" | "error";
}

interface SiteStoreState {
  sites: SiteConnection[];
  activeSiteId: string | null;
}

// -- Module-level state --

let state: SiteStoreState = {
  sites: [],
  activeSiteId: null,
};

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) {
    fn();
  }
}

function getSnapshot(): SiteStoreState {
  return state;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

// -- localStorage helpers --

function storageKey(orgId: string, projectId: string): string {
  return `mesh:site-editor:${orgId}:${projectId}:active-site`;
}

function readPersistedSite(orgId: string, projectId: string): string | null {
  try {
    return localStorage.getItem(storageKey(orgId, projectId));
  } catch {
    return null;
  }
}

function persistSite(
  connectionId: string,
  orgId: string,
  projectId: string,
): void {
  try {
    localStorage.setItem(storageKey(orgId, projectId), connectionId);
  } catch {
    // localStorage not available — silently ignore
  }
}

// -- Public API --

/**
 * Extract the last path segment as a display name.
 * e.g. "/home/user/projects/anjo.chat" -> "anjo.chat"
 */
export function deriveDisplayName(projectPath: string): string {
  const trimmed = projectPath.replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  return lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
}

/**
 * Populate the site list. On first call, restores activeSiteId from localStorage.
 * If the persisted ID doesn't match any current site, falls back to the first site.
 */
export function setSites(
  sites: SiteConnection[],
  orgId: string,
  projectId: string,
): void {
  const persisted = readPersistedSite(orgId, projectId);
  const matchesPersisted = sites.some((s) => s.connectionId === persisted);
  const matchesCurrent = sites.some(
    (s) => s.connectionId === state.activeSiteId,
  );

  let activeSiteId: string | null;
  if (matchesCurrent) {
    // Keep current selection if it still exists in the new list
    activeSiteId = state.activeSiteId;
  } else if (matchesPersisted) {
    activeSiteId = persisted;
  } else {
    activeSiteId = sites[0]?.connectionId ?? null;
  }

  state = { sites, activeSiteId };

  if (activeSiteId) {
    persistSite(activeSiteId, orgId, projectId);
  }

  notify();
}

/**
 * Switch the active site and persist to localStorage.
 */
export function setActiveSite(
  connectionId: string,
  orgId: string,
  projectId: string,
): void {
  state = { ...state, activeSiteId: connectionId };
  persistSite(connectionId, orgId, projectId);
  notify();
}

/**
 * Synchronous getter for use outside React (e.g. dirty-state checks).
 */
export function getActiveSiteId(): string | null {
  return state.activeSiteId;
}

/**
 * React hook — returns the full site store state via useSyncExternalStore.
 */
export function useSiteStore(): SiteStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
