import type { RegistryItem } from "@/web/components/store/registry-items-section";
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
          <h2 className="text-lg font-medium mb-3">Overview</h2>
          <p className="text-muted-foreground leading-relaxed">
            {data.description}
          </p>
        </div>
      )}

      {/* Publisher */}
      <div className="px-5 border-b border-border">
        <div className="flex items-center gap-3 py-5">
          <div className="w-12 h-12 rounded-lg bg-linear-to-br from-primary/20 to-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0 overflow-hidden">
            {publisherInfo.logo ? (
              <img
                src={publisherInfo.logo}
                alt={data.publisher}
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                  const parent = target.parentElement;
                  if (parent) {
                    const initials =
                      data.publisher ===
                      "io.modelcontextprotocol.registry/official"
                        ? "OR"
                        : data.publisher.substring(0, 2).toUpperCase();
                    parent.innerHTML = initials;
                  }
                }}
                className="w-full h-full object-cover"
              />
            ) : data.publisher ===
              "io.modelcontextprotocol.registry/official" ? (
              "OR"
            ) : (
              data.publisher.substring(0, 2).toUpperCase()
            )}
          </div>
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
        <h2 className="text-lg font-medium mb-3">Technical Details</h2>

        {data.version && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Version</span>
            <span className="text-foreground font-medium">v{data.version}</span>
          </div>
        )}

        {data.connectionType && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Connection Type</span>
            <span className="text-foreground font-medium">
              {data.connectionType}
            </span>
          </div>
        )}

        {data.schemaVersion && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Schema Version</span>
            <span className="text-foreground font-medium">
              {data.schemaVersion}
            </span>
          </div>
        )}

        {data.websiteUrl && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Website</span>
            <a
              href={data.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              <span>Visit</span>
              <Icon name="open_in_new" size={14} />
            </a>
          </div>
        )}

        {data.repository?.url && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Source</span>
            <a
              href={data.repository.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
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
