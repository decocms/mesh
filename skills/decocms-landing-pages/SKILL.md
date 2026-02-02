---
name: decocms-landing-pages
description: Create beautiful, on-brand landing pages in decoCMS. Use when building new landing pages, proposals, internal roadmaps, hiring projects, or converting documents into polished web pages with images.
---

# Building Landing Pages in decoCMS

Transform any document into a polished, on-brand landing page with custom sections, AI-generated images, and consistent styling.

## Quick Start

1. Find a reference page (see [reference-pages.md](reference-pages.md))
2. Create sections for each content block
3. Configure the page JSON
4. Generate images with nano banana
5. Add SEO metadata

## Page Architecture

### File Locations

| Type | Path | Description |
|------|------|-------------|
| Page config | `.deco/blocks/pages-{slug}.json` | Route + sections |
| Sections | `sections/{ComponentName}.tsx` | Reusable UI blocks |
| Islands | `islands/{ComponentName}.tsx` | Interactive (Preact) |
| Static | `static/` | Images, files |

### Page JSON Structure

```json
{
  "name": "Page Title",
  "path": "/url-slug",
  "sections": [
    { "__resolveType": "site/sections/ComponentName.tsx", "prop": "value" }
  ],
  "seo": {
    "__resolveType": "website/sections/Seo/SeoV2.tsx",
    "title": "Page Title | deco",
    "description": "Meta description for social sharing",
    "image": "https://decocms.com/og-image.jpg"
  },
  "__resolveType": "website/pages/Page.tsx"
}
```

## Section Anatomy

Every section follows this pattern:

```tsx
export interface Props {
  /**
   * @title Human Label
   * @description Shown in CMS
   * @format textarea | image-uri | html
   */
  propName?: string;
}

export default function SectionName({
  propName = "default value",
}: Props) {
  return (
    <section class="w-full bg-dc-950 py-16 md:py-20">
      <div class="max-w-[720px] mx-auto px-6">
        {/* Content */}
      </div>
    </section>
  );
}

export function Preview() {
  return <SectionName />;
}
```

**Key patterns:**
- Always provide defaults for all props
- Use `max-w-[720px]` for readable content, `max-w-[1000px]` for visuals
- Background is `bg-dc-950` (dark) by default
- Add `Preview()` for CMS preview

## Design Styles

Choose style based on purpose:

| Style | Use For | Container | Font Scale |
|-------|---------|-----------|------------|
| Flashy | Vision, investor materials | 1000-1200px | Large (display text) |
| Elegant | Client proposals, presentations | 720-1000px | Medium-large |
| Pragmatic | Technical specs, hiring projects | 720px | Medium |
| **Dashboard** | Ops docs, team views, data-dense | 1000px | Medium-large |

**Font sizing tip:** Start ~40% larger than you think. It's easier to read on screen and can always be reduced.

### Flashy (Roadmap 2026)

For dramatic internal docs, vision pieces, investor materials:

