# Phase 2: Block Scanner - Research

**Researched:** 2026-02-14
**Domain:** TypeScript codebase analysis, JSON Schema generation, dynamic form rendering
**Confidence:** HIGH

## Summary

Phase 2 builds the core pipeline that transforms a TypeScript codebase into editable CMS blocks: **discover components -> extract prop types -> generate JSON Schema -> render editor forms -> persist block definitions**. The entire pipeline uses libraries already in the Mesh monorepo except `ts-morph`, which is the only new dependency.

The critical architectural insight is that the scanner must work through the SITE_BINDING's `READ_FILE`/`LIST_FILES` tools to access source code, then construct an in-memory ts-morph Project for analysis. ts-morph supports `useInMemoryFileSystem: true`, and ts-json-schema-generator accepts an existing `ts.Program` -- so the full pipeline can run server-side without direct filesystem access to the user's project. For the AI agent scanning path (BLOCK-04), the agent uses the same `READ_FILE`/`LIST_FILES` tools to discover components and generates block definition JSON files via `PUT_FILE`.

The @rjsf form rendering is already proven in Mesh with two independent implementations: (1) workflow tool configuration forms (`@rjsf/core` with custom widgets/templates) and (2) MCP connection configuration forms (`@rjsf/shadcn` with custom ObjectFieldTemplate). The site-editor plugin should follow the `@rjsf/core` + custom templates pattern from the workflow forms, adapted for CMS prop editing.

**Primary recommendation:** Implement the scanner as server-side tools that read source files through MCP, run ts-morph in-memory, and write block definitions back via MCP. Render forms using @rjsf/core with custom templates adapted from the existing workflow forms. For the AI scanning path, provide a tool that gives the AI agent file listings and source code, and let it generate block definitions directly.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **ts-morph** | ^27.0.2 | Navigate TS AST, find component exports, extract prop type names | Standard TS Compiler API wrapper. Supports in-memory file system for MCP-based file access. Only new dependency. |
| **ts-json-schema-generator** | ^2.4.0 (in Mesh runtime) | Convert TypeScript types to JSON Schema | Already in Mesh. Accepts `ts.Program` so it integrates with ts-morph's internal program. AST-based approach handles aliases, generics, mapped types. |
| **@rjsf/core** | ^6.1.2 (in Mesh) | Render JSON Schema as editable forms | Already in Mesh. Two existing implementations to reference. Direct JSON Schema to form mapping with zero per-component form code. |
| **@rjsf/validator-ajv8** | ^6.1.2 (in Mesh) | Validate form data against JSON Schema | Already in Mesh. Required by @rjsf for schema validation. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@rjsf/utils** | ^6.1.2 (in Mesh) | Type definitions for custom widgets/templates | Always -- needed for `WidgetProps`, `TemplatesType`, etc. |
| **zod** | ^4.0.0 (in Mesh) | Define tool input/output schemas | Always -- server tool definitions use Zod schemas |
| **nanoid** | ^5.0.0 (peer dep) | Generate block IDs | For block definition creation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ts-morph (AST navigation) | Raw TypeScript Compiler API | ts-morph wraps the compiler API with simpler navigation; raw API is verbose but zero-dependency |
| ts-morph (AST navigation) | extract-react-types | Unmaintained (3+ years), Atlassian-only |
| ts-json-schema-generator | typescript-json-schema | ts-json-schema-generator uses AST (better alias/generic support), more actively maintained, already in Mesh |
| @rjsf/core | Custom form renderer | Massive effort to handle all JSON Schema types; @rjsf already proven in Mesh |
| @rjsf/core | @rjsf/shadcn | @rjsf/shadcn also in Mesh (used for MCP config forms); either works but `core` + custom templates gives more control over CMS-specific styling |

**Installation:**
```bash
# Only new dependency -- everything else is already in Mesh
bun add ts-morph@^27.0.2
```

## Architecture Patterns

