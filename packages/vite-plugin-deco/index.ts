import type { Plugin } from "vite";
import process from "process";
import path from "path";
import { exec } from "child_process";
import fs from "fs/promises";
import { cloudflare } from "@cloudflare/vite-plugin";

const VITE_SERVER_ENVIRONMENT_NAME = "server";

interface PluginConfig {
  target?: "cloudflare" | "bun";
  port?: number;
  experimentalAutoGenerateTypes?: boolean;
}

const cwd = process.cwd();
const DEFAULT_PORT = 4000;
const CF_DEFAULT_PORT = 8787;
const GEN_PROMISE_KEY = "deco-gen";

const GEN_FILE = "deco.gen.ts";

async function performDecoGen() {
  // @ts-ignore
  const cmd = typeof Bun === "undefined" ? "npm run gen" : "bun run gen";
  exec(cmd, { cwd }, (error) => {
    if (error) {
      console.error(`Error performing deco gen: ${error}`);
    }
  });
}

function shouldPerformDecoGen({ filePath }: { filePath: string }): boolean {
  return filePath.startsWith("server/") && !filePath.endsWith(GEN_FILE);
}

const FILES_TO_REMOVE = [
  ".dev.vars",
  // TODO: Support source maps
  "index.js.map",
];

const RENAME_MAP = {
  "index.js": "main.js",
};

type Operation =
  | {
      type: "remove";
      file: string;
    }
  | {
      type: "rename";
      oldFile: string;
      newFile: string;
    }
  | {
      type: "modify";
      file: string;
      replace: (content: string) => string;
    };

const OPERATIONS: Operation[] = [
  ...FILES_TO_REMOVE.map((file) => ({
    type: "remove" as const,
    file,
  })),
  ...Object.entries(RENAME_MAP).map(([oldFile, newFile]) => ({
    type: "rename" as const,
    oldFile,
    newFile,
  })),
];

async function fixCloudflareBuild({
  outputDirectory,
}: {
  outputDirectory: string;
}) {
  const files = await fs.readdir(outputDirectory);

  const isCloudflareViteBuild = files.some((file) => file === "wrangler.json");

  if (!isCloudflareViteBuild) {
    return;
  }

  const results = await Promise.allSettled(
    OPERATIONS.map(async (operation) => {
      if (operation.type === "remove") {
        await fs.rm(path.join(outputDirectory, operation.file), {
          force: true,
        });
      } else if (operation.type === "rename") {
        await fs.rename(
          path.join(outputDirectory, operation.oldFile),
          path.join(outputDirectory, operation.newFile),
        );
      }
    }),
  );

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error(`Error performing operation: ${result.reason}`);
    }
  });
}

export function decoCloudflarePatchPlugin(): Plugin {
  let outputDirectory = "dist";

  return {
    name: "vite-plugin-deco",
    enforce: "post",
    configResolved(config) {
      outputDirectory = config.build.outDir || "dist";
    },
    async closeBundle() {
      await fixCloudflareBuild({ outputDirectory });
    },
    config: () => ({
      worker: {
        format: "es",
      },
      optimizeDeps: {
        force: true,
      },
      build: {
        sourcemap: true,
      },
      define: {
        // Ensure proper module definitions for Cloudflare Workers context
        "process.env.NODE_ENV": JSON.stringify(
          process.env.NODE_ENV || "development",
        ),
        global: "globalThis",
      },
    }),
  };
}

export function importSqlStringPlugin(): Plugin {
  return {
    name: "vite-plugin-import-sql-string",
    transform(content: string, id: string) {
      if (id.endsWith(".sql")) {
        return {
          code: `export default ${JSON.stringify(content)};`,
          map: null,
        };
      }
    },
  };
}

