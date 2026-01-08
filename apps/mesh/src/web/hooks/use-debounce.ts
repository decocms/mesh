import { useState, useEffect } from "react";

/**
 * Hook that debounces a value by the specified delay.
 * Returns the debounced value that only updates after the delay has passed
 * without the input value changing.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