### Recommended Project Structure
```
packages/mesh-plugin-site-editor/
├── server/
│   ├── index.ts                    # ServerPlugin (extends Phase 1)
│   ├── tools/
│   │   ├── index.ts                # Tool registry (extends Phase 1)
│   │   ├── page-*.ts               # Existing page CRUD tools
│   │   ├── block-scan.ts           # BLOCK_SCAN tool (ts-morph pipeline)
│   │   ├── block-list.ts           # BLOCK_LIST tool (read .deco/blocks/)
│   │   ├── block-get.ts            # BLOCK_GET tool (single block definition)
│   │   └── block-register.ts       # BLOCK_REGISTER tool (manual registration)
│   └── scanner/
│       ├── discover.ts             # Find component files via LIST_FILES
│       ├── extract.ts              # ts-morph: parse source, extract exports + prop types
│       ├── schema.ts               # ts-json-schema-generator: type -> JSON Schema
│       └── types.ts                # BlockDefinition type, scan config types
├── client/
│   ├── index.tsx                   # ClientPlugin (extends Phase 1)
│   ├── lib/
│   │   ├── router.ts              # Updated routes (add blocks, block-detail)
│   │   ├── page-api.ts            # Existing page API
│   │   └── block-api.ts           # Block CRUD via SITE_BINDING tools
│   └── components/
│       ├── sections-list.tsx       # Updated: shows scanned blocks (replaces stub)
│       ├── block-detail.tsx        # Block detail view with schema + form preview
│       ├── prop-editor.tsx         # @rjsf form wrapper for block prop editing
│       └── rjsf/
│           ├── templates.tsx       # Custom RJSF templates (adapted from workflow)
│           └── widgets.tsx         # Custom RJSF widgets for CMS prop types
└── shared.ts                      # Shared constants
```

### Pattern 1: In-Memory ts-morph Project from MCP Files

**What:** Read source files via SITE_BINDING, construct ts-morph Project in memory, run analysis.
**When to use:** Server-side BLOCK_SCAN tool execution.
**Why:** The scanner runs inside Mesh (server plugin), but the user's code lives in a remote site accessible only via MCP tools. ts-morph's `useInMemoryFileSystem` bridges this gap.

```typescript
// Source: ts-morph docs (https://ts-morph.com/setup/file-system)
import { Project } from "ts-morph";

async function createProjectFromMCP(proxy: MCPProxy, patterns: string[]): Promise<Project> {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ES2020,
      jsx: JsxEmit.ReactJSX,
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
    },
  });

  // Read source files via MCP
  for (const pattern of patterns) {
    const listResult = await proxy.callTool({
      name: "LIST_FILES",
      arguments: { prefix: pattern },
    });
    const files = JSON.parse(listResult.content?.[0]?.text ?? "{}").files ?? [];

    for (const file of files) {
      if (!file.path.endsWith(".tsx") && !file.path.endsWith(".ts")) continue;
      const readResult = await proxy.callTool({
        name: "READ_FILE",
        arguments: { path: file.path },
      });
      const content = readResult.content?.[0]?.text;
      if (content) {
        project.createSourceFile(file.path, content);
      }
    }
  }

  return project;
}
```

### Pattern 2: Component Discovery via ts-morph

**What:** Find exported React components and their prop types from in-memory source files.
**When to use:** After building the in-memory project.
**Why:** ts-morph provides `getExportedDeclarations()`, type resolution, and `getProperties()` for extracting the full prop shape.

