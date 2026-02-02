# Reference Pages

Complete examples of landing pages built in decoCMS.

## Page Comparison

| Page | Style | Sections | Password | Images | Purpose |
|------|-------|----------|----------|--------|---------|
| `/future` | Flashy | 8 | Yes | 0 | 2028 vision document |
| `/2026` | Flashy | 10 | Yes | 4 | Retrospective/investor |
| `/roadmap` | Dashboard | 7 | Yes | 0 | Q1 ops dashboard |
| `/roadmap/admin-cx` | Action Plan | 5 | No | 0 | Meeting-derived action plan |
| `/vanto-ai` | Elegant | 8 | Yes | 3 | Client proposal |
| `/hiring-project-01` | Pragmatic | 7 | No | 3 | Hiring challenge |

**Document networks:** Pages can link to each other via Related Documents sections:
- `/future` → `/roadmap`, `/2026`
- `/2026` → `/roadmap`, `/future`
- `/roadmap` → `/roadmap/admin-cx`, `/future`
- `/roadmap/admin-cx` → `/roadmap`

---

## Admin CX Action Plan

**Purpose:** Internal team action plan derived from a meeting — decisions, transformation, action items.

**Style:** Action Plan — flashy hero for inspiration, practical sections for execution.

### Page Config

```json
{
  "name": "Admin CX Roadmap",
  "path": "/roadmap/admin-cx",
  "sections": [
    { "__resolveType": "site/sections/AdminCXHero.tsx",
      "eyebrow": "ADMIN CX ROADMAP",
      "title": "Make deco.cx Great Again",
      "vision": "Separate what matters. Simplify what's visible." },
    { "__resolveType": "site/sections/AdminCXPrinciples.tsx" },
    { "__resolveType": "site/sections/AdminCXBeforeAfter.tsx" },
    { "__resolveType": "site/sections/AdminCXActionPlan.tsx" },
    { "__resolveType": "site/sections/AdminCXCTA.tsx",
      "primaryButtonUrl": "https://github.com/...",
      "secondaryButtonUrl": "https://grain.com/..." }
  ],
  "__resolveType": "website/pages/Page.tsx"
}
```

### Key Section: Principles Grid

Numbered cards with insights:

```tsx
<div class="grid md:grid-cols-2 gap-8">
  {principles.map((p) => (
    <div class="p-8 bg-dc-900/50 border border-dc-800 rounded-2xl hover:border-primary-light/30 transition-all">
      <div class="flex items-center gap-4 mb-4">
        <div class="w-12 h-12 rounded-full bg-primary-light/10 border border-primary-light/30 flex items-center justify-center">
          <span class="text-primary-light font-mono font-bold text-lg">{p.number}</span>
        </div>
        <h3 class="text-xl font-medium text-dc-100">{p.title}</h3>
      </div>
      <p class="text-dc-400 leading-relaxed mb-4">{p.description}</p>
      <div class="pt-4 border-t border-dc-800">
        <p class="text-primary-light font-medium text-sm">→ {p.insight}</p>
      </div>
    </div>
  ))}
</div>
```

### Key Section: Before/After Table

Multi-row comparison table:

```tsx
{/* Header */}
<div class="grid grid-cols-[1fr_1fr_1fr] gap-4 px-4 pb-4 border-b border-dc-800">
  <div class="text-dc-500 font-mono text-sm uppercase">Aspect</div>
  <div class="text-red-400/80 font-mono text-sm uppercase">Before</div>
  <div class="text-primary-light font-mono text-sm uppercase">After</div>
</div>

{/* Rows */}
{items.map((item) => (
  <div class="grid grid-cols-[1fr_1fr_1fr] gap-4 p-4 bg-dc-900/30 rounded-xl hover:bg-dc-900/50 transition-all">
    <div class="font-medium text-dc-200">{item.label}</div>
    <div class="text-dc-400 text-sm">{item.before}</div>
    <div class="text-dc-200 text-sm">{item.after}</div>
  </div>
))}
```

### Key Section: Action Plan with Status

Grouped action items:

