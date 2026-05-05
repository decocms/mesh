import type { AppStateSnapshot } from "../app/application-service";
import { jsonResponse } from "./body-parser";

export interface HealthDeps {
  config: { daemonBootId: string };
  getReady: () => boolean;
  getApp: () => AppStateSnapshot;
  getOrchestrator: () => { running: boolean; pending: number };
  getConfigured: () => boolean;
}

export function makeHealthHandler(deps: HealthDeps): () => Response {
  return () =>
    jsonResponse({
      ready: deps.getReady(),
      bootId: deps.config.daemonBootId,
      configured: deps.getConfigured(),
      app: deps.getApp(),
      orchestrator: deps.getOrchestrator(),
      // Legacy field — runners and the e2e tests still expect a `setup`
      // shape with { running, done }. We translate orchestrator state.
      setup: {
        running: deps.getOrchestrator().running,
        done: deps.getApp().status === "up" || deps.getApp().status === "idle",
      },
    });
}
