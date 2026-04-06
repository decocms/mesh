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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash01 } from "@untitledui/icons";
import { useState } from "react";
import { toast } from "sonner";

interface BrandContextData {
  organizationId: string;
  name?: string;
  domain?: string;
  overview?: string;
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

  const { data: brandContext } = useQuery({
    queryKey: KEYS.brandContext(org.id),
    queryFn: async () => {
      const result = (await client.callTool({
        name: "BRAND_CONTEXT_GET",
        arguments: {},
      })) as { structuredContent?: BrandContextData };
      return (result.structuredContent ?? {}) as BrandContextData;
    },
    staleTime: 30_000,
  });

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [overview, setOverview] = useState("");
  const [logo, setLogo] = useState("");
  const [favicon, setFavicon] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [fonts, setFonts] = useState<FontEntry[]>([]);
  const [colors, setColors] = useState<ColorEntry[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Sync from server data on first load
  if (brandContext && !initialized) {
    setName(brandContext.name ?? "");
    setDomain(brandContext.domain ?? "");
    setOverview(brandContext.overview ?? "");
    setLogo(brandContext.logo ?? "");
    setFavicon(brandContext.favicon ?? "");
    setOgImage(brandContext.ogImage ?? "");
    setFonts(fontsToEntries(brandContext.fonts));
    setColors(colorsToEntries(brandContext.colors));
    setInitialized(true);
  }

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      if (!name || !domain || !overview) {
        throw new Error("Name, domain, and overview are required");
      }
      await client.callTool({
        name: "BRAND_CONTEXT_UPDATE",
        arguments: {
          name,
          domain,
          overview,
          logo: logo || null,
          favicon: favicon || null,
          ogImage: ogImage || null,
          fonts: entriesToFonts(fonts),
          colors: entriesToColors(colors),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.brandContext(org.id) });
      toast.success("Brand context updated");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <Page>
      <Page.Content>
        <Page.Body>
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <Page.Title>Brand Context</Page.Title>
              <Button onClick={() => save()} disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>

            {/* Company Overview */}
            <Card className="p-6">
              <CardHeader className="p-0">
                <CardTitle className="text-sm">Company Overview</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-0 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Name
                    </Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Company name"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Domain
                    </Label>
                    <Input
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="example.com"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Overview
                  </Label>
                  <Textarea
                    value={overview}
                    onChange={(e) => setOverview(e.target.value)}
                    placeholder="What does your company do?"
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Logos */}
            <Card className="p-6">
              <CardHeader className="p-0">
                <CardTitle className="text-sm">Logos</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-0 pt-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Logo URL
                  </Label>
                  <Input
                    value={logo}
                    onChange={(e) => setLogo(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Favicon URL
                  </Label>
                  <Input
                    value={favicon}
                    onChange={(e) => setFavicon(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">
                    OG Image URL
                  </Label>
                  <Input
                    value={ogImage}
                    onChange={(e) => setOgImage(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Fonts */}
            <Card className="p-6">
              <CardHeader className="flex flex-row items-center justify-between p-0">
                <CardTitle className="text-sm">Fonts</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setFonts([...fonts, { family: "", weight: "", style: "" }])
                  }
                >
                  <Plus size={14} className="mr-1" />
                  Add
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 p-0 pt-4">
                {fonts.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No fonts configured
                  </p>
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
                          setFonts(next);
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
                          setFonts(next);
                        }}
                        placeholder="400"
                      />
                    </div>
                    <div className="flex w-24 flex-col gap-1">
                      {i === 0 && (
                        <Label className="text-xs text-muted-foreground">
                          Style
                        </Label>
                      )}
                      <Input
                        value={font.style}
                        onChange={(e) => {
                          const next = [...fonts];
                          next[i] = { ...font, style: e.target.value };
                          setFonts(next);
                        }}
                        placeholder="normal"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setFonts(fonts.filter((_, j) => j !== i))}
                    >
                      <Trash01 size={14} />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Colors */}
            <Card className="p-6">
              <CardHeader className="flex flex-row items-center justify-between p-0">
                <CardTitle className="text-sm">Colors</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setColors([...colors, { name: "", value: "" }])
                  }
                >
                  <Plus size={14} className="mr-1" />
                  Add
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 p-0 pt-4">
                {colors.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No colors configured
                  </p>
                )}
                {colors.map((color, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      {i === 0 && (
                        <Label className="text-xs text-muted-foreground">
                          Name
                        </Label>
                      )}
                      <Input
                        value={color.name}
                        onChange={(e) => {
                          const next = [...colors];
                          next[i] = { ...color, name: e.target.value };
                          setColors(next);
                        }}
                        placeholder="primary"
                      />
                    </div>
                    <div className="flex w-36 flex-col gap-1">
                      {i === 0 && (
                        <Label className="text-xs text-muted-foreground">
                          Value
                        </Label>
                      )}
                      <div className="flex items-center gap-2">
                        <Input
                          value={color.value}
                          onChange={(e) => {
                            const next = [...colors];
                            next[i] = { ...color, value: e.target.value };
                            setColors(next);
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
                              backgroundColor: /^#[0-9a-fA-F]{3,8}$/.test(
                                color.value,
                              )
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
                      onClick={() =>
                        setColors(colors.filter((_, j) => j !== i))
                      }
                    >
                      <Trash01 size={14} />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </Page.Body>
      </Page.Content>
    </Page>
  );
}
