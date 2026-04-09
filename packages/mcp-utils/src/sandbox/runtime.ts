import {
  DefaultIntrinsics,
  type Intrinsics,
  type QuickJSContext,
  type QuickJSRuntime,
} from "quickjs-emscripten-core";
import { getQuickJS } from "./quickjs.ts";

export interface SandboxRuntimeOptions {
  memoryLimitBytes?: number;
  stackSizeBytes?: number;
}

export interface SandboxContextOptions extends Intrinsics {
  interruptAfterMs?: number;
}

export interface SandboxRuntime {
  newContext: (options?: SandboxContextOptions) => QuickJSContext;
  dispose: () => void;
  [Symbol.dispose]: () => void;
}

/**
 * Creates a fresh QuickJS runtime.
 *
 * Note: we intentionally create a new runtime per `run_code` execution to avoid
 * concurrency issues with a shared runtime interrupt handler.
 */
export async function createSandboxRuntime(
  options: SandboxRuntimeOptions = {},
): Promise<SandboxRuntime> {
  const QuickJS = await getQuickJS();
  const runtime: QuickJSRuntime = QuickJS.newRuntime({
    maxStackSizeBytes: options.stackSizeBytes,
    memoryLimitBytes: options.memoryLimitBytes,
  });

  const newContext = ({
    interruptAfterMs,
    ...intrinsics
  }: SandboxContextOptions = {}): QuickJSContext => {
    const ctx = runtime.newContext({
      intrinsics: { ...DefaultIntrinsics, ...intrinsics },
    });

    let deadline = 0;
    const setDeadline = (ms?: number) => {
      deadline = ms ? Date.now() + ms : 0;
    };

    runtime.setInterruptHandler(() => {
      const now = Date.now();
      const shouldInterrupt = deadline > 0 && now > deadline;
      if (shouldInterrupt) {
      }
      return shouldInterrupt;
    });

    if (interruptAfterMs) {
      setDeadline(interruptAfterMs);
    }
    return ctx;
  };

  const safeDispose = () => {
    try {
      runtime.dispose();
    } catch (err) {
      // When host promises (e.g. client.callTool) are still in-flight at disposal
      // time, the QuickJS WASM module may throw a RuntimeError from the
      // gc_obj_list assertion in JS_FreeRuntime. This is non-fatal — the runtime
      // memory is still freed by the WASM allocator. Swallow the error to prevent
      // it from crashing the process.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("gc_obj_list")) {
        return;
      }
      throw err;
    }
  };

  return {
    newContext,
    dispose: safeDispose,
    [Symbol.dispose]: safeDispose,
  };
}
