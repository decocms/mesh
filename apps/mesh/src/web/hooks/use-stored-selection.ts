import { useLocalStorage } from "./use-local-storage";

/**
 * Helper to find stored item in array, fallback to first item
 */
function findOrFirst<T>(
  array: T[],
  predicate: (item: T) => boolean,
): T | undefined {
  return array.find(predicate) ?? array[0];
}

/**
 * Hook that combines useLocalStorage with findOrFirst to manage selected items
 */
export function useStoredSelection<TState, TItem>(
  key: string,
  items: TItem[],
  predicate: (item: TItem, state: TState) => boolean,
  initialValue: TState | null = null,
) {
  const [storedState, setStoredState] = useLocalStorage<TState | null>(
    key,
    initialValue,
  );

  const selectedItem = findOrFirst(items, (item) =>
    storedState ? predicate(item, storedState) : false,
  );

  return [selectedItem, setStoredState] as const;
}
