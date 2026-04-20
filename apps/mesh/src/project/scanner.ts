/**
 * Project Scanner
 *
 * Detects the tech stack of a project directory by reading config files.
 * Pure function — no side effects, no subprocesses.
 */

import { join, basename } from "path";

export type FrameworkId =
  | "nextjs"
  | "fresh"
  | "astro"
  | "vite"
  | "remix"
  | "nuxt"
  | "bun";

export type PackageManager = "bun" | "npm" | "yarn" | "pnpm" | "deno";

export type DeployTarget = "vercel" | "netlify" | "deno-deploy" | "cloudflare";

export interface ContentDir {
  path: string;
  type: "blog" | "content" | "docs";
  /** Config file (e.g., blog/config.json) if found */
  configFile: string | null;
}

export interface ProjectScanResult {
  projectDir: string;
  projectName: string;
  framework: FrameworkId | null;
  packageManager: PackageManager;
  devCommand: string;
  devPort: number;
  buildCommand: string | null;
  deployTarget: DeployTarget | null;
  configFiles: string[];
  hasGit: boolean;
  contentDirs: ContentDir[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return await Bun.file(path).exists();
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    if (!(await fileExists(path))) return null;
    return JSON.parse(await Bun.file(path).text());
  } catch {
    return null;
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    if (!(await fileExists(path))) return null;
    return await Bun.file(path).text();
  } catch {
    return null;
  }
}

const FRAMEWORK_DEFAULTS: Record<
  FrameworkId,
  { devPort: number; devCommand: string; buildCommand: string }
> = {
  nextjs: { devPort: 3000, devCommand: "next dev", buildCommand: "next build" },
  fresh: {
    devPort: 8000,
    devCommand: "deno task dev",
    buildCommand: "deno task build",
  },
  astro: {
    devPort: 4321,
    devCommand: "astro dev",
    buildCommand: "astro build",
  },
  vite: {
    devPort: 5173,
    devCommand: "vite dev",
    buildCommand: "vite build",
  },
  remix: {
    devPort: 5173,
    devCommand: "remix vite:dev",
    buildCommand: "remix vite:build",
  },
  nuxt: { devPort: 3000, devCommand: "nuxt dev", buildCommand: "nuxt build" },
  bun: { devPort: 3000, devCommand: "bun dev", buildCommand: "bun run build" },
};

