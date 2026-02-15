# Feature Landscape

**Domain:** Stack-agnostic visual CMS with push-based data sync
**Researched:** 2026-02-15 (v1.1 polish update)
**Confidence:** HIGH (based on industry research and existing implementations)

---

## Note on This Document

This document has been updated for **v1.1 milestone** to focus specifically on the five polish features:
1. Connection/project setup wizards
2. Sections/loaders list pages
3. Iframe-based live editors
4. i18n variant management
5. Blocks framework specifications for AI agents

The original v1.0 features (visual editor, page CRUD, etc.) remain documented but are marked as **[BUILT]** for reference.

---

## Table Stakes

Features users expect from a modern headless CMS. Missing any of these and developers/editors will leave for Sanity, Builder.io, or Payload.

| Feature | Why Expected | Complexity | Notes | Status |
|---------|--------------|------------|-------|--------|
| **Visual page editor with drag-and-drop sections** | Every competitor (Builder.io, Plasmic, Storyblok, current deco.cx) has this. Editors refuse to work in JSON. | High | Core product. Must render actual site components, not wireframes. | [BUILT] |
| **Click-to-edit overlays** | Sanity's Content Source Maps + Vercel Visual Editing set the bar. Editors expect to click any element and edit it inline. | Medium | Sanity uses stega encoding; we can use prop-path mapping since we own the render. | [BUILT] |
| **Live preview** | All competitors offer real-time preview. Content changes must reflect in < 1 second. | Medium | Push-based data sync makes this natural -- write config, preview reads synced state. | [BUILT] |
| **Content modeling / typed schemas** | Contentful, Sanity, Payload all have structured content types. Developers expect typed props that generate editor forms. | Medium | Our edge: infer schemas from TypeScript types automatically instead of requiring manual schema definition. | [BUILT] |
| **Component/block registration** | Builder.io and Plasmic let devs register code components for editor use. Without this, the editor is useless. | Medium | Our version: AI auto-discovers components from codebase. Manual registration as fallback. | [BUILT] |
| **Page composition (routes to section arrangements)** | Every page builder maps URLs to ordered lists of sections/blocks. This is the core CMS primitive. | Medium | Store as JSON in `.deco/pages/`. Each page = route + ordered section list + prop overrides. | [BUILT] |
| **Publishing workflow (draft/published states)** | Contentful, Sanity, Storyblok all have draft/published. Editors expect to save work without it going live. | Low | Git branches map naturally: draft = branch, publish = merge to main. | [BUILT] |
| **Version history and rollback** | Git-based CMSs (TinaCMS, Crafter) and API CMSs (Contentful, Sanity) all provide this. | Low | Free with git. Show commit history per page with one-click revert. | [BUILT] |
| **Role-based access control** | Enterprise table stakes. Every CMS has editor/admin/viewer roles. | Low | Inherited from Mesh plugin infrastructure. Already built. | [BUILT] |
| **Media/asset management** | Every CMS has image upload, organization, and CDN delivery. | Medium | Use Mesh object storage plugin. Need: upload UI, image optimization pipeline, CDN URLs. | Deferred to v2 |
| **Responsive preview (mobile/tablet/desktop)** | All visual editors offer device preview toggles. | Low | Iframe resize in editor. Trivial but expected. | [BUILT] |
| **Undo/redo in editor** | Builder.io, Plasmic, Storyblok all have this. Editors expect Ctrl+Z to work. | Low | Command pattern on editor state. Must work across section reordering, prop edits, deletions. | [BUILT] |
| **Search and filter content** | With 50+ pages, editors need to find content. Every CMS has search. | Low | Full-text search over page titles, section types, content values in `.deco/` JSON files. | Deferred |

