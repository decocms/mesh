/**
 * Autosend — encode a queued chat message into a URL search parameter so
 * the next route can consume it on mount. Replaces the in-memory
 * `pendingMessage` mechanism for the home → task message handoff.
 *
 * Shape mirrors today's `pendingMessage`: `{ message, createdAt }`. Callers
 * enforce the TTL (`AUTOSEND_TTL_MS`) at consumption time so a pasted-link
 * autosend doesn't fire after the URL has been sitting in someone's
 * clipboard for hours.
 */

import type { SendMessageParams } from "@/web/components/chat/store/types";

export const AUTOSEND_TTL_MS = 10_000;

export interface AutosendPayload {
  message: SendMessageParams;
  createdAt: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeAutosend(payload: AutosendPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return toBase64Url(bytes);
}

export function decodeAutosend(s: string): AutosendPayload | null {
  let decoded: unknown;
  try {
    const bytes = fromBase64Url(s);
    const json = new TextDecoder().decode(bytes);
    decoded = JSON.parse(json);
  } catch {
    return null;
  }
  if (
    !decoded ||
    typeof decoded !== "object" ||
    typeof (decoded as { createdAt?: unknown }).createdAt !== "number" ||
    typeof (decoded as { message?: unknown }).message !== "object"
  ) {
    return null;
  }
  return decoded as AutosendPayload;
}
