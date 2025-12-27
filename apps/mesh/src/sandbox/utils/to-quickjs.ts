import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import { inspect } from "./error-handling.ts";

export function toQuickJS(ctx: QuickJSContext, value: unknown): QuickJSHandle {
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
      if (Array.isArray(value)) {
        const arr = ctx.newArray();
        value.forEach((v, i) => {
          const hv = toQuickJS(ctx, v);
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
        const hv = toQuickJS(ctx, v);
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

              (result as Promise<unknown>)
                .then((resolvedValue: unknown) => {
                  try {
                    const quickJSValue = toQuickJS(ctx, resolvedValue);
                    deferredPromise.resolve(quickJSValue);
                    quickJSValue.dispose();
                    ctx.runtime.executePendingJobs();
                  } catch (e) {
                    const errorMsg = inspect(e);
                    const errorHandle = ctx.newString(
                      `Promise resolution error: ${errorMsg}`,
                    );
                    deferredPromise.reject(errorHandle);
                    errorHandle.dispose();
                    ctx.runtime.executePendingJobs();
                  }
                })
                .catch((error: unknown) => {
                  const errorMsg = inspect(error);
                  const errorHandle = ctx.newString(
                    `Promise rejection: ${errorMsg}`,
                  );
                  deferredPromise.reject(errorHandle);
                  errorHandle.dispose();
                  ctx.runtime.executePendingJobs();
                });

              return deferredPromise.handle;
            }

            return toQuickJS(ctx, result);
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
