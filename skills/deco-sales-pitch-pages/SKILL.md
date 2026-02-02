---
name: deco-sales-pitch-pages
description: Research a target company and create a personalized sales pitch landing page. Use when prospecting a specific merchant from the target list — runs Core Web Vitals analysis, CrUX data, Perplexity research, creates a pitch strategy document, then implements a customized landing page in decoCMS.
---

# Sales Pitch Page Generator

Transform a target merchant from the target list into a personalized, compelling pitch landing page that demonstrates exactly how Deco can solve their specific problems.

## Philosophy: From Enabler to Doer

> "Software used to enable. Now it does. We don't recommend fixes — we ship them. We don't suggest optimizations — we own the outcome."

The pitch page itself IS the proof. The diagnostic we show them is a "free sample" of what runs 24/7 after they sign. We're not selling a faster CMS or better tools — we're selling a **teammate that actually ships**.

Key narrative beats:
1. **This diagnostic is a free sample** — what you're reading is what our agents do continuously
2. **Tools enable, we do** — dashboards don't deploy code, agents do
3. **The closed loop** — CONNECT → DETECT → ACT → MEASURE → EVOLVE

Reference: `context/references/2026-01-soren-larson-you-must-just-do-things.md`

## Overview

This skill automates the sales research and pitch creation workflow:

1. **Analyze** → Core Web Vitals + CrUX historical data (only show failing metrics)
2. **Research** → Company, stack, pain points via Perplexity
3. **Strategize** → Create "How to Wow Them" pitch document
4. **Implement** → Build customized landing page with closed-loop narrative

## Prerequisites

Before using this skill, ensure you have:

- Access to the target list: `@context/02_strategy/proposals/2026-01-31-target-list-north-american-storefronts.md`
- Perplexity MCP tools available
- Firecrawl MCP for site analysis
- Access to decoCMS for page creation

Reference skills to read first:
- `@context/skills/decocms-landing-pages/SKILL.md` — Page creation patterns
- `@context/skills/deco-brand-guidelines/SKILL.md` — Brand consistency

## Workflow

### Phase 1: Performance Analysis

#### Step 1.1: Run Core Web Vitals

Use browser tools or PageSpeed Insights API to capture current metrics:

```bash
# Using curl to PageSpeed Insights API (free, no key required for basic)
curl "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://[TARGET_SITE]&strategy=mobile"
```

Capture and record:
- **LCP** (Largest Contentful Paint) — target < 2.5s
- **INP** (Interaction to Next Paint) — target < 200ms  
- **CLS** (Cumulative Layout Shift) — target < 0.1
- **FCP** (First Contentful Paint) — target < 1.8s
- **TTFB** (Time to First Byte) — target < 800ms
- **Speed Index** — target < 3.4s

#### Step 1.2: Get CrUX Historical Data

Chrome User Experience Report provides 28-day rolling data:

```bash
# CrUX API (requires API key)
curl "https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=[API_KEY]" \
  -d '{"url": "https://[TARGET_SITE]"}'
```

Alternative: Use web.dev/measure or PageSpeed Insights which includes CrUX data.

Record historical percentiles (p75):
- How have their Core Web Vitals trended over past months?
- Are they passing or failing Google's thresholds?
- Mobile vs Desktop differences

### Phase 2: Company Research

Use Perplexity tools for comprehensive research.

#### Step 2.1: Company Overview

```
perplexity_research: "[COMPANY_NAME] ecommerce company overview revenue funding 
team size technology stack 2025 2026"
```

Capture:
- Founded date, HQ location
- Funding history (if any)
- Key executives (CEO, CTO, VP Ecommerce)
- Employee count
- Recent news/announcements

#### Step 2.2: Technology Stack

```
perplexity_search: "[COMPANY_NAME] website technology stack Shopify headless 
CMS platform architecture"
```

Also use Firecrawl to analyze:
- Platform (Shopify Plus, BigCommerce, custom)
- Headless setup (Hydrogen, Next.js, etc.)
- CMS (Sanity, Contentful, Builder.io, none)
- Analytics/tracking tools
- Third-party integrations

#### Step 2.3: Brand Values & Identity (NEW — Critical for Pitch Resonance)

```
perplexity_research: "[COMPANY_NAME] brand identity values mission visual aesthetic
what does the brand stand for beyond fashion/products"
```

