import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promises as dnsPromises } from "node:dns";
import { spawn } from "node:child_process";
import { DECO_UID, DECO_GID } from "../constants";
import { safePath } from "../paths";
import { parseBase64JsonBody, jsonResponse } from "./body-parser";

/**
 * SSRF guard for `write_from_url`. The model can supply arbitrary
 * https URLs to `copy_to_sandbox`, which the daemon then GETs from
 * inside the sandbox container. Without this check the model could
 * make the daemon fetch cloud-metadata services
 * (`http://169.254.169.254/...`), localhost, or RFC1918 endpoints —
 * exfiltrating credentials or pivoting into the cluster network.
 *
 * Policy:
 *   - http/https only (no file://, gopher://, etc.)
 *   - Hostname must resolve to a public unicast address
 *   - Reject loopback, link-local, RFC1918 / unique-local, IPv4-mapped
 *     IPv6 forms of any of the above
 *
 * DNS rebinding TOCTOU defense: we resolve once and pin the connection
 * to the validated IP via `https.request`'s `lookup` option. Without
 * this, a low-TTL attacker-controlled hostname returning a public IP
 * for the validation lookup and a private IP for the `fetch()` socket
 * connect would bypass the guard entirely.
 *
 * Redirects are revalidated on every hop in `safeFetch` (each hop is
 * a fresh DNS resolve + pin, capped at MAX_REDIRECT_HOPS).
 */
function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === undefined || b === undefined) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("febf:")) return true;
    if (
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("ff")
    ) {
      return true;
    }
    if (lower.startsWith("::ffff:")) {
      return isPrivateIp(lower.slice("::ffff:".length));
    }
    return false;
  }
  return true; // unknown family — fail closed
}

const MAX_REDIRECT_HOPS = 5;

interface SafeFetchResult {
  status: number;
  headers: Record<string, string>;
  body: Readable;
}

/**
 * GET a URL with SSRF protection: resolve hostname once, validate the
 * IP, then issue the request via `node:https`/`node:http` with a
 * `lookup` that pins the socket to the validated IP. Hostname stays
 * the URL hostname for SNI / TLS cert verification / Host header.
 *
 * Redirects are revalidated end-to-end (each hop re-resolves + re-pins).
 */
