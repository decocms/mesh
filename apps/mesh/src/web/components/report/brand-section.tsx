/**
 * BrandSection — mocked brand and visual identity extraction (DIAG-09).
 *
 * Displays hardcoded realistic brand data. This section is unlocked in a
 * future Pro version — it is clearly marked with a ProBadge.
 *
 * All data below is MOCKED / ILLUSTRATIVE — not sourced from live crawl.
 */

import { ProBadge } from "@/web/components/report/pro-badge";

// ============================================================================
// Mocked data (static constants — all illustrative)
// ============================================================================

const BRAND_COLORS = [
  { hex: "#1a1a2e", name: "Deep Navy" },
  { hex: "#e94560", name: "Crimson Red" },
  { hex: "#0f3460", name: "Royal Blue" },
  { hex: "#16213e", name: "Midnight" },
] as const;

const TYPOGRAPHY = [
  { family: "Inter", role: "Body & UI" },
  { family: "Georgia", role: "Display headings" },
] as const;

const BRAND_CONSISTENCY_SCORE = 78;
const LOGO_DETECTED = true;

// ============================================================================
// Sub-components
// ============================================================================

function ColorSwatches() {
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Primary Color Palette
      </h3>
      <div className="flex flex-wrap gap-3">
        {BRAND_COLORS.map((color) => (
          <div key={color.hex} className="flex items-center gap-2">
            <span
              className="h-8 w-8 rounded-full border border-border shadow-sm"
              style={{ backgroundColor: color.hex }}
              title={color.hex}
              aria-label={`${color.name}: ${color.hex}`}
            />
            <div>
              <p className="text-xs font-medium text-foreground">
                {color.name}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {color.hex}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypographyDisplay() {
  return (
    <div className="mt-5">
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Typography Detected
      </h3>
      <div className="flex flex-wrap gap-3">
        {TYPOGRAPHY.map((font) => (
          <div
            key={font.family}
            className="rounded-lg border border-border bg-background px-4 py-3"
          >
            <p
              className="text-base font-semibold text-foreground"
              style={{ fontFamily: font.family }}
            >
              {font.family}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{font.role}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrandSignals() {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {/* Logo detection */}
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-center gap-2">
          {LOGO_DETECTED ? (
            <svg
              aria-hidden="true"
              className="h-4 w-4 text-emerald-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              className="h-4 w-4 text-red-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
          <p className="text-sm font-medium text-foreground">
            {LOGO_DETECTED ? "Logo Detected" : "No Logo Found"}
          </p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Brand mark present on all pages
        </p>
      </div>

      {/* Brand consistency score */}
      <div className="rounded-lg border border-border bg-background p-4 sm:col-span-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Brand Consistency Score
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-3xl font-bold text-foreground">
            {BRAND_CONSISTENCY_SCORE}
            <span className="text-lg text-muted-foreground">/100</span>
          </span>
          <div className="flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${BRAND_CONSISTENCY_SCORE}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Good — minor inconsistencies detected
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function BrandSection() {
  return (
    <section
      aria-labelledby="brand-heading"
      className="rounded-xl border border-violet-100 bg-card p-6 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="brand-heading"
          className="text-xl font-semibold text-foreground"
        >
          Brand &amp; Visual Identity
        </h2>
        <ProBadge />
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Detected color palette, typography, and brand consistency signals.{" "}
        <span className="italic">
          Upgrade to Pro to see your full brand identity analysis.
        </span>
      </p>

      <div className="mt-5 opacity-70">
        <ColorSwatches />
        <TypographyDisplay />
        <BrandSignals />
      </div>
    </section>
  );
}