Capture:
- Core brand values (e.g., inclusivity, sustainability, empowerment)
- Key brand phrases they use (e.g., "we don't promise — we prove")
- Photography/visual style
- Community initiatives (ambassador programs, etc.)
- Certifications (B-Corp, etc.)
- Founder story and why it matters

**Why this matters:** The pitch resonates 10x better when you show alignment with their values. Good American cares about "proving, not promising" — so we show how our agents prove results, not just recommend them.

Use this data to populate `SalesPitchBrandValues.tsx` section.

#### Step 2.4: Pain Points & Opportunities

```
perplexity_search: "[COMPANY_NAME] website slow performance issues customer 
complaints reviews"
```

Look for:
- Customer reviews mentioning site speed
- Social media complaints about checkout
- Job postings (hiring for performance? frontend devs?)
- Recent replatforming discussions
- International expansion challenges

### Phase 3: Create Pitch Strategy Document

Create a detailed strategy document in context:

**File:** `context/02_strategy/pitches/YYYY-MM-DD-[company-slug]-pitch-strategy.md`

Document structure:

```markdown
# [Company Name] Pitch Strategy

**Date:** [DATE]
**Target Contact:** [NAME, TITLE]
**Deal Size Potential:** $[X]K/month
**Sale Type:** CMS-Only | CMS + Hosting

## Executive Summary
[One paragraph on why they need Deco and what we'll pitch]

## Company Profile
- Industry: [X]
- HQ: [City, Country]
- Platform: [Shopify Plus, BigCommerce, etc.]
- Current Stack: [Headless? CMS? Custom?]
- Traffic: ~[X]M monthly visits
- Revenue: Est. $[X]M annual

## Performance Analysis

### Current Core Web Vitals (Mobile)
| Metric | Value | Status | Impact |
|--------|-------|--------|--------|
| LCP | [X]s | PASS/FAIL | [conversion impact] |
| INP | [X]ms | PASS/FAIL | [user experience impact] |
| CLS | [X] | PASS/FAIL | [visual stability] |

### CrUX History (28-day)
[Summary of trends — improving, declining, stable]

### Estimated Impact
- Current conversion rate: ~[X]%
- Potential with Deco: +[X]% (based on speed improvements)
- Revenue impact: $[X]M additional annual revenue

## Pain Points Identified
1. [Pain point 1 with evidence]
2. [Pain point 2 with evidence]
3. [Pain point 3 with evidence]

## How Deco Solves Their Problems

### Problem 1: [Specific issue]
**Deco Solution:** [How we fix it]
**Proof Point:** [Case study or metric from FARM/other client]

### Problem 2: [Specific issue]
**Deco Solution:** [How we fix it]
**Proof Point:** [Case study or metric]

## Competitive Positioning
- vs Their Current CMS: [advantages]
- vs Staying on Liquid: [advantages]
- vs Other headless solutions: [advantages]

## The "Wow" Moment
[What specific demonstration or insight will make them say "I need this"?]

## Pitch Page Sections
1. Hero: [Personalized hook for this company]
2. Problem: [Their specific pain, not generic]
3. Solution: [How Deco specifically helps them]
4. Proof: [Relevant case study / metrics]
5. Calculator: [ROI specific to their traffic/revenue]
6. CTA: [Specific next step]

## Objection Handling
| Objection | Response |
|-----------|----------|
| "We just migrated" | [Response] |
| "Budget is tight" | [Response] |
| "Our CMS works fine" | [Response] |

## Contact Strategy
- **Ideal Contact:** [Name, Title, LinkedIn]
- **Opening Hook:** [Personalized first line]
- **Meeting Request:** [Specific ask]
```

### Phase 4: Implement Pitch Landing Page

Use the SalesPitch sections in decoCMS to build a customized page.

#### File Locations

| Type | Path |
|------|------|
| Page JSON | `.deco/blocks/pages-pitch-[company-slug].json` |
| Sections | `sections/SalesPitch/*.tsx` |

#### Available SalesPitch Sections

See `sections/SalesPitch/README.md` for complete catalog:

