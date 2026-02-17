# Phase 5: Publishing - Research

**Researched:** 2026-02-14
**Domain:** Draft/publish workflow, version history, starter template scaffolding
**Confidence:** MEDIUM

## Summary

Phase 5 delivers three distinct capabilities: (1) a draft/publish workflow using deconfig branches, (2) version history with per-page diff and revert, and (3) a default project template. The draft/publish workflow is the most architecturally significant -- it requires extending the SITE_BINDING with branch operations (CREATE_BRANCH, MERGE_BRANCH, LIST_BRANCHES, DELETE_BRANCH) that do not exist today. The current deconfig system already has branch awareness (every CLI command accepts `-b/--branch` and the `DeconfigHead` tracks the current branch), but there are NO branch lifecycle operations (create, merge, list, delete) exposed via MCP tools. This is the primary gap.

Version history is conceptually simpler since content is git-backed, but the current SITE_BINDING only exposes READ_FILE/PUT_FILE/LIST_FILES -- there is no file history or log capability. The backend likely stores git objects (deconfig uses blob addresses like `blobs:project-blob:<sha256>`), but querying commit history per-file is not exposed. The admin-cx codebase has a full `GitRepo` interface (`sdk/git.ts`) with `log()`, `branch()`, `checkout()`, and `diff()` using isomorphic-git -- this pattern is reference material but runs on different infrastructure (isomorphic-git in-memory FS vs deconfig MCP tools).

The default template should extend the existing `deco-create` repo (currently a Cloudflare Workers MCP app with React + Vite + Tailwind + shadcn) by adding `.deco/` scaffolding, example sections with TypeScript props, example loaders, and React Router 7 prerender configuration for CMS-driven routes.

**Primary recommendation:** Extend SITE_BINDING with branch lifecycle tools and file history tools as new MCP capabilities, then build the UI on top. The template is a standalone deliverable that can be built in parallel.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Deconfig MCP tools | built-in | Branch-aware file operations | Already in Mesh; every file op already takes a `branch` param |
| SITE_BINDING | built-in | Plugin-to-site contract | Existing binding needs extension for branch + history ops |
| TanStack Router | ^1.139.7 | Client routing for new UI views | Already in Mesh, used by site editor plugin |
| TanStack Query | 5.90.11 | Data fetching/caching for branch list, history | Already in Mesh |
| React Router 7 | ^7.x (framework mode) | Template routing + SSG prerender | Decided in STACK.md, first-party prerender support |
| shadcn/ui | latest | Template UI components | Matches Mesh frontend stack |
| Vite | ^7.2.1 | Template build tool | Matches Mesh stack |
| React 19 | ^19.2.0 | Template UI framework | Matches Mesh stack |
| Tailwind CSS 4 | ^4.1.x | Template styling | Matches Mesh stack |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| diff | ^7.x (npm) or built-in | JSON diff computation for version history | When rendering page diffs in the UI |
| @untitledui/icons | workspace dep | Icons for branch/publish UI | Consistent with existing site editor icons |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom JSON diff | diff2html / react-diff-viewer | Heavier dependencies; JSON page files are simple enough for custom rendering |
| isomorphic-git (client-side) | Deconfig MCP tools (server-side) | Admin-cx uses isomorphic-git but new architecture uses deconfig MCP; don't mix paradigms |
| Full git branch model | Simple deconfig branch naming convention | Git branches with PRs is overkill for CMS editors; deconfig branches are simpler |

## Architecture Patterns

### Recommended Project Structure (Changes to existing plugin)

```
packages/mesh-plugin-site-editor/
  server/
    tools/
      branch-list.ts        # NEW: List branches
      branch-create.ts      # NEW: Create draft branch
      branch-merge.ts       # NEW: Merge branch to main
      branch-delete.ts      # NEW: Delete branch
      page-history.ts       # NEW: Get page commit history
      page-revert.ts        # NEW: Revert page to previous version
  client/
    components/
      branch-switcher.tsx   # NEW: Branch dropdown in plugin header
      publish-bar.tsx       # NEW: Draft status bar with publish button
      page-history.tsx      # NEW: Version history panel
      page-diff.tsx         # NEW: Diff view for page versions
    lib/
      branch-api.ts         # NEW: Branch operations client API
      history-api.ts        # NEW: History operations client API
      router.ts             # MODIFIED: Add history route
  shared.ts                 # MODIFIED: Add branch-related types

packages/bindings/src/well-known/
  site.ts                   # MODIFIED: Extend SITE_BINDING with branch + history tools
```