```tsx
function ActionGroup({ title, items, accent }) {
  return (
    <div class={`p-6 rounded-2xl ${accent ? "bg-primary-light/5 border-primary-light/20" : "bg-dc-900/50 border-dc-800"}`}>
      <h3 class={`text-lg font-medium mb-4 ${accent ? "text-primary-light" : "text-dc-100"}`}>{title}</h3>
      <div class="space-y-3">
        {items.map((item) => (
          <div class="flex items-start gap-4 p-3 bg-dc-950/50 rounded-lg">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-dc-400 font-mono text-sm">{item.owner}</span>
                <StatusBadge status={item.status} />
              </div>
              <p class="text-dc-200">{item.task}</p>
            </div>
            <span class="text-dc-500 text-sm">{item.timeline}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Usage
<ActionGroup title="🚀 Immediate (This Week)" items={immediate} accent />
<ActionGroup title="📅 Short-term (Pre-Carnaval)" items={shortTerm} />
<ActionGroup title="⏸️ Blocked (Waiting)" items={blocked} />
```

### Meeting-to-Page Workflow

When deriving a landing page from a Grain meeting:

1. **Fetch meeting notes + transcript** — Use Grain MCP
2. **Extract structure:**
   - Hero: meeting title, date, participants
   - Principles: decisions made
   - Before/After: transformation discussion
   - Action items: action items from notes
   - CTA: link to decision doc + meeting recording
3. **Create decision doc first** — In context repo (`02_strategy/decisions/`)
4. **Link CTA to sources** — Decision doc + Grain recording URL
5. **Skip images** — Internal docs don't need generated imagery

---

## Q1 Roadmap Dashboard

**Purpose:** Ops-focused team dashboard — structured data, no flashy visuals.

**Style:** Dashboard — data tables, team cards, milestone lists, utilitarian layout.

### Page Config

```json
{
  "name": "Q1 Roadmap",
  "path": "/roadmap",
  "sections": [
    { "__resolveType": "site/sections/RoadmapQ1PasswordGate.tsx",
      "passwordHash": "...",
      "title": "Q1 2026 Roadmap",
      "subtitle": "Internal ops dashboard — password protected." },
    { "__resolveType": "site/sections/RoadmapQ1Hero.tsx",
      "badge": "INTERNAL OPS DASHBOARD",
      "title": "Q1 2026 Roadmap",
      "lastUpdated": "2026-01-23" },
    { "__resolveType": "site/sections/RoadmapQ1TeamChanges.tsx" },
    { "__resolveType": "site/sections/RoadmapQ1Teams.tsx" },
    { "__resolveType": "site/sections/RoadmapQ1Milestones.tsx" },
    { "__resolveType": "site/sections/RoadmapQ1People.tsx" },
    { "__resolveType": "site/sections/RoadmapQ1Footer.tsx" }
  ],
  "__resolveType": "website/pages/Page.tsx"
}
```

### Key Section: Hero with Quick Nav

```tsx
<section class="w-full bg-dc-950 pt-16 pb-10 border-b border-dc-800">
  <div class="max-w-[1000px] mx-auto px-6">
    {/* Badge + Last Updated */}
    <div class="flex items-center justify-between mb-6">
      <span class="inline-block px-3 py-1.5 bg-dc-900 border border-dc-700 rounded text-sm font-mono text-dc-500 uppercase tracking-wider">
        {badge}
      </span>
      <span class="text-sm font-mono text-dc-600">Last refresh: {lastUpdated}</span>
    </div>

    {/* Title */}
    <h1 class="text-3xl md:text-4xl lg:text-5xl font-medium text-dc-100 mb-4 font-mono">
      {title}
    </h1>

    {/* Quick Nav */}
    <div class="flex flex-wrap gap-4 mt-8 pt-6 border-t border-dc-800">
      <a href="#teams" class="text-sm font-mono text-dc-500 hover:text-primary-light">→ Teams</a>
      <a href="#milestones" class="text-sm font-mono text-dc-500 hover:text-primary-light">→ Milestones</a>
      <a href="#people" class="text-sm font-mono text-dc-500 hover:text-primary-light">→ People</a>
    </div>
  </div>
</section>
```

### Key Section: Team Cards

