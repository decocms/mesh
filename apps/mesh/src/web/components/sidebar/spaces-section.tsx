import { Suspense, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
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
import { CollectionSearch } from "@deco/ui/components/collection-search.tsx";
import { Plus, X } from "@untitledui/icons";
import {
  isDecopilot,
  useProjectContext,
  useVirtualMCPActions,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { useCreateVirtualMCP } from "@/web/hooks/use-create-virtual-mcp";
import { useSpaces } from "@/web/hooks/use-spaces";
import { AgentAvatar } from "@/web/components/agent-icon";
import { cn } from "@deco/ui/lib/utils.ts";
import { SiteEditorOnboardingModal } from "@/web/components/home/site-editor-onboarding-modal.tsx";
import { useCreateSlideBuilder } from "@/web/hooks/use-create-slide-builder";

const SITE_EDITOR_AGENT = {
  id: "site-editor",
  title: "Site Editor",
  icon: "icon://Globe01?color=violet",
} as const;

const SLIDE_BUILDER_AGENT = {
  id: "slide-builder",
  title: "Slide Builder",
  icon: "icon://PresentationChart01?color=yellow",
} as const;

const DEFAULT_AGENTS = [SITE_EDITOR_AGENT, SLIDE_BUILDER_AGENT];

function SpaceListItem({
  space,
  org,
}: {
  space: VirtualMCPEntity;
  org: string;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = pathname.startsWith(`/${org}/spaces/${space.id}`);
  const actions = useVirtualMCPActions();
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
  const xRef = useRef<HTMLButtonElement>(null);

  const handleIconMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    setButtonRect(
      (e.currentTarget as HTMLButtonElement).getBoundingClientRect(),
    );
  };

  const handleIconMouseLeave = (e: React.MouseEvent) => {
    if (
      xRef.current &&
      e.relatedTarget instanceof Node &&
      xRef.current.contains(e.relatedTarget)
    ) {
      return;
    }
    setButtonRect(null);
  };

  const xVisibleWidth = buttonRect ? Math.round(buttonRect.height * 0.9) : 0;
  const xTotalWidth = buttonRect ? buttonRect.width + xVisibleWidth : 0;

  return (
    <SidebarMenuItem className={buttonRect ? "z-[55]" : undefined}>
      <SidebarMenuButton
        tooltip={buttonRect ? undefined : space.title}
        isActive={isActive}
        onClick={() =>
          navigate({
            to: "/$org/spaces/$virtualMcpId",
            params: { org, virtualMcpId: space.id },
          })
        }
        onMouseEnter={handleIconMouseEnter}
        onMouseLeave={handleIconMouseLeave}
      >
        <AgentAvatar
          icon={space.icon}
          name={space.title}
          size="xs"
          className="w-full h-full [&_svg]:w-1/2 [&_svg]:h-1/2"
        />
      </SidebarMenuButton>

      {buttonRect &&
        createPortal(
          <button
            ref={xRef}
            type="button"
            onMouseLeave={() => setButtonRect(null)}
            onClick={(e) => {
              e.stopPropagation();
              setButtonRect(null);
              actions.update.mutate({ id: space.id, data: { pinned: false } });
              navigate({ to: "/$org", params: { org } });
            }}
            className={cn(
              "flex items-center justify-center",
              "bg-sidebar-accent text-muted-foreground",
              "rounded-xl cursor-pointer",
              "animate-in fade-in-0 slide-in-from-right-2",
              "duration-150 [animation-timing-function:cubic-bezier(0.165,0.84,0.44,1)]",
              "hover:text-foreground transition-colors",
            )}
            style={{
              position: "fixed",
              top: buttonRect.top,
              left: buttonRect.left,
              height: buttonRect.height,
              width: xTotalWidth,
              paddingLeft: buttonRect.width,
              zIndex: 50,
              boxShadow:
                "inset 0 0 0.5px 1px hsla(0, 0%, 100%, 0.075), 0 0 0 0.5px hsla(0, 0%, 0%, 0.12)",
            }}
          >
            <X size={14} />
          </button>,
          document.body,
        )}
    </SidebarMenuItem>
  );
}

function AgentGridItem({
  space,
  onClick,
}: {
  space: VirtualMCPEntity;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 rounded-xl transition-colors hover:bg-accent cursor-pointer group"
    >
      <AgentAvatar
        icon={space.icon}
        name={space.title}
        size="md"
        className="transition-transform group-hover:scale-105"
      />
      <span className="text-xs leading-tight text-center text-muted-foreground group-hover:text-foreground line-clamp-2 w-full">
        {space.title}
      </span>
    </button>
  );
}

export function PinSpacePopover() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [siteEditorModalOpen, setSiteEditorModalOpen] = useState(false);
  const allSpaces = useVirtualMCPs();
  const actions = useVirtualMCPActions();
  const { org } = useProjectContext();
  const { createVirtualMCP, isCreating } = useCreateVirtualMCP();
  const { createSlideBuilder, isCreating: isCreatingSlideBuilder } =
    useCreateSlideBuilder();

  const navigate = useNavigate();

  const lowerSearch = search.toLowerCase();
  const userAgents = allSpaces
    .filter((s) => !isDecopilot(s.id))
    .filter((s) => !search || s.title.toLowerCase().includes(lowerSearch));

  const filteredDefaults = DEFAULT_AGENTS.filter(
    (a) => !search || a.title.toLowerCase().includes(lowerSearch),
  );

  const handleSelect = async (space: VirtualMCPEntity) => {
    if (!space.pinned) {
      await actions.update.mutateAsync({
        id: space.id,
        data: { pinned: true },
      });
    }
    setOpen(false);
    setSearch("");
    navigate({
      to: "/$org/spaces/$virtualMcpId",
      params: { org: org.slug, virtualMcpId: space.id },
    });
  };

  const handleDefaultAgentClick = (agentId: string) => {
    setOpen(false);
    setSearch("");
    if (agentId === SITE_EDITOR_AGENT.id) {
      setSiteEditorModalOpen(true);
    } else if (agentId === SLIDE_BUILDER_AGENT.id) {
      createSlideBuilder();
    } else {
      navigate({
        to: "/$org/spaces/$virtualMcpId",
        params: { org: org.slug, virtualMcpId: agentId },
      });
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <SidebarMenuItem>
          <PopoverTrigger asChild>
            <SidebarMenuButton tooltip="Browse agents">
              <Plus className="!opacity-100" />
            </SidebarMenuButton>
          </PopoverTrigger>
        </SidebarMenuItem>
        <PopoverContent
          className="w-[380px] p-0 overflow-hidden"
          side="right"
          align="start"
        >
          <div className="flex flex-col max-h-[min(640px,80dvh)]">
            {/* Search */}
            <CollectionSearch
              value={search}
              onChange={setSearch}
              placeholder="Search agents..."
            />

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 min-h-0 px-3 pb-3">
              {/* Your Agents section */}
              <div className="px-1 pt-3 pb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Your Agents
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {/* Create new button */}
                <button
                  type="button"
                  disabled={isCreating}
                  onClick={async () => {
                    const { id } = await createVirtualMCP();
                    setOpen(false);
                    navigate({
                      to: "/$org/spaces/$virtualMcpId",
                      params: { org: org.slug, virtualMcpId: id },
                    });
                  }}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl transition-colors hover:bg-accent cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-12 h-12 rounded-xl border-2 border-dashed border-border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
                    <Plus size={18} className="text-muted-foreground" />
                  </div>
                  <span className="text-xs leading-tight text-center text-muted-foreground group-hover:text-foreground">
                    Create new
                  </span>
                </button>

                {userAgents.map((space) => (
                  <AgentGridItem
                    key={space.id}
                    space={space}
                    onClick={() => handleSelect(space)}
                  />
                ))}
              </div>

              {/* Default Agents section */}
              {filteredDefaults.length > 0 && (
                <>
                  <div className="px-1 pt-4 pb-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Agents
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {filteredDefaults.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        disabled={
                          agent.id === SLIDE_BUILDER_AGENT.id &&
                          isCreatingSlideBuilder
                        }
                        onClick={() => handleDefaultAgentClick(agent.id)}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl transition-colors hover:bg-accent cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <AgentAvatar
                          icon={agent.icon}
                          name={agent.title}
                          size="md"
                          className="transition-transform group-hover:scale-105"
                        />
                        <span className="text-xs leading-tight text-center text-muted-foreground group-hover:text-foreground line-clamp-2 w-full">
                          {agent.title}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {userAgents.length === 0 &&
                filteredDefaults.length === 0 &&
                !isCreating && (
                  <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                    {search ? "No agents found" : "No agents yet"}
                  </div>
                )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-3 py-2.5">
              <Link
                to="/$org/spaces"
                params={{ org: org.slug }}
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
              >
                See all agents
              </Link>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <SiteEditorOnboardingModal
        open={siteEditorModalOpen}
        onOpenChange={setSiteEditorModalOpen}
      />
    </>
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
