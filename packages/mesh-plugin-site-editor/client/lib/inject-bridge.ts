/**
 * Injectable Editor Bridge
 *
 * This script is injected into the site iframe by the editor after load.
 * The site needs ZERO editor-specific code — only `data-block-id` attributes
 * on section wrappers.
 *
 * The injected bridge handles:
 * - deco:ready handshake
 * - deco:ping/pong heartbeat
 * - deco:set-mode (edit/interact switching)
 * - deco:select-block (scroll to section)
 * - deco:deselect
 * - deco:page-config / deco:update-block (dispatched as CustomEvents)
 * - Click-to-select in edit mode (deco:block-clicked / deco:click-away)
 * - Hover detection in edit mode (deco:block-hover)
 * - Navigation detection in interact mode (deco:navigated)
 */

/**
 * Returns the bridge script source as a string.
 * This is injected into the iframe's document via a <script> tag.
 */
export function getBridgeScript(): string {
  return `(${bridgeMain.toString()})();`;
}

/**
 * Inject the editor bridge into an iframe's document.
 * Safe to call multiple times — checks for existing bridge.
 */
export function injectBridge(iframe: HTMLIFrameElement): boolean {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return false;

    // Already injected?
    if (doc.querySelector("[data-deco-bridge]")) return true;

    const script = doc.createElement("script");
    script.setAttribute("data-deco-bridge", "true");
    script.textContent = getBridgeScript();
    doc.head.appendChild(script);
    return true;
  } catch {
    // Cross-origin or sandbox restriction
    return false;
  }
}

// The actual bridge code that runs inside the iframe.
// Defined as a function so we can .toString() it for injection.
function bridgeMain() {
  const DECO_PREFIX = "deco:";
  let mode: "edit" | "interact" = "edit";

  // -- Helpers --

  function sendToParent(msg: Record<string, unknown>) {
    window.parent.postMessage(msg, "*");
  }

  function findSection(target: EventTarget | null): HTMLElement | null {
    let el = target as HTMLElement | null;
    while (el) {
      if (el.hasAttribute?.("data-block-id")) return el;
      el = el.parentElement;
    }
    return null;
  }

  // -- Edit mode handlers --

  let editClickHandler: ((e: MouseEvent) => void) | null = null;
  let editHoverHandler: ((e: MouseEvent) => void) | null = null;

  function setupEditMode() {
    editClickHandler = (e: MouseEvent) => {
      if (mode !== "edit") return;
      e.preventDefault();
      e.stopPropagation();

      const section = findSection(e.target);
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
      const section = findSection(e.target);
      if (section) {
        const rect = section.getBoundingClientRect();
        sendToParent({
          type: "deco:block-hover",
          blockId: section.getAttribute("data-block-id"),
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

  // -- Interact mode handlers --

  let interactClickHandler: ((e: MouseEvent) => void) | null = null;
  let popstateHandler: (() => void) | null = null;

  function setupInteractMode() {
    interactClickHandler = (e: MouseEvent) => {
      if (mode !== "interact") return;
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor?.href) return;
      const isInternal =
        new URL(anchor.href, window.location.origin).origin ===
        window.location.origin;
      sendToParent({ type: "deco:navigated", url: anchor.href, isInternal });
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

    switch (e.data.type) {
      case "deco:ping":
        sendToParent({ type: "deco:pong" });
        break;

      case "deco:set-mode": {
        const newMode = e.data.mode as "edit" | "interact";
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
        const el = document.querySelector(
          `[data-block-id="${e.data.blockId}"]`,
        );
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        break;
      }

      case "deco:deselect":
        break;

      case "deco:page-config":
        window.dispatchEvent(
          new CustomEvent("deco:page-config", { detail: e.data.page }),
        );
        break;

      case "deco:update-block":
        window.dispatchEvent(
          new CustomEvent("deco:update-block", {
            detail: { blockId: e.data.blockId, props: e.data.props },
          }),
        );
        break;
    }
  }

  // -- Init --

  window.addEventListener("message", handleEditorMessage);
  setupEditMode();
  sendToParent({ type: "deco:ready", version: 1 });
}
