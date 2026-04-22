/**
 * Watches the project's .deco directory and asks subscribers to reload the
 * preview iframe whenever a block/metadata JSON changes.
 *
 * Why: Deno's --unstable-hmr only watches the module graph reachable from the
 * entry file. Deco block JSONs are data read at request time, so editing one
 * doesn't cause dev to exit — which means the /_frsh/alive WS never closes,
 * Fresh's revision never bumps, and the browser has no reason to reload.
 * Without this watcher the user has to hit refresh manually.
 *
 * Only emits while dev is "ready". If dev is mid-restart (a .tsx edit in the
 * same batch triggered an exit), Fresh's own WS-close → reconnect → reload
 * path will handle it, and the SSE-based reload would be a redundant second
 * reload a few seconds later.
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
          // Dev left "ready" (exited / restarting) — let Fresh's own reload
          // path handle it to avoid double-reloading the iframe.
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
  // .deco is created by the dev server on first boot; poll briefly if absent
  // so we pick it up without requiring a daemon restart.
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
