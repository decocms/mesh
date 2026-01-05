import { useCallback, useRef } from "react";

/**
 * Hook for infinite scroll functionality using IntersectionObserver.
 *
 * @param onLoadMore - Callback function to load more items
 * @param hasMore - Whether there are more items to load
 * @param isLoading - Whether data is currently loading (prevents duplicate triggers)
 * @returns A ref callback to attach to the last element in the list
 *
 * @example
 * ```tsx
 * const lastElementRef = useInfiniteScroll(
 *   () => setPage(p => p + 1),
 *   items.length >= pageSize,
 *   isFetching
 * );
 *
 * return items.map((item, index) => (
 *   <div
 *     key={item.id}
 *     ref={index === items.length - 1 ? lastElementRef : null}
 *   >
 *     {item.name}
 *   </div>
 * ));
 * ```
 */
export function useInfiniteScroll(
  onLoadMore: () => void,
  hasMore: boolean,
  isLoading = false,
): (node: HTMLElement | null) => void {
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Use refs to always access the latest values inside the observer callback
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingRef = useRef(isLoading);
  onLoadMoreRef.current = onLoadMore;
  hasMoreRef.current = hasMore;
  isLoadingRef.current = isLoading;

  // Memoize the ref callback to prevent unnecessary observer recreation
  const lastElementRef = useCallback((node: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver((entries) => {
      if (
        entries[0]?.isIntersecting &&
        hasMoreRef.current &&
        !isLoadingRef.current
      ) {
        onLoadMoreRef.current();
      }
    });

    if (node) {
      observerRef.current.observe(node);
    }
  }, []);

  return lastElementRef;
}
