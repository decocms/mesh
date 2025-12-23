import { useRef } from "react";

/**
 * Hook for infinite scroll functionality using IntersectionObserver.
 *
 * @param onLoadMore - Callback function to load more items
 * @param hasMore - Whether there are more items to load
 * @returns A ref callback to attach to the last element in the list
 *
 * @example
 * ```tsx
 * const lastElementRef = useInfiniteScroll(
 *   () => setPage(p => p + 1),
 *   items.length >= pageSize
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
): (node: HTMLElement | null) => void {
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Use refs to always access the latest values inside the observer callback
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  onLoadMoreRef.current = onLoadMore;
  hasMoreRef.current = hasMore;

  const lastElementRef = (node: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMoreRef.current) {
        onLoadMoreRef.current();
      }
    });

    if (node) {
      observerRef.current.observe(node);
    }
  };

  return lastElementRef;
}