### v1.1 Polish Features (Table Stakes)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Streamlined project connection wizard** | Webflow, Builder.io, Plasmic all have onboarding flows. Users expect "connect in 5 minutes" not "read docs first." | Medium | Inline wizard detecting framework, scaffolding `.deco/`, validating MCP connection. NO separate settings modal. |
| **Component/section browser page** | WordPress Gutenberg, Webflow, Storyblok all have searchable block libraries with previews. | Low | List view with search, category filtering, and block metadata. Dependency: scanner must produce block definitions. |
| **Loader management page** | Sanity has data sources, Contentful has integrations. Managing where data comes from is table stakes for data-driven CMSs. | Low | List loaders, show sync status, navigate to detail view. Must be as prominent as Sections page. |
| **Iframe bridge with origin validation** | Every iframe-based editor (dotCMS Universal Visual Editor, Builder.io, email-builder) uses postMessage with strict security. | Low | Already using postMessage. Need: multi-layer validation (origin + source + token + sanitization). |
| **i18n variant management at page level** | Contentful, Strapi 5, Storyblok all have locale management. Supporting multiple languages is expected for any production CMS. | Medium | NOT field-level (anti-pattern). Page-level variants: `page_home.en-US.json` convention with locale switcher in editor. |

---

## Differentiators

Features that set this product apart from competitors. These are the reasons someone chooses deco over Sanity or Builder.io.

| Feature | Value Proposition | Complexity | Notes | Status |
|---------|-------------------|------------|-------|--------|
| **AI-powered codebase onboarding** | No competitor does this. Builder.io and Plasmic require manual component registration. We scan the codebase, identify components, infer prop schemas from TypeScript types, and auto-generate block definitions. Zero-config CMS setup. | High | Core differentiator. The "connect your repo, get a CMS in 5 minutes" experience. Must handle React, Next.js, Astro, FastStore component patterns. | Deferred to v2 |
| **Push-based data sync (ElectricSQL-inspired)** | No headless CMS does this. Sanity/Contentful fetch on request. Our loaders continuously sync data to immutable storage. Sites are always fast, always available, resilient to upstream API failures. | High | Core differentiator. Loaders as sync pipelines, not request-time fetchers. Shape-based subscriptions for incremental updates. | Deferred to v2 |
| **Loaders as first-class editor citizens** | Every CMS treats data fetching as a developer-only concern. We give loaders equal prominence to sections in the visual editor. Editors can configure which API data feeds which section, see sync status, understand freshness. | Medium | Unique positioning. Loaders get their own editor panel, connection visualization, and health monitoring. | [BUILT] — needs polish |
| **True stack-agnostic (any TypeScript site)** | Builder.io works with React/Vue/Angular. Plasmic is React-only. Sanity/Contentful are API-only (no visual editing of your actual components). We work with ANY TypeScript site -- Next.js, Astro, FastStore, Lovable output, plain Vite+React. | High | Requires framework adapters, but the core block system is framework-agnostic. TypeScript type inference is the universal language. | [BUILT] |
| **Git-native storage (no database for content config)** | TinaCMS is the only competitor that's truly git-based, but it's limited to Markdown. We store page compositions, block configs, and loader configs as JSON in `.deco/` -- reviewable in PRs, branchable, no vendor lock-in. | Medium | Unlike TinaCMS, we handle structured component data, not just markdown. Unlike Sanity/Contentful, there's no proprietary content lake. | [BUILT] |
| **SPA/SSG-first with SSR opt-in** | Most CMSs are SSR-first (Next.js assumption). We steer toward SSG + synced data, which is faster, cheaper, and more resilient. SSR only when justified (personalization, real-time pricing). | Medium | Contrarian but correct for 90% of sites. Push-based data sync makes this viable. | Deferred to v2 |
| **AI content copilot (natural language to page)** | Builder.io has AI page generation. We go further: AI understands your specific component library (because it onboarded it) and can assemble pages, suggest sections, and fill content using your actual blocks. | High | Phase 2+ feature. Builds on the onboarding AI's component graph. Much more useful than generic AI because it knows YOUR components. | Deferred to v2 |
| **Tunnel-based local development** | No CMS offers "edit in cloud admin, see changes on localhost in real-time." We tunnel the local dev server into the editor, so developers see visual edits on their actual running dev environment. | Medium | Already built in Mesh infrastructure. Massive DX advantage over competitors where local dev is disconnected from CMS. | [BUILT] |

