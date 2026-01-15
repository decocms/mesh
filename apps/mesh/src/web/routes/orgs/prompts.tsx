import type { PromptEntity } from "@/tools/prompt/schema";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import {
  usePromptActions,
  usePrompts,
} from "@/web/hooks/collections/use-prompt";
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

function OrgPromptsContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  const listState = useListState<PromptEntity>({
    namespace: org.slug,
    resource: "prompts",
  });

  const prompts = usePrompts(listState);
  const promptActions = usePromptActions();
  const isCreating = promptActions.create.isPending;

  const handleCreate = async () => {
    const title = `New Prompt ${new Date().toLocaleString()}`;
    const created = await promptActions.create.mutateAsync({
      title,
      name: slugify(title),
      description: null,
      template: "",
      arguments: [],
    });

    navigate({
      to: "/$org/prompts/$promptId",
      params: { org: org.slug, promptId: created.id },
    });
  };

  const handleDelete = async (prompt: PromptEntity) => {
    const confirmed = window.confirm(
      `Delete prompt "${prompt.title || prompt.name}"?`,
    );
    if (!confirmed) return;
    await promptActions.delete.mutateAsync(prompt.id);
  };

  const handleDuplicate = async (prompt: PromptEntity) => {
    const suffix = Date.now().toString();
    const title = `${prompt.title || prompt.name} Copy`;
    const created = await promptActions.create.mutateAsync({
      title,
      name: `${slugify(prompt.name)}-copy-${suffix}`,
      description: prompt.description ?? null,
      template: prompt.template ?? "",
      arguments: prompt.arguments ?? [],
      icons: prompt.icons ?? [],
      messages: prompt.messages ?? [],
    });

    navigate({
      to: "/$org/prompts/$promptId",
      params: { org: org.slug, promptId: created.id },
    });
  };

  const columns: TableColumn<PromptEntity>[] = [
    {
      id: "title",
      header: "Title",
      render: (prompt) => (
        <span className="text-sm font-medium text-foreground truncate">
          {prompt.title || prompt.name}
        </span>
      ),
      cellClassName: "w-48 min-w-0 shrink-0",
      sortable: true,
    },
    {
      id: "name",
      header: "Name",
      render: (prompt) => (
        <span className="text-xs font-mono text-muted-foreground truncate">
          {prompt.name}
        </span>
      ),
      cellClassName: "w-48 min-w-0 shrink-0",
      sortable: true,
    },
    {
      id: "description",
      header: "Description",
      render: (prompt) => (
        <span className="text-sm text-foreground line-clamp-2">
          {prompt.description || "—"}
        </span>
      ),
      cellClassName: "flex-1 min-w-0",
      wrap: true,
      sortable: true,
    },
    {
      id: "actions",
      header: "",
      render: (prompt) => (
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
                  to: "/$org/prompts/$promptId",
                  params: { org: org.slug, promptId: prompt.id },
                })
              }
            >
              <Share03 size={16} />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDuplicate(prompt)}>
              <Copy01 size={16} />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => handleDelete(prompt)}
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
        title="Prompts"
        viewMode={listState.viewMode}
        onViewModeChange={listState.setViewMode}
        sortKey={listState.sortKey}
        sortDirection={listState.sortDirection}
        onSort={listState.handleSort}
        sortOptions={[
          { id: "title", label: "Title" },
          { id: "description", label: "Description" },
          { id: "updated_at", label: "Updated" },
        ]}
        ctaButton={
          <Button size="sm" onClick={handleCreate} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Prompt"}
          </Button>
        }
      />

      <CollectionSearch
        searchTerm={listState.searchTerm}
        onSearchChange={listState.setSearchTerm}
      />

      <CollectionTableWrapper
        columns={columns}
        data={prompts}
        sortKey={listState.sortKey ? String(listState.sortKey) : undefined}
        sortDirection={listState.sortDirection}
        onSort={(key) => listState.handleSort(key as keyof PromptEntity)}
        onRowClick={(prompt) =>
          navigate({
            to: "/$org/prompts/$promptId",
            params: { org: org.slug, promptId: prompt.id },
          })
        }
        emptyState={
          <EmptyState
            title="No prompts yet"
            description="Saved prompts will appear here."
          />
        }
      />
    </CollectionPage>
  );
}

export default function OrgPromptsPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <OrgPromptsContent />
      </Suspense>
    </ErrorBoundary>
  );
}
