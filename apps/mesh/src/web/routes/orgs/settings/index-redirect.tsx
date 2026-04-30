import { Navigate, useParams } from "@tanstack/react-router";
import { Loading01 } from "@untitledui/icons";
import { useCapabilities } from "@/web/hooks/use-capability";

/**
 * Settings index — picks the first settings page the current user can access.
 *
 * Priority order:
 *   1. General           (requires org:manage)
 *   2. Connections       (basic-usage, everyone)
 *   3. Profile           (always available, ultimate fallback)
 *
 * This avoids dumping users without org:manage onto a "No access" screen
 * just because they clicked the Settings shortcut.
 */
export default function SettingsIndexRedirect() {
  const { org } = useParams({ from: "/shell/$org" });
  const { capabilities, loading } = useCapabilities();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loading01 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const target = capabilities["org:manage"]
    ? "/$org/settings/general"
    : "/$org/settings/connections";

  return <Navigate to={target} params={{ org }} replace />;
}