### v1.1 Polish Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Blocks framework specification for AI agents** | No CMS documents their component system in agent-readable format. We make ANY AI agent capable of making a site deco-compatible by following a spec. | Low | Unique to deco. JSON Schema + conventions doc = AI agents can scaffold blocks without human intervention. |
| **Inline connection wizard (not settings modal)** | Most CMSs hide connection setup in settings. Baseplate-style wizard brings it front and center in first-run experience. | Low | UX differentiator. Frameworks detect automatically, suggest configs, validate before proceeding. |
| **Page-level i18n (not field-level)** | Contentful/Sanity do field-level translation management — massive complexity, vendor lock-in. We use locale-suffixed page files. | Medium | Simpler, git-reviewable, integrates with Crowdin/Phrase without proprietary APIs. |

---

## Anti-Features

Features to explicitly NOT build. Learned from admin-cx bloat and competitor mistakes.

| Anti-Feature | Why Avoid | What to Do Instead | v1.1 Notes |
|--------------|-----------|-------------------|------------|
| **Theme editor / global design tokens UI** | Current admin-cx has this and nobody uses it. Developers control design in code (Tailwind config, CSS variables). A CMS theme editor creates a parallel, inferior design system. | Respect the developer's Tailwind/CSS config. Surface design tokens as read-only reference in editor, not editable. | Confirmed: NO theme editor in wizard or settings |
| **Built-in SEO panel** | Current admin-cx has SEO settings that duplicate what frameworks already handle. Meta tags belong in code or as simple section props, not a dedicated panel. | Expose SEO-relevant props (title, description, og:image) as regular section props on a Head/SEO section block. | Confirmed: NO SEO panel |
| **Complex multi-environment content branching** | Contentful Spaces, Sanity datasets -- these create operational complexity that small-to-mid teams never need. Git branches already solve this. | Git branches ARE environments. Main = production. Feature branches = staging/preview. No additional abstraction needed. | Confirmed: branches only |
| **Built-in A/B testing / personalization engine** | Contentful, Optimizely, Builder.io bundle this. It's a different product with different expertise (statistics, targeting). Doing it poorly is worse than not doing it. | Integrate with dedicated tools (LaunchDarkly, Statsig, Optimizely). Expose variant props on sections so external tools can swap content. | Confirmed: NO A/B testing |
| **Built-in analytics dashboard** | Duplicates Google Analytics, Plausible, etc. The admin-cx analytics panel is underused. | Integrate with Mesh observability. Link to external analytics. Don't build charts. | Confirmed: NO analytics dashboard |
| **Proprietary rich text editor** | Sanity's Portable Text, Contentful's Rich Text -- both create vendor lock-in and migration nightmares. Complex rich text editing is a bottomless pit of bugs. | Use Markdown/MDX for rich content. For structured content, use typed section props (heading, paragraph, image arrays). Escape the rich text trap. | Confirmed: Markdown or typed props only |
| **Proprietary content API / query language** | Sanity has GROQ, Contentful has GraphQL with proprietary schema. These create lock-in. | Content is files in git. Read them directly, or use the synced data layer. No proprietary query language needed. | Confirmed: no query language |
| **Form builder / workflow automation** | Feature creep. Many CMSs try to become low-code platforms. This dilutes the core CMS value. | Stay focused: pages, sections, loaders, data. Forms are a section type the developer builds, not a CMS feature. | Confirmed: NO form builder |
| **Marketplace / plugin store** | Builder.io and Plasmic have component stores. These fill a gap when component registration is hard. Our AI onboarding eliminates this gap -- you already have YOUR components. | The developer's codebase IS the component store. AI discovers what's there. No marketplace needed. | Confirmed: NO marketplace |

### v1.1 Anti-Features (Specific to Polish)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Field-level i18n with translation workflows** | Contentful/Sanity/Strapi do this — massive UI complexity, proprietary storage, vendor lock-in. Most teams use Crowdin/Phrase anyway. | Page-level variants as locale files. Props ARE the content. Integrate with external translation management tools. |
| **Inline locale fallback chains in UI** | Contentful lets you configure de-CH → de-AT → de-DE in the UI. Complex, hard to reason about, brittle. | Simple fallback: missing variant → default locale. Configure fallback logic in code if needed, not in CMS UI. |
| **Visual block preview thumbnails in sections list** | Tempting, but high maintenance cost. Components change, previews go stale, storage bloat. | Show block names, descriptions, and metadata. Use search/filter. If users need visual reference, they see it in the page composer. |
| **Multi-step onboarding wizard with 5+ screens** | Users abandon long wizards. The Salesforce approach (multi-page questionnaires) has low completion rates. | Single screen with smart defaults. Framework auto-detected → suggest config → validate → done. 3 steps max. |
| **Translation memory / glossary management in CMS** | This is what Crowdin/Phrase/Lokalise do. Don't compete with specialized tools. | Export locale files for translation tools, import results. CMS is the source of truth for page structure, not translation workflow. |

