#!/usr/bin/env bun
/**
 * Server and migration script bundler - bundles both server and migration scripts
 * Prunes node_modules to only include required dependencies for both scripts
 * Uses @vercel/nft to trace file dependencies
 *
 * Usage:
 *   bun run scripts/bundle-server-script.ts [--dist <path>]
 *
 * Options:
 *   --dist <path>  Output directory for pruned node_modules, server.js, and migrate.js (default: ./dist/server)
 */

import { nodeFileTrace } from "@vercel/nft";
import { cp, mkdir, readFile, stat } from "fs/promises";
import { dirname, join, resolve } from "path";
import { existsSync } from "fs";
import { $ } from "bun";

const SCRIPT_DIR =
  import.meta.dir || dirname(new URL(import.meta.url).pathname);
const SERVER_ENTRY_POINT = join(SCRIPT_DIR, "../src/index.ts");
const CLI_ENTRY_POINT = join(SCRIPT_DIR, "../src/cli.ts");
const MIGRATE_ENTRY_POINT = "kysely-bun-worker";

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let distPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dist" && i + 1 < args.length) {
      distPath = args[i + 1];
      i++; // Skip the next argument as it's the value
    }
  }

  return { distPath };
}

// Find the workspace root (where node_modules is located)
// Script is at apps/mesh/scripts, so we need to go up three levels to the repo root
const WORKSPACE_ROOT = resolve(SCRIPT_DIR, "../../..");
const MESH_APP_ROOT = resolve(SCRIPT_DIR, "..");

// Get dist path from args or use default
const { distPath } = parseArgs();
const OUTPUT_DIR = distPath
  ? resolve(distPath)
  : join(process.cwd(), "dist/server");

// Cache to store resolved package names for directories to avoid repeated FS calls
// Map<directoryPath, { name: string, path: string } | null>
const packageCache = new Map<string, { name: string; path: string } | null>();

/**
 * Walks up the directory tree from a file path to find the enclosing package.json
 * and returns the package name and its root directory.
 */
