/**
 * Git Routes — Server-side git operations for the site editor plugin.
 *
 * Mounted at /api/plugins/site-editor/git/*
 *
 * Reads the project path from connection metadata and runs git commands
 * via child_process in that directory. This approach works regardless of
 * which MCP server the user connected (local-fs, @modelcontextprotocol/server-filesystem, etc.).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join, relative } from "node:path";
import type {
  ServerPlugin,
  ServerPluginContext,
} from "@decocms/bindings/server-plugin";

const execFileAsync = promisify(execFile);

type HonoApp = NonNullable<Parameters<NonNullable<ServerPlugin["routes"]>>[0]>;

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function getProjectPath(
  db: ServerPluginContext["db"],
  connectionId: string,
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (await (db as any)
    .selectFrom("connections")
    .select(["metadata"])
    .where("id", "=", connectionId)
    .executeTakeFirst()) as { metadata: string | null } | undefined;

  if (!row) return null;
  try {
    const meta =
      typeof row.metadata === "string"
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : row.metadata;
    return typeof meta?.projectPath === "string" ? meta.projectPath : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Safety: resolve a relative path inside projectPath
// ---------------------------------------------------------------------------

function resolveSafe(projectPath: string, relativePath: string): string | null {
  const abs = resolve(join(projectPath, relativePath));
  if (!abs.startsWith(resolve(projectPath))) return null; // traversal attempt
  return abs;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function runGit(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
}

type StatusEnum =
  | "modified"
  | "added"
  | "deleted"
  | "untracked"
  | "renamed"
  | null;

interface FileStatus {
  path: string;
  oldPath?: string;
  staged: StatusEnum;
  unstaged: StatusEnum;
}

function parseGitStatus(output: string): FileStatus[] {
  if (!output.trim()) return [];
  const charMap: Record<string, StatusEnum> = {
    M: "modified",
    A: "added",
    D: "deleted",
    R: "renamed",
    " ": null,
  };
  return output
    .trim()
    .split("\n")
    .map((line): FileStatus | null => {
      if (line.length < 4) return null;
      const X = line[0];
      const Y = line[1];
      const rest = line.slice(3);
      if (X === "?" && Y === "?") {
        return { path: rest, staged: null, unstaged: "untracked" };
      }
      if (X === "R" || Y === "R") {
        const [newPath, oldPath] = rest.split("\t");
        return {
          path: newPath,
          oldPath,
          staged: X === "R" ? "renamed" : null,
          unstaged: Y === "R" ? "renamed" : null,
        };
      }
      return {
        path: rest,
        staged: charMap[X] ?? null,
        unstaged: charMap[Y] ?? null,
      };
    })
    .filter((x): x is FileStatus => x !== null);
}

interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

function parseGitLog(output: string): GitCommit[] {
  if (!output.trim()) return [];
  return output
    .split("\x1F")
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const [hash, author, date, ...msgParts] = block.split("\x00");
      return {
        hash: hash?.trim() ?? "",
        author: author?.trim() ?? "",
        date: date?.trim() ?? "",
        message: msgParts.join("\x00").trim(),
      };
    })
    .filter((c) => c.hash.length > 0);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerGitRoutes(
  app: HonoApp,
  ctx: ServerPluginContext,
): void {
  // GET /git/status?connectionId=...&path=...
  app.get("/git/status", async (c) => {
    const connectionId = c.req.query("connectionId");
    const filePath = c.req.query("path") ?? "";
    if (!connectionId) return c.json({ error: "connectionId required" }, 400);

    const projectPath = await getProjectPath(ctx.db, connectionId);
    if (!projectPath)
      return c.json({ error: "Connection not found or no projectPath" }, 404);

    try {
      const gitArgs = ["status", "--porcelain=v1", "--untracked-files=all"];
      if (filePath) {
        if (!resolveSafe(projectPath, filePath)) {
          return c.json({ error: "Path traversal detected" }, 400);
        }
        gitArgs.push("--", filePath);
      }
      const { stdout } = await runGit(gitArgs, projectPath);
      return c.json({ files: parseGitStatus(stdout) });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // GET /git/diff?connectionId=...&path=...
  app.get("/git/diff", async (c) => {
    const connectionId = c.req.query("connectionId");
    const filePath = c.req.query("path") ?? "";
    if (!connectionId) return c.json({ error: "connectionId required" }, 400);

    const projectPath = await getProjectPath(ctx.db, connectionId);
    if (!projectPath) return c.json({ error: "Connection not found" }, 404);

    try {
      const gitArgs = ["diff", "HEAD"];
      if (filePath) {
        if (!resolveSafe(projectPath, filePath)) {
          return c.json({ error: "Path traversal detected" }, 400);
        }
        gitArgs.push("--", filePath);
      }
      const { stdout } = await runGit(gitArgs, projectPath);
      return c.json({ diff: stdout });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // GET /git/log?connectionId=...&path=...&limit=50
  app.get("/git/log", async (c) => {
    const connectionId = c.req.query("connectionId");
    const filePath = c.req.query("path") ?? "";
    const limit = Number(c.req.query("limit") ?? "50") || 50;
    if (!connectionId) return c.json({ error: "connectionId required" }, 400);

    const projectPath = await getProjectPath(ctx.db, connectionId);
    if (!projectPath) return c.json({ error: "Connection not found" }, 404);

    try {
      const format = "%H%x00%an%x00%aI%x00%s%x1F";
      const gitArgs = ["log", `--max-count=${limit}`, `--format=${format}`];
      if (filePath) {
        if (!resolveSafe(projectPath, filePath)) {
          return c.json({ error: "Path traversal detected" }, 400);
        }
        gitArgs.push("--", filePath);
      }
      const { stdout } = await runGit(gitArgs, projectPath);
      return c.json({ commits: parseGitLog(stdout) });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // GET /git/show?connectionId=...&path=...&commitHash=...
  app.get("/git/show", async (c) => {
    const connectionId = c.req.query("connectionId");
    const filePath = c.req.query("path") ?? "";
    const commitHash = c.req.query("commitHash") ?? "HEAD";
    if (!connectionId || !filePath) {
      return c.json({ error: "connectionId and path required" }, 400);
    }

    const projectPath = await getProjectPath(ctx.db, connectionId);
    if (!projectPath) return c.json({ error: "Connection not found" }, 404);

    if (!resolveSafe(projectPath, filePath)) {
      return c.json({ error: "Path traversal detected" }, 400);
    }

    try {
      // git show uses relative path from repo root — keep filePath as-is
      const { stdout } = await runGit(
        ["show", `${commitHash}:${filePath}`],
        projectPath,
      );
      return c.json({ content: stdout });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // POST /git/checkout  body: { connectionId, path, force? }
  app.post("/git/checkout", async (c) => {
    let body: { connectionId?: string; path?: string; force?: boolean };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { connectionId, path: filePath, force } = body;
    if (!connectionId || !filePath) {
      return c.json({ error: "connectionId and path required" }, 400);
    }
    if (!force) {
      return c.json(
        { error: "GIT_CHECKOUT is destructive — pass force:true to confirm" },
        400,
      );
    }

    const projectPath = await getProjectPath(ctx.db, connectionId);
    if (!projectPath) return c.json({ error: "Connection not found" }, 404);

    if (!resolveSafe(projectPath, filePath)) {
      return c.json({ error: "Path traversal detected" }, 400);
    }

    try {
      await runGit(["checkout", "HEAD", "--", filePath], projectPath);
      return c.json({ path: filePath, ref: "HEAD" });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // POST /git/commit  body: { connectionId, message }
  app.post("/git/commit", async (c) => {
    let body: { connectionId?: string; message?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { connectionId, message } = body;
    if (!connectionId || !message) {
      return c.json({ error: "connectionId and message required" }, 400);
    }

    const projectPath = await getProjectPath(ctx.db, connectionId);
    if (!projectPath) return c.json({ error: "Connection not found" }, 404);

    try {
      // Pre-check: dirty?
      const { stdout: statusOut } = await runGit(
        ["status", "--porcelain=v1", "--untracked-files=all"],
        projectPath,
      );
      if (!statusOut.trim()) {
        return c.json(
          { error: "Nothing to commit: working tree is clean" },
          400,
        );
      }

      // Stage all
      await runGit(["add", "-A"], projectPath);

      // Commit with identity fallback
      const { stdout } = await execFileAsync(
        "git",
        [
          "-c",
          "user.name=Deco Editor",
          "-c",
          "user.email=editor@deco.cx",
          "commit",
          "--message",
          message,
        ],
        { cwd: projectPath },
      );

      const hashMatch = stdout.match(/\[[\w/.-]+ ([0-9a-f]+)\]/);
      const hash = hashMatch?.[1] ?? "";
      return c.json({ hash, message });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // Silence unused import warning
  void relative;
}
