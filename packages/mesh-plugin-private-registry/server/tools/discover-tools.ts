import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { z } from "zod";

/**
 * Reject URLs that target private/internal network ranges to prevent SSRF.
 */
function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // Block common private/internal hostnames
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return true;
    }

    // Block private IPv4 ranges
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 127) return true; // 127.0.0.0/8
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
      if (a === 0) return true; // 0.0.0.0/8
    }

    return false;
  } catch {
    return true; // Invalid URL → reject
  }
}

const DiscoverToolsInputSchema = z.object({
  url: z.string().describe("Remote MCP server URL"),
  type: z
    .enum(["http", "sse"])
    .optional()
    .default("http")
    .describe("Transport type"),
});

const DiscoverToolsOutputSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable().optional(),
    }),
  ),
  error: z.string().nullable().optional(),
});

/**
 * Build URL variants to try: if the URL is http, also try https, and vice versa.
 */
function getUrlVariants(url: string): string[] {
  const variants = [url];
  if (url.startsWith("http://")) {
    variants.push(url.replace("http://", "https://"));
  } else if (url.startsWith("https://")) {
    variants.push(url.replace("https://", "http://"));
  }
  return variants;
}

type TransportType = "http" | "sse";

interface ConnectAttempt {
  url: string;
  transport: TransportType;
}

interface DiscoverTool {
  name: string;
  description?: string | null;
}

/**
 * Check if an error message indicates the MCP server requires auth
 * for initialize but may still allow tools/list.
 */
function isAuthRequiredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("unauthorized") ||
    lower.includes("authentication required") ||
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes('"code":-32000')
  );
}

/**
 * Try to list tools via raw JSON-RPC POST (bypassing SDK initialize).
 * Some MCP servers (e.g. Google Drive) block initialize without auth
 * but allow tools/list publicly.
 */
async function tryRawToolsList(
  url: string,
  timeoutMs: number,
): Promise<DiscoverTool[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const text = await res.text();

    // Handle SSE-style response (event: message\ndata: {...})
    let json: Record<string, unknown> | null = null;
    if (text.includes("event:") || text.includes("data:")) {
      const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
      if (dataLine) {
        json = JSON.parse(dataLine.slice(5).trim());
      }
    } else {
      json = JSON.parse(text);
    }

    if (!json) return null;

    // Extract tools from either { result: { tools } } or { tools }
    const result = (json.result as Record<string, unknown>) ?? json;
    const tools = result?.tools as DiscoverTool[] | undefined;
    if (!Array.isArray(tools)) return null;

    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? null,
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Server-side tool to discover tools from a remote MCP server.
 * Runs on the server so there are no CORS restrictions.
 *
 * Strategy:
 * 1. Try full MCP SDK flow (initialize + listTools) with transport/protocol fallbacks.
 * 2. If initialize fails with auth error, try raw POST tools/list (many servers
 *    expose tool listing publicly even when they require auth for actual usage).
 */
export const REGISTRY_DISCOVER_TOOLS: ServerPluginToolDefinition = {
  name: "REGISTRY_DISCOVER_TOOLS",
  description:
    "Discover tools from a remote MCP server by connecting to it server-side (no CORS issues).",
  inputSchema: DiscoverToolsInputSchema,
  outputSchema: DiscoverToolsOutputSchema,

  handler: async (input) => {
    const typedInput = input as z.infer<typeof DiscoverToolsInputSchema>;
    const { url, type } = typedInput;

    if (!url) {
      return { tools: [], error: "URL is required" };
    }

    // Block requests to private/internal networks (SSRF prevention)
    if (isPrivateUrl(url)) {
      return {
        tools: [],
        error: "URLs targeting private networks are not allowed",
      };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };

    const timeoutMs = 10_000;
    const makeTimeout = () =>
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Connection timeout (10s)")),
          timeoutMs,
        );
      });

    const urlVariants = getUrlVariants(url);
    const transportTypes: TransportType[] =
      type === "sse" ? ["sse", "http"] : ["http", "sse"];

    // Build all combinations: each URL variant × each transport type
    const attempts: ConnectAttempt[] = [];
    for (const u of urlVariants) {
      for (const t of transportTypes) {
        attempts.push({ url: u, transport: t });
      }
    }

    let lastError: string | null = null;
    let authErrorUrl: string | null = null;

    for (const attempt of attempts) {
      let client: Client | null = null;
      try {
        client = new Client({
          name: "registry-discover",
          version: "1.0.0",
        });

        const transport =
          attempt.transport === "sse"
            ? new SSEClientTransport(new URL(attempt.url), {
                requestInit: { headers },
              })
            : new StreamableHTTPClientTransport(new URL(attempt.url), {
                requestInit: { headers },
              });

        await Promise.race([client.connect(transport), makeTimeout()]);
        const result = await Promise.race([client.listTools(), makeTimeout()]);

        const tools = (result.tools || []).map(
          (t: { name: string; description?: string | null }) => ({
            name: t.name,
            description: t.description ?? null,
          }),
        );

        console.log(
          `[REGISTRY_DISCOVER_TOOLS] Success via ${attempt.transport} ${attempt.url}: ${tools.length} tools`,
        );
        return { tools, error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[REGISTRY_DISCOVER_TOOLS] ${attempt.transport} ${attempt.url}: ${message}`,
        );
        lastError = message;

        // If the server responded with auth error, remember this URL to try raw fallback
        if (isAuthRequiredError(message) && !authErrorUrl) {
          authErrorUrl = attempt.url;
        }
      } finally {
        try {
          await client?.close();
        } catch {
          // ignore close errors
        }
      }
    }

    // ── Fallback: try raw POST tools/list on URLs that returned auth errors ──
    // Some servers block "initialize" without auth but allow "tools/list" publicly.
    if (authErrorUrl) {
      console.log(
        `[REGISTRY_DISCOVER_TOOLS] Server requires auth for initialize. Trying raw tools/list on ${authErrorUrl}...`,
      );

      // Try all URL variants for raw fallback
      for (const rawUrl of urlVariants) {
        const rawTools = await tryRawToolsList(rawUrl, timeoutMs);
        if (rawTools && rawTools.length > 0) {
          console.log(
            `[REGISTRY_DISCOVER_TOOLS] Raw tools/list succeeded on ${rawUrl}: ${rawTools.length} tools`,
          );
          return { tools: rawTools, error: null };
        }
      }

      console.log(
        `[REGISTRY_DISCOVER_TOOLS] Raw tools/list also failed. Server requires auth for everything.`,
      );
      return {
        tools: [],
        error:
          "Server requires authentication. Tools cannot be discovered without credentials, but the connection is valid.",
      };
    }

    console.error(
      `[REGISTRY_DISCOVER_TOOLS] All attempts failed for ${url}: ${lastError}`,
    );
    return { tools: [], error: lastError };
  },
};