### Pattern 1: Branch-Based Draft/Publish via SITE_BINDING Extension

**What:** Extend SITE_BINDING with new tools for branch lifecycle. The CMS plugin server tools call these through the MCP proxy, same as existing READ_FILE/PUT_FILE/LIST_FILES calls.

**When to use:** All draft/publish operations.

**Example:**
```typescript
// Extended SITE_BINDING (in packages/bindings/src/well-known/site.ts)
const CreateBranchInputSchema = z.object({
  name: z.string().describe("Branch name"),
  from: z.string().optional().describe("Source branch (default: main)"),
});

const MergeBranchInputSchema = z.object({
  source: z.string().describe("Source branch to merge"),
  target: z.string().optional().describe("Target branch (default: main)"),
});

const ListBranchesOutputSchema = z.object({
  branches: z.array(z.object({
    name: z.string(),
    isDefault: z.boolean(),
    lastModified: z.number().optional(),
  })),
});
```

**Why this pattern:** The deconfig CLI already passes `branch` to every file operation. The backend already supports branch-scoped reads/writes. What's missing is the branch lifecycle operations. Extending SITE_BINDING keeps the single MCP proxy pattern consistent.

### Pattern 2: Convention-Based Branch Naming

**What:** Draft branches follow a naming convention: `draft/<user-id>/<timestamp>` or `draft/<descriptive-name>`. Main branch is always `main` and represents published state.

**When to use:** When creating drafts from the CMS UI.

**Why:** Simple to reason about. `main` = published. Any branch starting with `draft/` = work in progress. No additional state tracking needed in a database.

### Pattern 3: File-Level History via Deconfig Extension

**What:** Add a `GET_FILE_HISTORY` tool that returns commit log entries for a specific file path. Each entry includes: commit hash, timestamp, author, message, and the file content at that point.

**When to use:** Viewing page version history in the editor.

**Example:**
```typescript
const GetFileHistoryInputSchema = z.object({
  path: z.string().describe("File path to get history for"),
  branch: z.string().optional().describe("Branch (default: main)"),
  limit: z.number().optional().describe("Max entries to return"),
});

const GetFileHistoryOutputSchema = z.object({
  entries: z.array(z.object({
    commitHash: z.string(),
    timestamp: z.number(),
    author: z.string(),
    message: z.string(),
  })),
});
```

### Pattern 4: Revert as PUT_FILE with Historical Content

**What:** Reverting a page does NOT use git revert. Instead, it reads the file content at the target commit hash and writes it as a new version via PUT_FILE. This is simpler, avoids merge conflicts, and works within existing SITE_BINDING capabilities.

**When to use:** One-click revert from version history UI.

**Why:** True git revert would require understanding the full commit graph and handling conflicts. Writing the old content as a new commit is always safe, always works, and produces a clear audit trail ("Reverted to version abc1234").

### Anti-Patterns to Avoid

- **Full git UI in CMS:** Don't build a git client. CMS users don't think in commits and branches. They think in "draft" and "published." The git operations should be invisible.
- **Storing branch state in database:** The branch exists in deconfig. Don't duplicate it in Mesh Postgres. Query the MCP for current branch state.
- **Blocking on merge conflicts:** For CMS JSON content, conflicts should be nearly impossible (single-writer per draft). If they somehow occur, auto-resolve by taking the source branch version. Don't show merge conflict UI to CMS editors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Branch lifecycle | Custom git operations | Extend SITE_BINDING with MCP tools that delegate to deconfig backend | Backend already has branch support; just needs tool exposure |
| JSON diff rendering | Custom diff algorithm | `diff` npm package + custom React renderer | Well-tested diff algorithm; custom renderer for JSON-specific display |
| Template scaffolding | Entire project from scratch | Extend existing `deco-cx/deco-create` template repo | Already has React + Vite + Tailwind + shadcn + Cloudflare Workers setup |
| SSG prerender config | Custom build pipeline | React Router 7 `prerender` config in `react-router.config.ts` | First-party feature, reads CMS pages at build time |