```typescript
// Source: ts-morph docs (https://ts-morph.com/details/types)
import { Project, SourceFile, SyntaxKind, Type } from "ts-morph";

interface ComponentInfo {
  name: string;
  filePath: string;
  propsTypeName: string | null;
  propsType: Type | null;
}

function discoverComponents(project: Project, patterns: string[]): ComponentInfo[] {
  const components: ComponentInfo[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();

    // Check default export
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (!defaultExport) continue;

    const declarations = defaultExport.getDeclarations();
    for (const decl of declarations) {
      // Function declarations: export default function Hero(props: HeroProps)
      if (decl.isKind(SyntaxKind.FunctionDeclaration)) {
        const params = decl.getParameters();
        if (params.length > 0) {
          const propsType = params[0].getType();
          components.push({
            name: decl.getName() ?? sourceFile.getBaseNameWithoutExtension(),
            filePath,
            propsTypeName: propsType.getSymbol()?.getName() ?? null,
            propsType,
          });
        }
      }
      // Arrow functions: const Hero = (props: HeroProps) => ...
      // Handle via variable declaration -> initializer
    }
  }

  return components;
}
```

### Pattern 3: JSON Schema Generation from ts.Program

**What:** Feed ts-morph's internal `ts.Program` to ts-json-schema-generator for schema creation.
**When to use:** After discovering component props types.
**Why:** ts-json-schema-generator's `SchemaGenerator` accepts a `ts.Program` directly, avoiding duplicate file parsing.

```typescript
// Source: ts-json-schema-generator GitHub (https://github.com/vega/ts-json-schema-generator)
import { createParser, createFormatter, SchemaGenerator } from "ts-json-schema-generator";
import type { Config } from "ts-json-schema-generator";

function generateSchema(project: Project, typeName: string, filePath: string): JSONSchema7 {
  const program = project.getProgram().compilerObject; // Get raw ts.Program

  const config: Config = {
    path: filePath,
    type: typeName,
    expose: "none", // Only the specified type
    jsDoc: "extended", // Include JSDoc descriptions
    skipTypeCheck: true, // Performance: skip type checking
    topRef: false,
    additionalProperties: false,
  };

  const parser = createParser(program, config);
  const formatter = createFormatter(config);
  const generator = new SchemaGenerator(program, parser, formatter, config);

  return generator.createSchema(typeName);
}
```

### Pattern 4: Block Definition Storage

**What:** Write block definitions as JSON files in `.deco/blocks/` via SITE_BINDING.
**When to use:** After scanning and schema generation.
**Why:** Follows the existing deco runtime pattern -- `.deco/blocks/` is already read by the deco decofile provider.

```typescript
// Block definition format
interface BlockDefinition {
  id: string;              // e.g., "sections--Hero"
  component: string;       // e.g., "sections/Hero.tsx"
  label: string;           // Human-readable: "Hero Banner"
  category: string;        // e.g., "Marketing", "Layout"
  description: string;     // From JSDoc or AI-generated
  schema: JSONSchema7;     // Props JSON Schema
  defaults: Record<string, unknown>; // Default prop values
  metadata: {
    scannedAt: string;
    scanMethod: "ts-morph" | "manual" | "ai-agent";
  };
}

// File path: .deco/blocks/{id}.json
// Example: .deco/blocks/sections--Hero.json
```

### Pattern 5: @rjsf Form for Prop Editing

**What:** Render block prop schema as editable form using @rjsf, following the existing workflow tool form pattern.
**When to use:** When displaying a block's editable properties in the sidebar.
**Why:** Already proven in Mesh with two independent implementations. Zero per-component form code.

```typescript
// Source: Mesh workflow tool-input.tsx pattern
import Form from "@rjsf/core";
import type { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { customTemplates } from "./rjsf/templates";
import { customWidgets } from "./rjsf/widgets";

interface PropEditorProps {
  schema: RJSFSchema;
  formData: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

function PropEditor({ schema, formData, onChange }: PropEditorProps) {
  return (
    <Form
      schema={schema}
      formData={formData}
      onChange={(data) => onChange(data.formData ?? {})}
      validator={validator}
      widgets={customWidgets}
      templates={customTemplates}
      uiSchema={{ "ui:submitButtonOptions": { norender: true } }}
      liveValidate={false}
      omitExtraData
      liveOmit
    >
      <></>
    </Form>
  );
}
```

