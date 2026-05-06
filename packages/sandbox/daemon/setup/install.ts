import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_MANAGER_DAEMON_CONFIG } from "../constants";
import { resolvePmRoot } from "../paths";
import type { Config } from "../types";
import { spawnSetupStep } from "./spawn-step";

export interface InstallDeps {
  config: Config;
  dropPrivileges?: boolean;
  onChunk: (source: "setup", data: string) => void;
}

export function spawnInstall(deps: InstallDeps): Promise<number> | null {
  const { config } = deps;
  const pm = config.application?.packageManager?.name;
  if (!pm) return null;
  const pmConfig = PACKAGE_MANAGER_DAEMON_CONFIG[pm];
  if (!pmConfig) return null;
  // No install command (e.g. deno) — runtime fetches deps lazily on first
  // task. Caller treats null as "nothing to do" and proceeds to start.
  if (!pmConfig.install) return null;
  const installRoot = resolvePmRoot(
    config.repoDir,
    config.application?.packageManager?.path,
  );
  const hasManifest = pmConfig.manifests.some((file) =>
    existsSync(join(installRoot, file)),
  );
  if (!hasManifest) {
    deps.onChunk(
      "setup",
      `\r\n[install] no package manifest (${pmConfig.manifests.join(" or ")}) found at ${installRoot} — skipping install\r\n`,
    );
    return null;
  }
  const registryUrl = process.env.NPM_CONFIG_REGISTRY;
  const nodeCacheDir = process.env.NODE_CACHE_DIR;
  if (registryUrl || nodeCacheDir) {
    let npmrc = registryUrl ? `registry=${registryUrl}\n` : "";
    if (pm === "pnpm" && nodeCacheDir) {
      npmrc += `store-dir=${nodeCacheDir}/pnpm\n`;
    }
    if (npmrc) writeFileSync(join(installRoot, ".npmrc"), npmrc);
    if (pm === "yarn" && registryUrl) {
      writeFileSync(
        join(installRoot, ".yarnrc"),
        `registry "${registryUrl}"\n`,
      );
    }
  }
  const corepack =
    "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CYPRESS_INSTALL_BINARY=0 PUPPETEER_SKIP_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 && (corepack enable 2>/dev/null || true) && ";
  const cmd = `${config.runtimePathPrefix}cd ${installRoot} && ${corepack}${pmConfig.install}`;
  deps.onChunk("setup", `\r\n$ ${pmConfig.install}\r\n`);
  return spawnSetupStep(cmd, deps.onChunk, deps.dropPrivileges);
}
