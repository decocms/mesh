/**
 * Local MCP Client
 *
 * Creates an in-process MCP client for local folder connections.
 * Instead of proxying HTTP requests to an external server, this registers
 * filesystem + bash + object-storage tools directly and communicates
 * via an in-memory bridge transport (zero serialization overhead).
 *
 * LocalFileStorage is cached per rootPath. McpServer instances are created
 * fresh per client because the MCP SDK only allows one transport per server.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createBridgeTransportPair } from "@decocms/mesh-sdk";
import {
  LocalFileStorage,
  registerTools,
  registerBashTool,
} from "@decocms/local-dev";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConnectionEntity } from "@/tools/connection/schema";
import { getInternalUrl } from "@/core/server-constants";

/** Name of the preview tool — used for sidebar pinning */
export const PREVIEW_TOOL_NAME = "dev_server_preview";

/**
 * Cache of LocalFileStorage instances per rootPath.
 * Storage is the expensive part (filesystem state); McpServer is cheap to create.
 */
const storageCache = new Map<string, LocalFileStorage>();

function getOrCreateStorage(rootPath: string): LocalFileStorage {
  const cached = storageCache.get(rootPath);
  if (cached) return cached;

  const storage = new LocalFileStorage(rootPath);
  storageCache.set(rootPath, storage);
  return storage;
}

// ---- Preview detection ----

interface PreviewConfig {
  command?: string;
  port?: number;
}

interface PreviewDetection {
  /** "static" = has index.html, no dev server needed; "dev-server" = has a dev command; "needs-config" = can't detect */
  mode: "static" | "dev-server" | "needs-config";
  /** For static mode: URL to iframe directly */
  staticUrl?: string;
  /** Suggested dev command (from package.json or .deco/preview.json) */
  command?: string;
  /** Suggested port */
  port?: number;
  /** Whether .deco/preview.json exists */
  hasConfig: boolean;
}

function detectPreview(
  rootPath: string,
  baseFileUrl: string,
): PreviewDetection {
  const hasIndexHtml = existsSync(join(rootPath, "index.html"));
  const hasPackageJson = existsSync(join(rootPath, "package.json"));

  // 1. Static site: has index.html at root — serve directly
  //    Even if there's a package.json, a root index.html means it can be previewed as-is.
  if (hasIndexHtml) {
    return {
      mode: "static",
      staticUrl: `${baseFileUrl}/index.html`,
      hasConfig: false,
    };
  }

  // 2. Check .deco/preview.json (user-configured, only relevant for dev-server projects)
  const configPath = join(rootPath, ".deco", "preview.json");
  let savedConfig: PreviewConfig | null = null;
  if (existsSync(configPath)) {
    try {
      savedConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {}
  }

  if (savedConfig?.command && savedConfig?.port) {
    return {
      mode: "dev-server",
      command: savedConfig.command,
      port: savedConfig.port,
      hasConfig: true,
    };
  }

  // 3. Check package.json for dev scripts
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(rootPath, "package.json"), "utf-8"),
      );
      const scripts = pkg.scripts || {};

      // Detect package manager
      let pm = "npm run";
      if (existsSync(join(rootPath, "bun.lockb"))) pm = "bun run";
      else if (existsSync(join(rootPath, "pnpm-lock.yaml"))) pm = "pnpm";
      else if (existsSync(join(rootPath, "yarn.lock"))) pm = "yarn";

      // Find a dev command
      for (const key of ["dev", "start", "serve"]) {
        if (scripts[key]) {
          let port = 3000;
          const portMatch = scripts[key].match(/(?:--port|PORT=|:)(\d{4,5})/);
          if (portMatch) port = parseInt(portMatch[1]);
          else if (scripts[key].includes("vite")) port = 5173;
          else if (scripts[key].includes("astro")) port = 4321;

          return {
            mode: "dev-server",
            command: `${pm} ${key}`,
            port,
            hasConfig: false,
          };
        }
      }
    } catch {}

    // Has package.json but no dev script — if there's an index.html, serve it statically
    if (hasIndexHtml) {
      return {
        mode: "static",
        staticUrl: `${baseFileUrl}/index.html`,
        hasConfig: false,
      };
    }
  }

  // 4. Can't detect — user needs to configure
  return { mode: "needs-config", hasConfig: false };
}

// ---- Preview tool registration ----

