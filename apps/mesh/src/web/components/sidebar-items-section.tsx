import { SidebarItem } from "@/storage/types";
import { X, File06, ChevronRight } from "@untitledui/icons";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
} from "@deco/ui/components/sidebar.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useState, useEffect } from "react";
import {
  useOrganizationSettings,
  useOrganizationSettingsActions,
} from "../hooks/collections/use-organization-settings";
import { useProjectContext } from "../providers/project-context-provider";
import { type ValidatedCollection } from "../hooks/use-binding";

/**
 * Individual sidebar item
 */
function SidebarItemListItem({ item }: { item: SidebarItem }) {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const settings = useOrganizationSettings(org.id);
  const actions = useOrganizationSettingsActions(org.id);

  const handleDelete = async () => {
    const currentItems = settings?.sidebar_items || [];
    const updatedItems = currentItems.filter(
      (sidebarItem: SidebarItem) => sidebarItem.url !== item.url,
    );

    await actions.update.mutateAsync({
      sidebar_items: updatedItems,
    });
  };

  const handleClick = () => {
    // Parse the URL to navigate properly with TanStack Router
    // URL format: /{orgSlug}/mcps/{connectionId}?tab={collectionName}
    const url = new URL(item.url, window.location.origin);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const searchParams = new URLSearchParams(url.search);

    if (pathParts.length >= 3 && pathParts[1] === "mcps") {
      const orgSlug = pathParts[0]; // Use the slug from the URL
      const connectionId = pathParts[2];
      const tab = searchParams.get("tab");

      navigate({
        to: "/$org/mcps/$connectionId",
        params: { org: orgSlug, connectionId },
        search: tab ? { tab } : undefined,
      });
    } else {
      // Fallback for other URL formats
      window.location.href = item.url;
    }
  };

  const isIconUrl = /^https?:\/\/.+/.test(item.icon);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="w-full pr-2 group/item relative cursor-pointer text-foreground/90 hover:text-foreground"
        onClick={handleClick}
        tooltip={item.title}
      >
        <div className="flex items-center justify-center shrink-0">
          {isIconUrl ? (
            <img
              src={item.icon}
              alt={item.title}
              className="h-4 w-4 rounded object-cover"
            />
          ) : (
            <File06
              size={16}
              className="text-muted-foreground group-hover/item:text-foreground transition-colors"
            />
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col items-start">
          <span className="truncate text-sm w-full capitalize">
            {item.title.toLocaleLowerCase()}
          </span>
        </div>
        <X
          size={16}
          className="text-muted-foreground opacity-0 group-hover/item:opacity-50 hover:opacity-100 cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDelete();
          }}
        />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Helper function to detect collections from connection tools
 */
export function detectCollections(
  tools: Array<{
    name: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
  }> | null,
): ValidatedCollection[] {
  if (!tools || tools.length === 0) return [];

  // Extract collection names using regex
  const collectionRegex = /^COLLECTION_(.+)_LIST$/;
  const names: string[] = [];

  for (const tool of tools) {
    const match = tool.name.match(collectionRegex);
    if (match?.[1]) {
      names.push(match[1]);
    }
  }

  return names.map((name) => ({
    name,
    displayName: name
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
    hasCreateTool: tools.some((t) => t.name === `COLLECTION_${name}_CREATE`),
    hasUpdateTool: tools.some((t) => t.name === `COLLECTION_${name}_UPDATE`),
    hasDeleteTool: tools.some((t) => t.name === `COLLECTION_${name}_DELETE`),
  }));
}

/**
 * Hook to auto-pin collections for a specific connection
 * Should be called from connection detail page where connection data is available
 */
export function useAutoPinConnectionCollections(
  connectionId: string,
  connectionTitle: string,
  connectionIcon: string | null,
  tools:
    | Array<{
        name: string;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
      }>
    | null
    | undefined,
) {
  const { org } = useProjectContext();
  const settings = useOrganizationSettings(org.id);
  const actions = useOrganizationSettingsActions(org.id);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    // Wait for tools and settings to load
    if (!tools || !settings) return;

    const collections = detectCollections(tools);
    if (collections.length === 0) return;

    // Check localStorage to see if we've already auto-pinned this connection
    const storageKey = `auto-pinned-${org.id}-${connectionId}`;
    const alreadyProcessed = localStorage.getItem(storageKey);

    if (alreadyProcessed) {
      // Already processed this connection, don't pin again
      return;
    }

    const currentItems = settings.sidebar_items || [];
    const currentUrls = new Set(
      currentItems.map((item: SidebarItem) => item.url),
    );
    const newItemsToPin: SidebarItem[] = [];

    // Only add collections that aren't already pinned
    collections.forEach((collection) => {
      const collectionUrl = `/${org.slug}/mcps/${connectionId}?tab=${collection.name}`;

      if (!currentUrls.has(collectionUrl)) {
        newItemsToPin.push({
          url: collectionUrl,
          title: collection.displayName, // Just the collection name
          icon: connectionIcon || "",
        });
      }
    });

    // Only pin if there are new items
    if (newItemsToPin.length > 0) {
      console.log(
        "[Auto-pin] Pinning new collections:",
        connectionTitle,
        newItemsToPin,
      );
      actions.update.mutate({
        sidebar_items: [...currentItems, ...newItemsToPin],
      });
    }

    // Mark this connection as processed (even if no new items to prevent future checks)
    localStorage.setItem(storageKey, "true");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, tools, actions, org.id, org.slug]);
}

/**
 * Sidebar items section content - pinned items
 */
function SidebarItemsSectionContent() {
  const { org } = useProjectContext();
  const settings = useOrganizationSettings(org.id);
  const [isPinnedOpen, setIsPinnedOpen] = useState(true);

  const sidebarItems = settings?.sidebar_items;

  if (!sidebarItems?.length) {
    return null;
  }

  return (
    <>
      <SidebarSeparator className="my-2 -ml-1" />
      <SidebarGroup>
        <Collapsible open={isPinnedOpen} onOpenChange={setIsPinnedOpen}>
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="w-full flex items-center gap-1 hover:bg-sidebar-accent rounded-md px-2 h-7! py-0! group-data-[collapsible=icon]:hidden">
              <span className="text-xs font-medium text-muted-foreground">
                Pinned Views
              </span>
              <ChevronRight
                className={`size-3 transition-transform text-muted-foreground ${isPinnedOpen ? "rotate-90" : ""}`}
              />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {sidebarItems.map((item: SidebarItem) => (
                  <SidebarItemListItem key={item.url} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroup>
    </>
  );
}

/**
 * Sidebar items section - renders pinned items (auto-pins collections from MCP servers)
 */
export function SidebarItemsSection() {
  return (
    <Suspense fallback={null}>
      <SidebarItemsSectionContent />
    </Suspense>
  );
}
