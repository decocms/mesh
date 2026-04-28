import { jsonResponse } from "./body-parser";

export interface HealthDeps {
  config: { daemonBootId: string };
  getReady: () => boolean;
  getSetup: () => { running: boolean; done: boolean };
}

export function makeHealthHandler(deps: HealthDeps): () => Response {
  return () =>
    jsonResponse({
      ready: deps.getReady(),
      bootId: deps.config.daemonBootId,
      setup: deps.getSetup(),
    });
}