async function detectPackageManager(dir: string): Promise<PackageManager> {
  if (await fileExists(join(dir, "bun.lock"))) return "bun";
  if (await fileExists(join(dir, "bun.lockb"))) return "bun";
  if (await fileExists(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (await fileExists(join(dir, "yarn.lock"))) return "yarn";
  return "npm";
}

async function detectDeployTarget(dir: string): Promise<DeployTarget | null> {
  if (await fileExists(join(dir, "vercel.json"))) return "vercel";
  if (await fileExists(join(dir, "netlify.toml"))) return "netlify";
  if (await fileExists(join(dir, "wrangler.toml"))) return "cloudflare";
  if (await fileExists(join(dir, "wrangler.jsonc"))) return "cloudflare";

  // Check deno.json for deploy config
  const denoJson = await readJson(join(dir, "deno.json"));
  if (denoJson?.deploy) return "deno-deploy";

  return null;
}

async function detectFramework(
  dir: string,
  configFiles: string[],
): Promise<{ framework: FrameworkId | null; packageManager: PackageManager }> {
  // 1. Deno / Fresh
  const denoJsonPath = (await fileExists(join(dir, "deno.json")))
    ? "deno.json"
    : (await fileExists(join(dir, "deno.jsonc")))
      ? "deno.jsonc"
      : null;

  if (denoJsonPath) {
    configFiles.push(denoJsonPath);
    const content = await readText(join(dir, denoJsonPath));
    if (content && content.includes("$fresh")) {
      return { framework: "fresh", packageManager: "deno" };
    }
    return { framework: null, packageManager: "deno" };
  }

  // 2. Next.js
  for (const ext of ["js", "ts", "mjs"]) {
    const file = `next.config.${ext}`;
    if (await fileExists(join(dir, file))) {
      configFiles.push(file);
      return {
        framework: "nextjs",
        packageManager: await detectPackageManager(dir),
      };
    }
  }

  // 3. Astro
  for (const ext of ["js", "ts", "mjs"]) {
    const file = `astro.config.${ext}`;
    if (await fileExists(join(dir, file))) {
      configFiles.push(file);
      return {
        framework: "astro",
        packageManager: await detectPackageManager(dir),
      };
    }
  }

  // 4. Nuxt
  for (const ext of ["js", "ts"]) {
    const file = `nuxt.config.${ext}`;
    if (await fileExists(join(dir, file))) {
      configFiles.push(file);
      return {
        framework: "nuxt",
        packageManager: await detectPackageManager(dir),
      };
    }
  }

  // 5. Remix — config file or deps
  for (const ext of ["js", "ts"]) {
    const file = `remix.config.${ext}`;
    if (await fileExists(join(dir, file))) {
      configFiles.push(file);
      return {
        framework: "remix",
        packageManager: await detectPackageManager(dir),
      };
    }
  }
  const pkg = await readJson(join(dir, "package.json"));
  if (pkg) {
    const deps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    };
    if (deps["@remix-run/react"] || deps["@remix-run/node"]) {
      return {
        framework: "remix",
        packageManager: await detectPackageManager(dir),
      };
    }
  }

  // 6. Vite (generic)
  for (const ext of ["js", "ts", "mjs"]) {
    const file = `vite.config.${ext}`;
    if (await fileExists(join(dir, file))) {
      configFiles.push(file);
      return {
        framework: "vite",
        packageManager: await detectPackageManager(dir),
      };
    }
  }

  // 7. Fallback — check package.json for a dev script
  if (pkg || (await fileExists(join(dir, "package.json")))) {
    const pm = await detectPackageManager(dir);
    return { framework: pm === "bun" ? "bun" : null, packageManager: pm };
  }

  return { framework: null, packageManager: await detectPackageManager(dir) };
}

function resolveDevCommand(
  framework: FrameworkId | null,
  packageManager: PackageManager,
  pkgScripts: Record<string, string> | undefined,
): { devCommand: string; devPort: number; buildCommand: string | null } {
  // If the project has explicit dev/build scripts in package.json, prefer those
  if (pkgScripts?.dev) {
    const defaults = framework ? FRAMEWORK_DEFAULTS[framework] : null;
    const runner =
      packageManager === "deno"
        ? "deno task"
        : packageManager === "bun"
          ? "bun run"
          : packageManager === "pnpm"
            ? "pnpm"
            : packageManager === "yarn"
              ? "yarn"
              : "npm run";

    return {
      devCommand: `${runner} dev`,
      devPort: defaults?.devPort ?? 3000,
      buildCommand: pkgScripts.build ? `${runner} build` : null,
    };
  }

  if (framework && FRAMEWORK_DEFAULTS[framework]) {
    const d = FRAMEWORK_DEFAULTS[framework];
    return {
      devCommand: d.devCommand,
      devPort: d.devPort,
      buildCommand: d.buildCommand,
    };
  }

  return {
    devCommand:
      packageManager === "deno" ? "deno task dev" : `${packageManager} run dev`,
    devPort: 3000,
    buildCommand: null,
  };
}

export async function scanProject(
  projectDir: string,
): Promise<ProjectScanResult> {
  const configFiles: string[] = [];

  // Check for package.json
  const pkg = await readJson(join(projectDir, "package.json"));
  if (pkg) configFiles.push("package.json");

  const { framework, packageManager } = await detectFramework(
    projectDir,
    configFiles,
  );

  const pkgScripts = pkg?.scripts as Record<string, string> | undefined;
  const { devCommand, devPort, buildCommand } = resolveDevCommand(
    framework,
    packageManager,
    pkgScripts,
  );

  const deployTarget = await detectDeployTarget(projectDir);
  // .git can be a directory or a file (worktrees), use existsSync for both
  const { existsSync } = await import("fs");
  const hasGit = existsSync(join(projectDir, ".git"));

  // Detect content directories (blog, content, docs)
  const contentDirs: ContentDir[] = [];
  const contentCandidates: Array<{ dir: string; type: ContentDir["type"] }> = [
    { dir: "blog", type: "blog" },
    { dir: "content", type: "content" },
    { dir: "docs", type: "docs" },
  ];
  for (const candidate of contentCandidates) {
    if (existsSync(join(projectDir, candidate.dir))) {
      const configFile = (await fileExists(
        join(projectDir, candidate.dir, "config.json"),
      ))
        ? join(candidate.dir, "config.json")
        : null;
      contentDirs.push({
        path: candidate.dir,
        type: candidate.type,
        configFile,
      });
    }
  }

  return {
    projectDir,
    projectName: basename(projectDir),
    framework,
    packageManager,
    devCommand,
    devPort,
    buildCommand,
    deployTarget,
    configFiles,
    hasGit,
    contentDirs,
  };
}