**Key insight:** The deconfig backend already supports branches. The gap is MCP tool exposure, not backend capability. Building branch operations from scratch would duplicate what exists.

## Common Pitfalls

### Pitfall 1: Branch Operations Not Available in MCP
**What goes wrong:** Current SITE_BINDING only has READ_FILE, PUT_FILE, LIST_FILES. No branch create/merge/list/delete.
**Why it happens:** Phase 1 scoped SITE_BINDING to minimum viable operations.
**How to avoid:** Extend SITE_BINDING with optional branch tools. Make them optional (not all MCP implementations will support them) so the plugin degrades gracefully.
**Warning signs:** Tool call returning "unknown tool" errors.

### Pitfall 2: Preview URL Not Branch-Aware
**What goes wrong:** The preview iframe always shows `main` branch content, even when editing a draft branch.
**Why it happens:** The tunnel/preview URL is currently fixed. The deconfig `watch` SSE connection needs to be told which branch to watch.
**How to avoid:** The preview panel must pass the current branch to the iframe via postMessage. The site's deconfig watcher must accept a branch parameter.
**Warning signs:** Editing on a draft branch but seeing main branch content in preview.

### Pitfall 3: Merge Conflicts in CMS JSON
**What goes wrong:** Two drafts modify the same page, and merge fails.
**Why it happens:** Git merge conflicts on JSON files.
**How to avoid:** For Phase 5, support single-draft-at-a-time per page. Or auto-resolve by "last write wins" on merge. Don't expose merge conflict UI to CMS editors.
**Warning signs:** Merge operation returning error instead of success.

### Pitfall 4: Template Not Including .deco/ Scaffolding
**What goes wrong:** User creates a project but the CMS has no pages, blocks, or loaders to work with.
**Why it happens:** Template is a blank slate.
**How to avoid:** Include example `.deco/pages/`, `.deco/blocks/`, and `.deco/loaders/` in the template with working examples that demonstrate the CMS capabilities.
**Warning signs:** New project shows empty pages list in CMS.

### Pitfall 5: React Router 7 Prerender with Dynamic CMS Routes
**What goes wrong:** Build-time prerender cannot access CMS page routes because it needs the deconfig connection.
**Why it happens:** Prerender runs at build time, not at runtime. It needs to read `.deco/pages/` to know which routes to generate.
**How to avoid:** The prerender function in `react-router.config.ts` should read `.deco/pages/` directly from the filesystem (not via MCP) since it runs in the build context where the files exist locally.
**Warning signs:** Build generates only static routes, not CMS-driven dynamic routes.

## Code Examples

### Extended SITE_BINDING with Branch Tools

```typescript
// Source: Extending packages/bindings/src/well-known/site.ts
// These are OPTIONAL tools -- not all implementations will support them

const CreateBranchInputSchema = z.object({
  name: z.string().describe("Branch name to create"),
  from: z.string().optional().describe("Source branch (default: main)"),
});

const CreateBranchOutputSchema = z.object({
  success: z.boolean(),
  branch: z.string(),
});

const MergeBranchInputSchema = z.object({
  source: z.string().describe("Source branch to merge from"),
  target: z.string().optional().describe("Target branch (default: main)"),
  deleteSource: z.boolean().optional().describe("Delete source after merge"),
});

const MergeBranchOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

const ListBranchesInputSchema = z.object({});

const ListBranchesOutputSchema = z.object({
  branches: z.array(z.object({
    name: z.string(),
    isDefault: z.boolean(),
  })),
});

const DeleteBranchInputSchema = z.object({
  name: z.string().describe("Branch name to delete"),
});

const DeleteBranchOutputSchema = z.object({
  success: z.boolean(),
});
```

### Branch Switcher Component