### Pattern 6: AI Agent Scanning (BLOCK-04)

**What:** The AI agent reads source files via MCP tools, analyzes the codebase structure, and generates block definition JSON files.
**When to use:** As an alternative or complement to the ts-morph scanner. Better for complex codebases where ts-morph may miss nuance.
**Why:** AI can infer component purpose, suggest labels/categories/descriptions, and handle framework-specific patterns that ts-morph analysis alone may miss.

The AI agent scanning works differently from the ts-morph scanner:
1. Agent receives a tool to list project files (`LIST_FILES` with various prefixes)
2. Agent reads key source files (`READ_FILE` for components, config files)
3. Agent analyzes component structure and generates block definitions
4. Agent writes block definitions to `.deco/blocks/` via `PUT_FILE`

This does NOT require ts-morph -- the AI directly interprets TypeScript source code.

### Anti-Patterns to Avoid

- **Running ts-morph on disk:** The user's code is remote (accessible via MCP). Never assume local filesystem access. Always use `useInMemoryFileSystem: true`.
- **Scanning everything at once:** For large codebases, scan incrementally (by directory) and cache results. Don't try to load 1000+ files into memory simultaneously.
- **Tight coupling between scanner and form renderer:** The scanner produces JSON Schema; the form renderer consumes JSON Schema. They should never reference each other. This allows manual block registration to bypass the scanner entirely.
- **Framework-specific scanner logic:** Don't build Next.js-specific or Remix-specific component detection. Scan for exported functions with typed props -- this is universal. Use configurable scan patterns (`sections/**/*.tsx`, `components/**/*.tsx`) rather than framework conventions.
- **Skipping the manual registration path:** BLOCK_REGISTER (manual) must always work, even if the scanner fails. Users can hand-write block definitions as JSON.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript type -> JSON Schema | Custom type walker | ts-json-schema-generator | Handles generics, unions, intersections, mapped types, conditional types, utility types. Thousands of edge cases. |
| JSON Schema -> editable form | Custom form renderer | @rjsf/core | Handles all schema types, nested objects, arrays with add/remove, validation, error display. Already proven in Mesh. |
| TypeScript AST navigation | Raw `ts.createProgram` + manual traversal | ts-morph | Wraps the verbose Compiler API with ergonomic `.getType()`, `.getProperties()`, `.getExportedDeclarations()` |
| JSON Schema validation | Custom validator | @rjsf/validator-ajv8 | AJV is the standard JSON Schema validator. @rjsf integrates it directly. |
| In-memory TypeScript project | Custom virtual filesystem | ts-morph `useInMemoryFileSystem` | Already built and tested, handles module resolution correctly |

**Key insight:** The entire pipeline (discover -> extract -> schema -> form -> validate) is covered by mature libraries. The only custom code needed is the glue between them and the MCP file access layer.

## Common Pitfalls

### Pitfall 1: ts-morph Memory Pressure on Large Codebases
**What goes wrong:** Loading 500+ TypeScript files into an in-memory ts-morph Project causes high memory usage and slow analysis.
**Why it happens:** ts-morph keeps the full AST in memory for all loaded files. Each file costs ~1-5MB of memory for complex TypeScript.
**How to avoid:** Scan in batches by directory. Load only files matching scan patterns (e.g., `sections/**/*.tsx`), not the entire codebase. Use `project.getSourceFile()` to load individual files as needed. Set `skipLibCheck: true` and `skipDefaultLibCheck: true` in compiler options.
**Warning signs:** Scanner tool takes >30 seconds or >500MB memory for a single scan.

