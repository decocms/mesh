import type { ResourceEntity } from "@/tools/resource/schema";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import {
  useResourceActions,
  useResources,
} from "@/web/hooks/collections/use-resource";
import { useListState } from "@/web/hooks/use-list-state";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { slugify } from "@/web/utils/slugify";
import { Button } from "@deco/ui/components/button.tsx";
import { type TableColumn } from "@deco/ui/components/collection-table.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { Copy01, DotsVertical, Share03, Trash01 } from "@untitledui/icons";

function OrgResourcesContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  const listState = useListState<ResourceEntity>({
    namespace: org.slug,
    resource: "resources",
  });

  const resources = useResources(listState);
  const resourceActions = useResourceActions();
  const isCreating = resourceActions.create.isPending;

  const handleCreate = async () => {
    const title = `New Resource ${new Date().toLocaleString()}`;
    const uri = `resource://${slugify(title)}`;
    const created = await resourceActions.create.mutateAsync({
      title,
      name: slugify(title),
      description: null,
      uri,
      mime_type: null,
      text: "",
      blob: null,
    });

    navigate({
      to: "/$org/resources/$resourceId",
      params: { org: org.slug, resourceId: created.id },
    });
  };

  const handleDelete = async (resource: ResourceEntity) => {
    const confirmed = window.confirm(
      `Delete resource "${resource.title || resource.name}"?`,
    );
    if (!confirmed) return;
    await resourceActions.delete.mutateAsync(resource.id);
  };

  const handleDuplicate = async (resource: ResourceEntity) => {
    const suffix = Date.now().toString();
    const title = `${resource.title || resource.name} Copy`;
    const uri = resource.uri.includes("?")
      ? `${resource.uri}&copy=${suffix}`
      : `${resource.uri}?copy=${suffix}`;
    const created = await resourceActions.create.mutateAsync({
      title,
      name: `${resource.name}-copy-${suffix}`,
      description: resource.description ?? null,
      uri,
      mime_type: resource.mime_type ?? null,
      text: resource.text ?? null,
      blob: resource.blob ?? null,
    });

    navigate({
      to: "/$org/resources/$resourceId",
      params: { org: org.slug, resourceId: created.id },
    });
  };

  const columns: TableColumn<ResourceEntity>[] = [
    {
      id: "title",
      header: "Name",
      render: (resource) => (
        <span className="text-sm font-medium text-foreground truncate">
          {resource.title || resource.name}
        </span>
      ),
      cellClassName: "w-48 min-w-0 shrink-0",
      sortable: true,
    },
    {
      id: "uri",
      header: "URI",
      render: (resource) => (
        <span className="text-xs font-mono text-muted-foreground truncate">
          {resource.uri}
        </span>
      ),
      cellClassName: "w-64 min-w-0 shrink-0",
      sortable: true,
    },
    {
      id: "description",
      header: "Description",
      render: (resource) => (
        <span className="text-sm text-foreground line-clamp-2">
          {resource.description || "—"}
        </span>
      ),
      cellClassName: "flex-1 min-w-0",
      wrap: true,
      sortable: true,
    },
    {
      id: "mime_type",
      header: "MIME",
      render: (resource) => (
        <span className="text-sm text-muted-foreground">
          {resource.mime_type || "—"}
        </span>
      ),
      cellClassName: "w-32 shrink-0",
    },
    {
      id: "actions",
      header: "",
      render: (resource) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(event) => event.stopPropagation()}
            >
              <DotsVertical size={20} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenuItem
              onClick={() =>
                navigate({
                  to: "/$org/resources/$resourceId",
                  params: { org: org.slug, resourceId: resource.id },
                })
              }
            >
              <Share03 size={16} />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDuplicate(resource)}>
              <Copy01 size={16} />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => handleDelete(resource)}
            >
              <Trash01 size={16} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      cellClassName: "w-12 shrink-0",
    },
  ];

  return (
    <CollectionPage>
      <CollectionHeader
        title="Resources"
        viewMode={listState.viewMode}
        onViewModeChange={listState.setViewMode}
        sortKey={listState.sortKey}
        sortDirection={listState.sortDirection}
        onSort={listState.handleSort}
        sortOptions={[
          { id: "title", label: "Name" },
          { id: "uri", label: "URI" },
          { id: "updated_at", label: "Updated" },
        ]}
        ctaButton={
          <Button size="sm" onClick={handleCreate} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Resource"}
          </Button>
        }
      />

      <CollectionSearch
        searchTerm={listState.searchTerm}
        onSearchChange={listState.setSearchTerm}
      />

      <CollectionTableWrapper
        columns={columns}
        data={resources}
        sortKey={listState.sortKey ? String(listState.sortKey) : undefined}
        sortDirection={listState.sortDirection}
        onSort={(key) => listState.handleSort(key as keyof ResourceEntity)}
        onRowClick={(resource) =>
          navigate({
            to: "/$org/resources/$resourceId",
            params: { org: org.slug, resourceId: resource.id },
          })
        }
        emptyState={
          <EmptyState
            title="No resources yet"
            description="Saved resources will appear here."
          />
        }
      />
    </CollectionPage>
  );
}

export default function OrgResourcesPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <OrgResourcesContent />
      </Suspense>
    </ErrorBoundary>
  );
}
