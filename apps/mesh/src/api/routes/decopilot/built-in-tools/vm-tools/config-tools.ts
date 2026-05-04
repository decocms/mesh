/**
 * VM config tools — `get_vm_config` (read) and `set_vm_config` (patch).
 *
 * Speaks to the daemon's `/_decopilot_vm/config` endpoint via the runner
 * proxy. Surface is deliberately narrow:
 *
 *   - `auth.rotateToken` (wire-only) — not in the schema; can't be sent.
 *   - `git.repository.cloneUrl` (immutable) — not in the input schema;
 *     surfaced read-only on `get_vm_config`.
 *   - `git.repository.branch` — not in the input schema; surfaced
 *     read-only. Branch switches belong to a dedicated tool because
 *     `git checkout` can fail on a dirty working tree.
 *   - `git.identity.*` — intentionally not exposed at all (commits are
 *     authored by the user, not the agent).
 *   - `application.proxy.targetPort` (transient override clobbered on
 *     every dev restart) — surfaced read-only as `proxyTargetPort` for
 *     debugging; the writable knob is `previewPort` (`desiredPort`).
 */

import type { SandboxRunner } from "@decocms/sandbox/runner";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import { daemonRequest } from "./index";

const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun", "deno"] as const;
const RUNTIMES = ["node", "bun", "deno"] as const;
const INTENTS = ["running", "paused"] as const;

const PortSchema = z.number().int().min(1).max(65535);

export const SetVmConfigInputSchema = z
  .object({
    monorepoPath: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Subdirectory inside the repo where package.json lives, for " +
          "monorepos (e.g. 'apps/web'). Omit to use the repo root.",
      ),
    packageManager: z
      .enum(PACKAGE_MANAGERS)
      .optional()
      .describe(
        "Package manager. Change `runtime` together (npm/pnpm/yarn → " +
          "node, bun → bun, deno → deno).",
      ),
    runtime: z
      .enum(RUNTIMES)
      .optional()
      .describe("JS runtime. Usually mirrors `packageManager`."),
    intent: z
      .enum(INTENTS)
      .optional()
      .describe(
        "'running' starts/keeps the dev script alive (auto-flips to " +
          "'paused' if it exits non-zero); 'paused' stops it.",
      ),
    previewPort: PortSchema.optional().describe(
      "Override the dev script's PORT. Only set this if the daemon's " +
        "auto-detected port is wrong, or if you want the preview to point " +
        "at a different server you're running inside the sandbox.",
    ),
  })
  .refine(
    (v) =>
      v.monorepoPath !== undefined ||
      v.packageManager !== undefined ||
      v.runtime !== undefined ||
      v.intent !== undefined ||
      v.previewPort !== undefined,
    "At least one config field must be set.",
  );

export const GetVmConfigInputSchema = z.object({});

export type SetVmConfigInput = z.infer<typeof SetVmConfigInputSchema>;
export type GetVmConfigInput = z.infer<typeof GetVmConfigInputSchema>;

/**
 * User-facing shape returned by both tools. `cloneUrl`, `branch`, and
 * `proxyTargetPort` are read-only — visible on `get_vm_config` but absent
 * from the input schema.
 */
export interface UserFacingVmConfig {
  cloneUrl?: string;
  branch?: string;
  monorepoPath?: string;
  packageManager?: (typeof PACKAGE_MANAGERS)[number];
  runtime?: (typeof RUNTIMES)[number];
  intent?: (typeof INTENTS)[number];
  previewPort?: number;
  proxyTargetPort?: number;
}

const SET_VM_CONFIG_DESCRIPTION =
  "Patch the sandbox's runtime config: `monorepoPath`, `packageManager`, " +
  "`runtime`, `intent` (running/paused), `previewPort`. All fields are " +
  "optional and deep-merged. Returns the resulting config plus a " +
  "`transition` marker (e.g. 'pm-change', 'intent-change', 'no-op').";

const GET_VM_CONFIG_DESCRIPTION =
  "Read the sandbox's current runtime config. Use this before " +
  "`set_vm_config` to inspect state instead of guessing.";

export interface ConfigToolsParams {
  readonly runner: SandboxRunner;
  readonly ensureHandle: () => Promise<string>;
  readonly needsApproval: boolean;
}