export function decoGenPlugin(decoConfig: PluginConfig = {}): Plugin {
  const singleFlight = new Map<string, Promise<void>>();

  return {
    name: "vite-plugin-deco-gen",
    buildStart() {
      if (!decoConfig.experimentalAutoGenerateTypes) {
        return;
      }
      performDecoGen();
    },
    handleHotUpdate(ctx) {
      // skip hmr entirely for the deco gen file
      if (ctx.file.endsWith(GEN_FILE)) {
        return [];
      }
      if (!decoConfig.experimentalAutoGenerateTypes) {
        return ctx.modules;
      }
      const relative = path.relative(cwd, ctx.file);
      if (!shouldPerformDecoGen({ filePath: relative })) {
        return ctx.modules;
      }
      const promise = singleFlight.get(GEN_PROMISE_KEY);
      if (promise) {
        return ctx.modules;
      }
      const newPromise = performDecoGen().finally(() => {
        singleFlight.delete(GEN_PROMISE_KEY);
      });
      singleFlight.set(GEN_PROMISE_KEY, newPromise);
      return ctx.modules;
    },
  };
}

export function baseDecoPlugin(decoConfig: PluginConfig = {}): Plugin {
  const buildOutDir =
    decoConfig.target === "cloudflare" ? "dist" : "dist/client";

  return {
    name: "vite-plugin-base-deco",
    config: () => ({
      server: {
        port: decoConfig.port || DEFAULT_PORT,
        strictPort: true,
      },
      build: {
        outDir: buildOutDir,
      },
    }),
  };
}

/**
 * Vite plugin that auto-injects the Deco editor bridge into the site's HTML.
 * Only active during dev (`serve`). Works with both SPA and SSR (React Router, etc.)
 * by intercepting HTML responses via configureServer middleware.
 *
 * The bridge script:
 * - Detects if the page is inside an iframe (no-op otherwise)
 * - Sends deco:ready handshake to the parent editor
 * - Handles click-to-select, hover, mode switching, heartbeat, etc.
 */
export function decoEditorBridgePlugin(): Plugin {
  const scriptTag = `<script data-deco-bridge="true">${BRIDGE_SCRIPT}</script>`;

  return {
    name: "vite-plugin-deco-editor-bridge",
    apply: "serve", // dev only

    // SPA: works for apps using index.html (classic Vite SPA)
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { "data-deco-bridge": "true" },
          children: BRIDGE_SCRIPT,
          injectTo: "body",
        },
      ];
    },

    // SSR: works for frameworks like React Router that render HTML server-side.
    // Hooks res.write/res.end to inject bridge before </body> in streamed HTML.
    configureServer(server) {
      // Return function so this runs AFTER framework SSR middleware
      return () => {
        server.middlewares.use((_req, res, next) => {
          const originalWrite = res.write.bind(res);
          const originalEnd = res.end.bind(res);
          let injected = false;

          function tryInject(chunk: unknown): unknown {
            if (injected || !chunk) return chunk;
            const str =
              typeof chunk === "string"
                ? chunk
                : Buffer.isBuffer(chunk)
                  ? chunk.toString("utf-8")
                  : null;
            if (!str || !str.includes("</body>")) return chunk;
            injected = true;
            return str.replace("</body>", `${scriptTag}</body>`);
          }

          res.write = function (chunk: any, ...args: any[]) {
            return originalWrite(tryInject(chunk), ...args);
          } as typeof res.write;

          res.end = function (chunk?: any, ...args: any[]) {
            return originalEnd(tryInject(chunk), ...args);
          } as typeof res.end;

          next();
        });
      };
    },
  };
}

