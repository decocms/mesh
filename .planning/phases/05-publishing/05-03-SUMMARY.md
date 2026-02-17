---
phase: 05-publishing
plan: 03
subsystem: ui
tags: [react-19, vite-7, tailwind-4, react-router-7, starter-template, prerender, cms-sections]

# Dependency graph
requires:
  - phase: 02-scanning
    provides: "Block definition schema (BlockDefinition type, JSON Schema per section)"
  - phase: 04-loaders
    provides: "Loader definition schema (LoaderDefinition type)"
provides:
  - "Complete starter template package with React 19, Vite 7, Tailwind 4"
  - "Three example sections (Hero, Features, Footer) with typed props for CMS scanner"
  - "Example products loader with typed input/output"
  - ".deco/ scaffolding with pre-configured pages, blocks, and loaders"
  - "React Router 7 prerender config reading .deco/pages/ for static generation"
  - "Section registry pattern for mapping blockType to React components"
affects: [cli, publishing, onboarding]

# Tech tracking
tech-stack:
  added: [react-19, react-router-7, vite-7, tailwindcss-4, "@tailwindcss/vite", "@react-router/dev", "@react-router/node"]
  patterns: [section-registry, cms-page-rendering, prerender-from-deco-pages, import-meta-glob-pages]

key-files:
  created:
    - packages/starter-template/package.json
    - packages/starter-template/react-router.config.ts
    - packages/starter-template/vite.config.ts
    - packages/starter-template/app/root.tsx
    - packages/starter-template/app/routes/home.tsx
    - packages/starter-template/app/routes/$.tsx
    - packages/starter-template/app/components/sections/hero.tsx
    - packages/starter-template/app/components/sections/features.tsx
    - packages/starter-template/app/components/sections/footer.tsx
    - packages/starter-template/app/loaders/products.ts
    - packages/starter-template/.deco/pages/page_home.json
    - packages/starter-template/.deco/blocks/sections--Hero.json
    - packages/starter-template/.deco/blocks/sections--Features.json
    - packages/starter-template/.deco/blocks/sections--Footer.json
    - packages/starter-template/.deco/loaders/loaders--products.json
    - packages/starter-template/README.md
  modified: []

key-decisions:
  - "Kebab-case filenames for sections (hero.tsx not Hero.tsx) to satisfy monorepo oxlint kebab-case rule"
  - "Local cn() utility in app/lib/utils.ts instead of @deco/ui dependency for standalone template"
  - "import.meta.glob for catch-all route page loading instead of dynamic fs reads"
  - "Section registry pattern mapping blockType string to React component for page rendering"

patterns-established:
  - "Section registry: Record<string, React.ComponentType<any>> mapping blockType IDs to components"
  - "CMS page rendering: routes read .deco/pages/ JSON, iterate blocks array, resolve via registry"
  - "Prerender discovery: react-router.config.ts reads .deco/pages/ at build time for static routes"
  - "Catch-all route: $.tsx handles all CMS-managed dynamic pages"

# Metrics
duration: 4min
completed: 2026-02-14
---

# Phase 5 Plan 3: Starter Template Summary

**React 19 + Vite 7 + Tailwind 4 starter template with three example sections, products loader, and .deco/ CMS scaffolding for prerendered static sites**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-14T14:23:04Z
- **Completed:** 2026-02-14T14:27:30Z
- **Tasks:** 2
- **Files modified:** 22

## Accomplishments
- Complete starter template with React 19, Vite 7, Tailwind CSS 4, and React Router 7
- Three example sections (Hero, Features, Footer) with rich TypeScript prop interfaces discoverable by CMS scanner
- Pre-configured .deco/ directory with home page, block definitions (JSON Schema), and loader definition
- React Router 7 prerender config that reads .deco/pages/ to generate static routes at build time

## Task Commits

Each task was committed atomically:

1. **Task 1: Create starter template package with build toolchain and example sections** - `abad437` (feat)
2. **Task 2: Add .deco/ scaffolding with pre-configured pages, blocks, and loaders** - `898142e` (feat)

