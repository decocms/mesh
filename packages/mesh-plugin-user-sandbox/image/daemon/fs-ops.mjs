/**
 * Typed file-operation endpoints (/fs/*). Plain-JSON bodies, paths rooted at
 * /app (or body.cwd) and guarded against escape. Shells out to `rg` for
 * grep/glob — the binary is pre-installed in the base image.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { WORKDIR } from "./config.mjs";
import { readJson, send } from "./http-helpers.mjs";

/**
 * Resolve `p` against `root`, rejecting paths that escape the root. Returns
 * the absolute path on success, null on escape. Empty path resolves to
 * `root` itself, which grep/glob use as "search everywhere".
 */
function safePath(p, root = WORKDIR) {
  const resolved = path.resolve(root, p ?? "");
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export async function handleFsRead(req, res) {
  try {
    const body = await readJson(req);
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
    // Binary-detect on the first 8KB so we don't splat \0 bytes into a JSON
    // response that callers will then render as text.
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
    const body = await readJson(req);
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
    const body = await readJson(req);
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

/**
 * `rg`-backed grep. Modes:
 *   - "files"    (default) — --files-with-matches
 *   - "content"            — --line-number with optional -C context
 *   - "count"              — --count per file
 */
export async function handleFsGrep(req, res) {
  try {
    const body = await readJson(req);
    if (typeof body.pattern !== "string" || body.pattern.length === 0) {
      return send(res, 400, { error: "pattern is required" });
    }
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
      cwd: body.cwd || WORKDIR,
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
    const body = await readJson(req);
    if (typeof body.pattern !== "string" || body.pattern.length === 0) {
      return send(res, 400, { error: "pattern is required" });
    }
    const searchPath = safePath(body.path ?? "", body.cwd);
    if (!searchPath) return send(res, 400, { error: "path escapes workdir" });
    const root = body.cwd || WORKDIR;
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
