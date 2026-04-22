/**
 * VM File Tools — runner-kind dispatch.
 *
 * Registers the same six LLM-visible tools (read/write/edit/grep/glob/bash)
 * regardless of which runner the mesh was booted with. Input/output schemas
 * and descriptions live in `./schemas` so both transports are literally the
 * same LLM API; only the wire path differs.
 */

import { createDockerVmTools } from "./docker";
import { createFreestyleVmTools } from "./freestyle";
import type { VmToolsParams } from "./types";

export type { VmToolsParams } from "./types";

export function createVmTools(params: VmToolsParams) {
  switch (params.runner) {
    case "freestyle":
      return createFreestyleVmTools(params);
    case "docker":
      return createDockerVmTools(params);
  }
}