async function safeFetch(rawUrl: string, hops = 0): Promise<SafeFetchResult> {
  if (hops > MAX_REDIRECT_HOPS) {
    throw new Error(`Too many redirects (>${MAX_REDIRECT_HOPS})`);
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Disallowed URL scheme: ${url.protocol}`);
  }

  let pinnedIp: string;
  let pinnedFamily: 4 | 6;
  if (net.isIP(url.hostname)) {
    if (isPrivateIp(url.hostname)) {
      throw new Error(
        `URL points to a private/loopback address: ${url.hostname}`,
      );
    }
    pinnedIp = url.hostname;
    pinnedFamily = net.isIP(url.hostname) as 4 | 6;
  } else {
    let addrs: { address: string; family: number }[];
    try {
      addrs = await dnsPromises.lookup(url.hostname, { all: true });
    } catch {
      throw new Error(`Could not resolve host: ${url.hostname}`);
    }
    if (addrs.length === 0) {
      throw new Error(`No addresses for host: ${url.hostname}`);
    }
    for (const addr of addrs) {
      if (isPrivateIp(addr.address)) {
        throw new Error(
          `URL host resolves to a private/loopback address: ${url.hostname} → ${addr.address}`,
        );
      }
    }
    const first = addrs[0]!;
    pinnedIp = first.address;
    pinnedFamily = first.family as 4 | 6;
  }

  const lib = url.protocol === "https:" ? https : http;
  const port = url.port
    ? Number.parseInt(url.port, 10)
    : url.protocol === "https:"
      ? 443
      : 80;

  return new Promise<SafeFetchResult>((resolve, reject) => {
    const req = lib.request({
      method: "GET",
      protocol: url.protocol,
      hostname: url.hostname,
      port,
      path: `${url.pathname}${url.search}`,
      lookup: ((
        _h: string,
        _opts: unknown,
        cb: (err: Error | null, addr: string, fam: number) => void,
      ) => {
        cb(null, pinnedIp, pinnedFamily);
      }) as never,
    });
    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        const loc = res.headers.location;
        if (typeof loc === "string" && loc.length > 0) {
          const next = new URL(loc, url).toString();
          res.resume(); // drain so the socket can close cleanly
          safeFetch(next, hops + 1).then(resolve, reject);
          return;
        }
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) {
        if (typeof v === "string") headers[k] = v;
        else if (Array.isArray(v)) headers[k] = v.join(",");
      }
      resolve({ status, headers, body: res });
    });
    req.on("error", reject);
    req.end();
  });
}

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

/** Cap on bytes for write_from_url / upload_to_url. Matches the share
 * pipeline's expected file sizes (CSVs, decks, zips). Files past this
 * are out of scope for the chat artifact flow. */
const MAX_TRANSFER_BYTES = 500 * 1024 * 1024;

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
function resolveReadPath(appRoot: string, userPath: string): string | null {
  if (path.isAbsolute(userPath)) return userPath;
  return safePath(appRoot, userPath);
}

export function makeReadHandler(deps: FsDeps) {
  return async (req: Request): Promise<Response> => {
    let body: { path?: string; offset?: number; limit?: number };
    try {
      body = (await parseBase64JsonBody(req)) as typeof body;
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 400);
    }
    const filePath = resolveReadPath(deps.appRoot, body.path ?? "");
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

/**
 * GET a remote URL (typically a presigned S3 URL) and stream the bytes to
 * a path on the sandbox FS. Mesh mints the URL and asks the daemon to
 * fetch it directly so bytes never round-trip through mesh.
 *
 * Body: { path: string; url: string }
 */
export function makeWriteFromUrlHandler(deps: FsDeps) {
  return async (req: Request): Promise<Response> => {
    let body: { path?: string; url?: string };
    try {
      body = (await parseBase64JsonBody(req)) as typeof body;
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 400);
    }
    if (typeof body.url !== "string" || !body.url) {
      return jsonResponse({ error: "url is required" }, 400);
    }
    const filePath = safePath(deps.appRoot, body.path ?? "");
    if (!filePath) return jsonResponse({ error: "Path escapes /app" }, 400);

    let resp: SafeFetchResult;
    try {
      resp = await safeFetch(body.url);
    } catch (err) {
      return jsonResponse(
        { error: `fetch failed: ${(err as Error).message}` },
        400,
      );
    }
    if (resp.status < 200 || resp.status >= 300) {
      resp.body.resume(); // drain
      return jsonResponse(
        { error: `upstream returned HTTP ${resp.status}` },
        502,
      );
    }
    const contentLengthHeader = resp.headers["content-length"];
    const declaredSize = contentLengthHeader
      ? Number.parseInt(contentLengthHeader, 10)
      : null;
    if (declaredSize !== null && declaredSize > MAX_TRANSFER_BYTES) {
      resp.body.resume();
      return jsonResponse(
        {
          error: `Payload too large (${declaredSize} > ${MAX_TRANSFER_BYTES})`,
        },
        413,
      );
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // pipeline() guarantees: backpressure honored, errors propagate
    // through the chain, all streams destroyed on failure. The Transform
    // tracks running byte count so we fail fast when a server lies in
    // (or omits) Content-Length.
    let written = 0;
    const cap = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        written += chunk.byteLength;
        if (written > MAX_TRANSFER_BYTES) {
          cb(new Error(`Stream exceeded ${MAX_TRANSFER_BYTES} bytes`));
          return;
        }
        cb(null, chunk);
      },
    });
    const out = fs.createWriteStream(filePath);
    try {
      await pipeline(resp.body, cap, out);
    } catch (err) {
      // Any failure (network RST, TLS error, size cap, write fault)
      // leaves a partial file. Remove it so a later skill step can't
      // read a half-baked artifact.
      fs.rmSync(filePath, { force: true });
      return jsonResponse(
        { error: `stream failed: ${(err as Error).message}` },
        502,
      );
    }
    return jsonResponse({ ok: true, path: body.path, size: written });
  };
}

/**
 * Read a file from the sandbox FS and PUT it to a remote URL (typically
 * a presigned S3 URL). Mesh mints the URL and asks the daemon to upload
 * directly so bytes never round-trip through mesh.
 *
 * Body: { path: string; url: string; contentType?: string }
 */
export function makeUploadToUrlHandler(deps: FsDeps) {
  return async (req: Request): Promise<Response> => {
    let body: { path?: string; url?: string; contentType?: string };
    try {
      body = (await parseBase64JsonBody(req)) as typeof body;
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 400);
    }
    if (typeof body.url !== "string" || !body.url) {
      return jsonResponse({ error: "url is required" }, 400);
    }
    const filePath = resolveReadPath(deps.appRoot, body.path ?? "");
    if (!filePath) {
      return jsonResponse({ error: "Path escapes project root" }, 400);
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return jsonResponse({ error: `File not found: ${body.path}` }, 400);
    }
    if (stat.isDirectory()) {
      return jsonResponse({ error: "Path is a directory" }, 400);
    }
    if (stat.size > MAX_TRANSFER_BYTES) {
      return jsonResponse(
        { error: `File too large (${stat.size} > ${MAX_TRANSFER_BYTES})` },
        413,
      );
    }

    const headers: Record<string, string> = {
      "Content-Length": String(stat.size),
    };
    if (body.contentType) headers["Content-Type"] = body.contentType;

    // Stream the file body — readFileSync at MAX_TRANSFER_BYTES would peg
    // ~25% of the daemon's memory cap on a single concurrent upload.
    // Bun.file().stream() returns a ReadableStream<Uint8Array> that fetch
    // accepts directly; backpressure stays on the network socket.
    let resp: Response;
    try {
      resp = await fetch(body.url, {
        method: "PUT",
        body: Bun.file(filePath).stream(),
        headers,
        // No SSRF revalidation here — the URL is mesh-minted (presigned
        // PUT to S3/R2), so the model can't influence where bytes go.
        // upload PUTs don't redirect under S3/R2 semantics anyway.
      });
    } catch (err) {
      return jsonResponse(
        { error: `upload failed: ${(err as Error).message}` },
        502,
      );
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return jsonResponse(
        {
          error: `upstream returned HTTP ${resp.status}: ${errText.slice(0, 500)}`,
        },
        502,
      );
    }
    return jsonResponse({ ok: true, size: stat.size });
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
