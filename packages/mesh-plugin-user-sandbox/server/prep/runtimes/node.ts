/**
 * Node runtime strategies.
 *
 * Four install flavours depending on lockfile — pnpm, yarn, npm-ci,
 * npm-install — each exported as a distinct Runtime so detection picks the
 * right one off the manifests in the workdir. They share the `node` name
 * because downstream (bake worker, prep storage) only cares about the
 * runtime family.
 *
 * No serve-time warmup: the Node ecosystem's cold-start surface is dominated
 * by `node_modules/` population, which `install` already handles. Anything
 * runtime-specific (e.g. Next.js `.next/` cache) is left for thread boot.
 */

import type { Runtime } from "./types";

export const PNPM_RUNTIME: Runtime = {
  name: "node",
  defaultInstallCommand: "pnpm install --frozen-lockfile",
};

export const YARN_RUNTIME: Runtime = {
  name: "node",
  defaultInstallCommand: "yarn install --frozen-lockfile",
};

export const NPM_CI_RUNTIME: Runtime = {
  name: "node",
  defaultInstallCommand: "npm ci",
};

export const NPM_INSTALL_RUNTIME: Runtime = {
  name: "node",
  defaultInstallCommand: "npm install",
};