| Section | Purpose |
|---------|---------|
| `SalesPitchHero.tsx` | Personalized hero with company name |
| `SalesPitchMetrics.tsx` | CWV scores (only failing by default) |
| `SalesPitchProblem.tsx` | The real problem (enabling vs doing) |
| `SalesPitchClosedLoop.tsx` | **KEY** — "This diagnostic is a free sample" |
| `SalesPitchSolution.tsx` | From enabling to doing |
| `SalesPitchROI.tsx` | Revenue impact calculator |
| `SalesPitchCaseStudy.tsx` | Relevant proof point |
| `SalesPitchCTA.tsx` | Next steps with calendar link |
| `SalesPitchPasswordGate.tsx` | Optional protection |

**Critical section: `SalesPitchClosedLoop.tsx`** — This is the narrative pivot. It shows the 5-step loop (CONNECT → DETECT → ACT → MEASURE → EVOLVE) and positions the diagnostic itself as a free sample of what runs continuously.

#### Page JSON Template

The section order matters — it builds the narrative:

1. **Password** → Gate access
2. **Hero** → Hook with "free sample" framing
3. **Metrics** → Only show what's broken (failing metrics)
4. **Problem** → The real issue: enabling vs doing
5. **ClosedLoop** → The pivot: "This diagnostic is what runs 24/7"
6. **Solution** → From enabling to doing
7. **ROI** → Revenue impact
8. **CaseStudy** → Proof it works
9. **CTA** → Ready for a teammate that ships?

```json
{
  "name": "[Company] | Deco Sales Pitch",
  "path": "/pitch/[company-slug]",
  "sections": [
    {
      "__resolveType": "site/sections/SalesPitch/SalesPitchPasswordGate.tsx",
      "passwordHash": "[HASH]"
    },
    {
      "__resolveType": "site/sections/SalesPitch/SalesPitchHero.tsx",
      "companyName": "[Company Name]",
      "headline": "Your store is leaving $[X]M on the table",
      "subheadline": "This analysis shows what's broken. Our agents fix it — automatically, continuously, while you sleep.",
      "eyebrow": "CLOSED-LOOP DIAGNOSTIC"
    },
    {
      "__resolveType": "site/sections/SalesPitch/SalesPitchMetrics.tsx",
      "sectionTitle": "What's Costing You Money",
      "lcpCurrent": "[X]",
      "lcpTarget": "2.0",
      "lcpStatus": "fail",
      "ttfbCurrent": "[X]",
      "ttfbTarget": "0.8",
      "ttfbStatus": "fail",
      "showOnlyFailing": true
    },
    {
      "__resolveType": "site/sections/SalesPitch/SalesPitchProblem.tsx",
      "sectionTitle": "The Real Problem",
      "subtitle": "You have [platform]. You have analytics. You have a team. But who's actually shipping fixes?",
      "problems": [
        { "title": "Nobody's Watching 24/7", "description": "[Specific metric drift]", "icon": "clock" },
        { "title": "Optimization Is Manual Labor", "description": "[Specific backlog pain]", "icon": "lock" },
        { "title": "Tools Enable, They Don't Do", "description": "Dashboards don't deploy code.", "icon": "alert" }
      ]
    },
    {
      "__resolveType": "site/sections/SalesPitch/SalesPitchClosedLoop.tsx",
      "sectionTitle": "This Diagnostic Is a Free Sample",
      "intro": "What you're reading right now? It's what our agents do continuously.",
      "steps": [
        { "name": "CONNECT", "description": "Agents connect to your repo, analytics, CrUX", "example": "[Their repo]" },
        { "name": "DETECT", "description": "Every hour, scan for regressions and opportunities", "example": "[Specific finding]" },
        { "name": "ACT", "description": "Open PRs with fixes. Run E2E. Wait for green.", "example": "PR: [specific fix]" },
        { "name": "MEASURE", "description": "Track impact after deploy. Revenue attributed.", "example": "[Impact estimate]" },
        { "name": "EVOLVE", "description": "System learns constraints and gets smarter.", "example": "[Brand guideline]" }
      ],
      "closingStatement": "While you sleep, the agent is shipping."
    },
    {
      "__resolveType": "site/sections/SalesPitch/SalesPitchSolution.tsx",
      "sectionTitle": "From Enabling to Doing",
      "subtitle": "We don't recommend fixes — we ship them."
    },
    {
      "__resolveType": "site/sections/SalesPitch/SalesPitchROI.tsx"
    },
    {
      "__resolveType": "site/sections/SalesPitch/SalesPitchCaseStudy.tsx",
      "clientName": "FARM Rio",
      "testimonial": "Deco agents ship fixes while we focus on product."
    },
    {
      "__resolveType": "site/sections/SalesPitch/SalesPitchCTA.tsx",
      "headline": "Ready for a teammate that actually ships?",
      "description": "This diagnostic was free. The next step: agents running on your store.",
      "ctaText": "Book a Demo"
    }
  ]
}
```

