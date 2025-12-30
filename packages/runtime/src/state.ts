import { AsyncLocalStorage } from "node:async_hooks";
import { DefaultEnv } from "./index.ts";
import type { AppContext } from "./tools.ts";

const asyncLocalStorage = new AsyncLocalStorage<AppContext | undefined>();

export const State = {
  getStore: () => {
    return asyncLocalStorage.getStore();
  },
  run: <TEnv extends DefaultEnv<any, any>, R, TArgs extends unknown[]>(
    ctx: AppContext<TEnv>,
    f: (...args: TArgs) => R,
    ...args: TArgs
  ): R => asyncLocalStorage.run(ctx, f, ...args),
};
