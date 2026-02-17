/**
 * Plugin Header Component
 *
 * Site switcher with command palette and branch switcher for the site editor plugin.
 * Replaces the old ConnectionSelector with a multi-site aware SiteSwitcher.
 */

import type { PluginRenderHeaderProps } from "@decocms/bindings/plugins";
import {
  useConnections,
  useProjectContext,
  type ConnectionEntity,
} from "@decocms/mesh-sdk";
import { useState, useRef, lazy, Suspense } from "react";
import {
  setSites,
  setActiveSite,
  useSiteStore,
  deriveDisplayName,
  type SiteConnection,
} from "../lib/site-store";
import {
  hasPendingSave,
  flushPendingSave,
  cancelPendingSave,
} from "../lib/dirty-state";
import { siteEditorRouter } from "../lib/router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";

const BranchSwitcher = lazy(() => import("./branch-switcher"));
const PublishBar = lazy(() => import("./publish-bar"));
const SiteSwitcher = lazy(() => import("./site-switcher"));
const SitePalette = lazy(() => import("./site-palette"));
const UnsavedChangesDialog = lazy(() => import("./unsaved-changes-dialog"));
const PluginEmptyState = lazy(() => import("./plugin-empty-state"));

/**
 * Derives SiteConnection[] from the raw connection entities.
 * Only includes STDIO connections that have a projectPath in metadata.
 */
function deriveSiteConnections(
  connections: ConnectionEntity[],
): SiteConnection[] {
  const result: SiteConnection[] = [];
  for (const c of connections) {
    if (c.connection_type !== "STDIO") continue;
    const meta = c.metadata as Record<string, unknown> | null | undefined;
    const projectPath =
      typeof meta?.projectPath === "string" ? meta.projectPath : null;
    if (!projectPath) continue;
    result.push({
      connectionId: c.id,
      projectPath,
      displayName: c.title || deriveDisplayName(projectPath),
      status: c.status as SiteConnection["status"],
    });
  }
  return result;
}

export default function PluginHeader(_props: PluginRenderHeaderProps) {
  const { org, project } = useProjectContext();
  const allConnections = useConnections();
  const navigate = siteEditorRouter.useNavigate();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const [showAddSite, setShowAddSite] = useState(false);

  const orgId = org.id;
  const projectId = project.id ?? "";

  // Derive site connections and sync into the site store (ref-guarded, not useEffect).
  const lastSyncRef = useRef<string>("");
  const siteConnections = deriveSiteConnections(allConnections ?? []);
  const syncKey = siteConnections.map((s) => s.connectionId).join(",");
  if (syncKey !== lastSyncRef.current) {
    lastSyncRef.current = syncKey;
    setSites(siteConnections, orgId, projectId);
  }

  const { activeSiteId } = useSiteStore();

  const performSwitch = (connectionId: string) => {
    setActiveSite(connectionId, orgId, projectId);
    // Navigate to pages list for clean slate on site switch
    navigate({ to: "/site-editor-layout/" });
  };

  const handleSwitchSite = (connectionId: string) => {
    if (connectionId === activeSiteId) return;
    if (hasPendingSave()) {
      setPendingSwitchId(connectionId);
      setShowUnsavedDialog(true);
    } else {
      performSwitch(connectionId);
    }
  };

  const handleSaveAndSwitch = async () => {
    setShowUnsavedDialog(false);
    await flushPendingSave();
    if (pendingSwitchId) {
      performSwitch(pendingSwitchId);
      setPendingSwitchId(null);
    }
  };

  const handleDiscardAndSwitch = () => {
    setShowUnsavedDialog(false);
    cancelPendingSave();
    if (pendingSwitchId) {
      performSwitch(pendingSwitchId);
      setPendingSwitchId(null);
    }
  };

  const handleCancelSwitch = () => {
    setShowUnsavedDialog(false);
    setPendingSwitchId(null);
  };

  const handleAddSite = () => {
    setShowAddSite(true);
  };

  return (
    <div className="flex flex-col w-full">
      <div className="flex items-center gap-3">
        <Suspense fallback={null}>
          <SiteSwitcher
            onOpenPalette={() => setPaletteOpen(true)}
            onAddSite={handleAddSite}
          />
        </Suspense>
        <Suspense fallback={null}>
          <BranchSwitcher />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <PublishBar />
      </Suspense>

      {/* Command palette for site switching */}
      <Suspense fallback={null}>
        <SitePalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onSwitchSite={handleSwitchSite}
          onAddSite={handleAddSite}
        />
      </Suspense>

      {/* Unsaved changes confirmation */}
      <Suspense fallback={null}>
        <UnsavedChangesDialog
          open={showUnsavedDialog}
          onSaveAndSwitch={handleSaveAndSwitch}
          onDiscardAndSwitch={handleDiscardAndSwitch}
          onCancel={handleCancelSwitch}
        />
      </Suspense>

      {/* Add site dialog — renders PluginEmptyState in a dialog */}
      <Dialog open={showAddSite} onOpenChange={setShowAddSite}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a new site</DialogTitle>
            <DialogDescription>
              Connect a local project folder as a new site.
            </DialogDescription>
          </DialogHeader>
          <Suspense fallback={null}>
            <PluginEmptyState />
          </Suspense>
        </DialogContent>
      </Dialog>
    </div>
  );
}
