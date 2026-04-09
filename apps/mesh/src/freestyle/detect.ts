export interface RepoFileReader {
  readFile(owner: string, repo: string, path: string): Promise<string | null>;
}

export interface DetectionResult {
  runtime: "bun";
  scripts: Record<string, string>;
  instructions: string | null;
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

export async function detectRepo(
  repoUrl: string,
  reader: RepoFileReader,
): Promise<DetectionResult> {
  const parts = repoUrl.split("/");
  const owner = parts[0]!;
  const repo = parts[1]!;

  const [packageJsonRaw, bunLock, agentsMd] = await Promise.all([
    reader.readFile(owner, repo, "package.json"),
    reader.readFile(owner, repo, "bun.lock"),
    reader.readFile(owner, repo, "AGENTS.md"),
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

  return {
    runtime: "bun",
    scripts,
    instructions: agentsMd,
  };
}