## Files Created/Modified
- `packages/starter-template/package.json` - Template package with React 19, Vite 7, Tailwind 4, React Router 7
- `packages/starter-template/vite.config.ts` - Vite config with Tailwind and React Router plugins
- `packages/starter-template/react-router.config.ts` - Prerender config reading .deco/pages/
- `packages/starter-template/tsconfig.json` - TypeScript config with react-jsx, bundler resolution
- `packages/starter-template/tailwind.config.ts` - Tailwind 4 content paths config
- `packages/starter-template/app/root.tsx` - Root layout with Tailwind CSS import
- `packages/starter-template/app/routes.ts` - Route definitions (index + catch-all)
- `packages/starter-template/app/routes/home.tsx` - Home page rendering sections from page_home.json
- `packages/starter-template/app/routes/$.tsx` - Catch-all CMS page route using import.meta.glob
- `packages/starter-template/app/components/sections/hero.tsx` - Hero section with title, subtitle, CTA
- `packages/starter-template/app/components/sections/features.tsx` - Feature grid with icons and columns
- `packages/starter-template/app/components/sections/footer.tsx` - Footer with links and copyright
- `packages/starter-template/app/loaders/products.ts` - Example products loader with mock data
- `packages/starter-template/app/lib/utils.ts` - cn() utility for className merging
- `packages/starter-template/.deco/pages/page_home.json` - Pre-configured home page with 3 blocks
- `packages/starter-template/.deco/blocks/sections--Hero.json` - Hero block definition with JSON Schema
- `packages/starter-template/.deco/blocks/sections--Features.json` - Features block definition with nested array schema
- `packages/starter-template/.deco/blocks/sections--Footer.json` - Footer block definition with links array schema
- `packages/starter-template/.deco/loaders/loaders--products.json` - Products loader with input/output schemas
- `packages/starter-template/README.md` - Quick start guide and project structure docs
- `packages/starter-template/app/app.css` - Tailwind CSS import
- `packages/starter-template/public/favicon.ico` - Placeholder favicon

## Decisions Made
- **Kebab-case filenames:** Monorepo oxlint enforces kebab-case filenames. Renamed Hero.tsx -> hero.tsx, Features.tsx -> features.tsx, Footer.tsx -> footer.tsx. Block definitions still reference kebab-case paths.
- **Local cn() utility:** Added a minimal cn() function in app/lib/utils.ts rather than depending on @deco/ui, keeping the template standalone and zero-dependency on internal packages.
- **import.meta.glob for page loading:** The catch-all route uses Vite's import.meta.glob to eagerly load all .deco/pages/*.json at build time, avoiding runtime fs access in the browser.
- **Section registry pattern:** Both home.tsx and $.tsx use a sectionRegistry object mapping blockType strings to React components, establishing the standard pattern for CMS page rendering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed section files to kebab-case**
- **Found during:** Task 1 (section file creation)
- **Issue:** Monorepo oxlint enforces kebab-case filenames; Hero.tsx, Features.tsx, Footer.tsx were rejected
- **Fix:** Renamed to hero.tsx, features.tsx, footer.tsx; updated all import paths
- **Files modified:** hero.tsx, features.tsx, footer.tsx, home.tsx, $.tsx
- **Verification:** Linter passes with 0 errors
- **Committed in:** abad437 (Task 1 commit)

**2. [Rule 3 - Blocking] Added cn() utility for className interpolation**
- **Found during:** Task 1 (features.tsx className)
- **Issue:** Monorepo oxlint require-cn-classname rule requires cn() for any dynamic className
- **Fix:** Created app/lib/utils.ts with minimal cn() function; used in features.tsx
- **Files modified:** app/lib/utils.ts, features.tsx
- **Verification:** Linter passes with 0 errors
- **Committed in:** abad437 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes required by monorepo lint rules. No scope creep -- files are functionally identical.

## Issues Encountered
None beyond the lint-driven deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Starter template ready for `deco create` scaffolding integration (05-01/05-02)
- All sections have typed props that CMS scanner (Phase 2) can discover
- .deco/ scaffolding provides out-of-the-box CMS experience
- Prerender config demonstrates the static generation workflow

## Self-Check: PASSED

All 12 key files verified present. Both task commits (abad437, 898142e) verified in git log.

---
*Phase: 05-publishing*
*Completed: 2026-02-14*
