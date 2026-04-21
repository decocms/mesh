/**
 * Fallback runtime for workdirs with no recognised manifest. The bake is
 * still useful — the clone step pre-populates `/app` and the committed
 * image saves thread boot from cloning again.
 */

import type { Runtime } from "./types";

const NONE_RUNTIME: Runtime = {
  name: "none",
  defaultInstallCommand: "echo 'no manifest detected; skipping install'",
};

export default NONE_RUNTIME;
