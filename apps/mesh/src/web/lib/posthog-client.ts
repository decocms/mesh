/**
 * PostHog analytics client (browser-side).
 *
 * Enabled only when `VITE_POSTHOG_KEY` is defined at build time. On
 * self-hosted / open-source builds without the env var, this module
 * exports no-op shims so call sites don't need to guard.
 *
 * Host defaults to PostHog US cloud. Override with `VITE_POSTHOG_HOST`
 * (e.g. `https://eu.i.posthog.com`).
 */

import posthog from "posthog-js";

const apiKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

let initialized = false;

export function initPostHog() {
  if (!apiKey || initialized || typeof window === "undefined") return;
  posthog.init(apiKey, {
    api_host: host,
    capture_pageview: "history_change",
    capture_pageleave: true,
    autocapture: true,
    // Capture unhandled JS exceptions (DOMError, TypeError, unhandled promise
    // rejections) as $exception events — gives us client-side error tracking
    // without hand-wiring every try/catch.
    capture_exceptions: true,
    // Session replay is on, but gated by project-level sampling (10%) and
    // minimum duration (10s). See PostHog project settings.
    // - `maskAllInputs: true` masks every native <input>/<textarea>/<select>
    //   by default. The Decopilot chat input is a TipTap contenteditable, so
    //   it's NOT an input and stays visible on purpose.
    // - `blockClass: "ph-no-capture"` → add to any element that should be
    //   fully hidden from recordings (shown as a solid block). Use on secret
    //   fields (API keys, connection tokens).
    session_recording: {
      maskAllInputs: true,
      blockClass: "ph-no-capture",
    },
    person_profiles: "identified_only",
  });
  initialized = true;
}

export function identifyUser(
  userId: string,
  props?: { email?: string; name?: string },
) {
  if (!apiKey || !initialized) return;
  posthog.identify(userId, props);
}

export function resetUser() {
  if (!apiKey || !initialized) return;
  posthog.reset();
}

export function setOrganizationGroup(
  organizationId: string,
  props?: { name?: string; slug?: string },
) {
  if (!apiKey || !initialized) return;
  posthog.group("organization", organizationId, props);
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (!apiKey || !initialized) return;
  posthog.capture(event, properties);
}

/**
 * Report an exception to PostHog with optional structured context.
 *
 * Use from React error boundaries (`componentDidCatch`) where errors are
 * caught BEFORE bubbling to `window.onerror` — so the built-in
 * `capture_exceptions: true` autocapture never sees them. Wrap in
 * try/catch so a PostHog failure never blocks the fallback UI.
 */
export function captureException(
  error: unknown,
  properties?: Record<string, unknown>,
) {
  if (!apiKey || !initialized) return;
  try {
    posthog.captureException(error, properties);
  } catch {
    // Swallow — never let analytics break the error UI.
  }
}

export const isPostHogEnabled = Boolean(apiKey);
