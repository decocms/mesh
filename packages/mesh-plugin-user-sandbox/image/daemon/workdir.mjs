/**
 * Workdir inspection helpers: runtime/pm detection, config reading, script
 * listing. Pure filesystem lookups — no daemon state, no subprocess calls.
 */

import fs from "node:fs";
import path from "node:path";

function hasFile(workdir, f) {
  try {
    fs.accessSync(path.join(workdir, f));
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the runtime family. Caller may override via the `/dev/start` hint —
 * this is the fallback when no hint is passed. Deno wins over Node when any
 * Deno config file is present, since deco-sites and friends ship `deno.json`
 * but may also have a stray `package.json` for editor tooling.
 */
export function detectRuntime(workdir) {
  if (
    hasFile(workdir, "deno.json") ||
    hasFile(workdir, "deno.jsonc") ||
    hasFile(workdir, "deno.lock")
  ) {
    return "deno";
  }
  if (hasFile(workdir, "bun.lock") || hasFile(workdir, "bun.lockb")) {
    return "bun";
  }
  return "node";
}

export function detectPackageManager(workdir) {
  if (hasFile(workdir, "bun.lock") || hasFile(workdir, "bun.lockb"))
    return "bun";
  if (hasFile(workdir, "pnpm-lock.yaml")) return "pnpm";
  if (hasFile(workdir, "yarn.lock")) return "yarn";
  if (hasFile(workdir, "package-lock.json")) return "npm";
  return "bun";
}

export function readPackageJson(workdir) {
  try {
    const raw = fs.readFileSync(path.join(workdir, "package.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Minimal JSONC support: strip `//` line comments and `/* *\/` block comments,
 * and trim trailing commas. Not a full JSONC parser — good enough for the
 * `tasks` field, which is what we read.
 */
function parseJsonc(raw) {
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
}

export function readDenoConfig(workdir) {
  for (const f of ["deno.json", "deno.jsonc"]) {
    try {
      const raw = fs.readFileSync(path.join(workdir, f), "utf8");
      return f.endsWith(".jsonc") ? parseJsonc(raw) : JSON.parse(raw);
    } catch {
      // try next
    }
  }
  return null;
}

export function pickScript(runtime, pkg, denoConfig) {
  if (runtime === "deno") {
    const tasks = (denoConfig && denoConfig.tasks) ?? {};
    if (typeof tasks.start === "string") return "start";
    if (typeof tasks.dev === "string") return "dev";
    return null;
  }
  const scripts = (pkg && pkg.scripts) ?? {};
  if (typeof scripts.dev === "string") return "dev";
  if (typeof scripts.start === "string") return "start";
  return null;
}

function listScripts(runtime, pkg, denoConfig) {
  if (runtime === "deno") {
    const tasks = (denoConfig && denoConfig.tasks) ?? {};
    return Object.keys(tasks);
  }
  const scripts = (pkg && pkg.scripts) ?? {};
  return Object.keys(scripts);
}

/**
 * Sniff a workdir for runtime + available dev/start scripts + package manager.
 * Shared by the SSE replay, the /dev/scripts endpoint, and startDev so the
 * rules stay in one place.
 */
export function inspectWorkdir(cwd) {
  const runtime = detectRuntime(cwd);
  const pkg = readPackageJson(cwd);
  const denoConfig = runtime === "deno" ? readDenoConfig(cwd) : null;
  return {
    runtime,
    pkg,
    denoConfig,
    scripts: listScripts(runtime, pkg, denoConfig),
    pm: runtime === "deno" ? "deno" : detectPackageManager(cwd),
  };
}