```tsx
// Animated gradient backgrounds
<div class="absolute inset-0 opacity-40" style={{
  background: "radial-gradient(ellipse 80% 50% at 50% 120%, #8caa25 0%, transparent 60%)"
}} />

// Grid overlay
<div class="absolute inset-0 opacity-10" style={{
  backgroundImage: `
    linear-gradient(rgba(208, 236, 26, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(208, 236, 26, 0.1) 1px, transparent 1px)
  `,
  backgroundSize: "64px 64px"
}} />

// Large display text with gradient
<div class="text-[120px] md:text-[280px] font-bold text-transparent bg-clip-text"
  style={{ backgroundImage: "linear-gradient(180deg, #D0EC1A 0%, #8caa25 50%, #07401A 100%)" }}>
  2026
</div>

// CSS animations
<style dangerouslySetInnerHTML={{ __html: `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-title { animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s forwards; opacity: 0; }
`}} />
```

### Elegant (Vanto Proposal)

For client-facing proposals, professional presentations:

```tsx
// Eyebrow badge
<div class="inline-flex items-center gap-2 px-4 py-2 bg-dc-800/50 border border-dc-700/50 rounded-full backdrop-blur-sm">
  <div class="w-2 h-2 rounded-full bg-primary-light animate-pulse" />
  <span class="text-dc-400 font-mono text-sm uppercase tracking-wider">EXECUTIVE WORKSHOP</span>
</div>

// Quote card with accent border
<div class="p-8 bg-dc-900 border-l-4 border-primary-light rounded-r-2xl">
  <p class="text-xl text-dc-200 italic">"{quote}"</p>
  <p class="text-dc-500 font-mono text-sm">— {attribution}</p>
</div>

// Key point callout
<div class="p-8 bg-gradient-to-r from-primary-light/10 to-primary-light/5 border-2 border-primary-light/40 rounded-2xl text-center">
  <p class="text-2xl md:text-3xl text-dc-100 font-semibold">{keyPoint}</p>
</div>

// Stat cards
<div class="flex flex-col items-center gap-2 px-8 py-6 bg-dc-800/50 border border-dc-700/50 rounded-2xl">
  <span class="text-dc-400 font-mono text-sm uppercase tracking-wider">Format</span>
  <span class="text-2xl text-dc-100 font-semibold">4 sessions × 2 hours</span>
</div>
```

### Action Plan (Internal Roadmap)

For internal team docs derived from meetings, action plans, decision summaries:

```tsx
// Principles card with number and insight
<div class="p-8 bg-dc-900/50 border border-dc-800 rounded-2xl hover:border-primary-light/30 transition-all">
  <div class="flex items-center gap-4 mb-4">
    <div class="w-12 h-12 rounded-full bg-primary-light/10 border border-primary-light/30 flex items-center justify-center">
      <span class="text-primary-light font-mono font-bold text-lg">01</span>
    </div>
    <h3 class="text-xl font-medium text-dc-100">{title}</h3>
  </div>
  <p class="text-dc-400 leading-relaxed mb-4">{description}</p>
  <div class="pt-4 border-t border-dc-800">
    <p class="text-primary-light font-medium text-sm">→ {insight}</p>
  </div>
</div>

// Before/After comparison table
<div class="grid grid-cols-[1fr_1fr_1fr] gap-4 p-4 bg-dc-900/30 rounded-xl">
  <div class="font-medium text-dc-200">{label}</div>
  <div class="text-dc-400 text-sm">{before}</div>
  <div class="text-dc-200 text-sm">{after}</div>
</div>

// Action item with status badge
<div class="flex items-start gap-4 p-3 bg-dc-950/50 rounded-lg">
  <div class="flex-1">
    <div class="flex items-center gap-2 mb-1">
      <span class="text-dc-400 font-mono text-sm">{owner}</span>
      <span class="px-2 py-0.5 rounded text-xs font-mono bg-primary-light/20 text-primary-light">In Progress</span>
    </div>
    <p class="text-dc-200">{task}</p>
  </div>
  <span class="text-dc-500 text-sm">{timeline}</span>
</div>

// Status badge variants
const statusStyles = {
  "todo": "bg-dc-700 text-dc-300",
  "in-progress": "bg-primary-light/20 text-primary-light",
  "blocked": "bg-red-500/20 text-red-400",
};
```

### Pragmatic (Hiring Project)

For technical docs, hiring projects, specs:

```tsx
// Simple badge
<span class="inline-block px-3 py-1 bg-dc-900 border border-dc-700 rounded text-xs font-mono text-dc-400 uppercase tracking-wider">
  Hiring Project
</span>

// Checklist items
<div class="flex items-start gap-3">
  <div class="w-4 h-4 mt-0.5 rounded border border-dc-600 flex-shrink-0" />
  <span class="text-dc-300">{item.text}</span>
</div>

// Highlighted section
<div class="border border-primary-light/20 bg-primary-light/5 rounded-lg p-6">
  <div class="flex items-center gap-3 mb-4">
    <span class="px-2 py-0.5 bg-primary-light/10 text-primary-light text-xs rounded font-medium">Stand out</span>
    <h3 class="text-xl font-medium text-dc-100">{title}</h3>
  </div>
</div>

// Arrow list items
<li class="flex items-start gap-2 text-dc-400 text-sm">
  <span class="text-primary-light/60">→</span>
  <span>{text}</span>
</li>
```

### Dashboard (Q1 Roadmap)

For ops docs, team views, structured data, weekly reviews:

```tsx
// Data table
<div class="overflow-x-auto border border-dc-800 rounded-lg">
  <table class="w-full text-base">
    <thead>
      <tr class="bg-dc-900 border-b border-dc-800">
        <th class="text-left px-5 py-4 font-mono text-dc-400 font-medium text-sm uppercase tracking-wider">
          Column
        </th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row, i) => (
        <tr class={`border-b border-dc-800/50 ${i % 2 === 0 ? "bg-dc-950" : "bg-dc-900/30"}`}>
          <td class="px-5 py-4 text-dc-100">{row.value}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

// Team card (compact)
<div class="bg-dc-900/50 border border-dc-800 rounded-lg p-5">
  <div class="flex items-start justify-between mb-4">
    <div>
      <span class="text-sm font-mono text-dc-500">Team 1</span>
      <h3 class="text-lg text-dc-100 font-medium">{teamName}</h3>
    </div>
    <span class="text-sm font-mono text-dc-600 bg-dc-800 px-2.5 py-1 rounded">
      {count} milestones
    </span>
  </div>
  <div class="mb-4 pb-4 border-b border-dc-800">
    <span class="text-sm text-dc-600 uppercase tracking-wider">Ops Lead</span>
    <p class="text-base text-primary-light/80 font-medium">{opsLead}</p>
  </div>
  <div class="flex flex-wrap gap-2">
    {members.map((m) => (
      <span class="text-sm px-2.5 py-1 rounded bg-dc-800 text-dc-400">{m}</span>
    ))}
  </div>
</div>

// Milestone card with owner
<div class="bg-dc-900/30 border border-dc-800 rounded-lg p-5">
  <div class="flex items-start gap-4">
    <span class="text-sm font-mono text-primary-light bg-primary-light/10 px-3 py-1.5 rounded">
      {id}
    </span>
    <div class="flex-1">
      <h4 class="text-dc-100 font-medium text-base mb-2">{title}</h4>
      <div class="flex items-center gap-2 mb-3">
        <span class="text-sm text-dc-600">Owner:</span>
        <span class="text-sm text-primary-light/80 font-medium">{owner}</span>
      </div>
      <p class="text-sm text-dc-500 leading-relaxed">{description}</p>
    </div>
  </div>
</div>

// Quick nav links (in hero)
<div class="flex flex-wrap gap-4 mt-8 pt-6 border-t border-dc-800">
  <a href="#teams" class="text-sm font-mono text-dc-500 hover:text-primary-light transition-colors">
    → Teams
  </a>
  <a href="#milestones" class="text-sm font-mono text-dc-500 hover:text-primary-light transition-colors">
    → Milestones
  </a>
</div>
```

## Color System

```
dc-950  #121110  — Page background (darkest)
dc-900  #1C1917  — Card backgrounds
dc-800  #282524  — Borders, secondary bg
dc-700  #44403C  — Subtle borders
dc-600  #56524E  — Muted text
dc-500  #78726E  — Secondary text
dc-400  #A6A09D  — Body text
dc-300  #D6D3D1  — Emphasis text
dc-200  #E7E5E4  — Strong text
dc-100  #F1F0EE  — Headlines

primary-light  #D0EC1A  — Accent (lime green)
primary-dark   #07401A  — Dark accent
purple-light   #A595FF  — Alt accent
yellow-light   #FFC116  — Alt accent
```

## Password Protection

For gated pages, create island + section pair:

**Island** (`islands/ProjectPasswordGate.tsx`):
```tsx
import { useEffect, useState } from "preact/hooks";

export interface Props {
  passwordHash?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
}

const AUTH_COOKIE = "project_auth";

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function ProjectPasswordGate({ passwordHash, title, subtitle, buttonText = "View" }: Props) {
  const [authState, setAuthState] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  // ... auth logic checking cookie, hashing input, setting cookie on success
  if (authState === true) return null;
  return (/* password form UI */);
}
```

**Section** (`sections/ProjectPasswordGate.tsx`):
```tsx
import PasswordGate from "../islands/ProjectPasswordGate.tsx";

export interface Props {
  passwordHash?: string;
}

export default function ProjectPasswordGateSection({ passwordHash }: Props) {
  return <PasswordGate passwordHash={passwordHash} title="Project Name" />;
}
```

Generate hash: `echo -n "password" | shasum -a 256`

## Image Generation

Use nano banana agent with visual style context. Reference the style guide:

```
@context/10_design/VISUAL_STYLE.md
```

This provides the complete aesthetic (retro comic + digital noir, monochromatic green palette, dithering effects, capybara heroes).

For professional/corporate imagery, use a simpler prompt:

```
Create a professional digital artwork for [PROJECT CONTEXT].

[DESCRIBE THE CONCEPT] - focus on [SPECIFIC ELEMENTS].

Style: Modern, professional, clean with subtle gradients.
Colors: Dark background (#121110) with lime-green accents (#D0EC1A).
Mood: Sophisticated, technical, authoritative.

Dimensions: 1376x768 (landscape, 16:9 ratio)
No text overlays. High contrast for dark theme integration.
```

See [image-generation.md](image-generation.md) for detailed prompts and examples.

**After generating:**
1. Download to `static/{project}-{concept}.png`
2. Reference as `/{project}-{concept}.png` in sections
3. For SEO, create optimized version:
   ```bash
   sips -Z 1200 --setProperty format jpeg --setProperty formatOptions 70 \
     static/hero.png --out static/hero-og.jpg
   ```

## SEO Configuration

Add to page JSON:

```json
"seo": {
  "__resolveType": "website/sections/Seo/SeoV2.tsx",
  "title": "Page Title | deco",
  "description": "Description for social sharing (150-160 chars)",
  "image": "https://decocms.com/og-image.jpg"
}
```

**Image requirements:**
- Use absolute URL (`https://decocms.com/...`)
- WhatsApp/social: max ~300KB
- Recommended: 1200×630px JPEG at 70% quality

## Cross-Page Navigation

For document networks (e.g., vision → roadmap → detail pages), add Related Documents links:

```tsx
export interface RelatedLink {
  label: string;
  url: string;
  description?: string;
}

// In CTA or Footer section
{relatedLinks && relatedLinks.length > 0 && (
  <div class="mb-10 pb-8 border-b border-dc-800">
    <p class="text-sm font-mono text-dc-500 uppercase tracking-wider mb-4">
      Related Documents
    </p>
    <div class="flex flex-col sm:flex-row gap-4">
      {relatedLinks.map((link) => (
        <a
          key={link.url}
          href={link.url}
          class="group flex items-center gap-4 px-5 py-4 bg-dc-900/50 border border-dc-800 rounded-lg hover:border-primary-light/30 hover:bg-dc-900 transition-all flex-1"
        >
          <span class="text-primary-light/60 group-hover:text-primary-light transition-colors text-lg">
            →
          </span>
          <div>
            <span class="text-base text-dc-200 font-medium block">{link.label}</span>
            {link.description && (
              <span class="text-sm text-dc-500">{link.description}</span>
            )}
          </div>
        </a>
      ))}
    </div>
  </div>
)}
```

**Tips:**
- Use relative URLs (`/roadmap`) to stay on same domain
- Add bidirectional links (A→B and B→A)
- Place in CTA section before final footer text
- Same password hash can be reused across related internal docs

## Common Section Types

| Section | Purpose | Width | Style |
|---------|---------|-------|-------|
| Hero | Title, subtitle, eyebrow | 1000px | All |
| Problem | Pain point, context | 720px | Elegant, Pragmatic |
| Features/Tools | Grid of capabilities | 720px | All |
| Timeline | Visual progression | 720px | Elegant |
| Phases/Checklists | Requirements, expectations | 720px | Pragmatic |
| Insight/Quote | Callout with attribution | 1000px | Elegant |
| CTA | Call to action with buttons | 720-1000px | All |
| Footer | Resources, source info | 720-1000px | All |
| **Teams** | Team cards with members | 1000px | Dashboard |
| **Milestones** | Milestone list with owners | 1000px | Dashboard |
| **People** | Per-person commitments grid | 1000px | Dashboard |
| **Data Table** | Structured data rows | 1000px | Dashboard |
| **Principles** | Numbered cards with insights | 1000px | Action Plan |
| **Before/After** | Transformation comparison table | 1000px | Action Plan |
| **Action Plan** | Grouped items with status badges | 1000px | Action Plan |

## Workflow

1. **Source doc** → Read and structure into sections
2. **Choose style** → Based on purpose (see style table above)
3. **Reference** → Find similar page for patterns
4. **Sections** → Create/reuse TSX components
5. **Page JSON** → Configure route and section order
6. **Navigation** → Add Related Documents links if part of doc network
7. **Images** → Generate 2-3 with nano banana (skip for Dashboard style)
8. **SEO** → Add title, description, og:image
9. **Test** → Check responsive, password gate, font sizes

### Style Selection Guide

| Source Document | Recommended Style |
|-----------------|-------------------|
| Vision/strategy doc | Flashy |
| Client proposal | Elegant |
| Technical spec, hiring project | Pragmatic |
| Team roadmap, ops doc, weekly review | Dashboard |
| Meeting-derived action plan | Action Plan |

### Meeting-to-Page Workflow

When deriving a landing page from a Grain meeting:

1. **Fetch meeting notes + transcript** — Use Grain MCP tools
2. **Create decision doc first** — In context repo (`02_strategy/decisions/YYYY-MM-DD-slug.md`)
3. **Extract page structure:**
   - **Hero**: meeting title, date, participants
   - **Principles**: core decisions made (numbered cards)
   - **Before/After**: transformation discussion (comparison table)
   - **Action items**: grouped by timeline with status badges
   - **CTA**: link to decision doc + Grain recording URL
4. **Skip images** — Internal docs don't need generated imagery
5. **No password** — Internal team pages can be public

### Common Mistakes

- **Fonts too small** — Start 40% larger than you think, scale down if needed
- **Missing navigation** — Add Related Documents for connected pages
- **Wrong container width** — 720px for reading, 1000px for data-dense
- **Skipping password** — Reuse existing hash for related internal docs

See [reference-pages.md](reference-pages.md) for complete examples.
