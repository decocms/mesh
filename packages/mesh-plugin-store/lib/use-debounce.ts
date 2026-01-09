import { useState, useEffect, useRef } from "react";

/**
 * Hook that debounces a value by the specified delay.
 * Returns the debounced value that only updates after the delay has passed
 * without the input value changing.
 *
 * Use this for rate-limiting network requests (e.g., search API calls).
 * Note: This is different from useDeferredValue which only defers render priority.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    // Skip debounce on first render - use initial value immediately
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, delay]);

  return debouncedValue;
}
