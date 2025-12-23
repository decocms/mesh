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

  const lastElementRef = (node: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore) {
        onLoadMore();
      }
    });

    if (node) {
      observerRef.current.observe(node);
    }
  };

  return lastElementRef;
}