/**
 * Daemon's GET response. PUT/POST also include `transition` — modeled
 * separately so the type system can't accidentally treat a GET as a
 * write outcome.
 */
interface DaemonReadResponse {
  bootId: string;
  config: DaemonConfig | null;
}

interface DaemonWriteResponse {
  bootId: string;
  transition: string;
  config: DaemonConfig;
}

/**
 * Mirror of the daemon's `TenantConfig` shape — duplicated here (instead of
 * imported from `@decocms/sandbox`) because the cross-package type would
 * couple the decopilot tool definition to the daemon's internal types,
 * which is exactly what the user-facing schema is supposed to insulate
 * us from. Keep this struct minimal — the mapper below only reads fields
 * we expose.
 */
interface DaemonConfig {
  git?: {
    repository?: {
      cloneUrl?: string;
      branch?: string;
    };
  };
  application?: {
    packageManager?: {
      name?: (typeof PACKAGE_MANAGERS)[number];
      path?: string;
    };
    runtime?: (typeof RUNTIMES)[number];
    intent?: (typeof INTENTS)[number];
    desiredPort?: number;
    proxy?: {
      targetPort?: number;
    };
  };
}

export function toDaemonPatch(
  input: SetVmConfigInput,
): Record<string, unknown> {
  const application: Record<string, unknown> = {};
  if (input.packageManager !== undefined || input.monorepoPath !== undefined) {
    const pm: Record<string, unknown> = {};
    if (input.packageManager !== undefined) pm.name = input.packageManager;
    if (input.monorepoPath !== undefined) pm.path = input.monorepoPath;
    application.packageManager = pm;
  }
  if (input.runtime !== undefined) application.runtime = input.runtime;
  if (input.intent !== undefined) application.intent = input.intent;
  if (input.previewPort !== undefined)
    application.desiredPort = input.previewPort;

  const patch: Record<string, unknown> = {};
  if (Object.keys(application).length > 0) patch.application = application;
  return patch;
}

export function fromDaemonConfig(
  config: DaemonConfig | null,
): UserFacingVmConfig {
  if (!config) return {};
  const out: UserFacingVmConfig = {};
  const repo = config.git?.repository;
  if (repo?.cloneUrl !== undefined) out.cloneUrl = repo.cloneUrl;
  if (repo?.branch !== undefined) out.branch = repo.branch;

  const app = config.application;
  if (app) {
    if (app.packageManager?.name !== undefined) {
      out.packageManager = app.packageManager.name;
    }
    if (app.packageManager?.path !== undefined) {
      out.monorepoPath = app.packageManager.path;
    }
    if (app.runtime !== undefined) out.runtime = app.runtime;
    if (app.intent !== undefined) out.intent = app.intent;
    if (app.desiredPort !== undefined) out.previewPort = app.desiredPort;
    if (app.proxy?.targetPort !== undefined) {
      out.proxyTargetPort = app.proxy.targetPort;
    }
  }
  return out;
}

const CONFIG_PATH = "/_decopilot_vm/config";

export function createConfigTools(params: ConfigToolsParams) {
  const { runner, ensureHandle, needsApproval } = params;

  const get_vm_config = tool({
    needsApproval: false,
    description: GET_VM_CONFIG_DESCRIPTION,
    inputSchema: zodSchema(GetVmConfigInputSchema),
    execute: async () => {
      const handle = await ensureHandle();
      const raw = (await daemonRequest(
        runner,
        handle,
        CONFIG_PATH,
        null,
        "GET",
      )) as DaemonReadResponse;
      return { config: fromDaemonConfig(raw.config) };
    },
  });

  const set_vm_config = tool({
    needsApproval,
    description: SET_VM_CONFIG_DESCRIPTION,
    inputSchema: zodSchema(SetVmConfigInputSchema),
    execute: async (input) => {
      const patch = toDaemonPatch(input);
      const handle = await ensureHandle();
      const raw = (await daemonRequest(
        runner,
        handle,
        CONFIG_PATH,
        patch,
        "PUT",
      )) as DaemonWriteResponse;
      return {
        transition: raw.transition,
        config: fromDaemonConfig(raw.config),
      };
    },
  });

  return { get_vm_config, set_vm_config };
}