---

## Feature Dependencies

```
AI Codebase Onboarding (v2)
  --> Component/Block Registration (AI generates these) [BUILT]
  --> Typed Schema Inference (from TypeScript types) [BUILT]

Component/Block Registration [BUILT]
  --> Visual Page Editor (needs blocks to compose) [BUILT]
  --> Page Composition (needs blocks to arrange) [BUILT]
  --> Sections Browser Page (v1.1) [ACTIVE]

Page Composition (routes + section lists) [BUILT]
  --> Live Preview (needs composition to render) [BUILT]
  --> Click-to-Edit Overlays (needs composition for prop mapping) [BUILT]
  --> Publishing Workflow (draft/publish of compositions) [BUILT]
  --> i18n Variant System (v1.1) [ACTIVE]
      --> Locale Switcher in Editor
      --> Locale-Suffixed Page Files

Push-Based Data Sync (v2)
  --> Loader Editor UI (configure and monitor loaders) [BUILT — needs polish]
  --> SSG/SPA Rendering (reads from synced data)
  --> Offline Resilience (synced data survives upstream failure)

Git-Based Storage [BUILT]
  --> Version History (git log per page) [BUILT]
  --> Publishing Workflow (branches as drafts) [BUILT]
  --> Multi-Environment (branches as environments) [BUILT]

Mesh Plugin Infrastructure (pre-existing) [BUILT]
  --> Auth / RBAC (inherited) [BUILT]
  --> Media/Asset Management (object storage plugin) [Deferred]
  --> Observability (inherited) [BUILT]
  --> Event Bus (inherited) [BUILT]
  --> Tunnel Infrastructure (inherited) [BUILT]

Iframe-Based Visual Editor [BUILT]
  --> postMessage Bridge (v1.1 polish) [ACTIVE]
      --> Origin Validation
      --> Multi-Layer Security
      --> Token-Based Authentication
  --> Live Prop Editing [BUILT]
  --> Click-to-Select [BUILT — needs fix]

Blocks Framework Specification (v1.1) [ACTIVE]
  --> AI Agent Compatibility
  --> Automated Site Scaffolding
  --> Component Registration Automation
```

### v1.1 Dependency Notes

- **Sections Browser requires Block Scanner:** The scanner must have produced `.deco/blocks/` definitions before the browser can list them.
- **Loaders Page requires Loader Scanner:** Similar to sections — loaders must be scanned and stored before they can be listed.
- **i18n Variant System requires Page Composition:** Variants are copies of page files with locale suffixes. The base page system must work first.
- **Iframe Security enhancements depend on existing postMessage bridge:** We're hardening what's there, not replacing it.
- **Blocks Framework Specification is standalone:** It documents conventions but doesn't depend on v1.0 code. It's a deliverable for AI agents.

---

## MVP Recommendation

### Phase 1: Core Editor (must ship first) — [COMPLETE]

Prioritize:
1. **Component/block registration** (manual first, AI later) -- without blocks, nothing works
2. **Page composition** (route to section list mapping) -- the core CMS primitive
3. **Visual page editor** with drag-and-drop sections -- the thing editors actually interact with
4. **Live preview** -- editors must see what they're building
5. **Git-based storage** in `.deco/` -- enables version history and publishing for free
6. **Typed schema inference** from TypeScript props -- auto-generates editor forms

### Phase 2: Data Layer + AI Onboarding — [DEFERRED TO v2]

Prioritize:
1. **AI codebase onboarding** -- the "wow moment" that converts developers
2. **Push-based data sync** (loaders syncing to immutable storage) -- the performance/resilience differentiator
3. **Loader editor UI** -- first-class loader management
4. **Click-to-edit overlays** -- elevates editor experience from good to great

### Phase 3: Production Polish — [DEFERRED TO v2]

Prioritize:
1. **Publishing workflow** (draft/published via git branches)
2. **Media/asset management** with CDN delivery
3. **Tunnel-based local development**
4. **AI content copilot** (natural language to page assembly)

