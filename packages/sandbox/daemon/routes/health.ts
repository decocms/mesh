import type { Phase } from "../state";
import { getLastError } from "../state";
import { jsonResponse } from "./body-parser";

export interface HealthDeps {
  config: { daemonBootId: string };
  getReady: () => boolean;
  getSetup: () => { running: boolean; done: boolean };
  getPhase?: () => Phase;
}

export function makeHealthHandler(deps: HealthDeps): () => Response {
  return () =>
    jsonResponse({
      ready: deps.getReady(),
      bootId: deps.config.daemonBootId,
      setup: deps.getSetup(),
      phase: deps.getPhase ? deps.getPhase() : "ready",
      lastError: getLastError(),
    });
}