```tsx
<div class="grid md:grid-cols-3 gap-5">
  {teams.map((team) => (
    <div class="bg-dc-900/50 border border-dc-800 rounded-lg p-5">
      <div class="flex items-start justify-between mb-4">
        <div>
          <span class="text-sm font-mono text-dc-500">Team {team.number}</span>
          <h3 class="text-lg text-dc-100 font-medium">{team.name}</h3>
        </div>
        <span class="text-sm font-mono text-dc-600 bg-dc-800 px-2.5 py-1 rounded">
          {team.milestoneCount} milestones
        </span>
      </div>
      
      {/* Ops Lead */}
      <div class="mb-4 pb-4 border-b border-dc-800">
        <span class="text-sm text-dc-600 uppercase tracking-wider">Ops Lead</span>
        <p class="text-base text-primary-light/80 font-medium">{team.opsLead}</p>
      </div>
      
      {/* Members */}
      <div class="flex flex-wrap gap-2">
        {team.members.map((m) => (
          <span class={`text-sm px-2.5 py-1 rounded ${
            m.isOpsLead 
              ? "bg-primary-light/10 text-primary-light border border-primary-light/30" 
              : "bg-dc-800 text-dc-400"
          }`}>{m.name}</span>
        ))}
      </div>
    </div>
  ))}
</div>
```

### Key Section: Milestones List

```tsx
{teams.map((team) => (
  <div>
    <div class="flex items-center gap-4 mb-5">
      <span class="text-sm font-mono text-dc-950 bg-dc-500 px-3 py-1 rounded">Team {team.teamNumber}</span>
      <span class="text-base text-dc-300">{team.teamName}</span>
    </div>
    
    <div class="space-y-4">
      {team.milestones.map((m) => (
        <div class="bg-dc-900/30 border border-dc-800 rounded-lg p-5">
          <div class="flex items-start gap-4">
            <span class="text-sm font-mono text-primary-light bg-primary-light/10 px-3 py-1.5 rounded">
              {m.id}
            </span>
            <div class="flex-1">
              <h4 class="text-dc-100 font-medium text-base mb-2">{m.title}</h4>
              <div class="flex items-center gap-2 mb-3">
                <span class="text-sm text-dc-600">Owner:</span>
                <span class="text-sm text-primary-light/80 font-medium">{m.owner}</span>
              </div>
              <p class="text-sm text-dc-500">{m.description}</p>
              {m.contributors && (
                <div class="flex flex-wrap gap-1.5 mt-3">
                  {m.contributors.map((c) => (
                    <span class="text-sm text-dc-400 bg-dc-800 px-2 py-0.5 rounded">{c}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
))}
```

---

## 2026 Internal Roadmap

**Purpose:** Dramatic internal vision document, investor-ready presentation.

**Style:** Maximum visual impact — animated backgrounds, large typography, CSS animations.

### Page Config

```json
{
  "name": "2026",
  "path": "/2026",
  "sections": [
    { "__resolveType": "site/sections/Roadmap2026PasswordGate.tsx", "passwordHash": "..." },
    { "__resolveType": "site/sections/Roadmap2026Hero.tsx",
      "eyebrow": "INTERNAL ROADMAP",
      "year": "2026",
      "title": "The Year deco.cx Became Unstoppable" },
    { "__resolveType": "site/sections/Roadmap2026Transformation.tsx" },
    { "__resolveType": "site/sections/Roadmap2026SelfEvolving.tsx" },
    { "__resolveType": "site/sections/Roadmap2026Story.tsx" },
    { "__resolveType": "site/sections/Roadmap2026Platform.tsx" },
    { "__resolveType": "site/sections/Roadmap2026Metrics.tsx" },
    { "__resolveType": "site/sections/Roadmap2026WhatMadeItPossible.tsx" },
    { "__resolveType": "site/sections/Roadmap2026WhatsNext.tsx" },
    { "__resolveType": "site/sections/Roadmap2026FinalCTA.tsx" }
  ],
  "__resolveType": "website/pages/Page.tsx"
}
```

### Key Section: Hero with Year Display

