import RequiredAuthLayout from "@/web/layouts/required-auth-layout";
import { authClient } from "@/web/lib/auth-client";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  ArrowRight,
  Building02,
  Check,
  CheckCircle,
  Edit03,
  Globe02,
  Globe04,
  LinkExternal01,
  Loading01,
  Palette,
  Plus,
  Users03,
  X,
} from "@untitledui/icons";
import { useSearch } from "@tanstack/react-router";
import { useState, useRef } from "react";

const DEV_MODE = import.meta.env.DEV;

// --- Types ---

type StepStatus = "done" | "active" | "pending";

type BrandData = {
  name: string;
  domain: string;
  overview: string;
  logo?: string | null;
  favicon?: string | null;
  ogImage?: string | null;
  fonts?: { name: string; role: string }[] | null;
  colors?: { label: string; value: string }[] | null;
};

// --- Data ---

const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
  "yandex.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "tutanota.com",
  "fastmail.com",
]);

const SETUP_STEPS = [
  { icon: Building02, label: "Creating organization", delay: 0 },
  { icon: Globe04, label: "Claiming email domain", delay: 1500 },
  { icon: Users03, label: "Enabling auto-join for your team", delay: 3000 },
  { icon: Palette, label: "Extracting brand context", delay: 4500 },
];

const GRID_CELLS = [
  { delay: 0 },
  { delay: 100 },
  { delay: 200 },
  { delay: 100 },
  { delay: 200 },
  { delay: 200 },
  { delay: 300 },
  { delay: 300 },
  { delay: 400 },
];

// --- Helpers ---

function isGenericDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return GENERIC_DOMAINS.has(domain ?? "");
}

function getDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

function getDomainLabel(email: string): string {
  const domain = getDomain(email);
  const name = domain.split(".")[0] ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]+/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Grid loader ---

