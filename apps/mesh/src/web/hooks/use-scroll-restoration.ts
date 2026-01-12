import { useRef } from "react";

/**
 * Hook to preserve scroll position across navigation
 * Uses sessionStorage to persist scroll position per key
 */
export function useScrollRestoration(key: string) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const storageKey = `scroll-position:${key}`;
  // Track which key was restored, not just if restored
  const restoredKeyRef = useRef<string | null>(null);

  // Save scroll position
  const saveScrollPosition = () => {
    if (scrollRef.current) {
      sessionStorage.setItem(storageKey, String(scrollRef.current.scrollTop));
    }
  };

  // Restore scroll position (call this in onScroll or after mount)
  const restoreScrollPosition = () => {
    // Skip if already restored for this key
    if (restoredKeyRef.current === storageKey) return;

    const saved = sessionStorage.getItem(storageKey);
    if (saved && scrollRef.current) {
      const scrollTop = Number.parseInt(saved, 10);
      scrollRef.current.scrollTop = scrollTop;
    }
    // Mark as restored for this key (even if no saved position)
    restoredKeyRef.current = storageKey;
  };

  // Handle scroll - restore on first scroll event if not yet restored
  const handleScroll = () => {
    if (restoredKeyRef.current !== storageKey) {
      restoreScrollPosition();
    }
  };

  // Ref callback to restore scroll when element mounts
  const setScrollRef = (element: HTMLDivElement | null) => {
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current =
      element;
    if (element && restoredKeyRef.current !== storageKey) {
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        restoreScrollPosition();
      });
    }
  };

  return { scrollRef: setScrollRef, saveScrollPosition, handleScroll };
}
