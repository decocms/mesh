#!/usr/bin/env node
/**
 * Local Object Storage MCP Server
 *
 * A STDIO MCP server that implements the OBJECT_STORAGE_BINDING interface
 * backed by the local filesystem. Includes an embedded HTTP server for
 * serving presigned URLs (download/upload).
 *
 * Usage:
 *   npx @decocms/mcp-local-object-storage /path/to/folder
 *   bun run src/index.ts /path/to/folder
 *
 * The server:
 * 1. Starts a tiny HTTP server on a random available port
 * 2. Registers OBJECT_STORAGE_BINDING tools (LIST_OBJECTS, GET_PRESIGNED_URL, etc.)
 * 3. Connects via STDIO for MCP protocol communication
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import {
  readdir,
  stat,
  rm,
  mkdir,
  writeFile,
  readFile,
} from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { z } from "zod";

// ============================================================================
// Configuration
// ============================================================================

const basePath = process.argv[2];
if (!basePath) {
  console.error(
    "Usage: mcp-local-object-storage <folder-path>\n" +
      "  folder-path: Absolute path to the local folder to use as object storage",
  );
  process.exit(1);
}

// Secret for signing presigned URLs (random per session)
const SESSION_SECRET = randomBytes(32).toString("hex");

// Default expiration for presigned URLs (1 hour)
const DEFAULT_EXPIRES_IN = 3600;

// ============================================================================
// Content Type Detection
// ============================================================================

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  avif: "image/avif",
  pdf: "application/pdf",
  json: "application/json",
  xml: "application/xml",
  txt: "text/plain",
  html: "text/html",
  css: "text/css",
  csv: "text/csv",
  md: "text/markdown",
  js: "application/javascript",
  ts: "application/typescript",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  zip: "application/zip",
  gz: "application/gzip",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
};

function getContentType(key: string): string {
  const ext = extname(key).slice(1).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

// ============================================================================
// Presigned URL Utilities
// ============================================================================

function generateSignature(
  key: string,
  expires: number,
  method: "GET" | "PUT",
): string {
  const data = `${key}:${expires}:${method}`;
  return createHmac("sha256", SESSION_SECRET).update(data).digest("hex");
}

function verifySignature(
  key: string,
  expires: number,
  method: "GET" | "PUT",
  signature: string,
): boolean {
  const expected = generateSignature(key, expires, method);
  return signature === expected;
}

function generatePresignedUrl(
  httpBaseUrl: string,
  key: string,
  expiresIn: number,
  method: "GET" | "PUT",
): string {
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const signature = generateSignature(key, expires, method);
  const sanitized = key.replace(/^\/+/, "");
  const url = new URL(`/files/${sanitized}`, httpBaseUrl);
  url.searchParams.set("expires", expires.toString());
  url.searchParams.set("signature", signature);
  url.searchParams.set("method", method);
  return url.toString();
}

function generateEtag(filePath: string, mtime: Date, size: number): string {
  const data = `${filePath}:${mtime.getTime()}:${size}`;
  return `"${createHmac("md5", "etag").update(data).digest("hex")}"`;
}

// ============================================================================
// File Utilities
// ============================================================================

function sanitizeKey(key: string): string {
  return key.replace(/^\/+/, "").replace(/\.\./g, "");
}

function getFilePath(key: string): string {
  return join(basePath, sanitizeKey(key));
}

interface FileObject {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
}

async function listFilesRecursive(
  dir: string,
  prefix: string,
  delimiter: string | undefined,
  results: { objects: FileObject[]; commonPrefixes: Set<string> },
): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const key = relative(basePath, fullPath).replace(/\\/g, "/");

      if (prefix && !key.startsWith(prefix)) continue;

      if (entry.isDirectory()) {
        if (delimiter) {
          const dirPrefix = key + "/";
          if (!prefix || dirPrefix.startsWith(prefix)) {
            const afterPrefix = prefix ? key.slice(prefix.length) : key;
            if (!afterPrefix.includes("/")) {
              results.commonPrefixes.add(dirPrefix);
            }
          }
        } else {
          await listFilesRecursive(fullPath, prefix, delimiter, results);
        }
      } else if (entry.isFile()) {
        if (delimiter && prefix) {
          const afterPrefix = key.slice(prefix.length);
          if (afterPrefix.includes(delimiter)) {
            const folderEnd = afterPrefix.indexOf(delimiter);
            const folderPath = prefix + afterPrefix.slice(0, folderEnd + 1);
            results.commonPrefixes.add(folderPath);
            continue;
          }
        }

        try {
          const fileStat = await stat(fullPath);
          results.objects.push({
            key,
            size: fileStat.size,
            lastModified: fileStat.mtime.toISOString(),
            etag: generateEtag(fullPath, fileStat.mtime, fileStat.size),
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
}

// ============================================================================
// HTTP Server (for presigned URL file serving/upload)
// ============================================================================

function parseQueryString(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return params;
  const query = url.slice(queryStart + 1);
  for (const pair of query.split("&")) {
    const [key, value] = pair.split("=");
    if (key && value !== undefined) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return params;
}

function getKeyFromPath(urlPath: string): string {
  // Path is /files/some/key.png?params
  const withoutQuery = urlPath.split("?")[0]!;
  const prefix = "/files/";
  if (withoutQuery.startsWith(prefix)) {
    return decodeURIComponent(withoutQuery.slice(prefix.length));
  }
  return "";
}

function startHttpServer(): Promise<{ baseUrl: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const urlPath = req.url || "/";
        const key = getKeyFromPath(urlPath);
        const params = parseQueryString(urlPath);

        if (!key) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing file key" }));
          return;
        }

        const expiresStr = params["expires"];
        const signature = params["signature"];
        const method = params["method"] as "GET" | "PUT" | undefined;

        if (!expiresStr || !signature || !method) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing signature parameters" }));
          return;
        }

        const expires = parseInt(expiresStr, 10);
        if (!Number.isFinite(expires)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid expires" }));
          return;
        }

        const now = Math.floor(Date.now() / 1000);
        if (expires < now) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "URL has expired" }));
          return;
        }

        if (!verifySignature(key, expires, method, signature)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid signature" }));
          return;
        }

        const filePath = getFilePath(key);

        if (req.method === "GET" && method === "GET") {
          try {
            const data = await readFile(filePath);
            const contentType = getContentType(key);
            res.writeHead(200, {
              "Content-Type": contentType,
              "Content-Length": data.length.toString(),
              "Cache-Control": "private, max-age=3600",
            });
            res.end(data);
          } catch {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "File not found" }));
          }
        } else if (req.method === "PUT" && method === "PUT") {
          try {
            const dir = join(filePath, "..");
            await mkdir(dir, { recursive: true });

            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(
                typeof chunk === "string" ? Buffer.from(chunk) : chunk,
              );
            }
            const body = Buffer.concat(chunks);

            await writeFile(filePath, body);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, key }));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Failed to save file",
                message: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        } else {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
        }
      },
    );

    // Listen on random available port
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        const baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve({ baseUrl, close: () => server.close() });
      }
    });
  });
}

// ============================================================================
// MCP Server
// ============================================================================

async function main() {
  // Ensure base directory exists
  await mkdir(basePath, { recursive: true });

  // Start HTTP server for presigned URLs
  const http = await startHttpServer();

  const server = new McpServer(
    {
      name: "local-object-storage",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {} },
    },
  );

  // LIST_OBJECTS
  server.registerTool(
    "LIST_OBJECTS",
    {
      description:
        "List objects in the local folder with pagination and prefix filtering",
      inputSchema: {
        prefix: z.string().optional().describe("Filter by prefix"),
        maxKeys: z
          .number()
          .optional()
          .default(1000)
          .describe("Max keys to return"),
        continuationToken: z.string().optional().describe("Pagination token"),
        delimiter: z
          .string()
          .optional()
          .describe("Delimiter for grouping (typically '/')"),
      },
      outputSchema: {
        objects: z.array(
          z.object({
            key: z.string(),
            size: z.number(),
            lastModified: z.string(),
            etag: z.string(),
          }),
        ),
        nextContinuationToken: z.string().optional(),
        isTruncated: z.boolean(),
        commonPrefixes: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      const prefix = (args.prefix as string) || "";
      const maxKeys = (args.maxKeys as number) ?? 1000;
      const delimiter = args.delimiter as string | undefined;
      const continuationToken = args.continuationToken as string | undefined;

      const results: {
        objects: FileObject[];
        commonPrefixes: Set<string>;
      } = { objects: [], commonPrefixes: new Set() };

      await listFilesRecursive(basePath, prefix, delimiter, results);
      results.objects.sort((a, b) => a.key.localeCompare(b.key));

      let startIndex = 0;
      if (continuationToken) {
        startIndex = results.objects.findIndex(
          (o) => o.key > continuationToken,
        );
        if (startIndex === -1) startIndex = results.objects.length;
      }

      const paginatedObjects = results.objects.slice(
        startIndex,
        startIndex + maxKeys,
      );
      const isTruncated = startIndex + maxKeys < results.objects.length;
      const nextToken = isTruncated
        ? paginatedObjects[paginatedObjects.length - 1]?.key
        : undefined;

      const output = {
        objects: paginatedObjects,
        isTruncated,
        nextContinuationToken: nextToken,
        commonPrefixes: Array.from(results.commonPrefixes).sort(),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
        structuredContent: output as { [x: string]: unknown },
      };
    },
  );

  // GET_OBJECT_METADATA
  server.registerTool(
    "GET_OBJECT_METADATA",
    {
      description: "Get metadata for a file in the local folder",
      inputSchema: {
        key: z.string().describe("Object key/path"),
      },
      outputSchema: {
        contentType: z.string().optional(),
        contentLength: z.number(),
        lastModified: z.string(),
        etag: z.string(),
        metadata: z.record(z.string(), z.string()).optional(),
      },
    },
    async (args) => {
      const key = args.key as string;
      const filePath = getFilePath(key);
      const fileStat = await stat(filePath);

      const output = {
        contentType: getContentType(key),
        contentLength: fileStat.size,
        lastModified: fileStat.mtime.toISOString(),
        etag: generateEtag(filePath, fileStat.mtime, fileStat.size),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
        structuredContent: output as { [x: string]: unknown },
      };
    },
  );

  // GET_PRESIGNED_URL
  server.registerTool(
    "GET_PRESIGNED_URL",
    {
      description:
        "Generate a presigned URL for downloading a file from local storage",
      inputSchema: {
        key: z.string().describe("Object key/path"),
        expiresIn: z
          .number()
          .optional()
          .describe("Expiration in seconds (default: 3600)"),
      },
      outputSchema: {
        url: z.string(),
        expiresIn: z.number(),
      },
    },
    async (args) => {
      const key = args.key as string;
      const expiresIn = (args.expiresIn as number) ?? DEFAULT_EXPIRES_IN;
      const url = generatePresignedUrl(http.baseUrl, key, expiresIn, "GET");

      const output = { url, expiresIn };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
        structuredContent: output as { [x: string]: unknown },
      };
    },
  );

  // PUT_PRESIGNED_URL
  server.registerTool(
    "PUT_PRESIGNED_URL",
    {
      description:
        "Generate a presigned URL for uploading a file to local storage",
      inputSchema: {
        key: z.string().describe("Object key/path for upload"),
        expiresIn: z
          .number()
          .optional()
          .describe("Expiration in seconds (default: 3600)"),
        contentType: z.string().optional().describe("MIME type"),
      },
      outputSchema: {
        url: z.string(),
        expiresIn: z.number(),
      },
    },
    async (args) => {
      const key = args.key as string;
      const expiresIn = (args.expiresIn as number) ?? DEFAULT_EXPIRES_IN;
      const url = generatePresignedUrl(http.baseUrl, key, expiresIn, "PUT");

      const output = { url, expiresIn };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
        structuredContent: output as { [x: string]: unknown },
      };
    },
  );

  // DELETE_OBJECT
  server.registerTool(
    "DELETE_OBJECT",
    {
      description: "Delete a single file from local storage",
      inputSchema: {
        key: z.string().describe("Object key/path to delete"),
      },
      outputSchema: {
        success: z.boolean(),
        key: z.string(),
      },
    },
    async (args) => {
      const key = args.key as string;
      const filePath = getFilePath(key);

      let success = false;
      try {
        await rm(filePath);
        success = true;
      } catch {
        // File may not exist
      }

      const output = { success, key };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
        structuredContent: output as { [x: string]: unknown },
      };
    },
  );

  // DELETE_OBJECTS
  server.registerTool(
    "DELETE_OBJECTS",
    {
      description: "Delete multiple files from local storage",
      inputSchema: {
        keys: z.array(z.string()).max(1000).describe("Keys to delete"),
      },
      outputSchema: {
        deleted: z.array(z.string()),
        errors: z.array(z.object({ key: z.string(), message: z.string() })),
      },
    },
    async (args) => {
      const keys = args.keys as string[];
      const deleted: string[] = [];
      const errors: { key: string; message: string }[] = [];

      await Promise.all(
        keys.map(async (key) => {
          try {
            await rm(getFilePath(key));
            deleted.push(key);
          } catch (err) {
            errors.push({
              key,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }),
      );

      const output = { deleted, errors };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
        structuredContent: output as { [x: string]: unknown },
      };
    },
  );

  // Connect via STDIO
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Clean up HTTP server when STDIO closes
  process.on("SIGINT", () => {
    http.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    http.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
