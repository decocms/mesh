/**
 * Rewrite localhost-bound URLs in an MCP server map so connections made from
 * inside a docker container reach the mesh process on the host.
 *
 * Runs only when the host-access probe settled on `--add-host` mode — in
 * `--network=host` mode the container shares the host's loopback, so
 * `localhost` already means the right thing and no rewrite is needed.
 *
 * Non-local URLs pass through untouched.
 */
export type McpServer = {
  type: "sse" | "http";
  url: string;
  headers?: Record<string, string>;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const CONTAINER_HOST = "host.docker.internal";

export function rewriteMcpUrlsForContainer(
  servers: Record<string, McpServer>,
): Record<string, McpServer> {
  const out: Record<string, McpServer> = {};
  for (const [name, server] of Object.entries(servers)) {
    out[name] = { ...server, url: rewriteLocalHost(server.url) };
  }
  return out;
}

function rewriteLocalHost(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!LOCAL_HOSTS.has(url.hostname)) return raw;
  url.hostname = CONTAINER_HOST;
  return url.toString();
}
