---
name: deco:enable-blocks
description: Enable deco blocks framework in any JS/TS project by creating sections/ and loaders/ folders with example blocks
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

<objective>
Set up deco block support in the current project. This skill creates the `sections/` and `loaders/` folder structure with one example of each — adapted to the project's framework — so the developer can immediately start building configurable, composable blocks.
</objective>

<context>
@packages/mesh-plugin-deco-blocks/BLOCKS_FRAMEWORK.md
</context>

<process>

## Step 1: Read the Framework Mental Model

Before doing anything, load `BLOCKS_FRAMEWORK.md` from this package (above) to understand what blocks, sections, and loaders are. This is the mental model you will apply throughout this skill.

## Step 2: Inspect the Project

Read the project root to identify its framework:

```bash
ls -la
cat package.json 2>/dev/null || cat deno.json 2>/dev/null
```

Look for:
- `next` or `next.js` in dependencies → **Next.js** (React components in `.tsx`)
- `astro` in dependencies → **Astro** (use `.astro` for pure Astro, or `.tsx` for React islands)
- `@hono/hono` or `hono` → **Hono** (server-side, use `.ts` with typed return types)
- `react` but no Next.js → **React (plain)** (use `.tsx` components)
- No UI framework → **Plain TypeScript** (use `.ts` with typed functions)

Also check if `sections/` or `loaders/` folders already exist:

```bash
ls sections/ 2>/dev/null && echo "sections exists" || echo "sections missing"
ls loaders/ 2>/dev/null && echo "loaders exists" || echo "loaders missing"
```

## Step 3: Create `sections/` Folder with Example Section

Create `sections/HeroSection.tsx` (or `.ts` for plain TS, `.astro` for Astro) with a working example:

**Next.js / plain React (`.tsx`):**
```typescript
// sections/HeroSection.tsx
export interface Props {
  /** @title Hero Title */
  /** @description The main headline shown on the hero banner */
  title: string;

  /** @title Subtitle */
  subtitle?: string;

  /** @title CTA Button Text */
  ctaText?: string;

  /** @title CTA Button URL */
  ctaUrl?: string;
}

/**
 * @title Hero Section
 * @description Full-width hero banner with headline, subtitle, and optional call-to-action
 */
export default function HeroSection({
  title,
  subtitle,
  ctaText = "Learn More",
  ctaUrl = "/",
}: Props) {
  return (
    <section>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {ctaText && (
        <a href={ctaUrl}>{ctaText}</a>
      )}
    </section>
  );
}
```

**Astro (`.astro`):**
```astro
---
// sections/HeroSection.astro
export interface Props {
  /** @title Hero Title */
  title: string;
  subtitle?: string;
  ctaText?: string;
  ctaUrl?: string;
}

const { title, subtitle, ctaText = "Learn More", ctaUrl = "/" } = Astro.props;
---

<section>
  <h1>{title}</h1>
  {subtitle && <p>{subtitle}</p>}
  {ctaText && <a href={ctaUrl}>{ctaText}</a>}
</section>
```

**Plain TypeScript (`.ts`):**
```typescript
// sections/HeroSection.ts
export interface Props {
  /** @title Hero Title */
  title: string;
  subtitle?: string;
}

export interface HeroSectionOutput {
  html: string;
}

/**
 * @title Hero Section
 * @description Returns rendered hero HTML
 */
export default function HeroSection({ title, subtitle }: Props): HeroSectionOutput {
  return {
    html: `<section><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</section>`,
  };
}
```

## Step 4: Create `loaders/` Folder with Example Loader

Create `loaders/content.ts` — a loader that fetches data and whose return type can be wired to sections:

```typescript
// loaders/content.ts

export interface Props {
  /** @title API Endpoint */
  /** @description URL of the content API to fetch from */
  endpoint: string;

  /** @title Max Items */
  /** @description Maximum number of items to return */
  limit?: number;
}

export interface ContentItem {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
}

/**
 * @title Content Loader
 * @description Fetches content items from an API endpoint
 */
const loader = async (
  props: Props,
  _req: Request,
  ctx: AppContext,            // AppContext: runtime context, NOT shown in editor
): Promise<ContentItem[] | null> => {
  const { endpoint, limit = 10 } = props;

  try {
    const response = await fetch(`${endpoint}?limit=${limit}`);
    if (!response.ok) return null;
    return response.json() as Promise<ContentItem[]>;
  } catch {
    return null;
  }
};

export default loader;
```

**Note:** Replace `AppContext` with the actual AppContext type from your project. If no AppContext exists yet, use `unknown` for the third parameter.

## Step 5: Explain to the User

After creating the files, tell the user:

```
Deco block support is now set up. Here's what was created:

sections/HeroSection.tsx — Example section block
  - Props interface defines what editors can configure
  - Default export is the rendering function
  - Add more sections by creating files in sections/ with a default export

loaders/content.ts — Example loader block
  - Props interface defines configurable query parameters (NOT secrets/API keys)
  - Async default export fetches data and returns typed results
  - Loader output can be wired to section props by type matching

How deco connects them:
  If a section prop is typed as ContentItem[], deco can wire the content loader
  to that prop. The editor shows both the loader's Props and the section's Props
  in the same configuration form.

Next steps:
  - Run `deco link` to connect this project to Mesh and start editing in the browser
  - Use the `deco:create-block` skill to add more sections and loaders
  - Run `bun run dev` (or your dev command) to see the blocks in action
```

</process>

<done>
`sections/` and `loaders/` folders created with framework-appropriate example blocks. User informed of what was set up and how to extend it.
</done>
