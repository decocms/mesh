import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";

export type SandboxLog = { type: "log" | "warn" | "error"; content: string };

export interface ConsoleBuiltin {
  readonly logs: SandboxLog[];
  [Symbol.dispose]: () => void;
}

export function installConsole(ctx: QuickJSContext): ConsoleBuiltin {
  const logs: SandboxLog[] = [];
  const handles: QuickJSHandle[] = [];

  const makeLog = (level: "log" | "warn" | "error") => {
    const logFn = ctx.newFunction(level, (...args: QuickJSHandle[]) => {
      try {
        const parts = args.map((h) => ctx.dump(h));
        logs.push({
          type: level ?? "log",
          content: parts.map(String).join(" "),
        });
      } finally {
        args.forEach((h) => h.dispose());
      }
      return ctx.undefined;
    });
    handles.push(logFn);
    return logFn;
  };

  const consoleObj = ctx.newObject();
  handles.push(consoleObj);

  const log = makeLog("log");
  const warn = makeLog("warn");
  const error = makeLog("error");

  ctx.setProp(consoleObj, "log", log);
  ctx.setProp(consoleObj, "warn", warn);
  ctx.setProp(consoleObj, "error", error);
  ctx.setProp(ctx.global, "console", consoleObj);

  return {
    logs,
    [Symbol.dispose]() {
      handles.forEach((handle) => handle.dispose());
    },
  };
}