### v1.1: Integration Polish — [ACTIVE]

Prioritize:
1. **Connection setup wizard** -- inline, framework-detecting, 3 steps max
2. **Sections page** -- list scanned blocks with search/filter
3. **Loaders page** -- list loaders with detail view
4. **Iframe bridge hardening** -- multi-layer postMessage validation
5. **i18n variant system** -- page-level locale files with switcher UI
6. **Blocks framework spec** -- agent-readable JSON Schema + conventions doc

### Defer indefinitely:

- **A/B testing** -- integrate with external tools
- **Multi-language UI** -- integrate with Crowdin/Phrase
- **Analytics dashboard** -- use Mesh observability + external tools
- **Theme editor** -- let developers own design in code
- **Field-level i18n** -- page-level variants sufficient

---

## Feature Prioritization Matrix

### v1.1 Features Only

| Feature | User Value | Implementation Cost | Dependencies | Priority |
|---------|------------|---------------------|--------------|----------|
| Connection Setup Wizard | HIGH | MEDIUM | MCP connection, framework detection | P1 |
| Sections Browser Page | HIGH | LOW | Block scanner already built | P1 |
| Loaders Browser Page | HIGH | LOW | Loader scanner already built | P1 |
| Iframe Bridge Security | HIGH | LOW | Existing postMessage bridge | P1 |
| i18n Variant System | MEDIUM | MEDIUM | Page composition system | P1 |
| Blocks Framework Spec | LOW | LOW | None (documentation) | P2 |
| anjo.chat Validation | HIGH | MEDIUM | All v1.0 + v1.1 features | P1 |

**Priority key:**
- P1: Must have for v1.1 release
- P2: Should have, add when time permits
- P3: Nice to have, future consideration (none in v1.1)

---

## Competitor Feature Analysis

### Connection Setup / Onboarding

| Feature | Builder.io | Webflow | Storyblok | Our Approach |
|---------|------------|---------|-----------|--------------|
| Initial Setup | Manual SDK installation, API key config | Hosted (no connection needed) | Git provider OAuth + webhook setup | Inline wizard with MCP connection, framework auto-detection |
| Component Registration | Manual `Builder.registerComponent()` calls | Built-in components only (closed system) | Manual schema definition in UI | AI scanner (v2) or manual registration via `.deco/blocks/` |
| Time to First Edit | 30-60 min (SDK setup, docs reading) | Immediate (hosted) | 15-30 min (git setup, schema definition) | Target: 5 min (connect → scan → edit) |

### Component/Section Browser

| Feature | WordPress Gutenberg | Webflow | Storyblok | Our Approach |
|---------|---------------------|---------|-----------|--------------|
| Block Library UI | Sidebar with search, grouped by category, hover preview | Component panel with categories and search | Content type list with metadata | List view with search, category filter, metadata display |
| Preview | Live preview on hover | Thumbnail + description | Schema preview | Description + metadata (no thumbnails — anti-feature) |
| Organization | Categories + tags | Folders + tags | Manual grouping | Auto-categorized by scanner (v2) or manual tags |

### Iframe-Based Editors

| Feature | dotCMS Universal | email-builder | Builder.io | Our Approach |
|---------|------------------|---------------|------------|--------------|
| Communication | postMessage with origin validation | postMessage (bidirectional) | postMessage + SDK | postMessage with multi-layer validation |
| Security | Origin checks, structured messages | Event.origin validation | Token-based auth + origin checks | Origin + source + token + input sanitization |
| Preview Updates | Live via postMessage | Live via postMessage | Live via postMessage | Already live — hardening security in v1.1 |

### i18n / Localization

| Feature | Contentful | Strapi 5 | Storyblok | Our Approach |
|---------|------------|----------|-----------|--------------|
| Scope | Field-level translation | Field-level translation | Field-level + folder-level | Page-level only (simpler) |
| Fallback | Custom fallback chains (de-CH → de-AT → de-DE) | Built-in fallback to default | Configurable fallback | Missing variant → default locale |
| Storage | Proprietary content API | Database with locale columns | Proprietary API | Locale-suffixed JSON files in git |
| UI | Inline side-by-side editing, translation status | Locale switcher per field | Locale switcher + folder structure | Locale switcher, copy variant, no side-by-side |
| Integration | Translation API webhooks | Proprietary plugins | Proprietary plugins | Export/import for Crowdin/Phrase |

