import { authClient } from "@/web/lib/auth-client";
import { Button } from "@deco/ui/components/button.tsx";
import { Plus } from "@untitledui/icons";
import { OrgItem } from "./org-item";

interface OrgPanelProps {
  currentOrgSlug?: string;
  onOrgSelect: (orgSlug: string) => void;
  onOrgSettings: (orgSlug: string) => void;
  onPopoverClose: () => void;
  onCreateOrganization: () => void;
}

export function OrgPanel({
  currentOrgSlug,
  onOrgSelect,
  onOrgSettings,
  onPopoverClose,
  onCreateOrganization,
}: OrgPanelProps) {
  const { data: organizations } = authClient.useListOrganizations();

  // Sort orgs: current first, then alphabetically
  const sortedOrganizations = [...(organizations ?? [])].sort((a, b) => {
    if (a.slug === currentOrgSlug) return -1;
    if (b.slug === currentOrgSlug) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col min-w-[275px] border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between h-10 px-3 border-b border-border">
        <span className="text-xs text-muted-foreground truncate">
          Your Organizations
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          onClick={() => {
            onPopoverClose();
            onCreateOrganization();
          }}
        >
          <Plus size={16} className="text-muted-foreground" />
        </Button>
      </div>

      {/* Org list */}
      <div className="flex flex-col gap-0.5 p-1 flex-1 overflow-y-auto">
        {sortedOrganizations.map((organization) => (
          <OrgItem
            key={organization.slug}
            org={organization}
            isActive={organization.slug === currentOrgSlug}
            onClick={() => onOrgSelect(organization.slug)}
            onSettings={() => onOrgSettings(organization.slug)}
          />
        ))}
      </div>
    </div>
  );
}
