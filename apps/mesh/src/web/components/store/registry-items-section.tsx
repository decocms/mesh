import { RegistryItemCard, extractCardDisplayData } from "./registry-item-card";
import type { MCPRegistryServerMeta } from "./registry-item-card";

/**
 * Generic registry item that can come from various JSON structures.
 * Different registries may use different property names for similar concepts.
 */
export interface RegistryItem {
  /** Unique identifier for the item */
  id: string;
  /** Primary name of the item */
  name?: string;
  /** Alternative name field used by some registries */
  title?: string;
  /** Primary description of the item */
  description?: string;
  /** Alternative description field used by some registries */
  summary?: string;
  /** Icon URL */
  icon?: string;
  /** Alternative icon field */
  image?: string;
  /** Alternative icon field */
  logo?: string;
  /** Whether the item is verified */
  verified?: boolean;
  /** Publisher name */
  publisher?: string;
  /** Publisher logo URL */
  publisher_logo?: string;
  /** Number of published apps */
  published_apps_count?: number;
  /** Available tools */
  tools?: Array<{
    id?: string;
    name?: string;
    description?: string | null;
  }>;
  /** Available models */
  models?: unknown[];
  /** Available emails */
  emails?: unknown[];
  /** Analytics configuration */
  analytics?: unknown;
  /** CDN configuration */
  cdn?: unknown;
  /** Metadata with various provider-specific information */
  _meta?: MCPRegistryServerMeta;
  /** Alternative metadata field */
  meta?: {
    verified?: boolean;
    [key: string]: unknown;
  };
  /** Nested server object (used by MCPRegistryServer format) */
  server?: {
    $schema?: string;
    name?: string;
    title?: string;
    description?: string;
    version?: string;
    websiteUrl?: string;
    repository?: {
      url?: string;
      source?: string;
      subfolder?: string;
    };
    remotes?: Array<{
      type?: string;
      url?: string;
      headers?: Array<{
        name?: string;
        value?: string;
        description?: string;
      }>;
    }>;
    icons?: Array<{ src: string }>;
    tools?: unknown[];
    models?: unknown[];
    emails?: unknown[];
    analytics?: unknown;
    cdn?: unknown;
    _meta?: MCPRegistryServerMeta;
  };
  /** When the item was last updated */
  updated_at?: string | Date;
}

interface RegistryItemsSectionProps {
  items: RegistryItem[];
  title: string;
  subtitle?: string;
  onItemClick: (item: RegistryItem) => void;
  totalCount?: number | null;
}

export function RegistryItemsSection({
  items,
  title,
  onItemClick,
  totalCount,
}: RegistryItemsSectionProps) {
  if (items.length === 0) return null;

  const itemsText =
    totalCount != null
      ? `${items.length} of ${totalCount}`
      : `${items.length} items`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between w-max gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        <span className="block text-xs text-muted-foreground">{itemsText}</span>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {items.map((item) => {
          const displayData = extractCardDisplayData(item);
          return (
            <RegistryItemCard
              key={item.id}
              {...displayData}
              onClick={() => onItemClick(item)}
            />
          );
        })}
      </div>
    </div>
  );
}
