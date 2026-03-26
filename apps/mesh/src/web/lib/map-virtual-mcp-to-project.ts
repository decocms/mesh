/**
 * Maps a VirtualMCP entity to the project data shape expected by ProjectContextProvider.
 */

interface VirtualMCPEntity {
  id: string;
  title: string;
  description: string | null;
  metadata?: Record<string, unknown> | null;
}

export function mapVirtualMcpToProject(
  entity: VirtualMCPEntity,
  organizationId: string,
) {
  const slug =
    (entity.metadata?.migrated_project_slug as string | undefined) ??
    ((entity.metadata?.ui as Record<string, unknown> | null | undefined)
      ?.slug as string | undefined) ??
    entity.id;

  return {
    id: entity.id,
    organizationId,
    slug,
    name: entity.title,
    description: entity.description,
    enabledPlugins: entity.metadata?.enabled_plugins as
      | string[]
      | null
      | undefined,
    ui: entity.metadata?.ui
      ? {
          banner:
            ((entity.metadata.ui as Record<string, unknown>).banner as
              | string
              | null) ?? null,
          bannerColor:
            ((entity.metadata.ui as Record<string, unknown>).bannerColor as
              | string
              | null) ?? null,
          icon:
            ((entity.metadata.ui as Record<string, unknown>).icon as
              | string
              | null) ?? null,
          themeColor:
            ((entity.metadata.ui as Record<string, unknown>).themeColor as
              | string
              | null) ?? null,
          pinnedViews:
            ((entity.metadata.ui as Record<string, unknown>)
              .pinnedViews as Array<{
              connectionId: string;
              toolName: string;
              label: string;
              icon: string | null;
            }> | null) ?? null,
        }
      : null,
  };
}
