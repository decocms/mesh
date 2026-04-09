export interface RepoFileReader {
  readFile(owner: string, repo: string, path: string): Promise<string | null>;
}

export interface DetectionResult {
  runtime: "bun";
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
  runtime?: "bun";
  previewPort?: number;
}

function parseDecoJson(raw: string): DecoJson | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const result: DecoJson = {};
    if (typeof parsed.autorun === "string") result.autorun = parsed.autorun;
    if (parsed.runtime === "bun") result.runtime = parsed.runtime;
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

export async function detectRepo(
  repoUrl: string,
  reader: RepoFileReader,
): Promise<DetectionResult> {
  const parts = repoUrl.split("/");
  const owner = parts[0]!;
  const repo = parts[1]!;

  const [packageJsonRaw, bunLock, agentsMd, decoJsonRaw] = await Promise.all([
    reader.readFile(owner, repo, "package.json"),
    reader.readFile(owner, repo, "bun.lock"),
    reader.readFile(owner, repo, "AGENTS.md"),
    reader.readFile(owner, repo, "deco.json"),
  ]);

  if (!bunLock && !packageJsonRaw) {
    throw new Error(
      `Repository "${repoUrl}" does not appear to be a JavaScript project (no bun.lock or package.json found).`,
    );
  }

  let scripts: Record<string, string> = {};
  if (packageJsonRaw) {
    try {
      const packageJson = JSON.parse(packageJsonRaw);
      scripts = packageJson.scripts ?? {};
    } catch {
      throw new Error(`Failed to parse package.json in "${repoUrl}".`);
    }
  }

  const decoConfig = decoJsonRaw ? parseDecoJson(decoJsonRaw) : null;

  return {
    runtime: "bun",
    scripts,
    instructions: agentsMd,
    autorun: decoConfig?.autorun ?? null,
    preview_port: decoConfig?.previewPort ?? null,
  };
}