```tsx
// Large year with gradient text
<div 
  class="font-mono text-[120px] md:text-[200px] lg:text-[280px] font-bold leading-none tracking-tighter text-transparent bg-clip-text"
  style={{
    backgroundImage: "linear-gradient(180deg, #D0EC1A 0%, #8caa25 50%, #07401A 100%)",
  }}
>
  2026
</div>

// Declaration card with gradient border
<div class="relative p-[2px] rounded-2xl bg-gradient-to-r from-primary-light via-primary-dark to-primary-light">
  <div class="bg-dc-900 rounded-2xl px-6 py-5">
    <p class="text-lg text-dc-200 leading-relaxed font-medium italic">
      "Cursor for commerce — it enters your git..."
    </p>
  </div>
</div>
```

### Key Section: Self-Evolving Loop

Visual loop diagram with steps 01-05:

```tsx
const steps = [
  { number: "01", name: "CONNECT", description: "Git, observability..." },
  { number: "02", name: "DETECT", description: "Issues identified..." },
  // ...
];

// Step cards with visual connection
<div class="relative">
  {steps.map((step, i) => (
    <div class="flex items-start gap-6">
      <div class="w-16 h-16 rounded-full bg-primary-light/20 border-2 border-primary-light flex items-center justify-center">
        <span class="text-primary-light font-mono font-bold">{step.number}</span>
      </div>
      <div>
        <h4 class="text-primary-light font-mono font-bold">{step.name}</h4>
        <p class="text-dc-400">{step.description}</p>
      </div>
    </div>
  ))}
  
  {/* Continuous loop indicator */}
  <div class="absolute -right-4 top-1/2 -translate-y-1/2 z-10 bg-dc-950 px-3 py-1 border border-dc-700 rounded-full">
    <span class="text-dc-400 text-sm font-mono">Continuous loop</span>
  </div>
</div>
```

---

## Vanto AI Proposal

**Purpose:** Client-facing executive proposal for AI workshop.

**Style:** Professional elegance — clean cards, quote blocks, stat displays.

### Page Config

```json
{
  "name": "Vanto AI",
  "path": "/vanto-ai",
  "sections": [
    { "__resolveType": "site/sections/VantoPasswordGate.tsx",
      "title": "AI Self-Sufficiency Program",
      "subtitle": "This proposal for Vanto Group is password protected.",
      "buttonText": "View Proposal" },
    { "__resolveType": "site/sections/VantoHero.tsx",
      "eyebrow": "EXECUTIVE WORKSHOP",
      "title": "AI Self-Sufficiency Program",
      "format": "4 sessions × 2 hours",
      "investment": "$7,500 USD",
      "heroImage": "/vanto-hero.png" },
    { "__resolveType": "site/sections/VantoInsight.tsx",
      "keyPoint": "You can do it yourself. You don't need to hire a software house." },
    { "__resolveType": "site/sections/VantoSessions.tsx" },
    { "__resolveType": "site/sections/VantoTimeline.tsx" },
    { "__resolveType": "site/sections/VantoDeliverables.tsx" },
    { "__resolveType": "site/sections/VantoInvestment.tsx" },
    { "__resolveType": "site/sections/VantoCTA.tsx", "image": "/vanto-build.png" }
  ],
  "__resolveType": "website/pages/Page.tsx"
}
```

### Key Section: Insight with Quote

```tsx
// Quote with accent border
<div class="mb-12 p-8 md:p-12 bg-dc-900 border-l-4 border-primary-light rounded-r-2xl">
  <p class="text-xl md:text-2xl text-dc-200 italic leading-relaxed mb-4">
    "{quote}"
  </p>
  <p class="text-dc-500 font-mono text-sm">— {attribution}</p>
</div>

// Key point callout (prominent)
<div class="mb-12 p-8 md:p-14 md:py-10 bg-gradient-to-r from-primary-light/10 to-primary-light/5 border-2 border-primary-light/40 rounded-2xl text-center">
  <p class="text-2xl md:text-3xl lg:text-4xl text-dc-100 font-semibold leading-tight">
    {keyPoint}
  </p>
</div>

// Comparison cards
<div class="grid md:grid-cols-2 gap-6">
  <div class="p-6 bg-dc-900/50 border border-dc-800 rounded-xl">
    <div class="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
      <span class="text-red-400">✕</span>
    </div>
    <span class="text-dc-400 font-mono text-sm uppercase">What you asked for</span>
    <p class="text-dc-200 text-lg">{askedFor}</p>
  </div>
  <div class="p-6 bg-dc-900/50 border border-primary-light/30 rounded-xl">
    <div class="w-8 h-8 rounded-full bg-primary-light/20 flex items-center justify-center">
      <span class="text-primary-light">✓</span>
    </div>
    <span class="text-dc-400 font-mono text-sm uppercase">What you need instead</span>
    <p class="text-dc-100 text-lg font-medium">{needInstead}</p>
  </div>
</div>
```

