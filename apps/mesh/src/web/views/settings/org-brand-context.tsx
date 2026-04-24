import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import {
  ChevronDown,
  ChevronRight,
  Edit03,
  LinkExternal01,
  Check,
  Plus,
  Star01,
  Trash01,
  X,
  Globe02,
  Zap,
} from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { toast } from "sonner";
import { Page } from "@/web/components/page";
import { KEYS } from "@/web/lib/query-keys";
import { unwrapToolResult } from "@/web/lib/unwrap-tool-result";
import { usePublicConfig } from "@/web/hooks/use-public-config";
import { track } from "@/web/lib/posthog-client";

// --- Types ---

type BrandColors = {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  foreground?: string;
};

type BrandFonts = {
  heading?: string;
  body?: string;
  code?: string;
};

type BrandContext = {
  id: string;
  organizationId: string;
  name: string;
  domain: string;
  overview: string;
  logo?: string | null;
  favicon?: string | null;
  ogImage?: string | null;
  fonts?: BrandFonts | null;
  colors?: BrandColors | null;
  images?: string[];
  archivedAt?: string | null;
  isDefault?: boolean;
};

// --- Editable card ---

function BrandCard({
  title,
  children,
  onEdit,
  editing,
  onSave,
  onCancel,
  className,
}: {
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
  editing?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border/60 bg-background p-5",
        editing && "ring-2 ring-ring/30",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {title}
        </span>
        {editing ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted hover:bg-muted-foreground/15"
            >
              <X size={13} className="text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={onSave}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 hover:bg-primary/20"
            >
              <Check size={13} className="text-primary" />
            </button>
          </div>
        ) : (
          onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted opacity-0 transition-opacity duration-150 hover:bg-muted-foreground/15 group-hover:opacity-100"
            >
              <Edit03 size={13} className="text-muted-foreground" />
            </button>
          )
        )}
      </div>
      {children}
    </div>
  );
}

// --- Auto-extract banner ---

