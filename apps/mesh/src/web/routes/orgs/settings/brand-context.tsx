import { useState } from "react";
import { cn } from "@deco/ui/lib/utils.ts";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Separator } from "@deco/ui/components/separator.tsx";
import { Slider } from "@deco/ui/components/slider.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deco/ui/components/tabs.tsx";
import { Plus, Trash01, Edit05, CheckCircle, XClose } from "@untitledui/icons";
import {
  buildMockContextData,
  type BrandContextData,
  type BrandColor,
  type ProductDetail,
  type CompetitorDetail,
  type SeoFinding,
  type SeoSignal,
} from "@/web/components/brand-context/mock-data";

// ── Editable Tag List ─────────────────────────────────────────────────────────

function EditableTagList({
  tags,
  onChange,
  placeholder,
  variant = "outline",
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  variant?: "outline" | "secondary";
}) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");

  function handleAdd() {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setNewTag("");
    setAdding(false);
  }

  function handleRemove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant={variant}
          className="gap-1 pr-1 cursor-default group"
        >
          {tag}
          <button
            type="button"
            onClick={() => handleRemove(tag)}
            className="size-3.5 rounded-full flex items-center justify-center opacity-50 hover:opacity-100 hover:bg-destructive/10 transition-opacity cursor-pointer"
            aria-label={`Remove ${tag}`}
          >
            <XClose size={8} />
          </button>
        </Badge>
      ))}
      {adding ? (
        <div className="flex items-center gap-1">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") {
                setAdding(false);
                setNewTag("");
              }
            }}
            placeholder={placeholder ?? "Add..."}
            className="h-6 w-24 text-xs px-2 rounded-md"
            autoFocus
          />
          <button
            type="button"
            onClick={handleAdd}
            className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <CheckCircle size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
        >
          <Plus size={10} />
          Add
        </button>
      )}
    </div>
  );
}

// ── Editable Color Swatch ─────────────────────────────────────────────────────

function ColorSwatch({
  color,
  onChange,
  onRemove,
}: {
  color: BrandColor;
  onChange: (c: BrandColor) => void;
  onRemove: () => void;
}) {
  return (
    <div className="group relative flex flex-col gap-1.5">
      <div className="relative">
        <label
          className="block h-12 rounded-lg border border-border shadow-xs cursor-pointer overflow-hidden"
          style={{ backgroundColor: color.hex }}
        >
          <input
            type="color"
            value={color.hex}
            onChange={(e) => onChange({ ...color, hex: e.target.value })}
            className="opacity-0 absolute inset-0 cursor-pointer"
            aria-label={`Pick color for ${color.name}`}
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm cursor-pointer"
          aria-label={`Remove ${color.name}`}
        >
          <XClose size={8} />
        </button>
      </div>
      <Input
        value={color.name}
        onChange={(e) => onChange({ ...color, name: e.target.value })}
        className="h-6 text-[10px] px-1.5 text-center rounded-md"
        aria-label="Color name"
      />
      <Input
        value={color.hex}
        onChange={(e) => onChange({ ...color, hex: e.target.value })}
        className="h-5 text-[10px] px-1.5 font-mono text-center text-muted-foreground rounded-md"
        aria-label="Hex value"
      />
    </div>
  );
}

// ── Score Donut ───────────────────────────────────────────────────────────────

function ScoreDonut({ score, label }: { score: number; label: string }) {
  const r = 22;
  const cx = 30;
  const cy = 30;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const color =
    score >= 70
      ? "oklch(0.72 0.19 142)"
      : score >= 40
        ? "oklch(0.80 0.18 84)"
        : "oklch(0.64 0.22 25)";

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className="relative">
        <svg
          width="56"
          height="56"
          viewBox="0 0 60 60"
          aria-label={`${label}: ${score}`}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-muted"
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-sm font-semibold tabular-nums leading-none"
            style={{ color }}
          >
            {score}
          </span>
        </div>
      </div>
      <span className="text-[10px] font-medium text-muted-foreground leading-none">
        {label}
      </span>
    </div>
  );
}

// ── Brand Tab ─────────────────────────────────────────────────────────────────