### Developer Specifications

| Feature | Sanity | Payload | Plasmic | Our Approach |
|---------|--------|---------|---------|--------------|
| Schema Definition | GROQ schema with TypeScript types | Config-as-code with TypeScript | React component props | TypeScript inference + JSON Schema |
| Documentation Format | API reference + examples | API docs + guides | SDK docs | Agent-readable JSON Schema + conventions doc |
| AI Agent Compatibility | None (human-readable only) | None (human-readable only) | None (human-readable only) | **Differentiator:** Explicit agent-readable spec |

---

## v1.1 Feature Details

### 1. Connection Setup Wizard

**Table Stakes:**
- Framework auto-detection (React, Next.js, Astro, FastStore)
- MCP connection validation
- `.deco/` scaffolding if missing
- Clear error messages for connection failures

**Differentiators:**
- Inline wizard (not separate settings modal)
- Smart defaults based on detected framework
- 3 steps max (detect → configure → validate)

**Complexity:** Medium (requires framework detection logic + MCP validation)

**Implementation Notes:**
- Detect framework from `package.json` and file structure
- Suggest config based on framework (e.g., Next.js → pages/api, Astro → src/pages)
- Validate MCP capabilities before proceeding
- Show progress indicators for each step
- Handle errors gracefully (e.g., MCP not connected → show instructions)

**Dependencies:**
- MCP connection (already built)
- File operations via SITE_BINDING (already built)

---

### 2. Sections Browser Page

**Table Stakes:**
- List all scanned blocks
- Search by name/description
- Filter by category/tags
- Navigate to block detail view

**Differentiators:**
- Metadata display (props, file location, last modified)
- Clear indication of manual vs. AI-scanned blocks (v2)

**Complexity:** Low (UI layer over existing scanner output)

**Implementation Notes:**
- Read `.deco/blocks/` directory
- Display block name, description, props count
- Search implemented client-side (small dataset)
- Categories auto-derived from file path or manual tags

**Dependencies:**
- Block scanner (already built)
- `.deco/blocks/` directory structure

**Anti-Features to Avoid:**
- Visual thumbnails (high maintenance, storage bloat)
- Inline prop editing (belongs in page composer, not browser)

---

### 3. Loaders Browser Page

**Table Stakes:**
- List all loaders
- Show sync status (if using push-based sync in v2)
- Navigate to loader detail view
- Clear indication of loader purpose

**Differentiators:**
- Equal prominence to Sections page
- Health monitoring (sync success/failure)
- Data freshness indicators

**Complexity:** Low (UI layer over existing loader scanner)

**Implementation Notes:**
- Read `.deco/loaders/` directory
- Display loader name, description, data source
- Sync status placeholder (future: live status from sync layer)
- Detail view shows schema, parameters, output type

**Dependencies:**
- Loader scanner (already built)
- `.deco/loaders/` directory structure

---

### 4. Iframe Bridge Security Hardening

**Table Stakes:**
- Origin validation on all postMessage events
- Structured message format validation
- No `*` targetOrigin in production

**Differentiators:**
- Multi-layer validation (origin + source + token + sanitization)
- Defense-in-depth approach

**Complexity:** Low (hardening existing bridge)

**Implementation Notes:**
- Layer 1: `event.origin` must match trusted origins list
- Layer 2: `event.source` must match known iframe window reference
- Layer 3: Token-based authentication (shared secret between parent and iframe)
- Layer 4: Input sanitization before processing message data
- All messages use typed schemas (e.g., `{ type: "PROP_UPDATE", path: string, value: unknown }`)

**Dependencies:**
- Existing postMessage bridge (already built)

**Security Best Practices from Research:**
- Never use `targetOrigin: "*"` in production
- Always validate `event.origin` before processing
- Use HTTPS exclusively
- Treat all incoming messages as untrusted until validated

---

### 5. i18n Variant Management

**Table Stakes:**
- Locale switcher in editor
- Create variant for new locale
- Copy existing variant to new locale
- Missing variant → show default locale

