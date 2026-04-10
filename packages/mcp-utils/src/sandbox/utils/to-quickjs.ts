import type {
  QuickJSContext,
  QuickJSDeferredPromise,
  QuickJSHandle,
} from "quickjs-emscripten-core";
import { inspect } from "./error-handling.ts";

/**
 * Tracks deferred promises created by host-function-to-QuickJS bridging.
 * Must be disposed before the QuickJS runtime to avoid gc_obj_list assertion failures.
 *
 * When a host function returns a Promise, toQuickJS creates a QuickJSDeferredPromise
 * with three handles: `handle` (the promise), `resolve`, and `reject`. The `handle` is
 * returned to the QuickJS VM and owned by it. The `resolve`/`reject` handles are retained
 * by the host for the async callback. If the runtime is disposed before the callback fires,
 * these handles leak and cause the gc_obj_list assertion.
 */
export class PendingPromiseTracker {
  private pending = new Set<QuickJSDeferredPromise>();

  add(promise: QuickJSDeferredPromise) {
    this.pending.add(promise);
  }

  remove(promise: QuickJSDeferredPromise) {
    this.pending.delete(promise);
  }

  /**
   * Dispose all outstanding deferred promises before the runtime is freed.
   * Call this before disposing the QuickJS context/runtime.
   */
  dispose() {
    for (const p of this.pending) {
      try {
        p.dispose();
      } catch {
        // Already disposed or partially consumed — ignore
      }
    }
    this.pending.clear();
  }
}

export function toQuickJS(
  ctx: QuickJSContext,
  value: unknown,
  maxDepth: number = 50,
  _depth: number = 0,
  _seen: WeakSet<object> = new WeakSet(),
  _tracker?: PendingPromiseTracker,
): QuickJSHandle {
  if (_depth > maxDepth) {
    return ctx.newString("[max depth exceeded]");
  }

  switch (typeof value) {
    case "string":
      return ctx.newString(value);
    case "number":
      return ctx.newNumber(value);
    case "boolean":
      return value ? ctx.true : ctx.false;
    case "undefined":
      return ctx.undefined;
    case "object": {
      if (value === null) return ctx.null;

      if (_seen.has(value as object)) {
        return ctx.newString("[circular reference]");
      }
      _seen.add(value as object);

      if (Array.isArray(value)) {
        const arr = ctx.newArray();
        value.forEach((v, i) => {
          const hv = toQuickJS(ctx, v, maxDepth, _depth + 1, _seen, _tracker);
          try {
            ctx.setProp(arr, String(i), hv);
          } finally {
            // Setting a property retains a reference inside the VM.
            // We must dispose the temporary handle we created to avoid leaks.
            hv.dispose?.();
          }
        });
        return arr;
      }

      const obj = ctx.newObject();
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const hv = toQuickJS(ctx, v, maxDepth, _depth + 1, _seen, _tracker);
        try {
          ctx.setProp(obj, k, hv);
        } finally {
          // Setting a property retains a reference inside the VM.
          // We must dispose the temporary handle we created to avoid leaks.
          hv.dispose?.();
        }
      }
      return obj;
    }
    case "function": {
      const functionId = `__hostFn_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const proxyFn = ctx.newFunction(
        functionId,
        (...args: QuickJSHandle[]) => {
          try {
            const jsArgs = args.map((h) => ctx.dump(h));
            const result = value(...jsArgs);

            if (
              result &&
              typeof (result as Promise<unknown>).then === "function"
            ) {
              const deferredPromise = ctx.newPromise();
              _tracker?.add(deferredPromise);

              (result as Promise<unknown>)
                .then((resolvedValue: unknown) => {
                  if (!ctx.alive) return;
                  try {
                    const quickJSValue = toQuickJS(
                      ctx,
                      resolvedValue,
                      maxDepth,
                      0,
                      new WeakSet(),
                      _tracker,
                    );
                    deferredPromise.resolve(quickJSValue);
                    quickJSValue.dispose();
                  } catch (e) {
                    if (!ctx.alive) return;
                    const errorMsg = inspect(e);
                    const errorHandle = ctx.newString(
                      `Promise resolution error: ${errorMsg}`,
                    );
                    deferredPromise.reject(errorHandle);
                    errorHandle.dispose();
                  } finally {
                    _tracker?.remove(deferredPromise);
                    if (ctx.alive) {
                      ctx.runtime.executePendingJobs();
                    }
                  }
                })
                .catch((error: unknown) => {
                  if (!ctx.alive) return;
                  try {
                    const errorMsg = inspect(error);
                    const errorHandle = ctx.newString(
                      `Promise rejection: ${errorMsg}`,
                    );
                    deferredPromise.reject(errorHandle);
                    errorHandle.dispose();
                    ctx.runtime.executePendingJobs();
                  } finally {
                    _tracker?.remove(deferredPromise);
                  }
                });

              return deferredPromise.handle;
            }

            return toQuickJS(ctx, result, maxDepth, 0, new WeakSet(), _tracker);
          } catch (e) {
            const msg = inspect(e);
            return ctx.newString(`HostFunctionError: ${msg}`);
          } finally {
            args.forEach((h) => h.dispose());
          }
        },
      );

      return proxyFn;
    }
    case "bigint":
      return ctx.newString(value.toString());
    case "symbol":
      return ctx.newString(value.toString());
    default: {
      try {
        return ctx.newString(String(value));
      } catch {
        return ctx.undefined;
      }
    }
  }
}