```tsx
// client/components/branch-switcher.tsx
function BranchSwitcher() {
  const { toolCaller } = usePluginContext<typeof SITE_BINDING>();
  const [currentBranch, setCurrentBranch] = useState("main");

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => toolCaller("LIST_BRANCHES", {}),
  });

  const createDraft = useMutation({
    mutationFn: (name: string) =>
      toolCaller("CREATE_BRANCH", { name: `draft/${name}`, from: "main" }),
    onSuccess: (_, name) => setCurrentBranch(`draft/${name}`),
  });

  const publish = useMutation({
    mutationFn: () =>
      toolCaller("MERGE_BRANCH", {
        source: currentBranch,
        target: "main",
        deleteSource: true,
      }),
    onSuccess: () => setCurrentBranch("main"),
  });

  // ... render branch dropdown + publish button
}
```

### React Router 7 Prerender with CMS Routes

```typescript
// react-router.config.ts in the default template
import type { Config } from "@react-router/dev/config";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

export default {
  ssr: false,
  async prerender({ getStaticPaths }) {
    const pagesDir = join(process.cwd(), ".deco/pages");
    const staticPaths = getStaticPaths();

    try {
      const files = await readdir(pagesDir);
      const cmsPages = await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map(async (f) => {
            const content = await readFile(join(pagesDir, f), "utf-8");
            const page = JSON.parse(content);
            if (page.deleted) return null;
            return page.path;
          })
      );

      return [
        ...staticPaths,
        ...cmsPages.filter(Boolean),
      ];
    } catch {
      // .deco/pages/ doesn't exist yet
      return staticPaths;
    }
  },
} satisfies Config;
```

### Page History View

