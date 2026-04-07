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

// --- Types ---

type BrandContext = {
  id: string;
  organizationId: string;
  name: string;
  domain: string;
  overview: string;
  logo?: string;
  favicon?: string;
  ogImage?: string;
  fonts?: { name: string; role: string }[];
  colors?: { label: string; value: string }[];
  images?: string[];
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
                if (e.key === "Enter" && domain.trim()) {
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
      logo: logo || undefined,
      favicon: favicon || undefined,
      ogImage: ogImage || undefined,
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

function FontsSection({
  brand,
  onSave,
}: {
  brand: Partial<BrandContext>;
  onSave: (data: Partial<BrandContext>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fonts, setFonts] = useState<{ name: string; role: string }[]>(
    brand.fonts ?? [],
  );

  const startEdit = () => {
    setFonts(brand.fonts?.length ? [...brand.fonts] : [{ name: "", role: "" }]);
    setEditing(true);
  };

  const save = () => {
    const validFonts = fonts.filter((f) => f.name.trim());
    onSave({ fonts: validFonts.length ? validFonts : undefined });
    setEditing(false);
  };

  const updateFont = (i: number, field: "name" | "role", value: string) => {
    setFonts(fonts.map((f, j) => (j === i ? { ...f, [field]: value } : f)));
  };

  const addFont = () => setFonts([...fonts, { name: "", role: "" }]);
  const removeFont = (i: number) => setFonts(fonts.filter((_, j) => j !== i));

  const hasFonts = brand.fonts && brand.fonts.length > 0;

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
          {fonts.map((font, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={font.name}
                onChange={(e) => updateFont(i, "name", e.target.value)}
                placeholder="Font name"
                className="flex-1"
              />
              <Input
                value={font.role}
                onChange={(e) => updateFont(i, "role", e.target.value)}
                placeholder="Role (e.g. Headings)"
                className="flex-1"
              />
              <Button variant="ghost" size="icon" onClick={() => removeFont(i)}>
                <X size={13} />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addFont}>
            + Add font
          </Button>
        </div>
      ) : hasFonts ? (
        <div className="space-y-3">
          {brand.fonts!.map((font) => (
            <div
              key={`${font.name}-${font.role}`}
              className="flex items-center gap-3"
            >
              <span className="w-9 text-xl font-medium leading-none text-foreground">
                Aa
              </span>
              <div>
                <p className="text-sm font-medium leading-none text-foreground">
                  {font.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {font.role}
                </p>
              </div>
            </div>
          ))}
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

function ColorsSection({
  brand,
  onSave,
}: {
  brand: Partial<BrandContext>;
  onSave: (data: Partial<BrandContext>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [colors, setColors] = useState<{ label: string; value: string }[]>(
    brand.colors ?? [],
  );

  const startEdit = () => {
    setColors(
      brand.colors?.length
        ? [...brand.colors]
        : [{ label: "", value: "#000000" }],
    );
    setEditing(true);
  };

  const save = () => {
    const validColors = colors.filter((c) => c.label.trim() && c.value.trim());
    onSave({ colors: validColors.length ? validColors : undefined });
    setEditing(false);
  };

  const updateColor = (i: number, field: "label" | "value", value: string) => {
    setColors(colors.map((c, j) => (j === i ? { ...c, [field]: value } : c)));
  };

  const addColor = () =>
    setColors([...colors, { label: "", value: "#000000" }]);
  const removeColor = (i: number) =>
    setColors(colors.filter((_, j) => j !== i));

  const hasColors = brand.colors && brand.colors.length > 0;

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
          {colors.map((color, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={color.value}
                onChange={(e) => updateColor(i, "value", e.target.value)}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
              />
              <Input
                value={color.value}
                onChange={(e) => updateColor(i, "value", e.target.value)}
                placeholder="#000000"
                className="w-28"
              />
              <Input
                value={color.label}
                onChange={(e) => updateColor(i, "label", e.target.value)}
                placeholder="Label (e.g. Primary)"
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeColor(i)}
              >
                <X size={13} />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addColor}>
            + Add color
          </Button>
        </div>
      ) : hasColors ? (
        <div className="flex flex-wrap gap-4">
          {brand.colors!.map((color) => (
            <div key={color.label} className="flex flex-col items-center gap-2">
              <div
                className="h-14 w-14 rounded-full shadow-sm"
                style={{
                  backgroundColor: color.value,
                  border:
                    color.value === "#FFFFFF" ? "1px solid #e5e7eb" : undefined,
                }}
              />
              <p className="font-mono text-[10px] text-muted-foreground">
                {color.value}
              </p>
              <p className="text-[10px] text-muted-foreground">{color.label}</p>
            </div>
          ))}
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
}: {
  brand: BrandContext;
  client: ReturnType<typeof useMCPClient>;
  onChanged: () => void;
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
    onSuccess: () => {
      onChanged();
      toast.success("Brand context saved");
    },
    onError: () => toast.error("Failed to save brand context"),
  });

  const { mutate: deleteBrand, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      await client.callTool({
        name: "BRAND_CONTEXT_DELETE",
        arguments: { id: brand.id },
      });
    },
    onSuccess: () => {
      onChanged();
      toast.success("Brand deleted");
    },
    onError: () => toast.error("Failed to delete brand"),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-background">
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
        {brand.colors && brand.colors.length > 0 && (
          <div className="flex shrink-0 gap-1">
            {brand.colors.slice(0, 5).map((c) => (
              <div
                key={c.label}
                className="h-5 w-5 rounded-full border border-border/40"
                style={{ backgroundColor: c.value }}
                title={`${c.label}: ${c.value}`}
              />
            ))}
            {brand.colors.length > 5 && (
              <span className="flex h-5 items-center text-[10px] text-muted-foreground">
                +{brand.colors.length - 5}
              </span>
            )}
          </div>
        )}

        {/* Font names */}
        {brand.fonts && brand.fonts.length > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {brand.fonts
              .slice(0, 2)
              .map((f) => f.name)
              .filter(Boolean)
              .join(", ")}
            {brand.fonts.length > 2 && ` +${brand.fonts.length - 2}`}
          </span>
        )}

        {/* Delete */}
        <span
          role="button"
          tabIndex={0}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            deleteBrand();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              deleteBrand();
            }
          }}
        >
          {isDeleting ? (
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
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  const { data: brands = [] } = useQuery<BrandContext[]>({
    queryKey: KEYS.brandContext(org.id),
    queryFn: async () => {
      const result = await client.callTool({
        name: "BRAND_CONTEXT_LIST",
        arguments: {},
      });
      const data = unwrapToolResult<{ items?: BrandContext[] }>(result);
      return Array.isArray(data?.items) ? data.items : [];
    },
    staleTime: 60_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: KEYS.brandContext(org.id) });

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
      invalidate();
      toast.success("Brand created");
    },
    onError: () => toast.error("Failed to create brand"),
  });

  const { mutate: extractBrand, isPending: isExtracting } = useMutation({
    mutationFn: async (domain: string) => {
      await client.callTool({
        name: "BRAND_CONTEXT_EXTRACT",
        arguments: { domain },
      });
    },
    onSuccess: () => {
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

            <AutoExtractBanner
              onExtract={(domain) => extractBrand(domain)}
              isExtracting={isExtracting}
            />

            {brands.length === 0 && (
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
              {brands.map((brand) => (
                <ExpandableBrandEntry
                  key={brand.id}
                  brand={brand}
                  client={client}
                  onChanged={invalidate}
                />
              ))}
            </div>
          </div>
        </Page.Body>
      </Page.Content>
    </Page>
  );
}
