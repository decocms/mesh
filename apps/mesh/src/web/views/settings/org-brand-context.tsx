import { Page } from "@/web/components/page";
import { KEYS } from "@/web/lib/query-keys";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deco/ui/components/card.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { unwrapToolResult } from "@/web/lib/unwrap-tool-result";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash01 } from "@untitledui/icons";
import { useRef, useState } from "react";
import { toast } from "sonner";

interface BrandContextData {
  id: string;
  organizationId: string;
  name: string;
  domain: string;
  overview: string;
  logo?: string | null;
  favicon?: string | null;
  ogImage?: string | null;
  fonts?: Record<string, unknown>[] | null;
  colors?: Record<string, unknown> | null;
  images?: Record<string, unknown>[] | null;
}

interface FontEntry {
  family: string;
  weight: string;
  style: string;
}

interface ColorEntry {
  name: string;
  value: string;
}

function fontsToEntries(
  fonts: Record<string, unknown>[] | null | undefined,
): FontEntry[] {
  if (!fonts || fonts.length === 0) return [];
  return fonts.map((f) => ({
    family: String(f.family ?? ""),
    weight: String(f.weight ?? ""),
    style: String(f.style ?? ""),
  }));
}

function entriesToFonts(
  entries: FontEntry[],
): Record<string, unknown>[] | null {
  const filtered = entries.filter((e) => e.family.trim());
  if (filtered.length === 0) return null;
  return filtered.map((e) => {
    const font: Record<string, unknown> = { family: e.family };
    if (e.weight) font.weight = e.weight;
    if (e.style) font.style = e.style;
    return font;
  });
}

function colorsToEntries(
  colors: Record<string, unknown> | null | undefined,
): ColorEntry[] {
  if (!colors || Object.keys(colors).length === 0) return [];
  return Object.entries(colors).map(([name, value]) => ({
    name,
    value: String(value),
  }));
}

function entriesToColors(
  entries: ColorEntry[],
): Record<string, unknown> | null {
  const filtered = entries.filter((e) => e.name.trim());
  if (filtered.length === 0) return null;
  const result: Record<string, unknown> = {};
  for (const e of filtered) {
    result[e.name] = e.value;
  }
  return result;
}

export function OrgBrandContextPage() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  const { data: brands } = useQuery({
    queryKey: KEYS.brandContext(org.id),
    queryFn: async () => {
      const result = await client.callTool({
        name: "BRAND_CONTEXT_LIST",
        arguments: {},
      });
      const data = unwrapToolResult<{ items: BrandContextData[] }>(result);
      return data.items ?? [];
    },
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
    onError: (err) => toast.error(err.message),
  });

  return (
    <Page>
      <Page.Content>
        <Page.Body>
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <Page.Title>Brand Context</Page.Title>
              <Button
                onClick={() => createBrand()}
                disabled={isCreating}
                variant="outline"
              >
                <Plus size={14} className="mr-1" />
                Add Brand
              </Button>
            </div>

            {(!brands || brands.length === 0) && (
              <Card className="border-dashed p-6">
                <CardContent className="flex flex-col items-center gap-2 p-0 text-center">
                  <p className="text-sm text-muted-foreground">
                    No brands configured yet.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => createBrand()}
                    disabled={isCreating}
                  >
                    <Plus size={14} className="mr-1" />
                    Add your first brand
                  </Button>
                </CardContent>
              </Card>
            )}

            {brands?.map((brand) => (
              <BrandCard
                key={brand.id}
                brand={brand}
                client={client}
                onChanged={invalidate}
              />
            ))}
          </div>
        </Page.Body>
      </Page.Content>
    </Page>
  );
}

