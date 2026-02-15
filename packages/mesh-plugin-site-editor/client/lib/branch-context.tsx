/**
 * Branch Store
 *
 * Module-level store for the current branch state.
 * Uses useSyncExternalStore so header and route components can share
 * branch state without needing a common provider ancestor.
 */

import { useSyncExternalStore } from "react";

type Listener = () => void;

let currentBranch = "main";
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string {
  return currentBranch;
}

function setCurrentBranch(branch: string): void {
  if (branch === currentBranch) return;
  currentBranch = branch;
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Hook to access the current branch and setter.
 * Works across any component in the site-editor plugin tree
 * without requiring a shared context provider.
 */
export function useBranch(): {
  currentBranch: string;
  setCurrentBranch: (branch: string) => void;
} {
  const branch = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { currentBranch: branch, setCurrentBranch };
}
