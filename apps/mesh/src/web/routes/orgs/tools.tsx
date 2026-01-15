import type { ToolEntity } from "@/tools/tool/schema";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useToolActions, useTools } from "@/web/hooks/collections/use-tool";
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

function OrgToolsContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  const listState = useListState<ToolEntity>({
    namespace: org.slug,
    resource: "tools",
  });

  const tools = useTools(listState);
  const toolActions = useToolActions();
  const isCreating = toolActions.create.isPending;

  const handleCreate = async () => {
    const title = `New Tool ${new Date().toLocaleString()}`;
    const created = await toolActions.create.mutateAsync({
      title,
      name: slugify(title),
      description: null,
      execute:
        "export default async function (tools) {\n  return { ok: true };\n}\n",
      dependencies: [],
      input_schema: {
        type: "object",
        additionalProperties: true,
      },
      output_schema: {
        type: "object",
        additionalProperties: true,
      },
    });

    navigate({
      to: "/$org/tools/$toolId",
      params: { org: org.slug, toolId: created.id },
    });
  };

  const handleDelete = async (tool: ToolEntity) => {
    const confirmed = window.confirm(
      `Delete tool "${tool.title || tool.name}"?`,
    );
    if (!confirmed) return;
    await toolActions.delete.mutateAsync(tool.id);
  };

  const handleDuplicate = async (tool: ToolEntity) => {
    const suffix = Date.now().toString();
    const title = `${tool.title || tool.name} Copy`;
    const created = await toolActions.create.mutateAsync({
      title,
      name: `${slugify(tool.name)}-copy-${suffix}`,
      description: tool.description ?? null,
      execute: tool.execute,
      dependencies: tool.dependencies,
      input_schema: tool.input_schema,
      output_schema: tool.output_schema ?? undefined,
    });

    navigate({
      to: "/$org/tools/$toolId",
      params: { org: org.slug, toolId: created.id },
    });
  };

  const columns: TableColumn<ToolEntity>[] = [
    {
      id: "title",
      header: "Name",
      render: (tool) => (
        <span className="text-sm font-medium text-foreground truncate">
          {tool.title || tool.name}
        </span>
      ),
      cellClassName: "w-48 min-w-0 shrink-0",
      sortable: true,
    },
    {
      id: "name",
      header: "Identifier",
      render: (tool) => (
        <span className="text-xs font-mono text-muted-foreground truncate">
          {tool.name}
        </span>
      ),
      cellClassName: "w-48 min-w-0 shrink-0",
      sortable: true,
    },
    {
      id: "description",
      header: "Description",
      render: (tool) => (
        <span className="text-sm text-foreground line-clamp-2">
          {tool.description || "—"}
        </span>
      ),
      cellClassName: "flex-1 min-w-0",
      wrap: true,
      sortable: true,
    },
    {
      id: "dependencies",
      header: "Dependencies",
      render: (tool) => (
        <span className="text-sm text-muted-foreground">
          {tool.dependencies?.length ?? 0}
        </span>
      ),
      cellClassName: "w-28 shrink-0",
    },
    {
      id: "actions",
      header: "",
      render: (tool) => (
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
                  to: "/$org/tools/$toolId",
                  params: { org: org.slug, toolId: tool.id },
                })
              }
            >
              <Share03 size={16} />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDuplicate(tool)}>
              <Copy01 size={16} />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => handleDelete(tool)}
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
        title="Tools"
        viewMode={listState.viewMode}
        onViewModeChange={listState.setViewMode}
        sortKey={listState.sortKey}
        sortDirection={listState.sortDirection}
        onSort={listState.handleSort}
        sortOptions={[
          { id: "title", label: "Name" },
          { id: "description", label: "Description" },
          { id: "updated_at", label: "Updated" },
        ]}
        ctaButton={
          <Button size="sm" onClick={handleCreate} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Tool"}
          </Button>
        }
      />

      <CollectionSearch
        searchTerm={listState.searchTerm}
        onSearchChange={listState.setSearchTerm}
      />

      <CollectionTableWrapper
        columns={columns}
        data={tools}
        sortKey={listState.sortKey ? String(listState.sortKey) : undefined}
        sortDirection={listState.sortDirection}
        onSort={(key) => listState.handleSort(key as keyof ToolEntity)}
        onRowClick={(tool) =>
          navigate({
            to: "/$org/tools/$toolId",
            params: { org: org.slug, toolId: tool.id },
          })
        }
        emptyState={
          <EmptyState
            title="No tools yet"
            description="Saved tools will appear here."
          />
        }
      />
    </CollectionPage>
  );
}

export default function OrgToolsPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <OrgToolsContent />
      </Suspense>
    </ErrorBoundary>
  );
}
