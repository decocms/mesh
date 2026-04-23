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
    // Session recording is opt-in — enable explicitly in PostHog project
    // settings when we're ready. Keeping it off avoids surprise data capture
    // on a product that routes user tool inputs.
    disable_session_recording: true,
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

export const isPostHogEnabled = Boolean(apiKey);
