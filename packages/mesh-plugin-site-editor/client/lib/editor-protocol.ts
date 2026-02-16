/**
 * Editor Protocol
 *
 * Typed postMessage protocol for communication between the Mesh editor
 * and the site iframe. Uses discriminated unions for type-safe message
 * handling with a "deco:" prefix to filter from other messages.
 */

import type { Page } from "./page-api";

/** Prefix for all deco editor messages */
export const DECO_MSG_PREFIX = "deco:" as const;

/**
 * Messages sent from the Mesh editor to the site iframe.
 */
export type EditorMessage =
  | { type: "deco:page-config"; page: Page }
  | {
      type: "deco:update-block";
      blockId: string;
      props: Record<string, unknown>;
    }
  | { type: "deco:select-block"; blockId: string }
  | { type: "deco:set-viewport"; width: number }
  | { type: "deco:deselect" }
  | { type: "deco:set-mode"; mode: "edit" | "interact" }
  | { type: "deco:ping" };

/**
 * Messages sent from the site iframe to the Mesh editor.
 */
export type SiteMessage =
  | { type: "deco:ready"; version: number }
  | { type: "deco:block-clicked"; blockId: string; rect: DOMRect }
  | {
      type: "deco:blocks-rendered";
      blocks: Array<{ id: string; rect: DOMRect }>;
    }
  | {
      type: "deco:block-hover";
      blockId: string | null;
      rect: DOMRect | null;
    }
  | { type: "deco:navigated"; url: string; isInternal: boolean }
  | { type: "deco:click-away" }
  | { type: "deco:section-error"; blockId: string; error: string }
  | { type: "deco:pong" };
