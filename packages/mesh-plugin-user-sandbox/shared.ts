export const PLUGIN_ID = "MCP User Sandbox";
export const PLUGIN_DESCRIPTION =
  "Isolated per-user sandboxes for MCP tool execution";

export const DAEMON_PORT = 9000;
export const DEFAULT_IMAGE = "mesh-sandbox:local";

/** Shell-quote a value for safe inclusion in a `bash -lc` script. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Shell snippet that sets global git identity. Prepend to any shell script
 * that then clones a repo — the per-call-site clone strategy (empty-dir,
 * backup-then-clone, tmp-fallback) is owned by the caller since they differ
 * meaningfully.
 */
export function gitIdentityScript(userName: string, userEmail: string): string {
  return `git config --global user.name ${shellQuote(userName)} && git config --global user.email ${shellQuote(userEmail)}`;
}

/**
 * Universal bootstrap injected into the iframe HTML on every proxied dev-server
 * response. Two responsibilities, both browser-side and intentionally
 * framework-agnostic:
 *
 *   1. **WebSocket URL rewriter** — Vite / Fresh / Next / Webpack / Bun all
 *      bake a WebSocket connection URL into their dev client at server start
 *      time, pointing at the dev server's container-internal address (e.g.
 *      `ws://localhost:3000/_frsh/alive`, `wss://<host>:5173/`). Loaded
 *      inside the mesh iframe under `/api/sandbox/.../preview/<port>/`,
 *      those URLs don't route. We monkey-patch `WebSocket` so any URL whose
 *      host is loopback OR shares the page hostname but uses a different
 *      port gets rewritten to use the iframe origin + the same proxy prefix
 *      the page itself was loaded under. The mesh's top-level WS upgrade
 *      handler resolves that path back to the daemon and on to the dev
 *      server, so HMR / hot-reload sockets land where they should.
 *
 *   2. **Visual editor activation** — listens for `visual-editor::activate`
 *      postMessages from the parent window (mesh's preview.tsx) and `eval`s
 *      the script body. Mirrors the freestyle BOOTSTRAP_SCRIPT in
 *      apps/mesh/src/tools/vm/start.ts so docker-backed sandboxes get the
 *      same visual-editor UX.
 *
 * The script must run before the framework's dev client constructs its
 * WebSocket — see `injectBootstrap` in image/daemon/proxy.mjs which splices
 * this into the HTML right after the opening `<head>` tag.
 */
export const IFRAME_BOOTSTRAP_SCRIPT = `<script>(function(){try{var W=window.WebSocket;if(W){var m=location.pathname.match(/^(\\/api\\/sandbox\\/[^\\/]+(?:\\/thread\\/[^\\/]+)?\\/preview(?:\\/\\d+)?)/);var p=m?m[1]:"";function r(u){try{var x=new URL(String(u),location.href);var lb=x.hostname==="localhost"||x.hostname==="127.0.0.1"||x.hostname==="0.0.0.0";var pm=x.hostname===location.hostname&&x.port!==location.port&&x.port!=="";if(!lb&&!pm)return String(u);x.protocol=location.protocol==="https:"?"wss:":"ws:";x.host=location.host;if(p&&!x.pathname.startsWith(p))x.pathname=p+x.pathname;return x.toString();}catch(_){return String(u);}}class P extends W{constructor(u,pr){super(r(u),pr);}}window.WebSocket=P;}}catch(_){}window.addEventListener("message",function(e){if(e.data&&e.data.type==="visual-editor::activate"&&e.data.script){try{new Function(e.data.script)();}catch(err){console.error("[visual-editor] injection failed",err);}}});})();</script>`;
