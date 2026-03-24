import { useNavigate, useMatch } from "@tanstack/react-router";
import { authClient } from "@/web/lib/auth-client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { Check, Plus } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { CreateOrganizationDialog } from "@/web/components/create-organization-dialog";
import { useState } from "react";

function getOrgColorStyle(name: string): {
  backgroundColor: string;
  color: string;
} {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return {
    backgroundColor: `hsl(${h} 55% 70%)`,
    color: `hsl(${h} 55% 20%)`,
  };
}

function OrgIcon({
  org,
  size = "sm",
}: {
  org: { name: string; logo?: string | null };
  size?: "xs" | "sm";
}) {
  const sizeClass = size === "xs" ? "size-5" : "size-6";
  const textClass = size === "xs" ? "text-[9px]" : "text-xs";

  return (
    <div
      className={cn(
        sizeClass,
        "shrink-0 rounded-md flex items-center justify-center border border-border/50 overflow-hidden",
      )}
      style={org.logo ? undefined : getOrgColorStyle(org.name)}
    >
      {org.logo ? (
        <img src={org.logo} alt="" className="size-full object-cover" />
      ) : (
        <span className={cn("font-semibold leading-none", textClass)}>
          {org.name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function MeshAccountSwitcher() {
  const orgMatch = useMatch({ from: "/shell/$org", shouldThrow: false });
  const orgParam = orgMatch?.params.org;
  const { data: organizations } = authClient.useListOrganizations();
  const navigate = useNavigate();

  const currentOrg = organizations?.find((o) => o.slug === orgParam);

  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSelectOrg = (orgSlug: string) => {
    setOpen(false);
    navigate({
      to: "/$org",
      params: { org: orgSlug },
    });
  };

  const sortedOrgs = [...(organizations ?? [])].sort((a, b) => {
    if (a.slug === orgParam) return -1;
    if (b.slug === orgParam) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-3 rounded-md p-1.5 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring min-h-[2.75rem] w-auto"
          >
            <div
              className="shrink-0 rounded-md flex items-center justify-center border border-border/50 overflow-hidden size-12"
              style={
                currentOrg?.logo
                  ? undefined
                  : getOrgColorStyle(currentOrg?.name ?? "")
              }
            >
              {currentOrg?.logo ? (
                <img
                  src={currentOrg.logo}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span className="font-semibold leading-none text-lg">
                  {(currentOrg?.name ?? "?").slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          side="bottom"
          className="w-56 flex flex-col gap-0.5 p-1"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {sortedOrgs.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => handleSelectOrg(org.slug)}
              className={cn(
                "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-left w-full transition-colors",
                org.slug === orgParam
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/50",
              )}
            >
              <OrgIcon org={org} size="xs" />
              <span className="flex-1 truncate">{org.name}</span>
              {org.slug === orgParam && (
                <Check
                  size={14}
                  className="ml-auto text-muted-foreground shrink-0"
                />
              )}
            </button>
          ))}
          <div className="h-px bg-border my-0.5" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setCreatingOrganization(true);
            }}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-left w-full text-foreground hover:bg-accent/50 transition-colors"
          >
            <Plus size={14} className="shrink-0 text-muted-foreground" />
            <span>Create organization</span>
          </button>
        </PopoverContent>
      </Popover>

      <CreateOrganizationDialog
        open={creatingOrganization}
        onOpenChange={setCreatingOrganization}
      />
    </>
  );
}

MeshAccountSwitcher.Skeleton = function MeshAccountSwitcherSkeleton() {
  return (
    <div className="flex items-center gap-1.5 h-7 px-1.5 w-full">
      <Skeleton className="size-5 rounded-[5px] shrink-0 bg-sidebar-accent" />
      <Skeleton className="h-3.5 flex-1 bg-sidebar-accent" />
    </div>
  );
};
