/**
 * SECURITY: root is always WORKDIR. `body.cwd` is a relative-path convenience
 * but must itself resolve under WORKDIR (e.g. `cwd: "/"` is rejected).
 * Every path is realpath-resolved before the prefix check, defeating symlink
 * escapes; resolution is tolerant of missing leaves for write/create flows.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { WORKDIR } from "./config.mjs";
import { parsedBody, send } from "./http-helpers.mjs";

/** Realpath tolerant of missing leaves; terminates at "/" (always exists). */
function realpathTolerant(abs) {
  const parts = [];
  let current = abs;
  while (true) {
    try {
      return path.join(fs.realpathSync(current), ...parts.reverse());
    } catch (err) {
      if (err && err.code === "ENOENT") {
        const base = path.basename(current);
        const parent = path.dirname(current);
        if (parent === current) return abs;
        parts.push(base);
        current = parent;
        continue;
      }
      throw err;
    }
  }
}

const WORKDIR_REAL = fs.realpathSync(WORKDIR);

function isUnderWorkdir(absResolved) {
  return (
    absResolved === WORKDIR_REAL ||
    absResolved.startsWith(WORKDIR_REAL + path.sep)
  );
}

/** Returns null if cwd escapes WORKDIR (incl. via symlink). */
function resolveCwd(cwd) {
  if (!cwd) return WORKDIR_REAL;
  const resolved = realpathTolerant(path.resolve(WORKDIR_REAL, cwd));
  return isUnderWorkdir(resolved) ? resolved : null;
}

/** Empty `p` resolves to `cwd` itself (used by grep/glob as search root). */
function safePath(p, cwd) {
  const base = resolveCwd(cwd);
  if (base === null) return null;
  const resolved = realpathTolerant(path.resolve(base, p ?? ""));
  return isUnderWorkdir(resolved) ? resolved : null;
}

export async function handleFsRead(req, res) {
  try {
    const body = await parsedBody(req);
    const filePath = safePath(body.path, body.cwd);
    if (!filePath) return send(res, 400, { error: "path escapes workdir" });
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return send(res, 404, { error: `file not found: ${body.path}` });
    }
    if (stat.isDirectory()) {
      return send(res, 400, { error: "path is a directory" });
    }
    // Binary-detect first 8KB to avoid splatting \0 into a text-rendered JSON.
    const fd = fs.openSync(filePath, "r");
    try {
      const probe = Buffer.alloc(Math.min(8192, stat.size));
      fs.readSync(fd, probe, 0, probe.length, 0);
      if (probe.includes(0)) {
        return send(res, 400, { error: "file appears to be binary" });
      }
    } finally {
      fs.closeSync(fd);
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split("\n");
    const offset = Math.max(1, Number(body.offset) || 1);
    const limit = Math.max(1, Number(body.limit) || 2000);
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const numbered = slice
      .map((line, i) => `${offset + i}\t${line}`)
      .join("\n");
    send(res, 200, { content: numbered, lineCount: lines.length });
  } catch (err) {
    send(res, 500, { error: String(err) });
  }
}

export async function handleFsWrite(req, res) {
  try {
    const body = await parsedBody(req);
    if (typeof body.content !== "string") {
      return send(res, 400, { error: "content is required" });
    }
    const filePath = safePath(body.path, body.cwd);
    if (!filePath) return send(res, 400, { error: "path escapes workdir" });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body.content, "utf8");
    send(res, 200, {
      ok: true,
      bytesWritten: Buffer.byteLength(body.content, "utf8"),
    });
  } catch (err) {
    send(res, 500, { error: String(err) });
  }
}

