/**
 * Deno --unstable-hmr only watches the module graph; .deco block JSONs are
 * data read at request time, so editing one wouldn't trigger a reload. Only
 * emits while dev is "ready" to avoid double-reload with Fresh's own WS path.
 */

import fs from "node:fs";
import path from "node:path";
import { WORKDIR } from "./config.mjs";
import { dev } from "./dev-state.mjs";
import { emitReload } from "./events.mjs";

const DECO_DIR = path.join(WORKDIR, ".deco");
const DEBOUNCE_MS = 500;

export function startDecoWatcher() {
  if (!fs.existsSync(DECO_DIR)) {
    console.log(
      `[deco-watcher] ${DECO_DIR} does not exist — watcher idle until created`,
    );
  }

  let timer = null;
  let watcher = null;

  const attach = () => {
    if (watcher || !fs.existsSync(DECO_DIR)) return;
    try {
      watcher = fs.watch(DECO_DIR, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          // Let Fresh's reload path handle non-ready phases (avoid double reload).
          if (dev.phase !== "ready") return;
          emitReload("deco-files-changed");
        }, DEBOUNCE_MS);
      });
      watcher.on("error", (err) => {
        console.error(
          `[deco-watcher] watch error: ${err?.message ?? String(err)}`,
        );
      });
      console.log(`[deco-watcher] watching ${DECO_DIR}`);
    } catch (err) {
      console.error(
        `[deco-watcher] failed to attach: ${err?.message ?? String(err)}`,
      );
    }
  };

  attach();
  // .deco is created on first dev boot; poll so we pick it up without restart.
  const retryTimer = watcher
    ? null
    : setInterval(() => {
        attach();
        if (watcher) clearInterval(retryTimer);
      }, 2000);

  return () => {
    clearTimeout(timer);
    if (retryTimer) clearInterval(retryTimer);
    watcher?.close();
  };
}
