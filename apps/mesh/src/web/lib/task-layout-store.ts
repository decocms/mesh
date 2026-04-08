/**
 * Per-task layout state persistence.
 * Stores which panels were open and which main view was active per taskId.
 * Tasks panel state is NOT stored here (it's global).
 */

const STORAGE_KEY = "mesh:task-layout";
const MAX_ENTRIES = 200;

interface TaskLayoutState {
  chatOpen?: boolean;
  mainOpen?: boolean;
  main?: string;
  id?: string;
  toolName?: string;
}

type Store = Record<string, TaskLayoutState>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  // Prune oldest entries if over limit
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    const toRemove = keys.slice(0, keys.length - MAX_ENTRIES);
    for (const key of toRemove) {
      delete store[key];
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage errors
  }
}

export function saveTaskLayout(taskId: string, state: TaskLayoutState) {
  const store = readStore();
  store[taskId] = state;
  writeStore(store);
}

export function getTaskLayout(taskId: string): TaskLayoutState | null {
  const store = readStore();
  return store[taskId] ?? null;
}
