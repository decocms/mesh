import { useEffect, useRef, useCallback } from "react";

/**
 * Hook to preserve scroll position across navigation
 * Uses sessionStorage to persist scroll position per key
 */
export function useScrollRestoration(key: string) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const storageKey = `scroll-position:${key}`;

  // Restore scroll position on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved && scrollRef.current) {
      const scrollTop = Number.parseInt(saved, 10);
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollTop;
        }
      });
    }
  }, [storageKey]);

  // Save scroll position before unmount or navigation
  const saveScrollPosition = useCallback(() => {
    if (scrollRef.current) {
      sessionStorage.setItem(storageKey, String(scrollRef.current.scrollTop));
    }
  }, [storageKey]);

  // Save on unmount
  useEffect(() => {
    return () => {
      saveScrollPosition();
    };
  }, [saveScrollPosition]);

  return { scrollRef, saveScrollPosition };
}
