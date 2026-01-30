/**
 * CLI Callback Route
 *
 * This page is shown after login when the user is authenticating via CLI.
 * It fetches the session token and shows a beautiful success page with
 * the capybara coding animation, then completes the callback silently.
 */

import { useEffect, useState, useRef } from "react";
import { useSearch } from "@tanstack/react-router";

// Declare UnicornStudio on window
declare global {
  interface Window {
    UnicornStudio?: {
      init: () => Promise<void>;
    };
  }
}

export default function CliCallbackRoute() {
  const searchParams = useSearch({ from: "/cli-callback" });
  const { callback } = searchParams;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const scriptLoadedRef = useRef(false);

  // Load UnicornStudio script
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (scriptLoadedRef.current) return;
    scriptLoadedRef.current = true;

    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/gh/nicholashamilton/unicorn-studio-embed-player@v1.5.2/dist/player.umd.js";
    script.async = true;
    script.onload = () => {
      if (window.UnicornStudio) {
        window.UnicornStudio.init().catch(console.error);
      }
    };
    document.body.appendChild(script);
  }, []);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    async function handleCliCallback() {
      if (!callback) {
        setError("No callback URL provided");
        return;
      }

      try {
        // Fetch the CLI token from the API
        const response = await fetch("/api/auth/custom/cli-token", {
          credentials: "include", // Include session cookie
        });

        const data = await response.json();

        if (!data.success || !data.token) {
          setError(data.error || "Failed to get session token");
          return;
        }

        // Build callback URL with token and user data
        const callbackUrl = new URL(callback);
        callbackUrl.searchParams.set("token", data.token);

        // Include user info so CLI doesn't need to fetch again
        if (data.user) {
          callbackUrl.searchParams.set("user", btoa(JSON.stringify(data.user)));
        }
        if (data.expiresAt) {
          callbackUrl.searchParams.set("expiresAt", data.expiresAt);
        }

        // Also include state if it was in our callback
        const currentParams = new URLSearchParams(window.location.search);
        const state = currentParams.get("state");
        if (state) {
          callbackUrl.searchParams.set("state", state);
        }

        setSuccess(true);

        // Complete the callback silently via hidden iframe
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = callbackUrl.toString();
        document.body.appendChild(iframe);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }

    handleCliCallback();
  }, [callback]);

  const badgeColor = error
    ? "rgba(239, 68, 68, 0.12)"
    : "rgba(34, 197, 94, 0.12)";
  const badgeBorder = error
    ? "rgba(239, 68, 68, 0.25)"
    : "rgba(34, 197, 94, 0.25)";
  const badgeTextColor = error ? "#f87171" : "#4ade80";

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0a0a0a] text-white overflow-hidden">
      {/* Animation Panel */}
      <div className="flex-1 min-h-[40vh] md:min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            data-us-project="3u9H2SGWSifD8DQZHG4X"
            data-us-production="true"
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </div>

      {/* Content Panel */}
      <div className="flex-shrink-0 md:w-[480px] lg:w-[540px] flex items-center justify-center p-8 bg-[#111111] border-t md:border-t-0 md:border-l border-[#262626]">
        <div className="bg-[#18181b] border border-[#27272a] rounded-3xl p-12 max-w-[420px] w-full shadow-2xl flex flex-col items-center">
          {/* Logo */}
          <img
            src="https://assets.decocache.com/decocms/4869c863-d677-4e5b-b3fd-4b3913a56034/deco-logo.png"
            alt="MCP Mesh"
            className="w-[140px] h-auto mb-8 opacity-0 animate-[fadeSlideUp_0.6s_ease-out_0.2s_forwards]"
          />

          {/* Status Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[0.8125rem] font-medium mb-6 opacity-0 animate-[fadeSlideUp_0.6s_ease-out_0.4s_forwards]"
            style={{
              background: badgeColor,
              border: `1px solid ${badgeBorder}`,
              color: badgeTextColor,
            }}
          >
            {error ? (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : success ? (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {error ? "Failed" : success ? "Authenticated" : "Authenticating"}
          </div>

          {/* Title */}
          <h1 className="text-2xl md:text-[2rem] font-bold mb-3 tracking-tight text-center opacity-0 animate-[fadeSlideUp_0.6s_ease-out_0.6s_forwards]">
            {error
              ? "Authentication Failed"
              : success
                ? "Welcome to the Mesh"
                : "Connecting..."}
          </h1>

          {/* Description */}
          <p className="text-[#71717a] text-sm leading-relaxed text-center opacity-0 animate-[fadeSlideUp_0.6s_ease-out_0.8s_forwards]">
            {error ? (
              <>
                {error}
                <br />
                <span className="text-[#52525b] mt-2 block">
                  You can close this window and try again.
                </span>
              </>
            ) : success ? (
              "You can close this window and return to your terminal."
            ) : (
              "Please wait while we complete the authentication..."
            )}
          </p>
        </div>
      </div>

      {/* Custom animation keyframes */}
      <style>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