**Differentiators:**
- Page-level variants (NOT field-level)
- Git-reviewable (locale files are just JSON with suffix)
- No proprietary APIs (integrates with Crowdin/Phrase via export/import)

**Complexity:** Medium (new feature, impacts page composition system)

**Implementation Notes:**
- Page file convention: `page_home.json` (default), `page_home.en-US.json`, `page_home.pt-BR.json`
- Locale switcher in editor toolbar
- "Create variant" copies default page with locale suffix
- Missing variant → load default page (simple fallback)
- No inline side-by-side editing (anti-feature)

**Dependencies:**
- Page composition system (already built)
- File operations via SITE_BINDING (already built)

**Anti-Features to Avoid:**
- Field-level translation (use page-level instead)
- Complex fallback chains (missing → default only)
- Translation memory / glossary (use external tools)
- Inline locale comparison (too complex)

**Integration with External Tools:**
- Export: generate JSON files for Crowdin/Phrase
- Import: read translated JSON files back into `.deco/pages/`
- Translation workflow happens OUTSIDE the CMS

---

### 6. Blocks Framework Specification

**Table Stakes:**
- JSON Schema for block definitions
- Conventions document (file structure, naming, etc.)
- Example blocks with annotations

**Differentiators:**
- **Agent-readable format** (not just human docs)
- Explicit instructions for AI agents
- Validation rules that agents can check

**Complexity:** Low (documentation + schema definition)

**Implementation Notes:**
- Create `.deco/BLOCKS_SPEC.md` with:
  - Block definition structure
  - Required fields (name, props schema, render function)
  - File naming conventions
  - Directory structure
  - TypeScript type inference rules
- Create JSON Schema for block definition validation
- Include example blocks (Hero, Feature, Testimonial)
- Add "How to make your site deco-compatible" guide for AI agents

**Purpose:**
- ANY AI agent (Claude, GPT, etc.) can read this spec and make a site deco-compatible
- Reduces manual intervention for onboarding
- Enables automated site scaffolding

**Dependencies:** None (standalone documentation)

---

## Sources

