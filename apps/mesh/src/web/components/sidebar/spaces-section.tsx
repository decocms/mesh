import { Suspense, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@deco/ui/components/sidebar.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Plus } from "@untitledui/icons";
import {
  useProjectContext,
  useVirtualMCPActions,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { useCreateVirtualMCP } from "@/web/hooks/use-create-virtual-mcp";
import { useSpaces } from "@/web/hooks/use-spaces";
import { AgentAvatar } from "@/web/components/agent-icon";

function SpaceListItem({
  space,
  org,
}: {
  space: VirtualMCPEntity;
  org: string;
}) {
  const navigate = useNavigate();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={space.title}
        onClick={() =>
          navigate({
            to: "/$org/spaces/$virtualMcpId",
            params: { org, virtualMcpId: space.id },
          })
        }
      >
        <AgentAvatar
          icon={space.icon}
          name={space.title}
          size="xs"
          className="w-full h-full rounded-lg [&_svg]:w-1/2 [&_svg]:h-1/2"
        />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function PinSpacePopover() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const allSpaces = useVirtualMCPs();
  const actions = useVirtualMCPActions();
  const { org } = useProjectContext();
  const { createVirtualMCP, isCreating } = useCreateVirtualMCP({
    navigateOnCreate: true,
  });

  const unpinnedSpaces = allSpaces
    .filter((s) => !s.pinned)
    .filter(
      (s) => !search || s.title.toLowerCase().includes(search.toLowerCase()),
    );

  const navigate = useNavigate();

  const handlePin = async (space: VirtualMCPEntity) => {
    await actions.update.mutateAsync({
      id: space.id,
      data: { pinned: true },
    });
    setOpen(false);
    setSearch("");
    navigate({
      to: "/$org/spaces/$virtualMcpId",
      params: { org: org.slug, virtualMcpId: space.id },
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <PopoverTrigger asChild>
          <SidebarMenuButton tooltip="Pin a space">
            <Plus className="!opacity-100" />
          </SidebarMenuButton>
        </PopoverTrigger>
      </SidebarMenuItem>
      <PopoverContent className="w-80 p-2" side="right" align="start">
        <Input
          placeholder="Search spaces..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 h-8 text-sm"
          autoFocus
        />
        <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5">
          {unpinnedSpaces.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {search ? "No matches" : "No unpinned spaces"}
            </div>
          ) : (
            unpinnedSpaces.map((space) => (
              <button
                key={space.id}
                type="button"
                className="flex items-start gap-3 px-2 py-2 rounded-md hover:bg-accent text-sm w-full text-left"
                onClick={() => handlePin(space)}
              >
                <AgentAvatar
                  icon={space.icon}
                  name={space.title}
                  size="sm"
                  className="shrink-0 mt-0.5"
                />
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-medium">{space.title}</span>
                  {space.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {space.description}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border mt-2 pt-2">
          <button
            type="button"
            disabled={isCreating}
            onClick={() => {
              createVirtualMCP();
              setOpen(false);
            }}
            className="flex-1 text-xs text-muted-foreground hover:text-foreground transition-colors text-center disabled:opacity-50"
          >
            + Create new
          </button>
          <span className="text-border">|</span>
          <Link
            to="/$org/spaces"
            params={{ org: org.slug }}
            onClick={() => setOpen(false)}
            className="flex-1 text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
          >
            See all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SpacesSectionContent() {
  const spaces = useSpaces({ pinnedOnly: true });
  const { org } = useProjectContext();

  return (
    <SidebarGroup className="py-0 px-0 mt-2">
      <SidebarGroupContent>
        <SidebarMenu className="gap-2">
          <PinSpacePopover />
          {spaces.map((space) => (
            <SpaceListItem key={space.id} space={space} org={org.slug} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function SidebarSpacesSection() {
  return (
    <Suspense
      fallback={
        <SidebarGroup className="py-0 px-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              <SidebarMenuItem>
                <div className="flex items-center gap-2 px-2 py-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      }
    >
      <SpacesSectionContent />
    </Suspense>
  );
}
