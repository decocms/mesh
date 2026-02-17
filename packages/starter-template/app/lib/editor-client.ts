/**
 * Site-side Editor Bridge Client
 *
 * Auto-initializes when loaded in an iframe context (window !== window.parent).
 * Handles the postMessage protocol for communication with the Mesh editor:
 * - Sends deco:ready on init
 * - Handles deco:page-config, deco:update-block, deco:set-mode, deco:select-block, deco:deselect
 * - Emits deco:block-clicked, deco:click-away, deco:block-hover, deco:navigated
 *
 * No-op when not in an iframe (production).
 */

import { useSyncExternalStore } from "react";

const DECO_PREFIX = "deco:";

// -- State --

interface BlockInstance {
  id: string;
  blockType: string;
  props: Record<string, unknown>;
}

interface PageConfig {
  id: string;
  path: string;
  title: string;
  blocks: BlockInstance[];
  metadata?: Record<string, unknown>;
}

let mode: "edit" | "interact" = "edit";
let currentPageState: PageConfig | null = null;
const listeners = new Set<() => void>();

let editClickHandler: ((e: MouseEvent) => void) | null = null;
let editHoverHandler: ((e: MouseEvent) => void) | null = null;
let interactClickHandler: ((e: MouseEvent) => void) | null = null;
let popstateHandler: (() => void) | null = null;

// -- Helpers --

function notifyListeners() {
  for (const fn of listeners) {
    fn();
  }
}

function findDeepestSection(target: EventTarget | null): HTMLElement | null {
  let el = target as HTMLElement | null;
  while (el) {
    if (el.hasAttribute?.("data-block-id")) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function sendToParent(msg: Record<string, unknown>) {
  window.parent.postMessage(msg, "*");
}

// -- Edit mode overlay --

function setupEditMode() {
  editClickHandler = (e: MouseEvent) => {
    if (mode !== "edit") return;
    e.preventDefault();
    e.stopPropagation();

    const section = findDeepestSection(e.target);
    if (section) {
      const blockId = section.getAttribute("data-block-id")!;
      const rect = section.getBoundingClientRect();
      sendToParent({
        type: "deco:block-clicked",
        blockId,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      });
    } else {
      sendToParent({ type: "deco:click-away" });
    }
  };

  editHoverHandler = (e: MouseEvent) => {
    if (mode !== "edit") return;

    const section = findDeepestSection(e.target);
    if (section) {
      const rect = section.getBoundingClientRect();
      const blockId = section.getAttribute("data-block-id")!;
      sendToParent({
        type: "deco:block-hover",
        blockId,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      });
    } else {
      sendToParent({ type: "deco:block-hover", blockId: null, rect: null });
    }
  };

  document.addEventListener("click", editClickHandler, true);
  document.addEventListener("mousemove", editHoverHandler, true);
  document.addEventListener("mouseleave", handleMouseLeave);
}

function handleMouseLeave() {
  sendToParent({ type: "deco:block-hover", blockId: null, rect: null });
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
  // Tell editor to clear hover overlay
  sendToParent({ type: "deco:block-hover", blockId: null, rect: null });
}

// -- Interact mode navigation detection --

function setupInteractMode() {
  interactClickHandler = (e: MouseEvent) => {
    if (mode !== "interact") return;

    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (!anchor) return;

    const href = anchor.href;
    if (!href) return;

    const isInternal =
      new URL(href, window.location.origin).origin === window.location.origin;
    sendToParent({ type: "deco:navigated", url: href, isInternal });
  };

  popstateHandler = () => {
    sendToParent({
      type: "deco:navigated",
      url: window.location.href,
      isInternal: true,
    });
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

function handleEditorMessage(e: MessageEvent) {
  if (!e.data?.type?.startsWith(DECO_PREFIX)) return;

  const msg = e.data;

  switch (msg.type) {
    case "deco:page-config": {
      currentPageState = msg.page;
      notifyListeners();
      break;
    }

    case "deco:update-block": {
      if (!currentPageState) break;
      currentPageState = {
        ...currentPageState,
        blocks: currentPageState.blocks.map((block) =>
          block.id === msg.blockId ? { ...block, props: msg.props } : block,
        ),
      };
      notifyListeners();
      break;
    }

    case "deco:set-mode": {
      const newMode = msg.mode as "edit" | "interact";
      if (newMode === mode) break;
      mode = newMode;
      if (mode === "edit") {
        teardownInteractMode();
        setupEditMode();
      } else {
        teardownEditMode();
        setupInteractMode();
      }
      break;
    }

    case "deco:select-block": {
      const el = document.querySelector(`[data-block-id="${msg.blockId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      break;
    }

    case "deco:deselect": {
      // No iframe-side visual for deselect — editor handles overlay
      break;
    }

    case "deco:ping": {
      sendToParent({ type: "deco:pong" });
      break;
    }
  }
}

// -- Public API --

/**
 * Initialize the editor bridge. No-op if not in an iframe.
 * Call once at module level in route files.
 */
export function initEditorBridge() {
  if (typeof window === "undefined") return;
  if (window === window.parent) return;

  // Send ready handshake
  sendToParent({ type: "deco:ready", version: 1 });

  // Listen for editor messages
  window.addEventListener("message", handleEditorMessage);

  // Set up default edit mode
  setupEditMode();

  // Re-send ready after Vite HMR
  if (import.meta.hot) {
    import.meta.hot.on("vite:afterUpdate", () => {
      sendToParent({ type: "deco:ready", version: 1 });
    });
  }
}

/**
 * Get the current editor page state.
 * Used by useSyncExternalStore.
 */
export function getEditorPageState(): PageConfig | null {
  return currentPageState;
}

/**
 * Subscribe to editor state changes.
 * Used by useSyncExternalStore.
 */
export function subscribeEditorState(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * React hook for live prop hot-swap in editor mode.
 *
 * When the page is loaded inside the editor iframe, returns the editor's
 * version of props (updated in real-time). Otherwise returns staticProps.
 *
 * SSR-safe: server snapshot returns staticProps.
 */
export function useEditorProps<T extends Record<string, unknown>>(
  blockId: string,
  staticProps: T,
): T {
  const pageState = useSyncExternalStore(
    subscribeEditorState,
    getEditorPageState,
    () => null, // server snapshot
  );

  if (pageState) {
    const block = pageState.blocks.find((b) => b.id === blockId);
    if (block) {
      return block.props as T;
    }
  }

  return staticProps;
}