```tsx
// client/components/page-history.tsx
function PageHistory({ pageId }: { pageId: string }) {
  const { toolCaller } = usePluginContext<typeof SITE_BINDING>();
  const pagePath = `.deco/pages/${pageId}.json`;

  const { data: history } = useQuery({
    queryKey: ["page-history", pageId],
    queryFn: () => toolCaller("GET_FILE_HISTORY", {
      path: pagePath,
      limit: 50,
    }),
  });

  const revert = useMutation({
    mutationFn: async (commitHash: string) => {
      // Read file content at that commit
      const oldContent = await toolCaller("READ_FILE_AT", {
        path: pagePath,
        commitHash,
      });
      // Write as new version
      await toolCaller("PUT_FILE", {
        path: pagePath,
        content: oldContent.content,
      });
    },
  });

  // ... render timeline of commits with diff previews and revert buttons
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| isomorphic-git in-memory (admin-cx) | Deconfig MCP tools (Mesh) | Phase 1 architecture | All git ops flow through MCP, no direct git access |
| Custom template generators (deco init) | `deco create` cloning deco-cx/deco-create | Current CLI | Template is a GitHub repo, easily updatable |
| Next.js SSG (getStaticPaths) | React Router 7 prerender config | STACK.md decision | Simpler, no Next.js dependency, Vite-based |
| Content in Turso/SQLite (admin-cx) | Content in git via deconfig | Architecture decision | Branching/history come free from git |

**Deprecated/outdated:**
- `deco init` (old Deno-based CLI) replaced by `deco create` (Node-based CLI)
- isomorphic-git direct usage replaced by deconfig MCP abstraction

## Open Questions

1. **Does the deconfig backend support branch create/merge/delete?**
   - What we know: The backend supports branch-scoped reads/writes (every tool takes a `branch` param). The CLI defaults to `main` branch.
   - What's unclear: Whether the backend has branch lifecycle endpoints (create, merge, delete, list). The `i:deconfig-management` integration path exists but we haven't verified its full tool surface.
   - Recommendation: Check the deconfig-management MCP server's tool list. If branch lifecycle tools don't exist, they need to be added to the backend. This is a **blocking dependency** for PUB-01.

2. **Does the deconfig backend support file-level history?**
   - What we know: Files have blob addresses with SHA-256 hashes. The deconfig watch SSE returns `patchId` and `ctime` per change event.
   - What's unclear: Whether there's a way to query the commit/change history for a specific file path.
   - Recommendation: If not available, file history could be approximated by storing version metadata in the page JSON itself (adding a `versions` array). Less elegant but works without backend changes.

3. **How should draft preview work when the site runs locally?**
   - What we know: The tunnel URL comes from `deco link`. The preview iframe loads this URL.
   - What's unclear: When a user creates a draft branch in the CMS, does the local dev server need to switch branches too? Or does the CMS preview read from deconfig (not local FS)?
   - Recommendation: The simplest model is that `deco link` syncs from deconfig to local FS (like `deconfig watch` does). When the CMS switches branches, it tells the watch to switch branches too, and local FS updates automatically.

4. **Should the default template use React Router 7 in framework mode?**
   - What we know: React Router 7 framework mode has native prerender. The existing deco-create template uses TanStack Router.
   - What's unclear: Whether the template should switch to React Router 7 or stay with TanStack Router. The prerender need is specific to production builds, not dev mode.
   - Recommendation: The template should use React Router 7 in framework mode for the prerender support. This aligns with the STACK.md decision. The Mesh admin itself uses TanStack Router, but the site template is a different concern.

5. **Template scope: MCP app or pure frontend?**
   - What we know: Current deco-create is a full MCP app (server + view). Phase 5 template needs to be a site with sections/loaders that the CMS can manage.
   - What's unclear: Does the template include an MCP server, or is it a pure React frontend that connects to a deconfig MCP server?
   - Recommendation: The template should be a Cloudflare Workers app (like deco-create) with the MCP server providing SITE_BINDING tools, plus a React frontend with example sections and CMS integration. This matches the existing `deco create` pattern.

## Sources

### Primary (HIGH confidence)
- `/Users/guilherme/Projects/mesh/packages/bindings/src/well-known/site.ts` -- Current SITE_BINDING definition (READ_FILE, PUT_FILE, LIST_FILES only)
- `/Users/guilherme/Projects/mesh/packages/cli/src/lib/deconfig-head.ts` -- DeconfigHead interface showing branch awareness
- `/Users/guilherme/Projects/mesh/packages/cli/src/commands/deconfig/base.ts` -- Deconfig file operations with branch param
- `/Users/guilherme/Projects/mesh/packages/cli/src/commands/deconfig/clone.ts` -- Clone operation with branch support
- `/Users/guilherme/Projects/mesh/packages/cli/src/commands/deconfig/push.ts` -- Push operation with branch and watch support
- `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/client/lib/page-api.ts` -- Current page CRUD API
- `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/client/lib/router.ts` -- Current plugin routes
- `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/server/tools/index.ts` -- Current server tools
- `/Users/guilherme/Projects/mesh/packages/cli/src/commands/create/create.ts` -- `deco create` command implementation

### Secondary (MEDIUM confidence)
- [React Router 7 Pre-Rendering docs](https://reactrouter.com/how-to/pre-rendering) -- Prerender configuration with async function for CMS routes
- [React Router 7 Rendering Strategies](https://reactrouter.com/start/framework/rendering) -- SSR/SSG/SPA modes
- `/Users/guilherme/Projects/admin-cx/sdk/git.ts` -- Admin-cx GitRepo interface (reference for git operations pattern, but on different infrastructure)
- `/Users/guilherme/Projects/admin-cx/components/spaces/siteEditor/extensions/Git/views/Releases/ReleasesTable.tsx` -- Reference for release/version UI patterns
- `/Users/guilherme/Projects/context/.planning/research/STACK.md` -- Stack decisions for React Router 7, Vite, Tailwind
- `/Users/guilherme/Projects/context/.planning/research/ARCHITECTURE.md` -- Architecture patterns for plugin structure
- `https://github.com/deco-cx/deco-create` -- Current default template repo structure
- `/Users/guilherme/Projects/deco/engine/decofile/deconfig.ts` -- Deconfig client implementation showing `i:deconfig-management` tool call pattern

### Tertiary (LOW confidence)
- Whether deconfig backend supports branch create/merge/delete MCP tools -- needs validation against actual backend
- Whether deconfig backend supports file-level commit history -- needs validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already decided in prior phases and STACK.md
- Architecture (draft/publish): MEDIUM - Pattern is clear but depends on unverified backend capabilities
- Architecture (version history): MEDIUM - Same dependency on backend capabilities
- Architecture (template): HIGH - Extending existing deco-create repo, well-understood
- Pitfalls: HIGH - Identified from codebase analysis of actual gaps

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days -- relatively stable domain, main risk is backend API changes)
