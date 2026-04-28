import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DECO_UID, DECO_GID } from "../constants";
import { safePath } from "../paths";
import { parseBase64JsonBody, jsonResponse } from "./body-parser";

export interface FsDeps {
  appRoot: string;
  /** If true, spawn rg with uid:gid=1000. Falsey in tests. */
  dropPrivileges?: boolean;
}

function spawnOpts(
  deps: FsDeps,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return deps.dropPrivileges
    ? { uid: DECO_UID, gid: DECO_GID, ...extra }
    : { ...extra };
}

/** Cap on bytes returned for image responses. ~5MB matches Anthropic's
 * vision input ceiling and keeps tool result payloads bounded. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Magic-byte sniffer for the image types Claude vision accepts.
 * Returns null for everything else; we don't try to be clever about
 * arbitrary binary formats. */
function sniffImageMediaType(probe: Buffer): string | null {
  if (
    probe.length >= 3 &&
    probe[0] === 0xff &&
    probe[1] === 0xd8 &&
    probe[2] === 0xff
  )
    return "image/jpeg";
  if (
    probe.length >= 8 &&
    probe[0] === 0x89 &&
    probe[1] === 0x50 &&
    probe[2] === 0x4e &&
    probe[3] === 0x47 &&
    probe[4] === 0x0d &&
    probe[5] === 0x0a &&
    probe[6] === 0x1a &&
    probe[7] === 0x0a
  )
    return "image/png";
  if (
    probe.length >= 6 &&
    probe[0] === 0x47 &&
    probe[1] === 0x49 &&
    probe[2] === 0x46 &&
    probe[3] === 0x38
  )
    return "image/gif";
  if (
    probe.length >= 12 &&
    probe[0] === 0x52 &&
    probe[1] === 0x49 &&
    probe[2] === 0x46 &&
    probe[3] === 0x46 &&
    probe[8] === 0x57 &&
    probe[9] === 0x45 &&
    probe[10] === 0x42 &&
    probe[11] === 0x50
  )
    return "image/webp";
  return null;
}

/**
 * Resolves a user-supplied path. Absolute paths pass through as-is — OS
 * permissions already gate what the sandbox user can read. Relative paths
 * are resolved against `appRoot` for the project-relative UX.
 */
function resolveViewPath(appRoot: string, userPath: string): string | null {
  if (path.isAbsolute(userPath)) return userPath;
  return safePath(appRoot, userPath);
}

export function makeViewHandler(deps: FsDeps) {
  return async (req: Request): Promise<Response> => {
    let body: { path?: string; offset?: number; limit?: number };
    try {
      body = (await parseBase64JsonBody(req)) as typeof body;
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 400);
    }
    const filePath = resolveViewPath(deps.appRoot, body.path ?? "");
    if (!filePath)
      return jsonResponse({ error: "Path escapes project root" }, 400);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return jsonResponse({ error: `File not found: ${body.path}` }, 400);
    }
    if (stat.isDirectory()) {
      return jsonResponse({ error: "Path is a directory" }, 400);
    }
    const fd = fs.openSync(filePath, "r");
    const probe = Buffer.alloc(Math.min(8192, stat.size));
    fs.readSync(fd, probe, 0, probe.length, 0);
    fs.closeSync(fd);

    const imageMediaType = sniffImageMediaType(probe);
    if (imageMediaType) {
      if (stat.size > MAX_IMAGE_BYTES) {
        return jsonResponse(
          {
            error: `Image too large (${stat.size} bytes; cap is ${MAX_IMAGE_BYTES})`,
          },
          400,
        );
      }
      const bytes = fs.readFileSync(filePath);
      return jsonResponse({
        kind: "image",
        mediaType: imageMediaType,
        size: stat.size,
        base64: bytes.toString("base64"),
      });
    }

    if (probe.includes(0))
      return jsonResponse(
        {
          error:
            "File appears to be binary and is not a supported image format (jpeg/png/gif/webp).",
        },
        400,
      );

    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.split("\n");
    const offset = Math.max(1, body.offset ?? 1);
    const limit = body.limit ?? 2000;
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const numbered = slice.map((l, i) => `${offset + i}\t${l}`).join("\n");
    return jsonResponse({
      kind: "text",
      content: numbered,
      lineCount: lines.length,
    });
  };
}

/** @deprecated Use makeViewHandler. Kept as alias during one release cycle. */
export const makeReadHandler = makeViewHandler;

export function makeWriteHandler(deps: FsDeps) {
  return async (req: Request): Promise<Response> => {
    let body: { path?: string; content?: string };
    try {
      body = (await parseBase64JsonBody(req)) as typeof body;
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 400);
    }
    if (typeof body.content !== "string")
      return jsonResponse({ error: "content is required" }, 400);
    const filePath = safePath(deps.appRoot, body.path ?? "");
    if (!filePath) return jsonResponse({ error: "Path escapes /app" }, 400);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body.content, "utf-8");
    return jsonResponse({
      ok: true,
      bytesWritten: Buffer.byteLength(body.content, "utf-8"),
    });
  };
}