function AutoExtractBanner({
  onExtract,
  isExtracting,
}: {
  onExtract: (domain: string) => void;
  isExtracting?: boolean;
}) {
  const [domain, setDomain] = useState("");

  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Zap size={18} className="text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Auto-extract brand context
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter your website URL and we'll automatically extract your brand
            colors, fonts, logos, and company overview.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="acme.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="max-w-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && domain.trim() && !isExtracting) {
                  onExtract(domain.trim());
                }
              }}
            />
            <Button
              variant="outline"
              disabled={!domain.trim() || isExtracting}
              onClick={() => onExtract(domain.trim())}
            >
              <Globe02 size={14} />
              {isExtracting ? "Extracting..." : "Extract"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Section: Company Overview (editable) ---

function OverviewSection({
  brand,
  onSave,
}: {
  brand: Partial<BrandContext>;
  onSave: (data: Partial<BrandContext>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(brand.name ?? "");
  const [domain, setDomain] = useState(brand.domain ?? "");
  const [overview, setOverview] = useState(brand.overview ?? "");

  const startEdit = () => {
    setName(brand.name ?? "");
    setDomain(brand.domain ?? "");
    setOverview(brand.overview ?? "");
    setEditing(true);
  };

  const save = () => {
    onSave({ name, domain, overview });
    setEditing(false);
  };

  const isEmpty = !brand.name && !brand.domain && !brand.overview;

  return (
    <BrandCard
      title="Company Overview"
      onEdit={startEdit}
      editing={editing}
      onSave={save}
      onCancel={() => setEditing(false)}
    >
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Company name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Domain
              </label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="acme.com"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Overview
            </label>
            <Textarea
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="Brief description of what the company does..."
              rows={3}
            />
          </div>
        </div>
      ) : isEmpty ? (
        <p className="text-sm text-muted-foreground/60">
          No company info yet. Click edit to add your company name, domain, and
          overview.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold leading-tight text-foreground">
              {brand.name}
            </h2>
            {brand.domain && (
              <a
                href={`https://${brand.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <LinkExternal01 size={11} />
                {brand.domain}
              </a>
            )}
          </div>
          {brand.overview && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {brand.overview}
            </p>
          )}
        </>
      )}
    </BrandCard>
  );
}

// --- Section: Logos ---

function LogosSection({
  brand,
  onSave,
}: {
  brand: Partial<BrandContext>;
  onSave: (data: Partial<BrandContext>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [logo, setLogo] = useState(brand.logo ?? "");
  const [favicon, setFavicon] = useState(brand.favicon ?? "");
  const [ogImage, setOgImage] = useState(brand.ogImage ?? "");

  const startEdit = () => {
    setLogo(brand.logo ?? "");
    setFavicon(brand.favicon ?? "");
    setOgImage(brand.ogImage ?? "");
    setEditing(true);
  };

  const save = () => {
    onSave({
      logo: logo || null,
      favicon: favicon || null,
      ogImage: ogImage || null,
    });
    setEditing(false);
  };

  const hasLogos = brand.logo || brand.favicon || brand.ogImage;

  return (
    <BrandCard
      title="Logos & Images"
      onEdit={startEdit}
      editing={editing}
      onSave={save}
      onCancel={() => setEditing(false)}
    >
      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Logo URL
            </label>
            <Input
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Favicon URL
            </label>
            <Input
              value={favicon}
              onChange={(e) => setFavicon(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              OG Image URL
            </label>
            <Input
              value={ogImage}
              onChange={(e) => setOgImage(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
      ) : hasLogos ? (
        <div className="flex gap-2">
          {brand.logo && (
            <div
              className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%), linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%)",
                backgroundSize: "8px 8px",
                backgroundPosition: "0 0, 4px 4px",
                backgroundColor: "#fff",
              }}
            >
              <img
                src={brand.logo}
                alt="Logo"
                className="h-full w-full object-contain p-2"
              />
            </div>
          )}
          {brand.favicon && (
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%), linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%)",
                backgroundSize: "8px 8px",
                backgroundPosition: "0 0, 4px 4px",
                backgroundColor: "#fff",
              }}
            >
              <img
                src={brand.favicon}
                alt="Favicon"
                className="h-8 w-8 object-contain"
              />
            </div>
          )}
          {brand.ogImage && (
            <div className="h-16 flex-1 overflow-hidden rounded-xl">
              <img
                src={brand.ogImage}
                alt="OG"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/60">
          No logos added yet. Click edit to add logo, favicon, and OG image
          URLs.
        </p>
      )}
    </BrandCard>
  );
}

// --- Section: Fonts ---

const FONT_ROLES = [
  { key: "heading" as const, label: "Headings" },
  { key: "body" as const, label: "Body" },
  { key: "code" as const, label: "Code" },
];

function FontsSection({
  brand,
  onSave,
}: {
  brand: Partial<BrandContext>;
  onSave: (data: Partial<BrandContext>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fonts, setFonts] = useState<BrandFonts>(brand.fonts ?? {});

  const startEdit = () => {
    setFonts(brand.fonts ?? {});
    setEditing(true);
  };

  const save = () => {
    const hasAny = Object.values(fonts).some((v) => v?.trim());
    onSave({ fonts: hasAny ? fonts : null });
    setEditing(false);
  };

  const hasFonts =
    brand.fonts && Object.values(brand.fonts).some((v) => v?.trim());

  return (
    <BrandCard
      title="Fonts"
      onEdit={startEdit}
      editing={editing}
      onSave={save}
      onCancel={() => setEditing(false)}
    >
      {editing ? (
        <div className="space-y-2">
          {FONT_ROLES.map(({ key, label }) => (
            <div key={key}>
              <label className="mb-1 block text-xs text-muted-foreground">
                {label}
              </label>
              <Input
                value={fonts[key] ?? ""}
                onChange={(e) => setFonts({ ...fonts, [key]: e.target.value })}
                placeholder={`Font family for ${label.toLowerCase()}`}
              />
            </div>
          ))}
        </div>
      ) : hasFonts ? (
        <div className="space-y-3">
          {FONT_ROLES.filter(({ key }) => brand.fonts?.[key]).map(
            ({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <span className="w-9 text-xl font-medium leading-none text-foreground">
                  Aa
                </span>
                <div>
                  <p className="text-sm font-medium leading-none text-foreground">
                    {brand.fonts![key]}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {label}
                  </p>
                </div>
              </div>
            ),
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/60">
          No fonts defined. Click edit to add your brand fonts.
        </p>
      )}
    </BrandCard>
  );
}

// --- Section: Colors ---

const COLOR_ROLES = [
  { key: "primary" as const, label: "Primary" },
  { key: "secondary" as const, label: "Secondary" },
  { key: "accent" as const, label: "Accent" },
  { key: "background" as const, label: "Background" },
  { key: "foreground" as const, label: "Foreground" },
];

function ColorsSection({
  brand,
  onSave,
}: {
  brand: Partial<BrandContext>;
  onSave: (data: Partial<BrandContext>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [colors, setColors] = useState<BrandColors>(brand.colors ?? {});

  const startEdit = () => {
    setColors(brand.colors ?? {});
    setEditing(true);
  };

  const save = () => {
    const hasAny = Object.values(colors).some((v) => v?.trim());
    onSave({ colors: hasAny ? colors : null });
    setEditing(false);
  };

  const hasColors =
    brand.colors && Object.values(brand.colors).some((v) => v?.trim());

  return (
    <BrandCard
      title="Colors"
      onEdit={startEdit}
      editing={editing}
      onSave={save}
      onCancel={() => setEditing(false)}
    >
      {editing ? (
        <div className="space-y-2">
          {COLOR_ROLES.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="color"
                value={colors[key] ?? "#000000"}
                onChange={(e) =>
                  setColors({ ...colors, [key]: e.target.value })
                }
                className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
              />
              <Input
                value={colors[key] ?? ""}
                onChange={(e) =>
                  setColors({ ...colors, [key]: e.target.value })
                }
                placeholder="#000000"
                className="w-28"
              />
              <span className="flex-1 text-xs text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>
      ) : hasColors ? (
        <div className="flex flex-wrap gap-4">
          {COLOR_ROLES.filter(({ key }) => brand.colors?.[key]).map(
            ({ key, label }) => (
              <div key={key} className="flex flex-col items-center gap-2">
                <div
                  className="h-14 w-14 rounded-full shadow-sm"
                  style={{
                    backgroundColor: brand.colors![key],
                    border:
                      brand.colors![key] === "#FFFFFF"
                        ? "1px solid #e5e7eb"
                        : undefined,
                  }}
                />
                <p className="font-mono text-[10px] text-muted-foreground">
                  {brand.colors![key]}
                </p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ),
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/60">
          No colors defined. Click edit to add your brand palette.
        </p>
      )}
    </BrandCard>
  );
}

// --- Expandable brand entry ---

function ExpandableBrandEntry({
  brand,
  client,
  onChanged,
  archived,
}: {
  brand: BrandContext;
  client: ReturnType<typeof useMCPClient>;
  onChanged: () => void;
  archived?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const { mutate: saveBrand } = useMutation({
    mutationFn: async (data: Partial<BrandContext>) => {
      const merged = {
        id: brand.id,
        name: data.name ?? brand.name ?? "",
        domain: data.domain ?? brand.domain ?? "",
        overview: data.overview ?? brand.overview ?? "",
        logo: "logo" in data ? data.logo : brand.logo,
        favicon: "favicon" in data ? data.favicon : brand.favicon,
        ogImage: "ogImage" in data ? data.ogImage : brand.ogImage,
        fonts: "fonts" in data ? data.fonts : brand.fonts,
        colors: "colors" in data ? data.colors : brand.colors,
        images: "images" in data ? data.images : brand.images,
      };
      await client.callTool({
        name: "BRAND_CONTEXT_UPDATE",
        arguments: merged,
      });
    },
    onSuccess: (_res, data) => {
      track("brand_updated", {
        brand_id: brand.id,
        fields: Object.keys(data),
      });
      onChanged();
      toast.success("Brand context saved");
    },
    onError: () => toast.error("Failed to save brand context"),
  });

  const { mutate: toggleArchive, isPending: isToggling } = useMutation({
    mutationFn: async () => {
      if (archived) {
        // Unarchive: clear archivedAt via update
        await client.callTool({
          name: "BRAND_CONTEXT_UPDATE",
          arguments: { id: brand.id, archivedAt: null },
        });
      } else {
        await client.callTool({
          name: "BRAND_CONTEXT_DELETE",
          arguments: { id: brand.id },
        });
      }
    },
    onSuccess: () => {
      track(archived ? "brand_restored" : "brand_archived", {
        brand_id: brand.id,
      });
      onChanged();
      toast.success(archived ? "Brand restored" : "Brand archived");
    },
    onError: () =>
      toast.error(
        archived ? "Failed to restore brand" : "Failed to archive brand",
      ),
  });

  const { mutate: setAsDefault } = useMutation({
    mutationFn: async () => {
      await client.callTool({
        name: "BRAND_CONTEXT_UPDATE",
        arguments: { id: brand.id, isDefault: true },
      });
    },
    onSuccess: () => {
      track("brand_set_as_default", { brand_id: brand.id });
      onChanged();
      toast.success("Set as default brand");
    },
    onError: () => toast.error("Failed to set default brand"),
  });

  return (
    <div
      className={cn(
        "rounded-2xl border bg-background",
        brand.isDefault ? "border-primary/30" : "border-border/60",
      )}
    >
      {/* Collapsed header — always visible */}
      <button
        type="button"
        className="flex w-full items-center gap-3 p-5"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* Logo thumbnail */}
        {brand.logo ? (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%), linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%)",
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0, 3px 3px",
              backgroundColor: "#fff",
            }}
          >
            <img
              src={brand.logo}
              alt=""
              className="h-full w-full object-contain p-1"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <span className="text-xs font-medium text-muted-foreground">
              {brand.name?.charAt(0)?.toUpperCase() || "?"}
            </span>
          </div>
        )}

        <div className="flex flex-1 flex-col items-start gap-0.5 overflow-hidden text-left">
          <span className="text-sm font-medium text-foreground">
            {brand.name || "Untitled Brand"}
          </span>
          {brand.domain && (
            <span className="truncate text-xs text-muted-foreground">
              {brand.domain}
            </span>
          )}
        </div>

        {/* Color swatches */}
        {brand.colors && Object.values(brand.colors).some((v) => v) && (
          <div className="flex shrink-0 gap-1">
            {Object.entries(brand.colors)
              .filter(([, v]) => v)
              .map(([role, value]) => (
                <div
                  key={role}
                  className="h-5 w-5 rounded-full border border-border/40"
                  style={{ backgroundColor: value }}
                  title={`${role}: ${value}`}
                />
              ))}
          </div>
        )}

        {/* Font names */}
        {brand.fonts && Object.values(brand.fonts).some((v) => v) && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {Object.values(brand.fonts).filter(Boolean).join(", ")}
          </span>
        )}

        {/* Default star */}
        {!archived && (
          <span
            role="button"
            tabIndex={0}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-opacity",
              brand.isDefault
                ? "opacity-100"
                : "opacity-0 hover:bg-muted group-hover:opacity-100",
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!brand.isDefault) setAsDefault();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                if (!brand.isDefault) setAsDefault();
              }
            }}
            title={brand.isDefault ? "Default brand" : "Set as default"}
          >
            <Star01
              size={13}
              className={cn(
                brand.isDefault
                  ? "text-primary fill-primary"
                  : "text-muted-foreground",
              )}
            />
          </span>
        )}

        {/* Archive */}
        <span
          role="button"
          tabIndex={0}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            toggleArchive();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              toggleArchive();
            }
          }}
        >
          {isToggling ? (
            <span className="text-[10px] text-muted-foreground">...</span>
          ) : (
            <Trash01 size={13} className="text-muted-foreground" />
          )}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="space-y-3 px-5 pb-5">
          <OverviewSection brand={brand} onSave={saveBrand} />

          <div className="grid grid-cols-2 gap-3">
            <LogosSection brand={brand} onSave={saveBrand} />
            <FontsSection brand={brand} onSave={saveBrand} />
          </div>

          <ColorsSection brand={brand} onSave={saveBrand} />
        </div>
      )}
    </div>
  );
}

// --- Main page ---

export function OrgBrandContextPage() {
  const { brandExtractEnabled } = usePublicConfig();
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  const { data: allBrands = [] } = useQuery<BrandContext[]>({
    queryKey: KEYS.brandContext(org.id),
    queryFn: async () => {
      const result = await client.callTool({
        name: "BRAND_CONTEXT_LIST",
        arguments: { includeArchived: true },
      });
      const data = unwrapToolResult<{ items?: BrandContext[] }>(result);
      return Array.isArray(data?.items) ? data.items : [];
    },
  });

  const activeBrands = allBrands.filter((b) => !b.archivedAt);
  const archivedBrands = allBrands.filter((b) => b.archivedAt);
  const [showArchived, setShowArchived] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: KEYS.brandContext(org.id),
      refetchType: "all",
    });

  const { mutate: createBrand, isPending: isCreating } = useMutation({
    mutationFn: async () => {
      await client.callTool({
        name: "BRAND_CONTEXT_CREATE",
        arguments: {
          name: "New Brand",
          domain: "example.com",
          overview: "",
        },
      });
    },
    onSuccess: () => {
      track("brand_created");
      invalidate();
      toast.success("Brand created");
    },
    onError: () => toast.error("Failed to create brand"),
  });

  const { mutate: extractBrand, isPending: isExtracting } = useMutation({
    mutationFn: async (domain: string) => {
      track("brand_extract_started", { domain });
      const result = await client.callTool({
        name: "BRAND_CONTEXT_EXTRACT",
        arguments: { domain },
      });
      // callTool doesn't throw on tool errors — check isError
      unwrapToolResult(result);
    },
    onSuccess: () => {
      track("brand_extract_succeeded");
      invalidate();
      toast.success("Brand extracted successfully");
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : "Failed to extract brand",
      ),
  });

  return (
    <Page>
      <Page.Content>
        <Page.Body>
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <Page.Title>Brand Context</Page.Title>
                <p className="mt-1 text-sm text-muted-foreground">
                  Define your brand profiles. Each brand is available as an MCP
                  prompt for AI clients.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => createBrand()}
                disabled={isCreating}
              >
                <Plus size={14} />
                Add Brand
              </Button>
            </div>

            {brandExtractEnabled && (
              <AutoExtractBanner
                onExtract={(domain) => extractBrand(domain)}
                isExtracting={isExtracting}
              />
            )}

            {activeBrands.length === 0 && archivedBrands.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No brands configured yet.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => createBrand()}
                  disabled={isCreating}
                >
                  <Plus size={14} />
                  Add your first brand
                </Button>
              </div>
            )}

            <div className="group space-y-3">
              {activeBrands.map((brand) => (
                <ExpandableBrandEntry
                  key={brand.id}
                  brand={brand}
                  client={client}
                  onChanged={invalidate}
                />
              ))}
            </div>

            {archivedBrands.length > 0 && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowArchived(!showArchived)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                >
                  <ChevronRight
                    size={12}
                    className={cn(
                      "transition-transform",
                      showArchived && "rotate-90",
                    )}
                  />
                  {archivedBrands.length} archived
                </button>

                {showArchived && (
                  <div className="space-y-3 opacity-60">
                    {archivedBrands.map((brand) => (
                      <ExpandableBrandEntry
                        key={brand.id}
                        brand={brand}
                        client={client}
                        onChanged={invalidate}
                        archived
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Page.Body>
      </Page.Content>
    </Page>
  );
}