export async function handleFsEdit(req, res) {
  try {
    const body = await parsedBody(req);
    const filePath = safePath(body.path, body.cwd);
    if (!filePath) return send(res, 400, { error: "path escapes workdir" });
    if (typeof body.old_string !== "string" || body.old_string.length === 0) {
      return send(res, 400, { error: "old_string is required" });
    }
    if (typeof body.new_string !== "string") {
      return send(res, 400, { error: "new_string is required" });
    }
    if (body.old_string === body.new_string) {
      return send(res, 400, { error: "old_string and new_string must differ" });
    }
    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      return send(res, 404, { error: `file not found: ${body.path}` });
    }
    const replaceAll = body.replace_all === true;
    const count = content.split(body.old_string).length - 1;
    if (count === 0) {
      return send(res, 400, { error: "old_string not found in file" });
    }
    if (!replaceAll && count > 1) {
      return send(res, 400, {
        error: `old_string found ${count} times. Pass replace_all: true or add more context to make it unique.`,
      });
    }
    const updated = replaceAll
      ? content.replaceAll(body.old_string, body.new_string)
      : content.replace(body.old_string, body.new_string);
    fs.writeFileSync(filePath, updated, "utf8");
    send(res, 200, { ok: true, replacements: replaceAll ? count : 1 });
  } catch (err) {
    send(res, 500, { error: String(err) });
  }
}

/** Modes: "files" (default, --files-with-matches), "content" (--line-number +optional -C), "count" (--count). */
export async function handleFsGrep(req, res) {
  try {
    const body = await parsedBody(req);
    if (typeof body.pattern !== "string" || body.pattern.length === 0) {
      return send(res, 400, { error: "pattern is required" });
    }
    const cwd = resolveCwd(body.cwd);
    if (cwd === null) return send(res, 400, { error: "cwd escapes workdir" });
    const searchPath = safePath(body.path ?? "", body.cwd);
    if (!searchPath) return send(res, 400, { error: "path escapes workdir" });
    const mode = body.output_mode ?? "files";
    const args = [];
    if (mode === "files") args.push("--files-with-matches");
    else if (mode === "count") args.push("--count");
    else args.push("--line-number");
    if (body.ignore_case) args.push("-i");
    if (body.context && mode === "content")
      args.push("-C", String(body.context));
    if (body.glob) args.push("--glob", String(body.glob));
    args.push("--", body.pattern, searchPath);
    const limit = Math.max(1, Number(body.limit) || 250);
    const child = spawn("rg", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const lines = [];
    let stderr = "";
    child.stdout.on("data", (d) => {
      for (const line of d.toString("utf8").split("\n")) {
        if (!line) continue;
        if (lines.length >= limit) break;
        lines.push(line);
      }
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("close", (code) => {
      // rg exit 1 means "no matches" — not an error.
      if (code != null && code > 1) {
        return send(res, 500, { error: stderr.trim() || `rg exited ${code}` });
      }
      send(res, 200, { results: lines.join("\n"), matchCount: lines.length });
    });
    child.on("error", (err) => send(res, 500, { error: String(err) }));
  } catch (err) {
    send(res, 500, { error: String(err) });
  }
}

export async function handleFsGlob(req, res) {
  try {
    const body = await parsedBody(req);
    if (typeof body.pattern !== "string" || body.pattern.length === 0) {
      return send(res, 400, { error: "pattern is required" });
    }
    const root = resolveCwd(body.cwd);
    if (root === null) return send(res, 400, { error: "cwd escapes workdir" });
    const searchPath = safePath(body.path ?? "", body.cwd);
    if (!searchPath) return send(res, 400, { error: "path escapes workdir" });
    const child = spawn("rg", ["--files", "--glob", body.pattern, searchPath], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("close", (code) => {
      if (code != null && code > 1) {
        return send(res, 500, { error: stderr.trim() || `rg exited ${code}` });
      }
      const prefix = root.endsWith("/") ? root : root + "/";
      const files = stdout
        .split("\n")
        .filter(Boolean)
        .slice(0, 1000)
        .map((f) => (f.startsWith(prefix) ? f.slice(prefix.length) : f));
      send(res, 200, { files });
    });
    child.on("error", (err) => send(res, 500, { error: String(err) }));
  } catch (err) {
    send(res, 500, { error: String(err) });
  }
}