// Self-contained bridge IIFE — plain JS, no TypeScript, runs inside the iframe.
const BRIDGE_SCRIPT = `(function() {
  if (window.self === window.top) return; // Not in an iframe, skip

  var DECO_PREFIX = "deco:";
  var mode = "edit";

  function sendToParent(msg) {
    window.parent.postMessage(msg, "*");
  }

  function findSection(target) {
    var el = target;
    while (el) {
      if (el.hasAttribute && el.hasAttribute("data-block-id")) return el;
      el = el.parentElement;
    }
    return null;
  }

  // -- Edit mode --
  var editClickHandler = null;
  var editHoverHandler = null;

  function setupEditMode() {
    editClickHandler = function(e) {
      if (mode !== "edit") return;
      e.preventDefault();
      e.stopPropagation();
      var section = findSection(e.target);
      if (section) {
        var blockId = section.getAttribute("data-block-id");
        var rect = section.getBoundingClientRect();
        sendToParent({
          type: "deco:block-clicked",
          blockId: blockId,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        });
      } else {
        sendToParent({ type: "deco:click-away" });
      }
    };
    editHoverHandler = function(e) {
      if (mode !== "edit") return;
      var section = findSection(e.target);
      if (section) {
        var rect = section.getBoundingClientRect();
        sendToParent({
          type: "deco:block-hover",
          blockId: section.getAttribute("data-block-id"),
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        });
      } else {
        sendToParent({ type: "deco:block-hover", blockId: null, rect: null });
      }
    };
    document.addEventListener("click", editClickHandler, true);
    document.addEventListener("mousemove", editHoverHandler, true);
    document.addEventListener("mouseleave", handleMouseLeave);
  }

  function teardownEditMode() {
    if (editClickHandler) {
      document.removeEventListener("click", editClickHandler, true);
      editClickHandler = null;
    }
    if (editHoverHandler) {
      document.removeEventListener("mousemove", editHoverHandler, true);
      editHoverHandler = null;
    }
    document.removeEventListener("mouseleave", handleMouseLeave);
    sendToParent({ type: "deco:block-hover", blockId: null, rect: null });
  }

  function handleMouseLeave() {
    sendToParent({ type: "deco:block-hover", blockId: null, rect: null });
  }

  // -- Interact mode --
  var interactClickHandler = null;
  var popstateHandler = null;

  function setupInteractMode() {
    interactClickHandler = function(e) {
      if (mode !== "interact") return;
      var target = e.target;
      var anchor = target.closest ? target.closest("a") : null;
      if (!anchor || !anchor.href) return;
      var isInternal = new URL(anchor.href, window.location.origin).origin === window.location.origin;
      sendToParent({ type: "deco:navigated", url: anchor.href, isInternal: isInternal });
    };
    popstateHandler = function() {
      sendToParent({ type: "deco:navigated", url: window.location.href, isInternal: true });
    };
    document.addEventListener("click", interactClickHandler);
    window.addEventListener("popstate", popstateHandler);
  }

  function teardownInteractMode() {
    if (interactClickHandler) {
      document.removeEventListener("click", interactClickHandler);
      interactClickHandler = null;
    }
    if (popstateHandler) {
      window.removeEventListener("popstate", popstateHandler);
      popstateHandler = null;
    }
  }

  // -- Message handler --
  function handleEditorMessage(e) {
    if (!e.data || !e.data.type || e.data.type.indexOf(DECO_PREFIX) !== 0) return;
    switch (e.data.type) {
      case "deco:ping":
        sendToParent({ type: "deco:pong" });
        break;
      case "deco:set-mode":
        var newMode = e.data.mode;
        if (newMode === mode) break;
        mode = newMode;
        if (mode === "edit") { teardownInteractMode(); setupEditMode(); }
        else { teardownEditMode(); setupInteractMode(); }
        break;
      case "deco:select-block":
        var el = document.querySelector('[data-block-id="' + e.data.blockId + '"]');
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        break;
      case "deco:deselect":
        break;
      case "deco:page-config":
        window.dispatchEvent(new CustomEvent("deco:page-config", { detail: e.data.page }));
        break;
      case "deco:update-block":
        window.dispatchEvent(new CustomEvent("deco:update-block", { detail: { blockId: e.data.blockId, props: e.data.props } }));
        break;
    }
  }

  // -- Init --
  window.addEventListener("message", handleEditorMessage);
  setupEditMode();
  sendToParent({ type: "deco:ready", version: 1 });

})();`;

export default function vitePlugins(decoConfig: PluginConfig = {}): Plugin[] {
  const targets: Record<NonNullable<PluginConfig["target"]>, Plugin[]> = {
    cloudflare: [
      ...cloudflare({
        configPath: "wrangler.toml",
        viteEnvironment: {
          name: VITE_SERVER_ENVIRONMENT_NAME,
        },
      }),
      decoCloudflarePatchPlugin(),
      baseDecoPlugin({
        ...decoConfig,
        port: decoConfig.port || CF_DEFAULT_PORT,
      }),
      decoGenPlugin(decoConfig),
      importSqlStringPlugin(),
    ],
    bun: [baseDecoPlugin(decoConfig), decoGenPlugin(decoConfig)],
  };

  const plugins = targets[decoConfig.target || "cloudflare"];

  if (!plugins) {
    throw new Error(`Unsupported target: ${decoConfig.target}`);
  }

  return plugins;
}
