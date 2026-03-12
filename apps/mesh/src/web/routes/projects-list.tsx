import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ORG_ADMIN_PROJECT_SLUG, useProjectContext } from "@decocms/mesh-sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProjects } from "@/web/hooks/use-project";
import { Page } from "@/web/components/page";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { ProjectCard } from "@/web/components/project-card";
import { EmptyState } from "@/web/components/empty-state.tsx";
import {
  CreateProjectDialog,
  ModeSelectionCards,
} from "@/web/components/create-project-dialog";
import { KEYS } from "@/web/lib/query-keys";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import type { PublicConfig } from "@/api/routes/public-config";

export default function ProjectsListPage() {
  const { org } = useProjectContext();
  const { data: projects, isLoading } = useProjects(org.id);
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [folderPicking, setFolderPicking] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: publicConfig } = useQuery<PublicConfig>({
    queryKey: KEYS.publicConfig(),
  });
  const isLocal = publicConfig?.localMode === true;

  // Pick folder → validate → create project → navigate (no dialog)
  const pickFolderAndCreate = async () => {
    if (folderPicking) return;
    setFolderPicking(true);
    try {
      // 1. Open native OS folder picker
      const pickRes = await fetch("/api/local-dev/pick-folder", {
        method: "POST",
        credentials: "include",
      });
      const pick: { path?: string; cancelled?: boolean; error?: string } =
        await pickRes.json();
      if (!pick.path) return;

      // 2. Validate folder (gets name/slug, checks for existing project)
      const valRes = await fetch("/api/local-dev/validate-folder", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath: pick.path }),
      });
      const val: {
        valid: boolean;
        name?: string;
        slug?: string;
        existingProjectSlug?: string;
        error?: string;
      } = await valRes.json();

      // If project already exists for this folder, navigate to it
      if (val.existingProjectSlug) {
        navigate({
          to: "/$org/$project",
          params: { org: org.slug, project: val.existingProjectSlug },
        });
        return;
      }

      if (!val.valid) {
        toast.error(val.error || "Invalid folder");
        return;
      }

      // 3. Create project automatically
      const createRes = await fetch("/api/local-dev/create-project", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderPath: pick.path,
          name: val.name,
          slug: val.slug,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${createRes.status}`);
      }
      const result: {
        project: { id: string; slug: string; name: string };
        virtualMcpId?: string;
      } = await createRes.json();

      // 4. Set localStorage keys and navigate
      const locator =
        `${org.slug}/${result.project.slug}` as `${string}/${string}`;
      if (result.virtualMcpId) {
        localStorage.setItem(
          `${locator}:selected-virtual-mcp-id`,
          JSON.stringify(result.virtualMcpId),
        );
      }
      localStorage.setItem(
        LOCALSTORAGE_KEYS.chatSelectedMode(locator),
        JSON.stringify("passthrough"),
      );

      toast.success(`Project "${result.project.name}" created`);
      await queryClient.invalidateQueries();
      navigate({
        to: "/$org/$project",
        params: { org: org.slug, project: result.project.slug },
      });
    } catch (err) {
      toast.error(
        `Failed to create project: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setFolderPicking(false);
    }
  };

  // Filter out org-admin and apply search
  const userProjects =
    projects
      ?.filter((p) => p.slug !== ORG_ADMIN_PROJECT_SLUG)
      ?.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.description?.toLowerCase().includes(search.toLowerCase()),
      ) ?? [];

  const hasProjects = !isLoading && userProjects.length > 0;
  const isEmpty = !isLoading && userProjects.length === 0 && !search;

  const handleSettingsClick = (projectSlug: string) => {
    navigate({
      to: "/$org/$project/projects/$slug/settings/general",
      params: {
        org: org.slug,
        project: ORG_ADMIN_PROJECT_SLUG,
        slug: projectSlug,
      },
    });
  };

  // Empty state in local mode: show creation cards centered, no header/search
  if (isEmpty && isLocal) {
    return (
      <Page>
        <Page.Content>
          <div className="flex items-center justify-center h-full">
            <div className="w-full max-w-sm">
              <div className="text-center mb-6">
                <h2 className="text-lg font-semibold">Add a project</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose how to get started.
                </p>
              </div>
              <ModeSelectionCards
                onSelectFolder={pickFolderAndCreate}
                onSelectBlank={() => setCreateDialogOpen(true)}
                folderPicking={folderPicking}
              />
            </div>
          </div>
          <CreateProjectDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            onPickFolder={pickFolderAndCreate}
          />
        </Page.Content>
      </Page>
    );
  }

  return (
    <Page>
      {/* Page Header */}
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Projects</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
        <Page.Header.Right>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            size="sm"
            className="h-7 px-3 rounded-lg text-sm font-medium"
          >
            Create new project
          </Button>
        </Page.Header.Right>
      </Page.Header>

      {/* Search Bar */}
      {hasProjects && (
        <CollectionSearch
          value={search}
          onChange={setSearch}
          placeholder="Search for a project..."
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSearch("");
              (event.target as HTMLInputElement).blur();
            }
          }}
        />
      )}

      {/* Content */}
      <Page.Content className="@container">
        {/* Loading State */}
        {isLoading && (
          <div className="p-5">
            <div className="grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-[240px] rounded-xl bg-muted animate-pulse"
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State - No projects after filtering */}
        {!isLoading && userProjects.length === 0 && search && (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              title="No projects found"
              description={`No projects match "${search}"`}
            />
          </div>
        )}

        {/* Empty State - No projects (non-local mode) */}
        {isEmpty && !isLocal && (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              title="No projects yet"
              description="Create a project to get started."
              actions={
                <Button onClick={() => setCreateDialogOpen(true)}>
                  Create new project
                </Button>
              }
            />
          </div>
        )}

        {/* Card Grid */}
        {hasProjects && (
          <div className="p-5">
            <div className="grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4 gap-4">
              {userProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onSettingsClick={() => handleSettingsClick(project.slug)}
                />
              ))}
            </div>
          </div>
        )}
      </Page.Content>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onPickFolder={pickFolderAndCreate}
      />
    </Page>
  );
}
