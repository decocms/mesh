---
name: deco:create-block
description: Create a new block (section, loader, or both) in an existing deco-enabled project
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

<objective>
Create a new deco block — a section, loader, or both — in a project that already has deco block support. The block is created with a properly typed Props interface and a correct default export, ready for the deco editor to discover and configure.
</objective>

<context>
@packages/mesh-plugin-deco-blocks/BLOCKS_FRAMEWORK.md
</context>

<process>

## Step 1: Load the Framework Mental Model

Load `BLOCKS_FRAMEWORK.md` from this package (above) before proceeding. This gives you the full mental model of blocks, sections, loaders, and how they compose.

## Step 2: Determine Block Type

If the user's request is explicit (e.g., "create a section", "add a loader"), use their instruction directly.

If the user describes a feature without specifying type, apply this rule:
- **Section:** renders UI, displays content, takes editor-configured values → create in `sections/`
- **Loader:** fetches data from an API, database, or external service → create in `loaders/`
- **Both:** the user wants a complete feature with data fetching and display → create both, wire loader return type to section prop

Ask the user to clarify if the intent is ambiguous.

## Step 3: Determine Block Name and Props

If the user provides a name and describes the configurable inputs, use them directly.

If not specified, infer from the user's description:
- Block name: PascalCase from the feature name (e.g., "product shelf" → `ProductShelf`)
- Props: extract the configurable inputs from the feature description

Ask the user to clarify if you cannot infer the props from context.

**Props rules (from BLOCKS_FRAMEWORK.md):**
- Only include what an editor or content manager needs to configure
- API keys, auth tokens, and secrets NEVER go in Props — they belong in ctx/AppContext
- Use `?` for optional props; provide defaults in the function signature where sensible
- Add JSDoc annotations for editor help text: `/** @description ... */`, `/** @title ... */`

## Step 4: Create the Section (if applicable)

Detect the project framework (check `package.json`) and create in the appropriate format:

**React / Next.js (`.tsx`):**
```typescript
// sections/{BlockName}.tsx

export interface Props {
  // Add each configurable prop with JSDoc
  /** @title {Field Label} */
  /** @description {Help text for editor} */
  propName: PropType;
  optionalProp?: PropType;
}

/**
 * @title {Block Display Name}
 * @description {What this section renders}
 */
export default function {BlockName}({ propName, optionalProp }: Props) {
  return (
    <div>
      {/* render the section content */}
    </div>
  );
}
```

**Astro (`.astro`):**
```astro
---
// sections/{BlockName}.astro

export interface Props {
  propName: PropType;
  optionalProp?: PropType;
}

const { propName, optionalProp } = Astro.props;
---

<div>
  <!-- render the section content -->
</div>
```

**Plain TypeScript (`.ts`):**
```typescript
// sections/{BlockName}.ts

export interface Props {
  propName: PropType;
  optionalProp?: PropType;
}

export interface {BlockName}Output {
  // define the return shape
}

export default function {BlockName}(props: Props): {BlockName}Output {
  // implementation
}
```

## Step 5: Create the Loader (if applicable)

```typescript
// loaders/{loaderName}.ts

export interface Props {
  /** @title {Field Label} */
  /** @description {Help text for editor} */
  queryParam: ParamType;
  optionalParam?: ParamType;
}

// Define the shape of data this loader returns
// This type must match the section prop it will wire to
export interface {ReturnTypeName} {
  id: string;
  // ... other fields
}

/**
 * @title {Loader Display Name}
 * @description {What data this loader fetches}
 */
const loader = async (
  props: Props,
  _req: Request,
  ctx: AppContext,
): Promise<{ReturnTypeName}[] | null> => {
  const { queryParam, optionalParam } = props;

  // fetch data using ctx (for internal services) or fetch (for external APIs)
  // return null on error or empty result — sections must handle null gracefully
};

export default loader;
```

**Important loader rules:**
- The function MUST be `async` and return a `Promise<T>`
- The return type must be **explicit** — deco cannot infer it for wiring
- Second parameter (`_req: Request`) and third (`ctx: AppContext`) are runtime context, never shown in editor
- Return `null` or an empty array on error rather than throwing — sections handle null defensively

## Step 6: Wire Loader to Section (if creating both)

If you created both a section and a loader, connect them by matching types:

1. The loader's return type (e.g., `Product[]`) must match a section prop type exactly
2. Update the section's Props interface to include a prop of the loader's return type:

```typescript
// sections/ProductShelf.tsx
import type { Product } from "../loaders/products.ts";

export interface Props {
  products: Product[];   // wired from loader by type match
  title: string;          // direct user input (not from a loader)
}
```

3. Explain to the user that in the deco editor, the `products` prop will show a loader picker instead of a text field.

## Step 7: Confirm Auto-Discovery

After creating the files, tell the user:

```
Block created and ready.

{BlockName} is now auto-discoverable by deco — no registration needed.
The block appears in the editor as soon as the dev server restarts.

Files created:
  sections/{BlockName}.tsx  — Renders UI; Props define what editors configure
  loaders/{loaderName}.ts   — Fetches data; Props define query parameters
                              (only shown if you created both)

To wire the loader to the section:
  In the deco editor, click the {products/data prop} field in {BlockName}'s config.
  Select "{loaderName}" from the loader picker.
  Configure the loader's props (e.g., category, limit).
  Save — the loader runs at render time and passes data to the section.

Next steps:
  - Restart your dev server to pick up the new blocks
  - Run `deco:create-block` again to add more blocks
  - Use `deco:enable-blocks` if this is a new project without sections/ or loaders/ yet
```

</process>

<done>
New deco block created in the correct folder with proper Props interface and default export. User informed of auto-discovery and how to wire loader output to section props.
</done>