function BrandTab({
  data,
  onChange,
}: {
  data: BrandContextData;
  onChange: (d: BrandContextData) => void;
}) {
  const brand = data.brand;

  function updateBrand(patch: Partial<typeof brand>) {
    onChange({ ...data, brand: { ...brand, ...patch } });
  }

  function updateColor(idx: number, color: BrandColor) {
    const colors = [...brand.colors];
    colors[idx] = color;
    updateBrand({ colors });
  }

  function removeColor(idx: number) {
    updateBrand({ colors: brand.colors.filter((_, i) => i !== idx) });
  }

  function addColor() {
    updateBrand({
      colors: [...brand.colors, { name: "New Color", hex: "#888888" }],
    });
  }

  function updateToneExample(
    type: "good" | "avoid",
    idx: number,
    value: string,
  ) {
    const examples = { ...data.toneExamples };
    const list = [...examples[type]];
    list[idx] = value;
    onChange({ ...data, toneExamples: { ...examples, [type]: list } });
  }

  function addToneExample(type: "good" | "avoid") {
    const examples = { ...data.toneExamples };
    onChange({
      ...data,
      toneExamples: {
        ...examples,
        [type]: [...examples[type], ""],
      },
    });
  }

  function removeToneExample(type: "good" | "avoid", idx: number) {
    const examples = { ...data.toneExamples };
    onChange({
      ...data,
      toneExamples: {
        ...examples,
        [type]: examples[type].filter((_, i) => i !== idx),
      },
    });
  }

  return (
    <div className="space-y-8">
      {/* Identity fields */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          Brand Identity
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="brand-name">Company Name</Label>
            <Input
              id="brand-name"
              value={brand.name}
              onChange={(e) => updateBrand({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-tagline">Tagline</Label>
            <Input
              id="brand-tagline"
              value={brand.tagline}
              onChange={(e) => updateBrand({ tagline: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand-url">Website URL</Label>
          <Input
            id="brand-url"
            value={brand.url}
            onChange={(e) => updateBrand({ url: e.target.value })}
          />
        </div>
      </section>

      <Separator />

      {/* Colors */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Brand Colors
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={addColor}
            className="gap-1.5"
          >
            <Plus size={12} />
            Add Color
          </Button>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
          {brand.colors.map((col, idx) => (
            <ColorSwatch
              key={`${col.name}-${idx}`}
              color={col}
              onChange={(c) => updateColor(idx, c)}
              onRemove={() => removeColor(idx)}
            />
          ))}
        </div>
      </section>

      <Separator />

      {/* Typography */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Typography</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="font-heading">Heading Font</Label>
            <Input
              id="font-heading"
              value={brand.fonts.heading}
              onChange={(e) =>
                updateBrand({
                  fonts: { ...brand.fonts, heading: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="font-body">Body Font</Label>
            <Input
              id="font-body"
              value={brand.fonts.body}
              onChange={(e) =>
                updateBrand({ fonts: { ...brand.fonts, body: e.target.value } })
              }
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* Voice */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Tone of Voice</h3>

        <div className="space-y-1.5">
          <Label>Voice Adjectives</Label>
          <EditableTagList
            tags={brand.toneAdjectives}
            onChange={(tags) => updateBrand({ toneAdjectives: tags })}
            placeholder="e.g. Warm"
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Formal</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(brand.toneSpectrum.formal * 100)}%
              </span>
            </div>
            <Slider
              value={[brand.toneSpectrum.formal * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={([v]) =>
                updateBrand({
                  toneSpectrum: {
                    ...brand.toneSpectrum,
                    formal: (v ?? 0) / 100,
                  },
                })
              }
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Casual</span>
              <span>Formal</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Minimal</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(brand.toneSpectrum.minimal * 100)}%
              </span>
            </div>
            <Slider
              value={[brand.toneSpectrum.minimal * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={([v]) =>
                updateBrand({
                  toneSpectrum: {
                    ...brand.toneSpectrum,
                    minimal: (v ?? 0) / 100,
                  },
                })
              }
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Expressive</span>
              <span>Minimal</span>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* Tone Examples */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Tone Examples</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Good examples */}
          <div className="rounded-xl border border-success/20 bg-success/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-success uppercase tracking-wider">
                Write like this
              </p>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => addToneExample("good")}
                className="gap-1 text-success hover:text-success"
              >
                <Plus size={10} />
                Add
              </Button>
            </div>
            {data.toneExamples.good.map((ex, idx) => (
              <div key={idx} className="flex items-start gap-2 group">
                <div className="mt-2.5 size-1.5 rounded-full bg-success shrink-0" />
                <Textarea
                  value={ex}
                  onChange={(e) =>
                    updateToneExample("good", idx, e.target.value)
                  }
                  className="min-h-8 text-sm italic bg-transparent border-transparent hover:border-input focus-visible:border-ring resize-none"
                  rows={1}
                />
                <button
                  type="button"
                  onClick={() => removeToneExample("good", idx)}
                  className="mt-1.5 size-5 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity cursor-pointer"
                  aria-label="Remove example"
                >
                  <Trash01 size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Avoid examples */}
          <div className="rounded-xl border border-destructive/15 bg-destructive/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-destructive/70 uppercase tracking-wider">
                Avoid
              </p>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => addToneExample("avoid")}
                className="gap-1 text-destructive/70 hover:text-destructive"
              >
                <Plus size={10} />
                Add
              </Button>
            </div>
            {data.toneExamples.avoid.map((ex, idx) => (
              <div key={idx} className="flex items-start gap-2 group">
                <div className="mt-2.5 size-1.5 rounded-full bg-destructive/40 shrink-0" />
                <Textarea
                  value={ex}
                  onChange={(e) =>
                    updateToneExample("avoid", idx, e.target.value)
                  }
                  className="min-h-8 text-sm line-through text-muted-foreground bg-transparent border-transparent hover:border-input focus-visible:border-ring resize-none"
                  rows={1}
                />
                <button
                  type="button"
                  onClick={() => removeToneExample("avoid", idx)}
                  className="mt-1.5 size-5 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity cursor-pointer"
                  aria-label="Remove example"
                >
                  <Trash01 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Audience Tab ──────────────────────────────────────────────────────────────

function AudienceTab({
  data,
  onChange,
}: {
  data: BrandContextData;
  onChange: (d: BrandContextData) => void;
}) {
  const audience = data.audience;

  function updateAudience(patch: Partial<typeof audience>) {
    onChange({ ...data, audience: { ...audience, ...patch } });
  }

  function updatePsychographic(idx: number, value: string) {
    const list = [...audience.psychographics];
    list[idx] = value;
    updateAudience({ psychographics: list });
  }

  function addPsychographic() {
    updateAudience({
      psychographics: [...audience.psychographics, ""],
    });
  }

  function removePsychographic(idx: number) {
    updateAudience({
      psychographics: audience.psychographics.filter((_, i) => i !== idx),
    });
  }

  return (
    <div className="space-y-8">
      {/* Persona */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          Primary Persona
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="persona-title">Persona Title</Label>
            <Input
              id="persona-title"
              value={audience.title}
              onChange={(e) => updateAudience({ title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="persona-age">Age Range</Label>
            <Input
              id="persona-age"
              value={audience.age}
              onChange={(e) => updateAudience({ age: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="persona-lifestyle">Lifestyle Description</Label>
          <Textarea
            id="persona-lifestyle"
            value={audience.lifestyle}
            onChange={(e) => updateAudience({ lifestyle: e.target.value })}
            rows={2}
          />
        </div>
      </section>

      <Separator />

      {/* Values & Channels */}
      <section className="space-y-4">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Values</Label>
            <EditableTagList
              tags={audience.values}
              onChange={(tags) => updateAudience({ values: tags })}
              placeholder="e.g. Quality"
              variant="secondary"
            />
          </div>
          <div className="space-y-2">
            <Label>Preferred Channels</Label>
            <EditableTagList
              tags={audience.channels}
              onChange={(tags) => updateAudience({ channels: tags })}
              placeholder="e.g. Instagram"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* Psychographics */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Behavior &amp; Psychographics
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={addPsychographic}
            className="gap-1.5"
          >
            <Plus size={12} />
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {audience.psychographics.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2 group">
              <div className="mt-3 size-1.5 shrink-0 rounded-full bg-primary/60" />
              <Input
                value={item}
                onChange={(e) => updatePsychographic(idx, e.target.value)}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removePsychographic(idx)}
                className="mt-2 size-5 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity cursor-pointer"
                aria-label="Remove"
              >
                <Trash01 size={12} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onChange,
  onRemove,
}: {
  product: ProductDetail;
  onChange: (p: ProductDetail) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={product.name}
            onChange={(e) => onChange({ ...product, name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={product.description}
            onChange={(e) =>
              onChange({ ...product, description: e.target.value })
            }
            rows={2}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input
              value={product.category}
              onChange={(e) =>
                onChange({ ...product, category: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Accent Color</Label>
            <div className="flex items-center gap-2">
              <label
                className="size-9 rounded-lg border border-border shadow-xs cursor-pointer shrink-0 overflow-hidden"
                style={{ backgroundColor: product.accentColor }}
              >
                <input
                  type="color"
                  value={product.accentColor}
                  onChange={(e) =>
                    onChange({ ...product, accentColor: e.target.value })
                  }
                  className="opacity-0 absolute cursor-pointer"
                  aria-label="Pick accent color"
                />
              </label>
              <Input
                value={product.accentColor}
                onChange={(e) =>
                  onChange({ ...product, accentColor: e.target.value })
                }
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:text-destructive"
          >
            Delete
          </Button>
          <Button size="sm" onClick={() => setEditing(false)}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden group bg-card hover:bg-accent/30 transition-colors">
      <div
        className="relative aspect-[4/3] flex items-center justify-center"
        style={{
          background: `linear-gradient(160deg, ${product.accentColor}18 0%, ${product.accentColor}40 100%)`,
        }}
      >
        <div
          className="flex size-10 items-center justify-center rounded-xl text-lg font-bold"
          style={{
            backgroundColor: `${product.accentColor}30`,
            color: product.accentColor,
          }}
        >
          {product.name[0]}
        </div>
        {product.category && (
          <span
            className="absolute top-2 left-2 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: `${product.accentColor}25`,
              color: product.accentColor,
            }}
          >
            {product.category}
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute top-2 right-2 size-6 rounded-md bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm cursor-pointer"
          aria-label="Edit product"
        >
          <Edit05 size={12} className="text-foreground" />
        </button>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs font-semibold text-foreground leading-snug">
          {product.name}
        </p>
        <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">
          {product.description}
        </p>
      </div>
    </div>
  );
}

function ProductsTab({
  data,
  onChange,
}: {
  data: BrandContextData;
  onChange: (d: BrandContextData) => void;
}) {
  function updateProduct(idx: number, product: ProductDetail) {
    const products = [...data.products];
    products[idx] = product;
    onChange({ ...data, products });
  }

  function removeProduct(idx: number) {
    onChange({ ...data, products: data.products.filter((_, i) => i !== idx) });
  }

  function addProduct() {
    const id = `p${Date.now()}`;
    onChange({
      ...data,
      products: [
        ...data.products,
        {
          id,
          name: "New Product",
          description: "Product description",
          category: "General",
          accentColor: "#6366f1",
          imageUrl: null,
        },
      ],
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Products ({data.products.length})
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={addProduct}
          className="gap-1.5"
        >
          <Plus size={12} />
          Add Product
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {data.products.map((p, idx) => (
          <ProductCard
            key={p.id}
            product={p}
            onChange={(updated) => updateProduct(idx, updated)}
            onRemove={() => removeProduct(idx)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Market Tab ────────────────────────────────────────────────────────────────

function CompetitorRow({
  competitor,
  onChange,
  onRemove,
}: {
  competitor: CompetitorDetail;
  onChange: (c: CompetitorDetail) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left cursor-pointer"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-foreground">
          {competitor.initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {competitor.name}
          </p>
          <p className="text-xs text-muted-foreground">{competitor.url}</p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {competitor.level}
        </Badge>
        <svg
          className={cn(
            "size-4 text-muted-foreground shrink-0 transition-transform duration-200",
            expanded && "rotate-180",
          )}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={competitor.name}
                onChange={(e) =>
                  onChange({ ...competitor, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input
                value={competitor.url}
                onChange={(e) =>
                  onChange({ ...competitor, url: e.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Strengths</Label>
            <EditableTagList
              tags={competitor.strengths}
              onChange={(tags) => onChange({ ...competitor, strengths: tags })}
              placeholder="e.g. Global reach"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Our Differentiator</Label>
            <Textarea
              value={competitor.differentiator}
              onChange={(e) =>
                onChange({ ...competitor, differentiator: e.target.value })
              }
              rows={2}
            />
          </div>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="text-destructive hover:text-destructive"
            >
              <Trash01 size={12} />
              Remove Competitor
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function MarketTab({
  data,
  onChange,
}: {
  data: BrandContextData;
  onChange: (d: BrandContextData) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  function updateCompetitor(idx: number, c: CompetitorDetail) {
    const list = [...data.competitors];
    list[idx] = c;
    onChange({ ...data, competitors: list });
  }

  function removeCompetitor(idx: number) {
    onChange({
      ...data,
      competitors: data.competitors.filter((_, i) => i !== idx),
    });
  }

  function addCompetitor() {
    const id = `c${Date.now()}`;
    onChange({
      ...data,
      competitors: [
        ...data.competitors,
        {
          id,
          name: "New Competitor",
          url: "example.com",
          initials: "NC",
          level: "indirect" as const,
          strengths: [],
          differentiator: "",
        },
      ],
    });
  }

  function barColor(intensity: number, isHovered: boolean): string {
    const alpha = isHovered ? 1 : 0.7;
    if (intensity >= 0.8) return `oklch(0.646 0.222 41.116 / ${alpha})`;
    if (intensity >= 0.55) return `oklch(0.769 0.188 70.08 / ${alpha})`;
    return `oklch(0.92 0.004 286.32 / ${alpha})`;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Competitors ({data.competitors.length})
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={addCompetitor}
            className="gap-1.5"
          >
            <Plus size={12} />
            Add Competitor
          </Button>
        </div>
        <div className="space-y-2">
          {data.competitors.map((c, idx) => (
            <CompetitorRow
              key={c.id}
              competitor={c}
              onChange={(updated) => updateCompetitor(idx, updated)}
              onRemove={() => removeCompetitor(idx)}
            />
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Seasonality</h3>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-end gap-1 h-28 mb-2">
            {data.seasonality.map((p) => {
              const isH = hovered === p.month;
              return (
                <div
                  key={p.month}
                  className="flex-1 flex flex-col items-center cursor-default"
                  onMouseEnter={() => setHovered(p.month)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div
                    className="w-full rounded-t-sm transition-all duration-150"
                    style={{
                      height: `${Math.max(p.intensity * 112, 4)}px`,
                      backgroundColor: barColor(p.intensity, isH),
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1">
            {data.seasonality.map((p) => (
              <div key={p.month} className="flex-1 text-center">
                <p
                  className={cn(
                    "text-[9px] transition-colors duration-100",
                    hovered === p.month
                      ? "text-foreground font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {MONTH_LABELS[p.month]}
                </p>
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
            {data.seasonality
              .filter((p) => p.label)
              .reduce<{ label: string; months: string[] }[]>((acc, p) => {
                const existing = acc.find((a) => a.label === p.label);
                if (existing) {
                  existing.months.push(MONTH_LABELS[p.month] ?? "");
                } else {
                  acc.push({
                    label: p.label!,
                    months: [MONTH_LABELS[p.month] ?? ""],
                  });
                }
                return acc;
              }, [])
              .map((peak) => (
                <div key={peak.label} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "size-2 rounded-full",
                      peak.months.some((m) => ["Nov", "Dec"].includes(m))
                        ? "bg-warning"
                        : "bg-primary",
                    )}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {peak.label} ({peak.months.join(", ")})
                  </span>
                </div>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ── SEO Tab ───────────────────────────────────────────────────────────────────

function SeoTab({ data }: { data: BrandContextData }) {
  const seo = data.seoHealth;

  return (
    <div className="space-y-8">
      {/* Score */}
      <div className="flex items-center gap-5 rounded-xl border border-border bg-card p-5">
        <ScoreDonut score={seo.score} label="SEO Health" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-sm font-semibold text-foreground">
              Overall Score
            </p>
            <Badge variant="warning">{seo.label}</Badge>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-destructive">
                {seo.critical}
              </span>{" "}
              critical
            </span>
            <span>
              <span className="font-semibold text-warning">{seo.medium}</span>{" "}
              medium
            </span>
            <span>
              <span className="font-semibold text-muted-foreground">
                {seo.low}
              </span>{" "}
              low
            </span>
          </div>
        </div>
      </div>

      {/* On-page + findings */}
      <div className="grid grid-cols-2 gap-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            On-Page Signals
          </h3>
          <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
            {data.seoOnPage.map((signal: SeoSignal) => {
              const dotColor = {
                pass: "bg-success",
                warn: "bg-warning",
                fail: "bg-destructive",
              }[signal.status];
              const valueColor = {
                pass: "text-muted-foreground",
                warn: "text-warning",
                fail: "text-destructive",
              }[signal.status];
              return (
                <div
                  key={signal.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <div
                    className={cn("size-1.5 shrink-0 rounded-full", dotColor)}
                  />
                  <p className="text-sm text-foreground flex-1">
                    {signal.label}
                  </p>
                  <p className={cn("text-xs font-medium", valueColor)}>
                    {signal.value}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Key Findings
          </h3>
          <div className="space-y-2">
            {seo.findings.map((f: SeoFinding) => {
              const cfg = {
                critical: {
                  dot: "bg-destructive",
                  badge: "destructive" as const,
                },
                medium: {
                  dot: "bg-warning",
                  badge: "warning" as const,
                },
                low: {
                  dot: "bg-muted-foreground/40",
                  badge: "outline" as const,
                },
              }[f.severity];
              return (
                <div
                  key={f.id}
                  className="rounded-xl border border-border bg-card px-4 py-3 space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn("size-1.5 shrink-0 rounded-full", cfg.dot)}
                    />
                    <p className="text-sm font-medium text-foreground flex-1">
                      {f.issue}
                    </p>
                    <Badge variant={cfg.badge} className="text-[10px]">
                      {f.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug pl-3.5">
                    {f.impact}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BrandContextPage() {
  const [data, setData] = useState<BrandContextData>(buildMockContextData);

  const brand = data.brand;
  const c = (i: number) => brand.colors[i]?.hex ?? "#888";
  const initials = brand.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    <div className="p-5 sm:p-8 max-w-4xl space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Brand Context</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your brand identity, voice, audience, and market context — powering
          all your agents.
        </p>
      </div>

      {/* Brand summary card */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card">
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${c(0)}, ${c(1)})`,
          }}
        />
        <div className="relative flex items-center gap-4 p-5">
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-xl text-base font-bold shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${c(0)}, ${c(1)})`,
              color: "white",
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground leading-tight">
              {brand.name}
            </p>
            <p className="text-sm text-muted-foreground italic">
              {brand.tagline}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {brand.colors.slice(0, 4).map((col, i) => (
              <div
                key={`${col.name}-${i}`}
                title={`${col.name}: ${col.hex}`}
                className="size-6 rounded-md border border-border/50 shadow-xs"
                style={{ backgroundColor: col.hex }}
              />
            ))}
          </div>
          <Separator orientation="vertical" className="hidden sm:block h-10" />
          <ScoreDonut score={data.seoHealth.score} label="SEO" />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="brand" variant="underline">
        <TabsList variant="underline">
          <TabsTrigger value="brand" variant="underline">
            Brand
          </TabsTrigger>
          <TabsTrigger value="audience" variant="underline">
            Audience
          </TabsTrigger>
          <TabsTrigger value="products" variant="underline">
            Products
          </TabsTrigger>
          <TabsTrigger value="market" variant="underline">
            Market
          </TabsTrigger>
          <TabsTrigger value="seo" variant="underline">
            SEO
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brand" className="pt-6">
          <BrandTab data={data} onChange={setData} />
        </TabsContent>
        <TabsContent value="audience" className="pt-6">
          <AudienceTab data={data} onChange={setData} />
        </TabsContent>
        <TabsContent value="products" className="pt-6">
          <ProductsTab data={data} onChange={setData} />
        </TabsContent>
        <TabsContent value="market" className="pt-6">
          <MarketTab data={data} onChange={setData} />
        </TabsContent>
        <TabsContent value="seo" className="pt-6">
          <SeoTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
