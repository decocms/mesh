# @decocms/ui

The Deco design system. Shadcn-based React 19 components, semantic color tokens, Tailwind v4 theme, self-hosted typography.

Single source of truth for UI across all Deco products. Update once here, every product gets the change on its next release.

## Install

```bash
bun add @decocms/ui
# or: npm install @decocms/ui / pnpm add @decocms/ui
```

### Peer dependencies

You need these in your app:

- `react >= 19`, `react-dom >= 19`
- `tailwindcss >= 4`
- `next-themes >= 0.4` (optional — only if you use the theme provider)

## Setup

### 1. Import the theme

In your app's global CSS (e.g. `index.css`):

```css
@import "@decocms/ui/styles/global.css";
```

This brings: font-face declarations (Inter var, CommitMono), all design tokens (colors, radius, spacing, motion, shadows), light + dark variants, and base element styles.

### 2. Tell Tailwind to scan the components

Tailwind v4 does not scan `node_modules` by default. Add this to your global CSS so utility classes used inside `@decocms/ui` get emitted:

```css
@source "../../node_modules/@decocms/ui/src/**/*.{ts,tsx}";
```

Adjust the relative path to match where your CSS file lives.

### 3. Use components

```tsx
import { Button } from "@decocms/ui/components/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@decocms/ui/components/card.tsx";

export function Example() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hello</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>Click me</Button>
      </CardContent>
    </Card>
  );
}
```

> **Note:** import paths include the `.tsx` extension. The package ships raw source files, so your `tsconfig.json` needs `"allowImportingTsExtensions": true` and `"moduleResolution": "bundler"` (or "NodeNext"). See "Known limitations" below.

## Exports

```
@decocms/ui/components/*    React components (71 total)
@decocms/ui/hooks/*         React hooks
@decocms/ui/lib/*           Utilities (cn, etc.)
@decocms/ui/providers/*     Theme provider
@decocms/ui/styles/*        global.css
@decocms/ui/assets/*        Fonts
```

## Customization

The design system ships with semantic tokens. Customize by overriding CSS variables in your app, **before** the `@import`:

```css
:root {
  --radius: 0.5rem;        /* bump all radius tokens */
  --spacing: 0.3rem;       /* bump the whole spacing scale */
  --brand: #ff00aa;        /* override brand color */
  --primary: oklch(0.3 0.2 300); /* override primary */
}

@import "@decocms/ui/styles/global.css";
```

Most product-level visual variation should happen here. If you find yourself forking components, consider whether a token is missing.

### Semantic color tokens

| Token              | Purpose                          |
| ------------------ | -------------------------------- |
| `background` / `foreground` | Page canvas + text       |
| `card`             | Elevated surfaces                |
| `popover`          | Floating surfaces                |
| `primary`          | Primary action color             |
| `secondary`        | Secondary action color           |
| `muted`            | Low-emphasis surfaces            |
| `accent`           | Hover / selection surfaces       |
| `destructive`      | Errors, destructive actions      |
| `success` / `warning` | Status colors                 |
| `border` / `input` / `ring` | Form primitives          |
| `brand`            | Marketing / identity surfaces    |
| `sidebar-*`        | Sidebar-specific variants        |
| `chart-1..5`       | Chart series colors              |

All have dark-mode variants. All paired with a `*-foreground` text color.

## Releasing a new version

The package is published automatically on push to `main` when anything under `packages/ui/**` changes. The publish workflow checks if the `version` in `packages/ui/package.json` already exists on npm; if it does, it skips. If not, it publishes.

To release:

1. Bump `packages/ui/package.json` version (`0.1.0` → `0.1.1` patch, `0.2.0` minor, etc.).
2. Merge to `main`.
3. The workflow (`.github/workflows/publish-ui-npm.yaml`) publishes and creates a GitHub release.

For prereleases, use a hyphenated version (`0.2.0-rc.1`). It will publish under the `next` tag instead of `latest`.

### One-time setup required

An `NPM_TOKEN` secret must be configured in repo settings for the publish workflow to authenticate with npm.

## Local validation

Before publishing a breaking change, validate the package works as a real consumer would:

```bash
# 1. Pack the package
cd packages/ui
bun pack

# 2. Install the tarball into the playground
cd ../../apps/ui-playground
bun add file:../../packages/ui/decocms-ui-$VERSION.tgz

# 3. Run the playground
bun run dev
```

The playground (`apps/ui-playground`) is a minimal Vite app that imports only from `@decocms/ui`. Good for catching: missing files in the tarball, broken relative paths (fonts!), Tailwind not scanning, dark mode not flipping.

## Contributing

Components live in `packages/ui/src/components/`. Follow the house rules:

- Use **semantic tokens only** (`bg-primary`, `text-destructive`) — not raw Tailwind palette (`bg-red-500`). Palette colors are reserved for intentional identity surfaces (avatar colors, role badges).
- Never hardcode hex or rgb in components. If a value isn't in `global.css`, add it there first.
- Use `class-variance-authority` for variant APIs.
- Keep component files single-file and readable — this package ships raw source, not bundled output.
- React 19 / React Compiler — do not use `useEffect`, `useMemo`, `useCallback`, or `memo`. The compiler handles memoization.

## Known limitations

- **Raw source, no compiled output.** The package ships `.tsx` files directly; there is no build step. Consumers must use a bundler that understands TS/JSX (Vite, Next.js, etc.) and a tsconfig with `allowImportingTsExtensions` + bundler/NodeNext resolution. A future version may add a build step with proper `.d.ts` emission to allow extension-free imports.
- **Tailwind v4 required.** The theme relies on v4-only features (`@theme inline`, `oklch()` color space). Not compatible with Tailwind v3.
- **React 19 required.** Uses React 19 features; older React versions are not supported.
- **No tree-shakeable barrel.** Every component must be imported by its own subpath (no `@decocms/ui` root export). This is intentional — keeps bundle size predictable.

## License

MIT.