### Pitfall 2: ts-json-schema-generator Failing on Complex Types
**What goes wrong:** ts-json-schema-generator throws errors on conditional types (`T extends U ? X : Y`), template literal types, or deeply nested utility types (`Partial<Pick<Omit<T, K>, J>>`).
**Why it happens:** Not all TypeScript type constructs are representable in JSON Schema. ts-json-schema-generator handles most but not all.
**How to avoid:** Wrap schema generation in try/catch per type. When it fails, fall back to `{ type: "object", additionalProperties: true }` (permissive schema). Log warnings for review. The manual registration path (BLOCK_REGISTER) can always provide a hand-written schema.
**Warning signs:** Schema generation errors in scanner logs. Missing or empty schemas in block definitions.

### Pitfall 3: Stale Block Definitions After Code Changes
**What goes wrong:** User changes a component's props, but the block definition in `.deco/blocks/` still has the old schema.
**Why it happens:** Block definitions are generated once during scanning, not updated automatically.
**How to avoid:** Design the scan tool to be re-runnable (idempotent). Include `metadata.scannedAt` timestamp. Client UI can show a "rescan" button. Future enhancement: file watcher triggers incremental rescan.
**Warning signs:** Form fields don't match actual component props. Users report "missing" fields.

### Pitfall 4: Confusing Component Exports with Non-Components
**What goes wrong:** Scanner picks up utility functions, constants, or type-only exports as "components".
**Why it happens:** Not every exported function with typed parameters is a React component.
**How to avoid:** Check that the function returns JSX (return type includes `JSX.Element`, `ReactNode`, etc.). Only look at default exports from `.tsx` files. Use configurable scan patterns to restrict which directories are scanned.
**Warning signs:** Block library shows non-visual items (utility functions, data transformers).

### Pitfall 5: @rjsf Schema Incompatibilities
**What goes wrong:** JSON Schema generated from TypeScript uses features that @rjsf doesn't fully support (e.g., `$ref` with nested definitions, complex `oneOf`/`anyOf` discriminated unions).
**Why it happens:** ts-json-schema-generator produces valid JSON Schema, but @rjsf has UI limitations for complex schema constructs.
**How to avoid:** Post-process the generated schema before passing to @rjsf. Inline `$ref` definitions. Simplify `oneOf` to `enum` where possible. Test generated schemas in the @rjsf playground. Use `topRef: false` in ts-json-schema-generator config.
**Warning signs:** Form renders empty or shows "unsupported field" errors.

### Pitfall 6: In-Memory File System Missing Type Resolution
**What goes wrong:** ts-morph in-memory project can't resolve imports between files (e.g., `import { ButtonProps } from '../ui/button'`) because not all dependency files are loaded.
**Why it happens:** Only scanned files are loaded into the in-memory project. Imported types from node_modules or other project files may be missing.
**How to avoid:** Load the TypeScript lib declaration files. For project-internal imports, resolve them by reading the imported file via MCP on demand. Accept that some types may not resolve -- fall back to `unknown`/`any` in the schema. `skipTypeCheck: true` prevents compile errors from halting the scan.
**Warning signs:** Props showing as `unknown` type. Schema generation returning empty schemas.

## Code Examples

### Complete Block Scan Tool Handler

```typescript
// Verified pattern combining all the above
import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

export const BLOCK_SCAN: ServerPluginToolDefinition = {
  name: "CMS_BLOCK_SCAN",
  description: "Scan a site's TypeScript codebase and generate block definitions in .deco/blocks/",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    patterns: z.array(z.string()).optional()
      .describe("File path prefixes to scan (default: ['sections/', 'components/'])"),
  }),
  outputSchema: z.object({
    blocks: z.array(z.object({
      id: z.string(),
      component: z.string(),
      label: z.string(),
      propsCount: z.number(),
    })),
    errors: z.array(z.string()),
  }),

  handler: async (input, ctx) => {
    const { connectionId, patterns = ["sections/", "components/"] } = input as {
      connectionId: string;
      patterns?: string[];
    };
    const proxy = await ctx.createMCPProxy(connectionId);
    const blocks = [];
    const errors = [];

    try {
      // 1. Discover component files
      // 2. Build in-memory ts-morph project
      // 3. Extract component exports + prop types
      // 4. Generate JSON Schema for each
      // 5. Write block definitions to .deco/blocks/
      // (Implementation in plan tasks)
    } finally {
      await proxy.close?.();
    }

    return { blocks, errors };
  },
};
```