## Quick Reference: The Complete Flow

```
1. Pick target from target list
         ↓
2. Run Core Web Vitals (PageSpeed Insights)
         ↓
3. Get CrUX data (web.dev/measure)
         ↓
4. Perplexity research (company, stack, pain points)
         ↓
5. Perplexity research (brand values, identity, what they stand for)
         ↓
6. Optional: Firecrawl scrape for deeper analysis
         ↓
7. Create pitch strategy document
         ↓
8. Generate images with nano-banana (see below)
         ↓
9. Configure SalesPitch sections with their data
         ↓
10. Create page JSON
         ↓
11. Test and share protected URL
```

## Image Generation

Use the nano-banana-agent MCP to generate on-brand images for the pitch.

### Visual Style (from `context/10_design/VISUAL_STYLE.md`)

- **Aesthetic:** Retro comic hero meets digital noir — starring capybaras
- **Colors:** Monochromatic green (#121110 dark to #D0EC1A lime)
- **Effects:** Heavy dithering, halftone dots, CRT glow, pixelation
- **Capybara:** Calm, confident, heroic — doing the work while others plan

### Recommended Images

Generate 2-3 images per pitch:

1. **Hero Image** — Capybara at command center, optimizing storefronts
2. **Closed Loop Image** — Capybara walking away from optimization explosion
3. **Brand Values Image** — Capybara with community of agents working together

### Prompt Template

```
Create a landscape digital artwork (16:9) with deep dark background (hex #121110).

A capybara hero [DESCRIBE ACTION — e.g., "at a command center optimizing a fashion storefront"].

[OPTIONAL: Connect to brand values — e.g., "Multiple screens show diverse customers being served"]

Style: 1950s comic book meets digital noir. Heavy dithering and halftone effects. 
Pixelated edges. CRT glow on screens.

Bright lime-green (hex #D0EC1A) for highlights, screen glow, and data flows. 
Dark noir shadows.

Monochromatic green palette. The capybara is calm, confident, heroic.

No text.
```

### Tool Usage

```json
{
  "prompt": "[your prompt]",
  "model": "gemini-3-pro-image-preview",
  "aspectRatio": "16:9"
}
```

### Save Images

Download generated images to `decocms/static/pitch-[company-slug]-[purpose].png`

Example:
- `/pitch-good-american-hero.png`
- `/pitch-good-american-closed-loop.png`
- `/pitch-good-american-community.png`

## Tools Used

| Tool | Purpose |
|------|---------|
| `perplexity_research` | Deep company research |
| `perplexity_search` | Quick fact finding |
| `firecrawl_scrape` | Analyze site structure |
| PageSpeed Insights | Core Web Vitals |
| CrUX API | Historical performance data |
| decoCMS | Landing page creation |

## Output Artifacts

After running this skill, you'll have:

1. **Pitch Strategy Document** → `context/02_strategy/pitches/YYYY-MM-DD-[slug]-pitch-strategy.md`
2. **Landing Page** → `https://deco.cx/pitch/[slug]` (password protected)
3. **Performance Data** → Captured in strategy doc

## Common Variations

### CMS-Only Pitch
Focus on:
- CMS cost comparison (Contentful/Sanity pricing vs Deco)
- Content velocity improvements
- Commerce-specific optimizations
- No migration needed

### Full Migration Pitch
Focus on:
- Complete performance transformation
- Before/after case studies
- Total cost of ownership
- Migration timeline

### Canadian Market Pitch
Emphasize:
- Toronto presence / Shopify ecosystem alignment
- CAD pricing options
- Canadian success stories
- Local support

## Related Skills

- `@context/skills/decocms-landing-pages/SKILL.md` — Core landing page patterns
- `@context/skills/deco-performance-audit/SKILL.md` — Performance analysis tools
- `@context/skills/deco-writing-style/SKILL.md` — Copy guidelines