function registerPreviewTool(
  server: McpServer,
  rootPath: string,
  baseFileUrl: string,
) {
  const previewResourceUri = "ui://local-dev/preview";

  // Register the UI resource that serves the preview HTML
  server.registerResource(
    "preview",
    previewResourceUri,
    {
      description: "Dev server preview",
      mimeType: "text/html;profile=mcp-app",
    },
    async () => ({
      contents: [
        {
          uri: previewResourceUri,
          mimeType: "text/html;profile=mcp-app",
          text: getPreviewHtml(rootPath, baseFileUrl),
        },
      ],
    }),
  );

  // Register the tool with UI metadata so Mesh discovers it
  server.registerTool(
    PREVIEW_TOOL_NAME,
    {
      title: "Dev Server Preview",
      description:
        "Preview your local project. Auto-detects static sites and dev servers. " +
        "Configure via .deco/preview.json with { command, port }.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: {
        ui: {
          resourceUri: previewResourceUri,
          csp: {
            connectDomains: [
              "http://localhost:*",
              "http://127.0.0.1:*",
              "ws://localhost:*",
              "ws://127.0.0.1:*",
            ],
            frameDomains: ["http://localhost:*", "http://127.0.0.1:*"],
          },
        },
      },
    },
    async () => {
      const detection = detectPreview(rootPath, baseFileUrl);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(detection),
          },
        ],
      };
    },
  );
}

/**
 * Create an in-process MCP client for a local folder connection.
 */
export async function createLocalClient(
  connection: ConnectionEntity,
  rootPath: string,
): Promise<Client> {
  const storage = getOrCreateStorage(rootPath);

  const mcpServer = new McpServer({
    name: `local-dev-${rootPath}`,
    version: "1.0.0",
  });

  const internalUrl = getInternalUrl();
  const baseFileUrl = `${internalUrl}/api/local-dev/files/${connection.id}`;

  registerTools(mcpServer, storage, baseFileUrl);
  registerBashTool(mcpServer, rootPath);
  registerPreviewTool(mcpServer, rootPath, baseFileUrl);

  const { client: clientTransport, server: serverTransport } =
    createBridgeTransportPair();

  await mcpServer.connect(serverTransport);

  const client = new Client({
    name: "local-mcp-client",
    version: "1.0.0",
  });
  await client.connect(clientTransport);

  return client;
}

/**
 * Get the LocalFileStorage instance for a connection's root path.
 */
export function getLocalStorage(
  rootPath: string,
): LocalFileStorage | undefined {
  return storageCache.get(rootPath);
}

/**
 * Returns the HTML for the preview MCP App.
 *
 * Implements the MCP ext-apps protocol:
 * 1. PostMessageTransport handshake (ui/initialize → ui/notifications/initialized)
 * 2. Receives tool result with preview detection info
 * 3. Can call tools (bash) via tools/call JSON-RPC
 *
 * Detection modes:
 * - static: iframe the file serving URL directly (e.g. index.html)
 * - dev-server: start the dev server via bash, then iframe localhost:port
 * - needs-config: show a form for the user to fill in command + port
 */
