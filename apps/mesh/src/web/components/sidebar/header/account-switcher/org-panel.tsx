import { authClient } from "@/web/lib/auth-client";
import { Plus } from "@untitledui/icons";
import { OrgItem } from "./org-item";

export interface Organization {
  id: string;
  slug: string;
  name: string;
  logo?: string | null;
}

interface OrgPanelProps {
  currentOrgSlug?: string;
  hoveredOrgId?: string | null;
  onOrgSelect: (orgSlug: string) => void;
  onOrgSettings: (orgSlug: string) => void;
  onPopoverClose: () => void;
  onCreateOrganization: () => void;
  onOrgHover?: (orgId: string | null) => void;
}

export function OrgPanel({
  currentOrgSlug,
  hoveredOrgId,
  onOrgSelect,
  onOrgSettings,
  onPopoverClose,
  onCreateOrganization,
  onOrgHover,
}: OrgPanelProps) {
  const { data: organizations } = authClient.useListOrganizations();

  // Sort orgs: current first, then alphabetically
  const sortedOrganizations = [...(organizations ?? [])].sort((a, b) => {
    if (a.slug === currentOrgSlug) return -1;
    if (b.slug === currentOrgSlug) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col min-w-[240px] border-l border-border">
      {/* Org list */}
      <div className="flex flex-col gap-0.5 p-1 flex-1 overflow-y-auto">
        <p className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
          Organizations
        </p>
        {sortedOrganizations.map((organization) => (
          <OrgItem
            key={organization.slug}
            org={organization}
            isActive={organization.slug === currentOrgSlug}
            isHovered={organization.id === hoveredOrgId}
            onClick={() => onOrgSelect(organization.slug)}
            onSettings={() => onOrgSettings(organization.slug)}
            onHover={onOrgHover}
          />
        ))}
      </div>

      {/* Footer — create org */}
      <div className="border-t px-1.5 py-1.5">
        <button
          type="button"
          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-accent transition-colors"
          onClick={() => {
            onPopoverClose();
            onCreateOrganization();
          }}
        >
          <Plus size={14} className="shrink-0 opacity-50" />
          <span className="text-[13px]">Create organization</span>
        </button>
      </div>
    </div>
  );
}