async function resolvePackage(
  filePath: string,
  rootDir: string,
): Promise<{ name: string; path: string } | null> {
  // Convert to absolute path if it isn't already
  let currentDir = resolve(rootDir, filePath);

  // If it's a file, start from its directory
  const stats = await stat(currentDir);
  if (!stats.isDirectory()) {
    currentDir = dirname(currentDir);
  }

  // Traverse up until we leave the rootDir or hit the system root
  while (currentDir.startsWith(rootDir)) {
    // Check cache first
    if (packageCache.has(currentDir)) {
      return packageCache.get(currentDir)!;
    }

    const pkgJsonPath = join(currentDir, "package.json");

    if (existsSync(pkgJsonPath)) {
      try {
        const content = await readFile(pkgJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        const name = pkg.name;

        if (!name) {
          throw new Error(`Invalid package.json: ${pkgJsonPath}`);
        }

        const result = { name, path: currentDir };

        // Cache this result for this directory
        packageCache.set(currentDir, result);

        return result;
      } catch {
        // invalid package.json, keep walking
      }
    }

    // Move up one level
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break; // Reached system root
    currentDir = parentDir;
  }

  // Cache failure to avoid re-walking
  // Note: this might be too aggressive if we traverse deeply, but for node_modules usually fine
  return null;
}

async function pruneNodeModules(): Promise<Set<string>> {
  console.log(`🔍 Tracing dependencies for server and migration scripts...`);

  // Find the migration entry point file
  // Resolve from mesh app root where kysely-bun-worker is a dependency
  let migrateEntryPointPath: string;
  try {
    migrateEntryPointPath = Bun.resolveSync(MIGRATE_ENTRY_POINT, MESH_APP_ROOT);
  } catch (error) {
    console.error(`❌ Failed to resolve ${MIGRATE_ENTRY_POINT}:`, error);
    process.exit(1);
  }
  console.log(`📦 Migration entry point: ${migrateEntryPointPath}`);

  // Resolve server entry point to absolute path
  const serverEntryPointPath = resolve(SERVER_ENTRY_POINT);
  if (!existsSync(serverEntryPointPath)) {
    console.error(`❌ Server entry point not found: ${serverEntryPointPath}`);
    process.exit(1);
  }
  console.log(`📦 Server entry point: ${serverEntryPointPath}`);

  // Resolve CLI entry point to absolute path
  const cliEntryPointPath = resolve(CLI_ENTRY_POINT);
  if (!existsSync(cliEntryPointPath)) {
    console.error(`❌ CLI entry point not found: ${cliEntryPointPath}`);
    process.exit(1);
  }
  console.log(`📦 CLI entry point: ${cliEntryPointPath}`);

  // Trace all file dependencies for all entry points
  const { fileList } = await nodeFileTrace(
    [migrateEntryPointPath, serverEntryPointPath, cliEntryPointPath],
    {
      base: WORKSPACE_ROOT,
    },
  );

  console.log(`📋 Found ${fileList.size} files in dependency tree`);

  // Extract unique packages from traced files
  // Map<packageName, packageRootPath>
  const packagesToCopy = new Map<string, string>();

  // Use parallel processing for faster resolution
  await Promise.all(
    Array.from(fileList).map(async (file) => {
      // Only check files that look like they are in node_modules
      if (!file.includes("node_modules/")) return;

      const pkg = await resolvePackage(file, WORKSPACE_ROOT);
      if (pkg) {
        // We might encounter the same package multiple times from different files
        // We just overwrite, assuming consistent locations for the same package name
        // or that we want the last one found.
        packagesToCopy.set(pkg.name, pkg.path);
      }
    }),
  );

  console.log(
    `📦 Found ${packagesToCopy.size} packages to copy:`,
    Array.from(packagesToCopy.keys()).join(", "),
  );

  // Create output directory structure
  if (existsSync(OUTPUT_DIR)) {
    console.log(`🧹 Cleaning existing ${OUTPUT_DIR}...`);
    await $`rm -rf ${OUTPUT_DIR}`.quiet();
  }
  const outputNodeModules = join(OUTPUT_DIR, "node_modules");
  await mkdir(outputNodeModules, { recursive: true });

  // Copy entire package directories to ensure package.json and all metadata are included
  // Only externalize packages that are successfully copied (not workspace packages)
  const successfullyCopied = new Set<string>();

  for (const [packageName, packagePath] of packagesToCopy.entries()) {
    // Skip workspace packages - they should be bundled inline, not externalized
    // Workspace packages use the @decocms/ scope (except @decocms/better-auth which is published)
    if (
      packageName.startsWith("@decocms/") &&
      packageName !== "@decocms/better-auth"
    ) {
      console.log(`📦 Bundling inline (workspace): ${packageName}`);
      continue;
    }

    const destPackagePath = join(outputNodeModules, packageName);

    if (!existsSync(packagePath)) {
      console.warn(
        `⚠️  Package source not found: ${packageName} at ${packagePath}`,
      );
      continue;
    }

    try {
      await cp(packagePath, destPackagePath, { recursive: true });
      successfullyCopied.add(packageName);
      console.log(`✅ Copied package: ${packageName}`);
    } catch (error) {
      console.warn(`⚠️  Failed to copy package ${packageName}: ${error}`);
    }
  }

  console.log(
    `\n✅ Successfully copied ${successfullyCopied.size} packages to ${OUTPUT_DIR}`,
  );
  console.log(`📊 Output directory: ${OUTPUT_DIR}`);

  // Only return packages that were actually copied - these will be externalized
  // Workspace packages are not returned, so they get bundled inline
  return successfullyCopied;
}

async function buildMigrateScript(packagesToExternalize: Set<string>) {
  console.log("🔨 Building migrate.js...");

  const migrateSourcePath = join(SCRIPT_DIR, "../src/database/migrate.ts");
  const migrateOutputPath = join(OUTPUT_DIR, "migrate.js");

  // Ensure output directory exists
  await mkdir(OUTPUT_DIR, { recursive: true });

  const commandsParts = [
    "bun",
    "build",
    migrateSourcePath,
    "--target",
    "bun",
    "--minify",
    "--production",
    "--outfile",
    migrateOutputPath,
    "--external",
    "bun:sqlite",
  ];

  for (const pkg of packagesToExternalize) {
    commandsParts.push("--external", pkg);
  }

  console.log(`🔨 Running command: ${commandsParts.join(" ")}`);
  // Build migrate.js
  await $`${commandsParts}`.quiet();

  if (!existsSync(migrateOutputPath)) {
    console.error("❌ Failed to build migrate.js");
    process.exit(1);
  }

  console.log(`✅ migrate.js built successfully at ${migrateOutputPath}`);
}

async function buildServerScript(packagesToExternalize: Set<string>) {
  console.log("🔨 Building server.js...");

  const serverSourcePath = join(SCRIPT_DIR, "../src/index.ts");
  const serverOutputPath = join(OUTPUT_DIR, "server.js");

  // Ensure output directory exists
  await mkdir(OUTPUT_DIR, { recursive: true });

  const commandsParts = [
    "bun",
    "build",
    serverSourcePath,
    "--target",
    "bun",
    "--minify",
    "--production",
    "--outfile",
    serverOutputPath,
    "--external",
    "bun:sqlite",
  ];

  for (const pkg of packagesToExternalize) {
    commandsParts.push("--external", pkg);
  }

  console.log(`🔨 Running command: ${commandsParts.join(" ")}`);
  // Build server.js
  await $`${commandsParts}`.quiet();

  if (!existsSync(serverOutputPath)) {
    console.error("❌ Failed to build server.js");
    process.exit(1);
  }

  console.log(`✅ server.js built successfully at ${serverOutputPath}`);
}

async function buildCliScript(packagesToExternalize: Set<string>) {
  console.log("🔨 Building cli.js...");

  const cliSourcePath = CLI_ENTRY_POINT;
  const cliOutputPath = join(OUTPUT_DIR, "cli.js");

  // Ensure output directory exists
  await mkdir(OUTPUT_DIR, { recursive: true });

  const commandsParts = [
    "bun",
    "build",
    cliSourcePath,
    "--target",
    "bun",
    "--minify",
    "--production",
    "--outfile",
    cliOutputPath,
    "--external",
    "bun:sqlite",
  ];

  for (const pkg of packagesToExternalize) {
    commandsParts.push("--external", pkg);
  }

  console.log(`🔨 Running command: ${commandsParts.join(" ")}`);
  // Build cli.js
  await $`${commandsParts}`.quiet();

  if (!existsSync(cliOutputPath)) {
    console.error("❌ Failed to build cli.js");
    process.exit(1);
  }

  console.log(`✅ cli.js built successfully at ${cliOutputPath}`);
}

async function copyRootReadme() {
  console.log("📄 Copying root README.md...");

  const readmeSourcePath = join(WORKSPACE_ROOT, "README.md");
  // Copy to parent dist folder so it's at dist/README.md (alongside dist/server and dist/client)
  const readmeOutputPath = join(OUTPUT_DIR, "..", "README.md");

  if (!existsSync(readmeSourcePath)) {
    console.warn("⚠️  Root README.md not found, skipping...");
    return;
  }

  try {
    await cp(readmeSourcePath, readmeOutputPath);
    console.log(`✅ README.md copied to ${readmeOutputPath}`);
  } catch (error) {
    console.warn(`⚠️  Failed to copy README.md: ${error}`);
  }
}

async function main() {
  // Prune node_modules to only include required dependencies for both scripts
  const packagesToExternalize = await pruneNodeModules();

  // Build migrate.js, server.js, and cli.js
  await buildMigrateScript(packagesToExternalize);
  await buildServerScript(packagesToExternalize);
  await buildCliScript(packagesToExternalize);

  // Copy root README.md to dist folder
  await copyRootReadme();

  console.log("\n🎉 Build completed successfully!");
  console.log(`📦 Output directory: ${OUTPUT_DIR}`);
  console.log(`   - migrate.js`);
  console.log(`   - server.js`);
  console.log(`   - cli.js`);
  console.log(`   - node_modules/`);
  console.log(`   - ../README.md`);
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