function GridLoader() {
  const [cellColors] = useState(() => {
    const chart = `var(--chart-${Math.ceil(Math.random() * 5)})`;
    return GRID_CELLS.map(() =>
      Math.random() < 0.6
        ? "color-mix(in srgb, var(--muted-foreground) 25%, transparent)"
        : chart,
    );
  });

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "repeat(3, 3px)",
        gap: "1.5px",
        width: "fit-content",
      }}
    >
      {GRID_CELLS.map(({ delay }, i) => (
        <div
          key={i}
          className="rounded-[1px]"
          style={
            {
              width: 3,
              height: 3,
              "--cell-color": cellColors[i],
              animation: "grid-ripple 1s ease infinite",
              animationDelay: `${delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

// --- Product preview (right panel placeholder) ---

function ProductPreview() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border/50 px-5 py-3">
        <div className="h-5 w-5 rounded bg-muted-foreground/10" />
        <div className="h-3 w-20 rounded-full bg-muted-foreground/8" />
        <div className="ml-auto flex gap-2">
          <div className="h-3 w-12 rounded-full bg-muted-foreground/8" />
          <div className="h-3 w-12 rounded-full bg-muted-foreground/8" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-48 space-y-2 border-r border-border/50 p-3">
          <div className="mb-4 h-3 w-16 rounded-full bg-muted-foreground/8" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2 py-1.5">
              <div className="h-3.5 w-3.5 rounded bg-muted-foreground/8" />
              <div
                className="h-2.5 rounded-full bg-muted-foreground/8"
                style={{ width: `${40 + i * 12}px` }}
              />
            </div>
          ))}
        </div>
        <div className="flex-1 p-5">
          <div className="mb-6 h-4 w-32 rounded-full bg-muted-foreground/10" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="space-y-3 rounded-lg border border-border/40 p-4"
              >
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-muted-foreground/8" />
                  <div className="h-3 w-16 rounded-full bg-muted-foreground/10" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded-full bg-muted-foreground/6" />
                  <div className="h-2 w-3/4 rounded-full bg-muted-foreground/6" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex w-56 flex-col border-l border-border/50 p-3">
          <div className="mb-4 h-3 w-12 rounded-full bg-muted-foreground/8" />
          <div className="flex-1 space-y-3">
            <div className="ml-4 space-y-1.5 rounded-lg bg-muted-foreground/5 p-2.5">
              <div className="h-2 w-full rounded-full bg-muted-foreground/8" />
              <div className="h-2 w-2/3 rounded-full bg-muted-foreground/8" />
            </div>
            <div className="mr-4 space-y-1.5 rounded-lg bg-muted-foreground/5 p-2.5">
              <div className="h-2 w-full rounded-full bg-muted-foreground/8" />
              <div className="h-2 w-4/5 rounded-full bg-muted-foreground/8" />
              <div className="h-2 w-1/2 rounded-full bg-muted-foreground/8" />
            </div>
          </div>
          <div className="mt-auto rounded-lg border border-border/40 p-2.5">
            <div className="h-2.5 w-24 rounded-full bg-muted-foreground/6" />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Step row ---

function StepRow({
  step,
  status,
}: {
  step: (typeof SETUP_STEPS)[number];
  status: StepStatus;
}) {
  const Icon = step.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-3 transition-opacity duration-500",
        status === "pending" ? "opacity-30" : "opacity-100",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        {status === "done" ? (
          <CheckCircle
            size={16}
            className="text-primary transition-colors duration-300"
          />
        ) : status === "active" ? (
          <Loading01 size={16} className="animate-spin text-primary" />
        ) : (
          <Icon size={16} className="text-muted-foreground" />
        )}
      </div>
      <span
        className={cn(
          "text-sm transition-colors duration-300",
          status === "active"
            ? "font-medium text-foreground"
            : "text-muted-foreground",
        )}
      >
        {step.label}
      </span>
    </div>
  );
}

// ============================================================================
// Brand context cards — identical to settings (org-brand-context.tsx)
// ============================================================================

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

function OverviewSection({
  brand,
  onSave,
}: {
  brand: Partial<BrandData>;
  onSave: (data: Partial<BrandData>) => void;
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

function LogosSection({
  brand,
  onSave,
}: {
  brand: Partial<BrandData>;
  onSave: (data: Partial<BrandData>) => void;
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

function FontsSection({
  brand,
  onSave,
}: {
  brand: Partial<BrandData>;
  onSave: (data: Partial<BrandData>) => void;
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
    onSave({ fonts: validFonts.length ? validFonts : null });
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

function ColorsSection({
  brand,
  onSave,
}: {
  brand: Partial<BrandData>;
  onSave: (data: Partial<BrandData>) => void;
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
    onSave({ colors: validColors.length ? validColors : null });
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

function BrandContextCards({
  brand,
  onSave,
}: {
  brand: BrandData;
  onSave: (data: Partial<BrandData>) => void;
}) {
  return (
    <div className="space-y-3 overflow-y-auto p-6">
      <OverviewSection brand={brand} onSave={onSave} />
      <div className="grid grid-cols-2 gap-3">
        <LogosSection brand={brand} onSave={onSave} />
        <FontsSection brand={brand} onSave={onSave} />
      </div>
      <ColorsSection brand={brand} onSave={onSave} />
    </div>
  );
}

// ============================================================================
// View components
// ============================================================================

function GenericEmailView({
  onSubmitUrl,
  onSkip,
}: {
  onSubmitUrl: (url: string) => void;
  onSkip: () => void;
}) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmitUrl(url.trim());
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Create your brand context
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Enter your website to generate a brand kit, or start with a clean slate.
      </p>

      <div className="mt-10">
        <p className="mb-4 text-sm text-foreground">
          Import from website{" "}
          <span className="text-muted-foreground">(recommended)</span>
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 pl-4"
        >
          <Globe02 size={18} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="yourcompany.com"
            value={url}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setUrl(e.target.value)
            }
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <Button type="submit" disabled={!url.trim()} size="sm">
            Generate
          </Button>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          You can always edit this later.
        </p>
      </div>

      <div className="my-10 h-px bg-border" />

      <div>
        <p className="mb-4 text-sm text-foreground">
          No website? Start with an empty brand kit.
        </p>
        <button
          type="button"
          className="w-full rounded-xl border border-border bg-card py-3.5 text-center text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={onSkip}
        >
          Set up manually
        </button>
        <p className="mt-3 text-xs text-muted-foreground">
          You can customize your brand context later and update it anytime.
        </p>
      </div>
    </>
  );
}

function OrgExistsView({
  org,
  onEnter,
  onCreateNew,
  isJoining,
  joinError,
}: {
  org: { name: string; slug: string; domain?: string };
  onEnter: () => void;
  onCreateNew: () => void;
  isJoining?: boolean;
  joinError?: string | null;
}) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Welcome back
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Your domain already has an organization on deco.
      </p>

      <button
        type="button"
        className="mt-10 flex w-full items-center gap-4 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent"
        onClick={onEnter}
        disabled={isJoining}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-foreground">
          {org.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{org.name}</p>
          {org.domain && (
            <p className="text-xs text-muted-foreground">{org.domain}</p>
          )}
        </div>
        <span className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {isJoining ? "Joining..." : "Enter"}
        </span>
      </button>

      {joinError && (
        <p className="mt-2 text-xs text-destructive">{joinError}</p>
      )}

      <div className="my-10 h-px bg-border" />

      <p className="mb-4 text-sm text-foreground">
        Or create a new organization
      </p>
      <button
        type="button"
        className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent"
        onClick={onCreateNew}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
          <Plus size={16} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            Create new organization
          </p>
          <p className="text-xs text-muted-foreground">Start from scratch</p>
        </div>
      </button>
    </>
  );
}

// ============================================================================
// Entry + Main page
// ============================================================================

export default function OnboardingRoute() {
  const search = useSearch({ from: "/onboarding" }) as { email?: string };
  const testEmail = DEV_MODE ? search.email : undefined;

  if (testEmail) {
    return <OnboardingPage testEmail={testEmail} />;
  }

  return (
    <RequiredAuthLayout>
      <OnboardingPage />
    </RequiredAuthLayout>
  );
}

function OnboardingPage({ testEmail }: { testEmail?: string }) {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const userEmail = testEmail ?? session?.user?.email ?? "";
  const domain = getDomain(userEmail);
  const domainLabel = getDomainLabel(userEmail);
  const isGeneric = isGenericDomain(userEmail);
  const isTestMode = !!testEmail;

  const [view, setView] = useState<
    "loading" | "gathering" | "org-ready" | "generic-email"
  >("loading");
  const [setupSlug, setSetupSlug] = useState<string | null>(null);
  const [setupDone, setSetupDone] = useState(false);
  const [brandData, setBrandData] = useState<BrandData | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [domainLookup, setDomainLookup] = useState<{
    found: boolean;
    autoJoinEnabled?: boolean;
    organization?: { name: string; slug: string } | null;
  } | null>(null);
  const lookupStartedRef = useRef(false);

  // Step animation
  const [activeStep, setActiveStep] = useState(0);
  const didScheduleSteps = useRef(false);

  const startStepAnimation = () => {
    if (didScheduleSteps.current) return;
    didScheduleSteps.current = true;
    for (let i = 1; i < SETUP_STEPS.length; i++) {
      setTimeout(() => setActiveStep(i), SETUP_STEPS[i]!.delay);
    }
  };

  const effectiveStep = setupDone ? SETUP_STEPS.length : activeStep;
  const allStepsDone = effectiveStep >= SETUP_STEPS.length;

  const getStepStatus = (index: number): StepStatus => {
    if (index < effectiveStep) return "done";
    if (index === effectiveStep && !allStepsDone) return "active";
    return "pending";
  };

  const handleBrandSave = (data: Partial<BrandData>) => {
    setBrandData((prev) => (prev ? { ...prev, ...data } : null));
  };

  // On mount: determine which view to show
  if (
    !lookupStartedRef.current &&
    userEmail &&
    (!sessionLoading || isTestMode)
  ) {
    lookupStartedRef.current = true;

    if (isTestMode) {
      if (isGeneric) {
        setView("generic-email");
      } else {
        setView("gathering");
        startStepAnimation();
        setTimeout(() => setSetupDone(true), 6000);
        setSetupSlug(domain.split(".")[0] ?? "test");
        setBrandData({
          name: domainLabel,
          domain,
          overview: `${domainLabel} is a company operating at ${domain}.`,
          fonts: [
            { name: "Inter", role: "Body" },
            { name: "Space Grotesk", role: "Headings" },
          ],
          colors: [
            { label: "Primary", value: "#2FD180" },
            { label: "Dark", value: "#0D1117" },
            { label: "Accent", value: "#113032" },
          ],
        });
      }
    } else if (isGeneric) {
      setView("generic-email");
    } else {
      fetch("/api/auth/custom/domain-lookup", { credentials: "include" })
        .then((res) => res.json())
        .then((data) => {
          if (data.found && data.organization) {
            setDomainLookup(data);
            setView("org-ready");
          } else {
            setView("gathering");
            startStepAnimation();
            triggerDomainSetup();
          }
        })
        .catch(() => {
          setView("gathering");
          startStepAnimation();
          triggerDomainSetup();
        });
    }
  }

  const triggerDomainSetup = async () => {
    try {
      const res = await fetch("/api/auth/custom/domain-setup", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.slug) {
        setSetupSlug(data.slug);
        if (data.brandExtracted) {
          setBrandData({ name: domainLabel, domain, overview: "" });
        }
      }
      setSetupDone(true);
    } catch {
      setSetupDone(true);
    }
  };

  const handleGoToOrg = () => {
    if (isTestMode) return;
    if (setupSlug) {
      window.location.href = `/${setupSlug}`;
    }
  };

  const handleJoinOrg = async () => {
    if (isTestMode) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      const res = await fetch("/api/auth/custom/domain-join", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.slug) {
        window.location.href = `/${data.slug}`;
      } else {
        setJoinError(data.error || "Failed to join organization");
        setIsJoining(false);
      }
    } catch {
      setJoinError("Failed to join organization");
      setIsJoining(false);
    }
  };

  const handleCreateManual = async (name: string) => {
    if (isTestMode) {
      setSetupSlug(slugify(name));
      setSetupDone(true);
      return;
    }
    const slug = slugify(name);
    if (!slug) return;
    const result = await authClient.organization.create({ name, slug });
    if (result?.data?.slug) {
      setSetupSlug(result.data.slug);
      setSetupDone(true);
    }
  };

  if (sessionLoading && !isTestMode) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading01 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Right panel shows brand cards when steps are done and brand data exists
  const showBrandCards =
    allStepsDone && brandData !== null && view === "gathering";

  return (
    <main className="flex h-screen bg-background">
      {/* Left panel */}
      <div className="flex w-full flex-col p-8 md:w-[620px] md:min-w-[620px] md:p-14 lg:p-20">
        <div className="mb-12">
          <img
            src="/logos/deco logo.svg"
            alt="Deco"
            className="h-7 w-7 dark:hidden"
          />
          <img
            src="/logos/deco logo negative.svg"
            alt="Deco"
            className="hidden h-7 w-7 dark:block"
          />
        </div>

        <div
          key={view}
          className="flex flex-1 flex-col"
          style={{ animation: "slideUpFade 0.35s var(--ease-out-quart) both" }}
        >
          {view === "loading" && (
            <div className="flex flex-1 items-center gap-2">
              <Loading01
                size={14}
                className="animate-spin text-muted-foreground"
              />
              <span className="text-sm text-muted-foreground">
                Checking {domain}...
              </span>
            </div>
          )}

          {view === "generic-email" && (
            <GenericEmailView
              onSubmitUrl={(url) => {
                const name =
                  url.replace(/^https?:\/\//, "").split(".")[0] ?? url;
                handleCreateManual(
                  name.charAt(0).toUpperCase() + name.slice(1),
                );
              }}
              onSkip={() => handleCreateManual("My Organization")}
            />
          )}

          {view === "gathering" && (
            <>
              {!allStepsDone ? (
                <div className="mb-8 inline-flex w-fit items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                  <GridLoader />
                  <span>Setting up</span>
                </div>
              ) : (
                <div className="mb-8 inline-flex w-fit items-center gap-2 rounded-md border border-border bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check size={13} />
                  <span>Ready</span>
                </div>
              )}

              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Setting up {domainLabel}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Getting everything ready from {domain}
              </p>

              <div className="mt-10">
                {SETUP_STEPS.map((step, index) => (
                  <StepRow
                    key={step.label}
                    step={step}
                    status={getStepStatus(index)}
                  />
                ))}
              </div>

              <div className="mt-auto pt-12">
                {allStepsDone && (
                  <div
                    style={{
                      animation: "slideUpFade 0.35s var(--ease-out-quart) both",
                    }}
                  >
                    <Button size="lg" onClick={handleGoToOrg}>
                      Go to organization
                      <ArrowRight size={16} />
                    </Button>
                    <p className="mt-3 text-xs text-muted-foreground">
                      You can always edit your brand context later in settings.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {view === "org-ready" && (
            <OrgExistsView
              org={
                domainLookup?.organization
                  ? { ...domainLookup.organization, domain }
                  : {
                      name: domainLabel,
                      slug: domain.split(".")[0] ?? domain,
                      domain,
                    }
              }
              isJoining={isJoining}
              joinError={joinError}
              onEnter={handleJoinOrg}
              onCreateNew={() => {
                setView("gathering");
                startStepAnimation();
                triggerDomainSetup();
              }}
            />
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="hidden flex-1 flex-col border-l border-border bg-[var(--brand-green-light)] dark:bg-[var(--brand-green-dark)] md:flex">
        {showBrandCards ? (
          <BrandContextCards brand={brandData} onSave={handleBrandSave} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 lg:p-12">
            <div className="flex h-full max-h-[600px] w-full max-w-3xl flex-col">
              {view === "gathering" && !allStepsDone && (
                <div className="mb-10 flex justify-center">
                  <span className="shimmer text-xs text-muted-foreground">
                    Grabbing context...
                  </span>
                </div>
              )}
              <div
                className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-background shadow-lg"
                style={{
                  maskImage:
                    "linear-gradient(to bottom, black 55%, transparent 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, black 55%, transparent 100%)",
                }}
              >
                <ProductPreview />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
