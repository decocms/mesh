/**
 * Organization Home Page
 *
 * Main content for the org home route's main panel.
 * Delegates to AgentHomePage only when a ?main= param is present,
 * avoiding unnecessary Suspense queries when the panel is collapsed.
 */

import { lazy, Suspense } from "react";
import { useSearch } from "@tanstack/react-router";
import { Loading01 } from "@untitledui/icons";

const AgentHomePage = lazy(() => import("@/web/routes/agent-home"));

export default function OrgHomePage() {
  const { main } = useSearch({ strict: false }) as { main?: string };

  // Only mount AgentHomePage when a main view is explicitly requested.
  // Without ?main=, the panel is collapsed and rendering AgentHomePage
  // would trigger unnecessary Suspense queries for the decopilot entity.
  if (!main) return null;

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loading01
            size={20}
            className="animate-spin text-muted-foreground"
          />
        </div>
      }
    >
      <AgentHomePage />
    </Suspense>
  );
}