### Key Section: Timeline

Vertical timeline with dots and week labels:

```tsx
<div class="flex justify-center">
  <div class="inline-block relative">
    {/* Continuous vertical line */}
    <div class="absolute top-0 bottom-0 w-0.5 bg-dc-700" style={{ left: "calc(5rem + 1rem + 6px)" }} />
    
    <div class="space-y-6">
      {items.map((item) => (
        <div class="flex items-center gap-4">
          <span class="w-20 text-right text-dc-500 font-mono text-sm whitespace-nowrap">
            {item.week}
          </span>
          <div class="relative z-10 w-3.5 h-3.5 rounded-full bg-primary-light border-2 border-dc-950 mt-1.5" />
          <span class="text-dc-200">{item.description}</span>
        </div>
      ))}
    </div>
  </div>
</div>
```

---

## Hiring Project

**Purpose:** Technical spec for hiring challenge — clear requirements, professional but pragmatic.

**Style:** Minimal decoration, focus on content, checklists, and structure.

### Page Config

```json
{
  "name": "Hiring Project 01 - Customer Context Agent",
  "path": "/hiring-project-01",
  "sections": [
    { "__resolveType": "site/sections/HiringProjectHero.tsx",
      "badge": "Hiring Project",
      "title": "Customer Context Agent",
      "position": "Financial Dev Analyst",
      "duration": "1-2 weeks",
      "compensation": "R$2.000" },
    { "__resolveType": "site/sections/HiringProjectProblem.tsx" },
    { "__resolveType": "site/sections/HiringProjectTools.tsx" },
    { "__resolveType": "site/sections/HiringProjectRequirements.tsx" },
    { "__resolveType": "site/sections/HiringProjectPhases.tsx" },
    { "__resolveType": "site/sections/HiringProjectEvaluation.tsx" },
    { "__resolveType": "site/sections/HiringProjectFooter.tsx" }
  ],
  "seo": {
    "__resolveType": "website/sections/Seo/SeoV2.tsx",
    "title": "Customer Context Agent | Hiring Project | deco",
    "description": "Build an MCP server that gives our finance team instant access to customer billing and usage data.",
    "image": "https://decocms.com/hiring-hero-og.jpg"
  },
  "__resolveType": "website/pages/Page.tsx"
}
```

### Key Section: Hero (Pragmatic)

```tsx
<section class="w-full bg-dc-950 pt-16 pb-12 md:pt-24 md:pb-16">
  <div class="max-w-[720px] mx-auto px-6">
    {/* Badge */}
    <span class="inline-block px-3 py-1 bg-dc-900 border border-dc-700 rounded text-xs font-mono text-dc-400 uppercase tracking-wider">
      {badge}
    </span>
    
    {/* Title */}
    <h1 class="text-3xl md:text-4xl lg:text-5xl font-medium text-dc-100 mb-4">{title}</h1>
    
    {/* Position */}
    <p class="text-lg text-primary-light mb-6">Position: {position}</p>
    
    {/* Description */}
    <p class="text-lg text-dc-300 mb-8 leading-relaxed">{description}</p>
    
    {/* Quick Info */}
    <div class="flex flex-wrap gap-6 text-sm mb-10">
      <div class="flex items-center gap-2">
        <span class="text-dc-500">Duration:</span>
        <span class="text-dc-200 font-medium">{duration}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-dc-500">Compensation:</span>
        <span class="text-dc-200 font-medium">{compensation}</span>
      </div>
    </div>
    
    {/* Hero Image */}
    {image && (
      <div class="rounded-lg overflow-hidden border border-dc-800">
        <img src={image} alt={title} class="w-full h-auto" />
      </div>
    )}
  </div>
</section>
```

### Key Section: Phases with Checklists