function BrandCard({
  brand,
  client,
  onChanged,
}: {
  brand: BrandContextData;
  client: ReturnType<typeof useMCPClient>;
  onChanged: () => void;
}) {
  const [name, setName] = useState(brand.name);
  const [domain, setDomain] = useState(brand.domain);
  const [overview, setOverview] = useState(brand.overview);
  const [logo, setLogo] = useState(brand.logo ?? "");
  const [favicon, setFavicon] = useState(brand.favicon ?? "");
  const [ogImage, setOgImage] = useState(brand.ogImage ?? "");
  const [fonts, setFonts] = useState<FontEntry[]>(fontsToEntries(brand.fonts));
  const [colors, setColors] = useState<ColorEntry[]>(
    colorsToEntries(brand.colors),
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: save, isPending } = useMutation({
    mutationFn: async (args: {
      name: string;
      domain: string;
      overview: string;
      logo: string;
      favicon: string;
      ogImage: string;
      fonts: FontEntry[];
      colors: ColorEntry[];
    }) => {
      if (!args.name || !args.domain) return;
      await client.callTool({
        name: "BRAND_CONTEXT_UPDATE",
        arguments: {
          id: brand.id,
          name: args.name,
          domain: args.domain,
          overview: args.overview,
          logo: args.logo || null,
          favicon: args.favicon || null,
          ogImage: args.ogImage || null,
          fonts: entriesToFonts(args.fonts),
          colors: entriesToColors(args.colors),
          images: brand.images ?? null,
        },
      });
    },
    onSuccess: () => onChanged(),
    onError: (err) => toast.error(err.message),
  });

  const scheduleAutoSave = (
    overrides: Partial<{
      name: string;
      domain: string;
      overview: string;
      logo: string;
      favicon: string;
      ogImage: string;
      fonts: FontEntry[];
      colors: ColorEntry[];
    }>,
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const snapshot = {
      name: overrides.name ?? name,
      domain: overrides.domain ?? domain,
      overview: overrides.overview ?? overview,
      logo: overrides.logo ?? logo,
      favicon: overrides.favicon ?? favicon,
      ogImage: overrides.ogImage ?? ogImage,
      fonts: overrides.fonts ?? fonts,
      colors: overrides.colors ?? colors,
    };
    timerRef.current = setTimeout(() => save(snapshot), 1000);
  };

  const update = <K extends string>(
    setter: (v: string) => void,
    field: K,
    value: string,
  ) => {
    setter(value);
    scheduleAutoSave({ [field]: value } as Record<string, unknown> as never);
  };

  const updateFonts = (next: FontEntry[]) => {
    setFonts(next);
    scheduleAutoSave({ fonts: next });
  };

  const updateColors = (next: ColorEntry[]) => {
    setColors(next);
    scheduleAutoSave({ colors: next });
  };

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
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card className="p-6">
      <CardHeader className="flex flex-row items-center justify-between p-0">
        <CardTitle className="text-sm">
          {brand.name || "Untitled Brand"}
          {isPending && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Saving...
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteBrand()}
            disabled={isDeleting}
          >
            <Trash01 size={14} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 p-0 pt-4">
        {/* Overview */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={name}
                onChange={(e) => update(setName, "name", e.target.value)}
                placeholder="Brand name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Domain</Label>
              <Input
                value={domain}
                onChange={(e) => update(setDomain, "domain", e.target.value)}
                placeholder="example.com"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Overview</Label>
            <Textarea
              value={overview}
              onChange={(e) => update(setOverview, "overview", e.target.value)}
              placeholder="What does this brand represent?"
              rows={3}
            />
          </div>
        </div>

        {/* Logos */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">Logos</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Logo</Label>
              <Input
                value={logo}
                onChange={(e) => update(setLogo, "logo", e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Favicon</Label>
              <Input
                value={favicon}
                onChange={(e) => update(setFavicon, "favicon", e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">OG Image</Label>
              <Input
                value={ogImage}
                onChange={(e) => update(setOgImage, "ogImage", e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        {/* Fonts */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Fonts</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                updateFonts([...fonts, { family: "", weight: "", style: "" }])
              }
            >
              <Plus size={14} className="mr-1" />
              Add
            </Button>
          </div>
          {fonts.length === 0 && (
            <p className="text-xs text-muted-foreground">No fonts configured</p>
          )}
          {fonts.map((font, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                {i === 0 && (
                  <Label className="text-xs text-muted-foreground">
                    Family
                  </Label>
                )}
                <Input
                  value={font.family}
                  onChange={(e) => {
                    const next = [...fonts];
                    next[i] = { ...font, family: e.target.value };
                    updateFonts(next);
                  }}
                  placeholder="Inter"
                />
              </div>
              <div className="flex w-24 flex-col gap-1">
                {i === 0 && (
                  <Label className="text-xs text-muted-foreground">
                    Weight
                  </Label>
                )}
                <Input
                  value={font.weight}
                  onChange={(e) => {
                    const next = [...fonts];
                    next[i] = { ...font, weight: e.target.value };
                    updateFonts(next);
                  }}
                  placeholder="400"
                />
              </div>
              <div className="flex w-24 flex-col gap-1">
                {i === 0 && (
                  <Label className="text-xs text-muted-foreground">Style</Label>
                )}
                <Input
                  value={font.style}
                  onChange={(e) => {
                    const next = [...fonts];
                    next[i] = { ...font, style: e.target.value };
                    updateFonts(next);
                  }}
                  placeholder="normal"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => updateFonts(fonts.filter((_, j) => j !== i))}
              >
                <Trash01 size={14} />
              </Button>
            </div>
          ))}
        </div>

        {/* Colors */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Colors</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateColors([...colors, { name: "", value: "" }])}
            >
              <Plus size={14} className="mr-1" />
              Add
            </Button>
          </div>
          {colors.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No colors configured
            </p>
          )}
          {colors.map((color, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                {i === 0 && (
                  <Label className="text-xs text-muted-foreground">Name</Label>
                )}
                <Input
                  value={color.name}
                  onChange={(e) => {
                    const next = [...colors];
                    next[i] = { ...color, name: e.target.value };
                    updateColors(next);
                  }}
                  placeholder="primary"
                />
              </div>
              <div className="flex w-36 flex-col gap-1">
                {i === 0 && (
                  <Label className="text-xs text-muted-foreground">Value</Label>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    value={color.value}
                    onChange={(e) => {
                      const next = [...colors];
                      next[i] = { ...color, value: e.target.value };
                      updateColors(next);
                    }}
                    placeholder="#0066FF"
                  />
                  <label className="relative h-8 w-8 shrink-0 cursor-pointer rounded border border-border">
                    <input
                      type="color"
                      value={
                        /^#[0-9a-fA-F]{6}$/.test(color.value)
                          ? color.value
                          : "#000000"
                      }
                      onChange={(e) => {
                        const next = [...colors];
                        next[i] = { ...color, value: e.target.value };
                        setColors(next);
                      }}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                    <div
                      className="h-full w-full rounded"
                      style={{
                        backgroundColor: /^#[0-9a-fA-F]{3,8}$/.test(color.value)
                          ? color.value
                          : "#ffffff",
                      }}
                    />
                  </label>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => updateColors(colors.filter((_, j) => j !== i))}
              >
                <Trash01 size={14} />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