function getPreviewHtml(rootPath: string, baseFileUrl: string): string {
  // Do server-side detection to bake initial state into HTML
  const detection = detectPreview(rootPath, baseFileUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; height: 100vh; display: flex; flex-direction: column; background: var(--app-background, #fff); color: var(--app-foreground, #111); }
  .toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--app-border, #e5e5e5); background: var(--app-surface, #fafafa); flex-shrink: 0; }
  .toolbar button { padding: 4px 12px; border-radius: 6px; border: 1px solid var(--app-border, #e5e5e5); background: var(--app-surface, #fff); cursor: pointer; font-size: 13px; color: inherit; }
  .toolbar button:hover { background: var(--app-muted, #f0f0f0); }
  .toolbar button.primary { background: var(--app-primary, #2563eb); color: white; border-color: transparent; }
  .toolbar button.primary:hover { opacity: 0.9; }
  .toolbar button.danger { color: #dc2626; }
  .url-bar { flex: 1; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--app-border, #e5e5e5); background: var(--app-background, #fff); font-size: 13px; font-family: monospace; color: var(--app-muted-foreground, #666); }
  .status { font-size: 12px; color: var(--app-muted-foreground, #888); }
  .status.running { color: #16a34a; }
  .status.stopped { color: #dc2626; }
  iframe { flex: 1; border: none; width: 100%; }
  .setup { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 32px; text-align: center; }
  .setup h2 { font-size: 18px; font-weight: 600; }
  .setup p { font-size: 14px; color: var(--app-muted-foreground, #666); max-width: 400px; }
  .setup .config-form { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 360px; text-align: left; }
  .setup label { font-size: 13px; font-weight: 500; }
  .setup input { padding: 8px 12px; border-radius: 6px; border: 1px solid var(--app-border, #e5e5e5); font-size: 14px; font-family: monospace; background: var(--app-background, #fff); color: inherit; }
  .detecting { animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
</head>
<body>
<div id="app"></div>
<script>
// ---- Minimal MCP App protocol ----
// Implements the JSON-RPC handshake required by ext-apps AppBridge.

var _msgId = 0;
var _pending = {};

// Listen for messages from the host
window.addEventListener("message", function(e) {
  var msg = e.data;
  if (!msg || msg.jsonrpc !== "2.0") return;

  // Response to a request we sent
  if (msg.id != null && _pending[msg.id]) {
    _pending[msg.id](msg);
    delete _pending[msg.id];
    return;
  }

  // Notification from host (tool result, context changes, etc.)
  if (msg.method === "ui/notifications/tool-result" && msg.params) {
    onToolResult(msg.params);
  }
  if (msg.method === "ui/notifications/host-context-changed" && msg.params) {
    if (msg.params.theme) {
      document.documentElement.className = msg.params.theme === "dark" ? "dark" : "";
    }
  }
  // Resource teardown — just respond OK
  if (msg.method === "ui/resource-teardown" && msg.id != null) {
    window.parent.postMessage({ jsonrpc: "2.0", id: msg.id, result: {} }, "*");
  }
  // Ping
  if (msg.method === "ping" && msg.id != null) {
    window.parent.postMessage({ jsonrpc: "2.0", id: msg.id, result: {} }, "*");
  }
});

function sendRequest(method, params) {
  return new Promise(function(resolve, reject) {
    var id = ++_msgId;
    _pending[id] = function(msg) {
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    };
    window.parent.postMessage({
      jsonrpc: "2.0",
      id: id,
      method: method,
      params: params
    }, "*");
  });
}

function sendNotification(method, params) {
  window.parent.postMessage({
    jsonrpc: "2.0",
    method: method,
    params: params || {}
  }, "*");
}

// Initialize the MCP App protocol handshake
async function initApp() {
  try {
    await sendRequest("ui/initialize", {
      appInfo: { name: "Local Dev Preview", version: "1.0.0" },
      appCapabilities: { tools: {} },
      protocolVersion: "2025-03-26"
    });
    sendNotification("ui/notifications/initialized");
  } catch (err) {
    console.error("MCP App init failed:", err);
  }
}

// Call a tool on the host MCP server
async function callTool(name, args) {
  return sendRequest("tools/call", { name: name, arguments: args });
}

async function bash(cmd) {
  var result = await callTool("bash", { cmd: cmd, timeout: 30000 });
  var text = result && result.content && result.content[0] && result.content[0].text || "{}";
  return JSON.parse(text);
}

// ---- Preview state ----

var ROOT = ${JSON.stringify(rootPath)};
var BASE_FILE_URL = ${JSON.stringify(baseFileUrl)};
var detection = ${JSON.stringify(detection)};
var config = null;
var serverRunning = false;

function onToolResult(params) {
  // Tool result may contain updated detection
  try {
    if (params.content && params.content[0] && params.content[0].text) {
      var d = JSON.parse(params.content[0].text);
      if (d.mode) detection = d;
    }
  } catch {}
}

// ---- Config management ----

async function loadConfig() {
  try {
    var result = await bash("cat .deco/preview.json 2>/dev/null || echo '{}'");
    var parsed = JSON.parse(result.stdout || "{}");
    if (parsed.command && parsed.port) {
      config = parsed;
      return true;
    }
  } catch {}
  return false;
}

async function saveConfig(command, port) {
  var json = JSON.stringify({ command: command, port: port }, null, 2);
  await bash("mkdir -p .deco && printf '%s' " + JSON.stringify(json) + " > .deco/preview.json");
  config = { command: command, port: port };
}

async function checkServer() {
  if (!config) return false;
  try {
    var result = await bash("curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 http://localhost:" + config.port + " 2>/dev/null || echo 000");
    var code = parseInt(result.stdout || "000");
    return code > 0 && code < 500;
  } catch { return false; }
}

async function startServer() {
  if (!config) return;
  await bash("cd " + ROOT + " && nohup " + config.command + " > .deco/preview.log 2>&1 &");
  for (var i = 0; i < 30; i++) {
    await new Promise(function(r) { setTimeout(r, 1000); });
    if (await checkServer()) { serverRunning = true; render(); return; }
  }
  render();
}

async function stopServer() {
  if (!config) return;
  await bash("lsof -ti:" + config.port + " | xargs kill -9 2>/dev/null || true");
  serverRunning = false;
  render();
}

// ---- Rendering ----

function render() {
  var el = document.getElementById("app");

  // Static mode: just iframe the files directly
  if (detection.mode === "static" && detection.staticUrl) {
    renderStatic(el, detection.staticUrl);
    return;
  }

  // Dev server mode with config (from detection or loaded)
  if (config) {
    if (serverRunning) {
      renderRunning(el);
    } else {
      renderStopped(el);
    }
    return;
  }

  // Needs config
  renderSetup(el);
}

function renderStatic(el, url) {
  el.innerHTML =
    '<div class="toolbar">' +
      '<span class="status running">● Static</span>' +
      '<span class="url-bar">' + url + '</span>' +
      '<button id="refresh-btn">↻ Refresh</button>' +
      '<button id="open-btn">↗ Open</button>' +
    '</div>' +
    '<iframe id="preview-frame" src="' + url + '"></iframe>';
  document.getElementById("refresh-btn").onclick = function() {
    document.getElementById("preview-frame").src = url;
  };
  document.getElementById("open-btn").onclick = function() {
    window.open(url, "_blank");
  };
  sendNotification("ui/notifications/size-changed", { height: window.innerHeight });
}

function renderRunning(el) {
  var url = "http://localhost:" + config.port;
  el.innerHTML =
    '<div class="toolbar">' +
      '<span class="status running">● Running</span>' +
      '<span class="url-bar">' + url + '</span>' +
      '<button id="refresh-btn">↻ Refresh</button>' +
      '<button id="open-btn">↗ Open</button>' +
      '<button class="danger" id="stop-btn">Stop</button>' +
    '</div>' +
    '<iframe id="preview-frame" src="' + url + '"></iframe>';
  document.getElementById("refresh-btn").onclick = function() {
    document.getElementById("preview-frame").src = url;
  };
  document.getElementById("open-btn").onclick = function() { window.open(url, "_blank"); };
  document.getElementById("stop-btn").onclick = stopServer;
  sendNotification("ui/notifications/size-changed", { height: window.innerHeight });
}

function renderStopped(el) {
  el.innerHTML =
    '<div class="toolbar">' +
      '<span class="status stopped">● Stopped</span>' +
      '<span class="url-bar">http://localhost:' + config.port + '</span>' +
      '<button class="primary" id="start-btn">Start Server</button>' +
      '<button id="edit-btn">Edit</button>' +
    '</div>' +
    '<div class="setup">' +
      '<p>Dev server is not running.</p>' +
      '<button class="primary" id="start-btn2" style="padding:10px 24px; border-radius:8px; border:none; background:var(--app-primary,#2563eb); color:white; cursor:pointer; font-size:14px;">Start Dev Server</button>' +
    '</div>';
  var start = async function() {
    document.querySelectorAll("#start-btn, #start-btn2").forEach(function(b) { b.textContent = "Starting..."; b.disabled = true; });
    await startServer();
  };
  document.getElementById("start-btn").onclick = start;
  document.getElementById("start-btn2").onclick = start;
  document.getElementById("edit-btn").onclick = function() { config = null; render(); };
}

function renderSetup(el) {
  var suggestedCmd = detection.command || "";
  var suggestedPort = detection.port || 3000;
  el.innerHTML =
    '<div class="setup">' +
      '<h2>Configure Dev Server</h2>' +
      '<p>Set the command and port for your local development server.</p>' +
      '<div class="config-form">' +
        '<label>Command</label>' +
        '<input id="cmd" placeholder="bun run dev" value="' + suggestedCmd + '" />' +
        '<label>Port</label>' +
        '<input id="port" type="number" placeholder="3000" value="' + suggestedPort + '" />' +
        '<button class="primary" id="save-btn" style="padding:8px 16px; border-radius:6px; border:none; background:var(--app-primary,#2563eb); color:white; cursor:pointer; font-size:14px;">Save & Start</button>' +
      '</div>' +
    '</div>';
  document.getElementById("save-btn").onclick = async function() {
    var cmd = document.getElementById("cmd").value.trim();
    var port = parseInt(document.getElementById("port").value) || 3000;
    if (!cmd) return;
    await saveConfig(cmd, port);
    await startServer();
  };
}

// ---- Boot ----

(async function() {
  // Initialize MCP App protocol first
  await initApp();

  // If detection says dev-server, load saved config or use detection
  if (detection.mode === "dev-server") {
    var hasConfig = await loadConfig();
    if (!hasConfig && detection.command) {
      config = { command: detection.command, port: detection.port || 3000 };
    }
    if (config) {
      serverRunning = await checkServer();
    }
  } else if (detection.mode === "needs-config") {
    await loadConfig();
  }

  render();
})();
</script>
</body>
</html>`;
}
