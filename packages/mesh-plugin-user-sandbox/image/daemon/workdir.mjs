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

/** Deno wins over Node when a deno config is present (deco-sites ship both). */
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

/** Minimal JSONC — strips comments + trailing commas; enough for `tasks`. */
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
    } catch {}
  }
  return null;
}

export function pickScript(runtime, pkg, denoConfig) {
  // Prefer `dev` over `start`: deco/Fresh `start` points at a daemonizer
  // (@deco/deco/daemon/main.ts) that forks and exits 0 — which the supervisor
  // reads as a clean exit and respawns, orphaning port-8000 holders.
  if (runtime === "deno") {
    const tasks = (denoConfig && denoConfig.tasks) ?? {};
    if (typeof tasks.dev === "string") return "dev";
    if (typeof tasks.start === "string") return "start";
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

/** Shared by SSE replay, /dev/scripts, and startDev — keeps rules in one place. */
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
