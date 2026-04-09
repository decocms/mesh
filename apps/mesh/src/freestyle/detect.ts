export interface RepoFileReader {
  readFile(owner: string, repo: string, path: string): Promise<string | null>;
}

export type Runtime = "bun" | "deno";

export interface DetectionResult {
  runtime: Runtime;
  scripts: Record<string, string>;
  instructions: string | null;
  autorun?: string | null;
  preview_port?: number | null;
}

export class GitHubFileReader implements RepoFileReader {
  async readFile(
    owner: string,
    repo: string,
    path: string,
  ): Promise<string | null> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github.v3.raw" },
    });
    if (!response.ok) return null;
    return response.text();
  }
}

interface DecoJson {
  autorun?: string;
  runtime?: Runtime;
  previewPort?: number;
}

function parseDecoJson(raw: string): DecoJson | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const result: DecoJson = {};
    if (typeof parsed.autorun === "string") result.autorun = parsed.autorun;
    if (parsed.runtime === "bun" || parsed.runtime === "deno") {
      result.runtime = parsed.runtime;
    }
    if (
      typeof parsed.previewPort === "number" &&
      Number.isInteger(parsed.previewPort) &&
      parsed.previewPort >= 1 &&
      parsed.previewPort <= 65535
    ) {
      result.previewPort = parsed.previewPort;
    }
    return result;
  } catch {
    return null;
  }
}

function detectRuntime(files: {
  bunLock: string | null;
  denoJson: string | null;
  denoJsonc: string | null;
  denoLock: string | null;
  packageJson: string | null;
}): Runtime {
  // deno.json/deno.jsonc or deno.lock → deno
  if (files.denoJson || files.denoJsonc || files.denoLock) return "deno";
  // fallback to bun
  return "bun";
}

function parseScripts(
  runtime: Runtime,
  packageJsonRaw: string | null,
  denoJsonRaw: string | null,
  denoJsoncRaw: string | null,
): Record<string, string> {
  if (runtime === "deno") {
    // deno.json(c) tasks
    const raw = denoJsonRaw ?? denoJsoncRaw;
    if (raw) {
      try {
        const denoConfig = JSON.parse(raw);
        return denoConfig.tasks ?? {};
      } catch {
        // fall through
      }
    }
  }

  // package.json scripts (bun or fallback)
  if (packageJsonRaw) {
    try {
      const packageJson = JSON.parse(packageJsonRaw);
      return packageJson.scripts ?? {};
    } catch {
      // fall through
    }
  }

  return {};
}

export async function detectRepo(
  repoUrl: string,
  reader: RepoFileReader,
): Promise<DetectionResult> {
  const parts = repoUrl.split("/");
  const owner = parts[0]!;
  const repo = parts[1]!;

  const [
    packageJsonRaw,
    bunLock,
    denoJsonRaw,
    denoJsoncRaw,
    denoLock,
    agentsMd,
    decoJsonRaw,
  ] = await Promise.all([
    reader.readFile(owner, repo, "package.json"),
    reader.readFile(owner, repo, "bun.lock"),
    reader.readFile(owner, repo, "deno.json"),
    reader.readFile(owner, repo, "deno.jsonc"),
    reader.readFile(owner, repo, "deno.lock"),
    reader.readFile(owner, repo, "AGENTS.md"),
    reader.readFile(owner, repo, "deco.json"),
  ]);

  console.log("[detect] Files found:", {
    packageJson: !!packageJsonRaw,
    bunLock: !!bunLock,
    denoJson: !!denoJsonRaw,
    denoJsonc: !!denoJsoncRaw,
    denoLock: !!denoLock,
    agentsMd: !!agentsMd,
    decoJson: !!decoJsonRaw,
  });

  const hasJsProject =
    bunLock || packageJsonRaw || denoJsonRaw || denoJsoncRaw || denoLock;

  if (!hasJsProject) {
    throw new Error(
      `Repository "${repoUrl}" does not appear to be a JavaScript project (no package.json, bun.lock, deno.json, or deno.lock found).`,
    );
  }

  const autoDetectedRuntime = detectRuntime({
    bunLock,
    denoJson: denoJsonRaw,
    denoJsonc: denoJsoncRaw,
    denoLock,
    packageJson: packageJsonRaw,
  });

  const decoConfig = decoJsonRaw ? parseDecoJson(decoJsonRaw) : null;

  // deco.json runtime overrides auto-detection
  const runtime = decoConfig?.runtime ?? autoDetectedRuntime;

  console.log("[detect] Runtime:", {
    autoDetected: autoDetectedRuntime,
    decoOverride: decoConfig?.runtime,
    final: runtime,
  });

  const scripts = parseScripts(
    runtime,
    packageJsonRaw,
    denoJsonRaw,
    denoJsoncRaw,
  );

  console.log("[detect] Scripts parsed:", {
    scriptCount: Object.keys(scripts).length,
    scriptNames: Object.keys(scripts),
  });

  return {
    runtime,
    scripts,
    instructions: agentsMd,
    autorun: decoConfig?.autorun ?? null,
    preview_port: decoConfig?.previewPort ?? null,
  };
}