```tsx
{/* The Minimum */}
<div class="mb-12">
  <div class="flex items-center gap-3 mb-4">
    <span class="px-2 py-0.5 bg-dc-700 text-dc-300 text-xs rounded font-medium">Required</span>
    <h3 class="text-xl font-medium text-dc-100">The Minimum</h3>
  </div>
  <p class="text-dc-400 mb-5">This gets you a passing grade:</p>
  
  <div class="space-y-2.5">
    {checklist.map((item) => (
      <div class="flex items-start gap-3">
        <div class="w-4 h-4 mt-0.5 rounded border border-dc-600 flex-shrink-0" />
        <span class="text-dc-300">{item.text}</span>
      </div>
    ))}
  </div>
</div>

{/* Wow Us */}
<div class="border border-primary-light/20 bg-primary-light/5 rounded-lg p-6">
  <div class="flex items-center gap-3 mb-4">
    <span class="px-2 py-0.5 bg-primary-light/10 text-primary-light text-xs rounded font-medium">Stand out</span>
    <h3 class="text-xl font-medium text-dc-100">Wow Us</h3>
  </div>
  
  <h4 class="text-sm font-medium text-dc-200 mb-3">Questions to consider:</h4>
  <ul class="space-y-2">
    {questions.map((q) => (
      <li class="flex items-start gap-2 text-dc-400 text-sm">
        <span class="text-primary-light/60">→</span>
        <span>{q.text}</span>
      </li>
    ))}
  </ul>
</div>
```

### Key Section: Requirements with Links

```tsx
interface RequirementItem {
  text: string;
  link?: string;
  linkText?: string;
}

// Render with clickable links
{items.map((item) => (
  <div class="flex items-start gap-3">
    <div class="w-1.5 h-1.5 rounded-full bg-primary-light mt-2 flex-shrink-0" />
    <span class="text-dc-300">
      {item.text}
      {item.link && (
        <> (<a href={item.link} target="_blank" rel="noopener noreferrer" 
              class="text-primary-light hover:underline">{item.linkText || "link"}</a>)</>
      )}
    </span>
  </div>
))}
```

---

## Common Patterns

### Eyebrow Badge (All Styles)

```tsx
// Flashy (animated)
<div class="inline-flex items-center gap-2 px-4 py-2 bg-dc-800/50 border border-dc-700/50 rounded-full backdrop-blur-sm">
  <div class="w-2 h-2 rounded-full bg-primary-light animate-pulse" />
  <span class="text-dc-400 font-mono text-sm uppercase tracking-wider">{text}</span>
</div>

// Simple
<span class="inline-block px-3 py-1 bg-dc-900 border border-dc-700 rounded text-xs font-mono text-dc-400 uppercase tracking-wider">
  {text}
</span>
```

### Section Title

```tsx
// With eyebrow
<div class="text-center mb-12">
  <span class="text-dc-500 font-mono text-sm uppercase tracking-wider">{eyebrow}</span>
  <h2 class="text-3xl md:text-4xl font-medium text-dc-100 mt-2">{title}</h2>
</div>

// Simple
<h2 class="text-2xl md:text-3xl font-medium text-dc-100 mb-10">{title}</h2>
```

### Card Grid

```tsx
<div class="grid md:grid-cols-2 gap-6">
  {items.map((item) => (
    <div class="p-6 bg-dc-900/50 border border-dc-800 rounded-xl">
      <h3 class="text-lg font-medium text-dc-100 mb-2">{item.title}</h3>
      <p class="text-dc-400">{item.description}</p>
    </div>
  ))}
</div>
```

### Image with Border

```tsx
<div class="rounded-xl overflow-hidden border border-dc-700/50">
  <img src={image} alt={alt} class="w-full h-auto" loading="lazy" />
</div>
```

### CTA Buttons

```tsx
<div class="flex flex-col sm:flex-row gap-4 justify-center">
  <a href={primaryUrl} class="px-8 py-4 bg-primary-light text-dc-950 font-semibold rounded-xl hover:bg-primary-light/90 transition-all text-center">
    {primaryText}
  </a>
  <a href={secondaryUrl} class="px-8 py-4 bg-dc-800 border border-dc-700 text-dc-100 font-medium rounded-xl hover:bg-dc-700 transition-all text-center">
    {secondaryText}
  </a>
</div>
```
