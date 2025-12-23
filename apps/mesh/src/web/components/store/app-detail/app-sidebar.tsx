import type { RegistryItem } from "@/web/components/store/registry-items-section";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import type { AppData, PublisherInfo } from "./types";

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

interface AppSidebarProps {
  data: AppData;
  publisherInfo: PublisherInfo;
  selectedItem: RegistryItem;
}

export function AppSidebar({
  data,
  publisherInfo,
  selectedItem,
}: AppSidebarProps) {
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
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              {publisherInfo.count > 0 ? (
                <>
                  <img src="/globe.svg" alt="globe" className="w-3 h-3" />
                  <span>
                    {publisherInfo.count}{" "}
                    {publisherInfo.count === 1
                      ? "published app"
                      : "published apps"}
                  </span>
                </>
              ) : (
                "Publisher"
              )}
            </div>
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
              <Icon name="open_in_new" size={14} />
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
              <Icon name="open_in_new" size={14} />
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