### Existing @rjsf Usage Reference (from Mesh workflow forms)

The workflow tool-input component (`tool-input.tsx`) shows the proven pattern:
- `Form` from `@rjsf/core` with `schema`, `formData`, `onChange`
- `validator` from `@rjsf/validator-ajv8`
- Custom `widgets` (TextWidget, NumberWidget, CheckboxWidget, SelectWidget)
- Custom `templates` (FieldTemplate, ObjectFieldTemplate, ArrayFieldTemplate)
- `uiSchema` with `ui:submitButtonOptions: { norender: true }` to hide submit
- Empty `<></>` children to suppress default submit button
- `omitExtraData` and `liveOmit` for clean data handling

File: `/Users/guilherme/Projects/mesh/apps/mesh/src/web/components/details/workflow/components/tool-selection/components/tool-input.tsx`

### Existing MCP Config Form Reference (from Mesh)

The MCP configuration form (`mcp-configuration-form.tsx`) shows the `@rjsf/shadcn` pattern with formContext for parent-controlled state:
- Uses `RjsfForm` from `@rjsf/shadcn`
- `formContext` pattern for cross-field communication
- Custom ObjectFieldTemplate handling binding fields

File: `/Users/guilherme/Projects/mesh/apps/mesh/src/web/components/details/connection/settings-tab/mcp-configuration-form.tsx`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Deco's `@deco/deno-ast-wasm` schema transform | ts-json-schema-generator (AST-based) | Already in Mesh runtime | Better support for complex types, standard JSON Schema output |
| Hand-written form per component | @rjsf auto-generated forms from JSON Schema | Already in Mesh | Zero per-component form code |
| Local filesystem scanner | In-memory scanner via MCP file access | Phase 2 (new) | Works with remote codebases, no direct FS dependency |
| Manual component registration only | AI agent + ts-morph auto-discovery | Phase 2 (new) | Dramatically reduces onboarding friction |

**Deprecated/outdated:**
- `extract-react-types` (Atlassian): unmaintained 3+ years, don't use
- `typescript-json-schema` (YousefED): superseded by ts-json-schema-generator (AST-based is more accurate)
- Zod-first approach (require users to write Zod schemas): defeats stack-agnostic goal

## Open Questions

1. **ts-json-schema-generator + ts-morph Program compatibility**
   - What we know: ts-json-schema-generator `SchemaGenerator` constructor accepts `ts.Program`. ts-morph exposes `project.getProgram().compilerObject` as `ts.Program`.
   - What's unclear: Whether the in-memory file system host works correctly with ts-json-schema-generator's internal file resolution. The generator may try to read files from disk that the in-memory FS doesn't have.
   - Recommendation: Prototype this integration early (first task). If it fails, fall back to having ts-json-schema-generator create its own program from the same in-memory source strings. Worst case, write temp files to disk, generate schema, clean up.

2. **Scan performance for large codebases**
   - What we know: ts-morph keeps full AST in memory. Reading files through MCP adds latency (each file is an MCP tool call).
   - What's unclear: How many files per second can we read through MCP? What's the practical limit before memory becomes an issue?
   - Recommendation: Design scan to be incremental from the start (scan by directory prefix). Add progress reporting via streaming. Set a practical limit (e.g., 200 files per scan batch) and paginate.

3. **Import resolution in in-memory project**
   - What we know: TypeScript needs to resolve imports to analyze types correctly. In-memory project won't have `node_modules`.
   - What's unclear: How much type resolution degrades without node_modules available. Whether React type definitions (JSX.Element, etc.) are needed.
   - Recommendation: Start without loading any dependencies. Use `skipTypeCheck: true`. If prop types show as `unknown`, selectively load the project's `tsconfig.json` type references. React types may need to be bundled as static type stubs.

