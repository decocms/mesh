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

/**
 * Lazy promise wrapper that defers execution until the promise is awaited.
 * The factory function is only called when .then() is invoked for the first time.
 * Concurrent calls share the same promise (prevents race conditions).
 */
class Lazy<T> implements PromiseLike<T> {
  private promise: Promise<T> | null = null;

  constructor(private factory: () => Promise<T>) {}

  private getOrCreatePromise(): Promise<T> {
    if (!this.promise) {
      this.promise = this.factory();
    }
    return this.promise;
  }

  // eslint-disable-next-line no-thenable
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ): PromiseLike<TResult1 | TResult2> {
    return this.getOrCreatePromise().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | null
      | undefined,
  ): Promise<T | TResult> {
    return this.getOrCreatePromise().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<T> {
    return this.getOrCreatePromise().finally(onfinally);
  }
}

/**
 * Creates a lazy promise that defers execution until awaited.
 * - Factory is only called when the promise is first awaited
 * - Concurrent awaits share the same promise (prevents race conditions)
 * - Result is cached for subsequent awaits
 */
export function lazy<T>(factory: () => Promise<T>): Promise<T> {
  return new Lazy(factory) as unknown as Promise<T>;
}
