/**
 * Creates a function that executes the factory only once.
 * - Concurrent calls share the same in-flight promise (prevents race conditions)
 * - On success: caches the result, subsequent calls return cached promise
 * - On failure: clears cache, next call will retry
 */
export function once<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;

  return () => {
    if (promise) {
      return promise;
    }

    promise = factory().catch((error) => {
      promise = null;
      throw error;
    });

    return promise;
  };
}
