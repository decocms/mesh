/**
 * Hook to prioritize a list by placing a selected item first.
 * Useful for connection and tool selectors where the selected item
 * should appear at the top of the list.
 */
export function usePrioritizedList<T>(
  items: T[],
  selectedItem: T | null | undefined,
  getKey: (item: T) => string,
  compareFn?: (a: T, b: T) => number,
): T[] {
  if (!selectedItem) {
    return [...items].sort(compareFn);
  }

  const selectedKey = getKey(selectedItem);
  return [...items].sort((a, b) => {
    const aKey = getKey(a);
    const bKey = getKey(b);

    if (aKey === selectedKey) return -1;
    if (bKey === selectedKey) return 1;

    return compareFn ? compareFn(a, b) : 0;
  });
}