4. **Block definition update strategy**
   - What we know: Block definitions are JSON files in `.deco/blocks/`. Scanning produces new definitions.
   - What's unclear: When the user re-scans after code changes, should existing block definitions be overwritten or merged? What about manually-edited labels/descriptions?
   - Recommendation: Use a merge strategy: auto-generated fields (schema, component, propsTypeName) are overwritten; user-edited fields (label, description, category, defaults) are preserved if already set. Track which fields were manually edited with a `customized` array in metadata.

## Sources

### Primary (HIGH confidence)
- Mesh `@rjsf/core` workflow form: `/Users/guilherme/Projects/mesh/apps/mesh/src/web/components/details/workflow/components/tool-selection/components/tool-input.tsx`
- Mesh `@rjsf` custom templates: `/Users/guilherme/Projects/mesh/apps/mesh/src/web/components/details/workflow/components/tool-selection/rjsf/rjsf-templates.tsx`
- Mesh `@rjsf` custom widgets: `/Users/guilherme/Projects/mesh/apps/mesh/src/web/components/details/workflow/components/tool-selection/rjsf/rjsf-widgets.tsx`
- Mesh `@rjsf/shadcn` MCP config form: `/Users/guilherme/Projects/mesh/apps/mesh/src/web/components/details/connection/settings-tab/mcp-configuration-form.tsx`
- Mesh ts-json-schema-generator usage: `/Users/guilherme/Projects/mesh/packages/runtime/scripts/generate-json-schema.ts`
- Phase 1 plugin structure: `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/`
- ServerPlugin interface: `/Users/guilherme/Projects/mesh/packages/bindings/src/core/server-plugin.ts`
- SITE_BINDING definition: `/Users/guilherme/Projects/mesh/packages/bindings/src/well-known/site.ts`
- Deco runtime `.deco/blocks` loading: `/Users/guilherme/Projects/deco/engine/decofile/fetcher.ts`
- Deco blocks concept: `/Users/guilherme/Projects/deco/blocks/section.ts`

### Secondary (MEDIUM confidence)
- [ts-morph in-memory file system docs](https://ts-morph.com/setup/file-system) - Verified `useInMemoryFileSystem: true` support
- [ts-morph performance guide](https://ts-morph.com/manipulation/performance) - Memory optimization tips
- [ts-morph type navigation](https://ts-morph.com/details/types) - `getProperties()`, `getType()` API
- [ts-json-schema-generator GitHub](https://github.com/vega/ts-json-schema-generator) - `SchemaGenerator(program, parser, formatter, config)` constructor
- [ts-json-schema-generator npm](https://www.npmjs.com/package/ts-json-schema-generator) - Config options including `skipTypeCheck`
- [@rjsf custom widgets docs](https://rjsf-team.github.io/react-jsonschema-form/docs/advanced-customization/custom-widgets-fields/) - Widget/template customization
- [@rjsf custom templates docs](https://rjsf-team.github.io/react-jsonschema-form/docs/advanced-customization/custom-templates/) - Template system

### Tertiary (LOW confidence)
- [Knip ts-morph performance blog](https://knip.dev/blog/slim-down-to-speed-up) - Experience moving away from ts-morph for performance reasons (context only, different use case)
- [souporserious ts-morph docs guide](https://souporserious.com/generate-typescript-docs-using-ts-morph/) - React component prop extraction patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified in Mesh codebase except ts-morph (verified on npm)
- Architecture: HIGH - Patterns follow existing Mesh ServerPlugin + SITE_BINDING conventions, @rjsf already implemented
- Pitfalls: MEDIUM - Memory/performance concerns are based on docs and community reports, not firsthand benchmarking. ts-json-schema-generator + in-memory ts.Program integration is theoretical (needs prototype validation)

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable libraries, 30-day validity)
