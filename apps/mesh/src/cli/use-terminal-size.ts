import { useSyncExternalStore } from "react";

interface TerminalSize {
  rows: number;
  columns: number;
}

let cachedSnapshot: TerminalSize = {
  rows: process.stdout.rows || 24,
  columns: process.stdout.columns || 80,
};

function getSnapshot(): TerminalSize {
  const rows = process.stdout.rows || 24;
  const columns = process.stdout.columns || 80;

  if (rows !== cachedSnapshot.rows || columns !== cachedSnapshot.columns) {
    cachedSnapshot = { rows, columns };
  }

  return cachedSnapshot;
}

function subscribe(callback: () => void): () => void {
  process.stdout.on("resize", callback);
  return () => {
    process.stdout.off("resize", callback);
  };
}

export function useTerminalSize(): TerminalSize {
  return useSyncExternalStore(subscribe, getSnapshot);
}