### v1.0 Research Sources
- [Sanity Visual Editing](https://www.sanity.io/docs/visual-editing/introduction-to-visual-editing)
- [Sanity Content Source Maps](https://www.sanity.io/docs/visual-editing/content-source-maps)
- [Sanity Overlays](https://www.sanity.io/docs/visual-editing/visual-editing-overlays)
- [Builder.io Visual Editing](https://www.builder.io/m/knowledge-center/visual-editing)
- [Builder.io AI Components](https://www.builder.io/blog/ai-components)
- [Builder.io Code Components](https://www.plasmic.app/code-components)
- [Plasmic Component Registration](https://docs.plasmic.app/learn/registering-code-components/)
- [Plasmic Customizable Components](https://docs.plasmic.app/learn/customizable-components-overview/)
- [TinaCMS GitHub](https://github.com/tinacms/tinacms)
- [TinaCMS Visual Editing on Vercel](https://vercel.com/blog/visual-editing-meets-markdown)
- [Payload CMS 3.0 Announcement](https://payloadcms.com/posts/blog/payload-30-the-first-cms-that-installs-directly-into-any-nextjs-app)
- [Contentful Content Modeling](https://www.contentful.com/help/content-models/content-modelling-basics/)
- [Contentful AI Content Type Generator](https://www.contentful.com/blog/jumpstart-your-content-modeling-with-the-ai-content-type-generator/)
- [Contentful Experimentation](https://www.contentful.com/products/personalization/experimentation/)
- [Git-Based Headless CMS Advantages](https://craftercms.com/blog/2022/04/advantages-of-a-git-based-headless-cms)
- [Headless CMS for Content Managers 2025](https://kontent.ai/blog/best-headless-cms-for-content-managers-and-marketing-teams/)
- [deco.cx GitHub](https://github.com/deco-cx/deco)

### v1.1 Research Sources

**Connection Setup / Onboarding:**
- [What is an Onboarding Wizard (with Examples)](https://userguiding.com/blog/what-is-an-onboarding-wizard-with-examples)
- [Onboarding Wizard | One to One Hundred](https://1to100.com/baseplate/features/onboarding-wizard/)
- [Salesforce Offline App Onboarding Wizard](https://developer.salesforce.com/blogs/2023/07/introducing-the-salesforce-offline-app-onboarding-wizard)
- [HubSpot CRM Implementation Guide 2026](https://www.rolustech.com/blog/hubspot-crm-implementation-step-by-step-guide-for-2026)
- [Customer Onboarding Best Practices: 10 Proven Tips](https://blog.screendesk.io/customer-onboarding-best-practices/)
- [Onboarding and Connecting Smart Devices: 5 Guidelines](https://www.nngroup.com/articles/smart-device-onboarding/)

**Component Browser / Sections:**
- [Payload: The Next.js Headless CMS](https://payloadcms.com/)
- [Best Headless CMS for Developers in 2026](https://prismic.io/blog/best-headless-cms-for-developers)
- [Storyblok — Headless CMS with Visual Editor](https://www.storyblok.com/)
- [Builder.io Registering Custom Components](https://www.builder.io/c/docs/custom-components-setup)
- [WordPress Gutenberg Block Library](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-block-library/)
- [Webflow Libraries](https://help.webflow.com/hc/en-us/articles/33961343551763-Libraries)
- [Best Component Libraries for Webflow 2026](https://www.flowvibe.studio/blog/best-component-libraries-for-webflow-designers-in-2026)
- [Tagging content entries and creating custom views](https://www.builder.io/c/docs/tags-and-views)

**Iframe Editors / postMessage Security:**
- [Technical Deep Dive: dotCMS Universal Visual Editor](https://docs.dotcms.com/blog/post/mastering-the-new-universal-visual-editor-in-dotcms)
- [Window: postMessage() method - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [Seamless Communication Between Parent and iFrame Using postMessage()](https://medium.com/@hanifmaliki/seamless-communication-between-parent-and-iframe-using-postmessage-201becfe6a75)
- [Building a Secure Code Sandbox: iframe isolation and postMessage](https://medium.com/@muyiwamighty/building-a-secure-code-sandbox-what-i-learned-about-iframe-isolation-and-postmessage-a6e1c45966df)
- [Steps Involved in Improving Iframe Security](https://jscrambler.com/blog/improving-iframe-security)
- [2026 Iframe Security Risks and 10 Ways to Secure Them](https://qrvey.com/blog/iframe-security/)
- [Securing Cross-Window Communication: A Guide to postMessage](https://www.bindbee.dev/blog/secure-cross-window-communication)
- [Play safely in sandboxed IFrames](https://web.dev/articles/sandboxed-iframes)

**i18n / Localization:**
- [Strapi 5 i18n Guide: Multilingual SEO & Internationalization](https://strapi.io/blog/strapi-5-i18n-complete-guide)
- [Internationalization | Strapi 5 Documentation](https://docs.strapi.io/cms/features/internationalization)
- [Localization with Contentful](https://www.contentful.com/developers/docs/tutorials/general/setting-locales/)
- [Contentful Localization Strategies](https://www.contentful.com/help/localization/field-and-entry-localization/)
- [Contentful Manage Locales](https://www.contentful.com/help/localization/manage-locales/)
- [Payload i18n Documentation](https://payloadcms.com/docs/configuration/i18n)
- [Headless CMS for Localization | Storyblok](https://www.storyblok.com/lp/localization-cms)
- [Getting Internationalization Right With Remix And Headless CMS](https://www.smashingmagazine.com/2023/02/internationalization-i18n-right-remix-headless-cms-storyblok/)

**AI Agent Protocols / Framework Specs:**
- [AI Agent Protocols 2026: Complete Guide](https://www.ruh.ai/blogs/ai-agent-protocols-2026-complete-guide)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [Build with Google's A2UI Spec: Agent User Interfaces](https://www.copilotkit.ai/blog/build-with-googles-new-a2ui-spec-agent-user-interfaces-with-a2ui-ag-ui)
- [Best CMS Platforms for Developers (2026 Edition)](https://cmsminds.com/blog/cms-for-developers/)
- [8 Best CMS for Developers in 2026](https://hygraph.com/blog/best-cms-for-developers)

---

*Feature research for: deco.cx v2 — Stack-Agnostic Agentic CMS*
*v1.0 researched: 2026-02-14*
*v1.1 updated: 2026-02-15*