export function makeEditHandler(deps: FsDeps) {
  return async (req: Request): Promise<Response> => {
    let body: {
      path?: string;
      old_string?: string;
      new_string?: string;
      replace_all?: boolean;
    };
    try {
      body = (await parseBase64JsonBody(req)) as typeof body;
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 400);
    }
    const filePath = safePath(deps.appRoot, body.path ?? "");
    if (!filePath) return jsonResponse({ error: "Path escapes /app" }, 400);
    if (!body.old_string || typeof body.old_string !== "string")
      return jsonResponse({ error: "old_string is required" }, 400);
    if (typeof body.new_string !== "string")
      return jsonResponse({ error: "new_string is required" }, 400);
    if (body.old_string === body.new_string)
      return jsonResponse(
        { error: "old_string and new_string must differ" },
        400,
      );

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      return jsonResponse({ error: `File not found: ${body.path}` }, 400);
    }
    const replaceAll = body.replace_all === true;
    const count = content.split(body.old_string).length - 1;
    if (count === 0)
      return jsonResponse({ error: "old_string not found in file" }, 400);
    if (!replaceAll && count > 1)
      return jsonResponse(
        {
          error: `old_string found ${count} times. Use replace_all or provide more context to make it unique.`,
        },
        400,
      );
    const updated = replaceAll
      ? content.replaceAll(body.old_string, body.new_string)
      : content.replace(body.old_string, body.new_string);
    fs.writeFileSync(filePath, updated, "utf-8");
    return jsonResponse({ ok: true, replacements: replaceAll ? count : 1 });
  };
}

export function makeGrepHandler(deps: FsDeps) {
  return async (req: Request): Promise<Response> => {
    let body: {
      pattern?: string;
      path?: string;
      output_mode?: "files" | "count" | "content";
      ignore_case?: boolean;
      context?: number;
      glob?: string;
      limit?: number;
    };
    try {
      body = (await parseBase64JsonBody(req)) as typeof body;
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 400);
    }
    if (!body.pattern)
      return jsonResponse({ error: "pattern is required" }, 400);
    const searchPath = body.path
      ? safePath(deps.appRoot, body.path)
      : deps.appRoot;
    if (!searchPath) return jsonResponse({ error: "Path escapes /app" }, 400);
    const args: string[] = [];
    const mode = body.output_mode ?? "files";
    if (mode === "files") args.push("--files-with-matches");
    else if (mode === "count") args.push("--count");
    else args.push("--line-number");
    if (body.ignore_case) args.push("-i");
    if (body.context && mode === "content")
      args.push("-C", String(body.context));
    if (body.glob) args.push("--glob", body.glob);
    args.push("--", body.pattern, searchPath);

    const limit = body.limit ?? 250;
    const child = spawn(
      "rg",
      args,
      spawnOpts(deps, {
        cwd: deps.appRoot,
        stdio: ["ignore", "pipe", "pipe"],
      }) as Parameters<typeof spawn>[2],
    );
    let stdout = "";
    let lineCount = 0;
    let truncated = false;
    child.stdout!.on("data", (chunk: Buffer) => {
      if (truncated) return;
      const lines = chunk.toString("utf-8").split("\n");
      for (const line of lines) {
        if (lineCount >= limit) {
          truncated = true;
          try {
            child.kill("SIGTERM");
          } catch {}
          break;
        }
        if (line) {
          stdout += (stdout ? "\n" : "") + line;
          lineCount++;
        }
      }
    });
    let stderr = "";
    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    const code: number | null = await new Promise((resolve) => {
      child.on("close", (c) => resolve(c));
      child.on("error", () => resolve(-1));
    });
    if (code !== null && code > 1)
      return jsonResponse(
        { error: stderr || `rg failed with code ${code}` },
        500,
      );
    return jsonResponse({ results: stdout, matchCount: lineCount });
  };
}

export function makeGlobHandler(deps: FsDeps) {
  return async (req: Request): Promise<Response> => {
    let body: { pattern?: string; path?: string };
    try {
      body = (await parseBase64JsonBody(req)) as typeof body;
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 400);
    }
    if (!body.pattern)
      return jsonResponse({ error: "pattern is required" }, 400);
    const searchPath = body.path
      ? safePath(deps.appRoot, body.path)
      : deps.appRoot;
    if (!searchPath) return jsonResponse({ error: "Path escapes /app" }, 400);
    const child = spawn(
      "rg",
      ["--files", "--glob", body.pattern, searchPath],
      spawnOpts(deps, {
        cwd: deps.appRoot,
        stdio: ["ignore", "pipe", "pipe"],
      }) as Parameters<typeof spawn>[2],
    );
    let stdout = "";
    child.stdout!.on("data", (c: Buffer) => {
      stdout += c.toString("utf-8");
    });
    let stderr = "";
    child.stderr!.on("data", (c: Buffer) => {
      stderr += c.toString("utf-8");
    });
    const code: number | null = await new Promise((resolve) => {
      child.on("close", (c) => resolve(c));
      child.on("error", () => resolve(-1));
    });
    if (code !== null && code > 1)
      return jsonResponse(
        { error: stderr || `rg failed with code ${code}` },
        500,
      );
    const files = stdout
      .split("\n")
      .filter(Boolean)
      .slice(0, 1000)
      .map((f) =>
        f.startsWith(`${deps.appRoot}/`) ? f.slice(deps.appRoot.length + 1) : f,
      );
    return jsonResponse({ files });
  };
}
