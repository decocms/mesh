import type { RegistryItem } from "@/web/components/store/types";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { LinkExternal01 } from "@untitledui/icons";
import type { MCPServerData, PublisherInfo } from "./types";

/** Format date to MMM DD, YYYY format */
function formatLastUpdated(date: unknown): string {
  if (!date) return "—";
  try {
    const parsedDate = new Date(date as string);
    if (isNaN(parsedDate.getTime())) return "—";
    return parsedDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

interface MCPServerDetailSidebarProps {
  data: MCPServerData;
  publisherInfo: PublisherInfo;
  selectedItem: RegistryItem;
}

export function MCPServerDetailSidebar({
  data,
  publisherInfo,
  selectedItem,
}: MCPServerDetailSidebarProps) {
  return (
    <div className="lg:col-span-1 flex flex-col pt-5">
      {/* Overview */}
      {data.description && (
        <div className="px-5 pb-5 border-b border-border">
          <h2 className="text-base font-medium mb-3">Overview</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {data.description}
          </p>
        </div>
      )}

      {/* Publisher */}
      <div className="px-5 border-b border-border">
        <div className="flex items-center gap-3 py-5">
          <IntegrationIcon
            icon={publisherInfo.logo}
            name={
              data.publisher === "io.modelcontextprotocol.registry/official"
                ? "Official Registry"
                : data.publisher
            }
            size="sm"
            className="shrink-0 shadow-sm"
          />
          <div>
            <div className="font-medium">
              {data.publisher === "io.modelcontextprotocol.registry/official"
                ? "Official Registry"
                : data.publisher.charAt(0).toUpperCase() +
                  data.publisher.slice(1)}
            </div>
            <div className="text-xs text-muted-foreground">Publisher</div>
          </div>
        </div>
      </div>

      {/* Technical Details */}
      <div className="px-5 py-5 border-b border-border space-y-4">
        {data.version && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-foreground text-sm">Version</span>
            <span className="text-muted-foreground uppercase text-xs">
              v{data.version}
            </span>
          </div>
        )}

        {data.tags && data.tags.length > 0 && (
          <div className="flex justify-between items-start text-sm">
            <span className="text-foreground text-sm">Tags</span>
            <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
              {data.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-muted px-2 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.categories && data.categories.length > 0 && (
          <div className="flex justify-between items-start text-sm">
            <span className="text-foreground text-sm">Categories</span>
            <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
              {data.categories.map((cat) => (
                <span
                  key={cat}
                  className="text-xs bg-muted px-2 py-0.5 rounded"
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.connectionType && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-foreground text-sm">Connection Type</span>
            <span className="text-muted-foreground uppercase text-xs">
              {data.connectionType}
            </span>
          </div>
        )}

        {data.schemaVersion && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-foreground text-sm">Schema Version</span>
            <span className="text-muted-foreground text-xs">
              {data.schemaVersion}
            </span>
          </div>
        )}

        {data.websiteUrl && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-foreground text-sm">Website</span>
            <a
              href={data.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:underline flex items-center gap-1 text-xs"
            >
              <span>Visit</span>
              <LinkExternal01 size={14} />
            </a>
          </div>
        )}

        {data.repository?.url && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-foreground text-sm">Source</span>
            <a
              href={data.repository.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:underline flex items-center gap-1 text-xs"
            >
              <span>GitHub</span>
              <LinkExternal01 size={14} />
            </a>
          </div>
        )}
      </div>

      {/* Last Updated */}
      <div className="px-5 py-5 text-sm flex justify-between items-center border-b border-border">
        <span className="text-foreground text-sm">Last Updated</span>
        <span className="text-muted-foreground uppercase text-xs">
          {formatLastUpdated(selectedItem.updated_at)}
        </span>
      </div>
    </div>
  );
}
