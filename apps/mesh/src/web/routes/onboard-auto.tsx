/**
 * Automatic Onboarding Redirect — /onboard-auto?token=<token>
 *
 * After login, claims the diagnostic session (creates org + storefront project)
 * and redirects to /{orgSlug}/{projectSlug}?onboarding=true.
 *
 * With token:    POST /api/onboarding/claim → use returned slugs
 * Without token: use user's first org → navigate to /{slug}/storefront
 */

import { useState } from "react";
import { Navigate, useSearch } from "@tanstack/react-router";
import { authClient } from "@/web/lib/auth-client";

type Stage = "idle" | "claiming" | "done" | "error";

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <svg
        className="size-5 animate-spin text-muted-foreground"
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
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
  );
}

export default function OnboardAutoPage() {
  const search = useSearch({ from: "/onboard-auto" });
  const token = search.token;

  const session = authClient.useSession();
  const { data: organizations, isPending: orgsLoading } =
    authClient.useListOrganizations();

  const [stage, setStage] = useState<Stage>("idle");
  const [dest, setDest] = useState<string | null>(null);

  const isPending = session.isPending || orgsLoading;

  if (isPending) return <Spinner />;

  if (!session.data) {
    const next = token ? `/onboard-auto?token=${token}` : "/onboard-auto";
    return <Navigate to={`/login?next=${encodeURIComponent(next)}` as "/"} />;
  }

  // Already computed destination — redirect
  if (dest) {
    window.location.href = dest;
    return <Spinner />;
  }

  // Currently claiming
  if (stage === "claiming") return <Spinner />;

  // Error fallback — go to first org home
  if (stage === "error") {
    const firstOrg = organizations?.[0];
    if (firstOrg) {
      window.location.href = `/${firstOrg.slug}/storefront?onboarding=true`;
    } else {
      window.location.href = "/";
    }
    return <Spinner />;
  }

  // stage === "idle" — kick off claim
  if (token) {
    // Claim using diagnostic token → creates org + storefront project
    setStage("claiming");
    fetch("/api/onboarding/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "create" }),
    })
      .then((r) => r.json())
      .then((data) => {
        const orgSlug = data.organizationSlug;
        const projectSlug = data.projectSlug ?? "storefront";
        if (orgSlug) {
          setDest(`/${orgSlug}/${projectSlug}?onboarding=true`);
          setStage("done");
        } else {
          setStage("error");
        }
      })
      .catch(() => setStage("error"));

    return <Spinner />;
  }

  // No token — use first org's storefront project directly
  const firstOrg = organizations?.[0];
  if (firstOrg) {
    window.location.href = `/${firstOrg.slug}/storefront?onboarding=true`;
  } else {
    window.location.href = "/onboard-setup";
  }
  return <Spinner />;
}
