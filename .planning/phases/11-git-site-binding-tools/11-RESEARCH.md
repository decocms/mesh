# Phase 11: Git SITE_BINDING Tools - Research

**Researched:** 2026-02-18
**Domain:** Git CLI operations via child_process, SITE_BINDING extension, local-fs MCP tool pattern
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Path scoping
- All path arguments are **relative to the project root** — the MCP joins them with the root internally
- Paths are **enforced** to stay within the project root; `../` traversal is rejected with an error
- GIT_STATUS and GIT_DIFF: if no path provided, **default to full repo** (whole working tree)
- GIT_LOG and GIT_SHOW: path is optional — no path = full repo log

#### Error responses
- Git failures use **MCP tool errors** (`isError: true`) — standard throw pattern, not `{ ok: false }` return values
- GIT_CHECKOUT is **destructive** and requires a `force: true` parameter to confirm intent; missing `force` throws an error
- GIT_COMMIT **auto-configures git identity** with a fallback (e.g. `'Deco Editor <editor@deco.cx>'`) if `user.name` / `user.email` are not set
- GIT_STATUS / GIT_DIFF returning no changes is **not an error** — return empty list / empty string

#### GIT_STATUS granularity
- File status uses a **typed enum**: `'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'`
- Status **distinguishes staged vs unstaged per file**: `{ path, staged: StatusEnum | null, unstaged: StatusEnum | null }`
- Renamed files expose **both paths**: `{ path: 'new.json', oldPath: 'old.json', status: 'renamed' }`
- **Untracked files are included** by default (required for Phase 12's "(new)" badge on new page files)

#### GIT_COMMIT staging
- Stages **all changes**: `git add -A` (tracked + untracked) — new page JSON files are included automatically
- Returns `{ hash: string, message: string }` on success
- Uses **git config / auto-configured fallback identity** — no author override parameter
- **Pre-checks** that the working tree is dirty before staging; throws `'nothing to commit'` error if clean

### Claude's Discretion
- Exact error message strings for each failure case
- Whether to use `simple-git`, `isomorphic-git`, or raw `child_process` for git execution
- Internal structure of the SITE_BINDING declaration extension
- GIT_DIFF output format (raw unified diff string is fine)
- GIT_LOG return shape (hash, author, date, message per commit)
- GIT_SHOW return shape (file contents as string)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DIFF-01 | User can see deleted sections as greyed-out "(deleted)" in section list | GIT_STATUS with staged/unstaged 'deleted' status enables Phase 12 to detect deletions |
| DIFF-02 | User can see newly added sections with "(new)" badge | GIT_STATUS returns untracked files — new page JSON shows as { unstaged: 'untracked' } |
| DIFF-03 | User can see modified sections with "(edited)" indicator | GIT_STATUS 'modified' status per file enables Phase 12 to mark edited sections |
| DIFF-04 | User can restore deleted section via "Undelete" (git checkout) | GIT_CHECKOUT with path argument restores a deleted file from HEAD |
| DIFF-05 | User can discard all pending changes via "Discard changes" (git checkout) | GIT_CHECKOUT with force:true on a page path reverts working tree |
| COMMIT-01 | User can commit all pending page changes via Commit button | GIT_COMMIT tool does git add -A + commit, enabling Phase 13 UI |
| COMMIT-02 | CMS auto-generates commit message using AI | Phase 13 concern — Phase 11 just needs GIT_COMMIT to accept a message string |
| COMMIT-03 | Commit creates real git commit in site's repository | GIT_COMMIT executes against storage.root, creates verifiable git commit |
| HIST-01 | User can open history panel showing commits per page file | GIT_LOG with optional path arg returns commit list — enables Phase 14 UI |
| HIST-02 | User can click commit to load that page version in preview | GIT_SHOW returns file content at a given commit hash — Phase 14 uses this |
| HIST-03 | User can "Revert here" to restore historical version | Phase 14 uses GIT_SHOW to get content + PUT_FILE to write + GIT_COMMIT to commit |
</phase_requirements>

## Summary

Phase 11 adds 6 git operation tools to the local-fs MCP server (`/Users/guilherme/Projects/mcps/local-fs/`) and extends `SITE_BINDING` in `packages/bindings/src/well-known/site.ts` to declare them as optional tools. No UI work belongs here — Phases 12–14 consume these tools.

The local-fs MCP already uses `node:child_process` (both `exec` and `spawn`) in its existing `EXEC` and `DENO_TASK` tools, establishing `execPromise = promisify(exec)` as the standard pattern. The `LocalFileStorage` class owns `storage.root` (the resolved absolute path), which becomes the `cwd` for all git commands. Path scoping is already enforced by `storage.resolvePath()` which throws on traversal attacks — git tools should call `storage.resolvePath(path)` to validate, then pass only the relative portion to git commands (git runs in `cwd: storage.root`).

**Primary recommendation:** Use raw `child_process.exec` (via `promisify`) for all git commands — zero new dependencies, consistent with existing EXEC tool pattern, and all required git operations map cleanly to simple CLI invocations. Add tools to a new `server/git.ts` file, register them in `tools.ts` via a `registerGitTools()` function, and add 6 optional tool entries to `SITE_BINDING`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:child_process` | built-in | Execute git CLI commands | Already used in EXEC/DENO_TASK tools; zero new deps |
| `node:util` (promisify) | built-in | Promise-wrap exec | Same pattern as EXEC tool in tools.ts |
| `zod` | ^3.24.0 | Schema validation (already in package.json) | Already the project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `simple-git` | ^3.x | Higher-level git abstraction | Already used in nearby `git-as-fs` project, but NOT recommended here — adds a dependency the local-fs MCP doesn't have |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `child_process.exec` | `simple-git` | simple-git has better TypeScript types and handles edge cases, but adds a new npm dependency to local-fs, which currently has zero dependencies beyond the MCP SDK and zod. The operations needed are simple CLI calls that don't need an abstraction layer. |
| `child_process.exec` | `isomorphic-git` | isomorphic-git is a pure JS git implementation (no git binary needed), but is significantly heavier, has a very different API, and is overkill for 6 straightforward CLI operations. |
| `git status --porcelain=v2` | `git status --porcelain=v1` | v2 format gives richer data (especially for renames via `2 R.` prefix), but is harder to parse. v1 is sufficient if renames are detected separately via `git mv` tracking. Recommendation: use v1 for simplicity; rename detection is edge case. |

**Installation:**
```bash
# No new dependencies needed — child_process is built-in to Node/Bun
```

## Architecture Patterns

### Recommended Project Structure
```
mcps/local-fs/server/
├── tools.ts          # Existing: registerTools() calls registerGitTools()
├── git.ts            # NEW: registerGitTools(server, storage) — all 6 git tools
├── storage.ts        # Existing: LocalFileStorage with resolvePath()
└── mcp.test.ts       # Existing: add git tool tests here
```

```
mesh/packages/bindings/src/well-known/
└── site.ts           # Extend SITE_BINDING with 6 optional git tool entries
```

### Pattern 1: Tool Registration — Follow Existing Pattern Exactly

All existing tools in `tools.ts` follow this pattern:

```typescript
// Source: /Users/guilherme/Projects/mcps/local-fs/server/tools.ts
server.registerTool(
  "TOOL_NAME",
  {
    title: "Human Readable Title",
    description: "...",
    inputSchema: {
      path: z.string().describe("..."),
      // fields inline — NOT z.object({}) — just the fields
    },
    annotations: { readOnlyHint: true }, // or false for mutating ops
  },
  withLogging("TOOL_NAME", async (args): Promise<CallToolResult> => {
    try {
      // implementation
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }),
);
```

**Critical:** `inputSchema` takes an object with Zod field values (NOT `z.object({...})`). This is the `registerTool` API from `@modelcontextprotocol/sdk`.

### Pattern 2: Git Command Execution — Using exec

```typescript
// Source: /Users/guilherme/Projects/mcps/local-fs/server/tools.ts (EXEC tool pattern)
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout, stderr } = await execAsync(`git ${args.join(" ")}`, {
    cwd,
    maxBuffer: 10 * 1024 * 1024, // 10MB — same as EXEC tool
  });
  return stdout.trim();
}
```

Git failures throw — the error.message includes stderr content from git, which becomes the `isError: true` response.

### Pattern 3: Path Scoping — Use storage.resolvePath() for Validation

```typescript
// Validate + extract absolute path, then derive relative for git commands
function validateAndResolve(storage: LocalFileStorage, relativePath: string): string {
  // This throws "Path traversal attempt detected" if ../  escapes root
  const absPath = storage.resolvePath(relativePath);
  return absPath; // absolute — needed for git show HEAD:<absPath> style? No.
  // For git commands with cwd=storage.root, just validate then use relativePath
}
```

For git commands, validation is: call `storage.resolvePath(path)` (throws on traversal), then pass the original `relativePath` to git since `cwd` is `storage.root`. Git with `cwd: storage.root` treats relative paths correctly.

### Pattern 4: Git Status Parsing — Porcelain v1 Format

```
git status --porcelain=v1 --untracked-files=all
```

Porcelain v1 format: two-character XY prefix + space + filename (tab + original for renames):
- `XY` where X = staged status, Y = unstaged status
- Characters: ` ` (unmodified), `M` (modified), `A` (added), `D` (deleted), `R` (renamed), `?` (untracked in `??` case)

Mapping to typed enum:
```typescript
const statusChar: Record<string, 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | null> = {
  'M': 'modified',
  'A': 'added',
  'D': 'deleted',
  'R': 'renamed',
  '?': 'untracked',
  ' ': null,
};
```

Parsing logic:
```typescript
interface FileStatus {
  path: string;
  staged: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | null;
  unstaged: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | null;
  oldPath?: string; // for renames
}

function parseStatusLine(line: string): FileStatus {
  const X = line[0];  // staged
  const Y = line[1];  // unstaged
  const rest = line.slice(3);

  // Rename format: "new_path\told_path"
  if (X === 'R' || Y === 'R') {
    const [newPath, oldPath] = rest.split('\t');
    return { path: newPath, oldPath, staged: map[X], unstaged: map[Y] };
  }

  // Untracked: "?? filename"
  if (X === '?' && Y === '?') {
    return { path: rest, staged: null, unstaged: 'untracked' };
  }

  return { path: rest, staged: map[X], unstaged: map[Y] };
}
```

**Confirmed by live testing:** `git status --porcelain=v1` with renames shows `R ` in X position when rename is staged, and the filename field is `new\told` (tab-separated).

### Pattern 5: GIT_COMMIT Identity Fallback

```typescript
// Check if identity is set, use -c flags as fallback
async function buildIdentityFlags(cwd: string): Promise<string[]> {
  try {
    const { stdout: name } = await execAsync('git config user.name', { cwd });
    const { stdout: email } = await execAsync('git config user.email', { cwd });
    if (name.trim() && email.trim()) return []; // identity already configured
  } catch {
    // config not set
  }
  return ['-c', 'user.name=Deco Editor', '-c', 'user.email=editor@deco.cx'];
}

// Usage:
const flags = await buildIdentityFlags(storage.root);
const cmd = ['git', ...flags, 'commit', '-m', message].join(' ');
```

**Alternative (simpler):** Use `-c` flags unconditionally — they override but don't overwrite config. This is safe and simpler than checking first.

**Confirmed by live testing:** `git -c user.name="X" -c user.email="y@z.com" commit -m "msg"` works correctly and the -c flags override without modifying the repo's git config.

### Pattern 6: GIT_COMMIT Dirty-Check Pre-condition

```typescript
// Check if working tree is dirty before staging
const isClean = await execAsync('git status --porcelain', { cwd: storage.root })
  .then(({ stdout }) => stdout.trim().length === 0);

if (isClean) {
  throw new Error('nothing to commit, working tree clean');
}

// Stage all + commit
await execAsync('git add -A', { cwd: storage.root });
const { stdout } = await execAsync(`git -c user.name="${name}" -c user.email="${email}" commit -m "${message}"`, { cwd: storage.root });
```

### Pattern 7: SITE_BINDING Extension — Optional Tool Entry

```typescript
// Source: /Users/guilherme/Projects/mesh/packages/bindings/src/well-known/site.ts
// All existing optional tools use this exact pattern:
{
  name: "GIT_STATUS" as const,
  inputSchema: GIT_STATUS_InputSchema,
  outputSchema: GIT_STATUS_OutputSchema,
  opt: true,           // marks as optional — connection doesn't NEED it
} satisfies ToolBinder<"GIT_STATUS", GIT_STATUS_Input, GIT_STATUS_Output>,
```

Adding `opt: true` means `connectionImplementsBinding()` won't fail if the tool is absent. The site plugin checks for specific tools before calling them.

### Anti-Patterns to Avoid
- **Don't use `z.object({})` in inputSchema:** `registerTool` takes `{ fieldName: z.SomeType() }` directly, not a wrapped object. Using `z.object({})` will cause runtime schema errors.
- **Don't throw errors from git tools:** The MCP pattern is `catch(error) { return { isError: true } }` — never let errors bubble up uncaught.
- **Don't pass absolute paths to git commands when cwd is set:** With `cwd: storage.root`, git treats paths as relative to root automatically. Passing absolute paths in `git diff -- /abs/path` still works but is inconsistent.
- **Don't skip the `--` separator** in git commands that take paths: `git diff -- path/to/file` and `git log -- path/to/file` require `--` to distinguish paths from refs.
- **Don't forget shell escaping for commit messages:** Use array form with execFile or escape the message properly to prevent shell injection via crafted commit messages.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git status parsing | Custom regex parser | `git status --porcelain=v1` | Standard format, stable, handles all edge cases including binary files, submodules, merge conflicts |
| Git identity management | Reading ~/.gitconfig manually | `git config user.name` + `-c` override flags | git itself knows all config scope hierarchy (system → global → local) |
| Path traversal protection | Custom path sanitizer | `storage.resolvePath()` (already exists) | Already tested, already deployed, throws the right error |
| Diff generation | In-memory diff computation | `git diff` / `git diff HEAD` | git's diff is correct for binary files, encoding, line endings; hand-rolling misses edge cases |

**Key insight:** Every git operation already has a clean CLI interface. The child_process bridge is 5-10 lines per tool. Don't add dependencies to solve problems git already solves.

## Common Pitfalls

### Pitfall 1: Shell Injection via Commit Messages
**What goes wrong:** `exec(\`git commit -m "${userInput}"\`)` — a message containing `"` or backticks breaks the shell command.
**Why it happens:** String interpolation into shell commands.
**How to avoid:** Use `execFile` from `node:child_process` which takes args as an array and bypasses shell, OR escape the message: `message.replace(/"/g, '\\"')`. Since GIT_COMMIT takes a message parameter, this is critical.
**Warning signs:** Test with a message containing `"; rm -rf /` — it should fail safely.

Recommended approach:
```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

await execFileAsync('git', ['-c', `user.name=Deco Editor`, '-c', `user.email=editor@deco.cx`, 'commit', '-m', message], { cwd: storage.root });
```

### Pitfall 2: Path Scoping with Git Commands
**What goes wrong:** `git diff -- some/path` where path comes from user input — if validation is skipped, `../outside-root/file` could be passed to git, which follows the path.
**Why it happens:** Git doesn't know about the MCP's root boundary.
**How to avoid:** Always call `storage.resolvePath(path)` before passing any path to git. The check `if (!resolved.startsWith(this.rootDir))` throws. Then pass the sanitized relative path to git.
**Warning signs:** Test with `path: "../../../etc/passwd"` — GIT_DIFF should return `isError: true`.

### Pitfall 3: GIT_STATUS Empty = Not an Error
**What goes wrong:** Tool returns `isError: true` when `git status --porcelain` produces no output.
**Why it happens:** Treating empty stdout as a failure.
**How to avoid:** An empty porcelain output is valid — return `{ files: [] }`, not an error. Only return `isError: true` when `exec` rejects (git process exit code != 0).
**Warning signs:** Test on a clean repo — GIT_STATUS should return `{ files: [] }`.

### Pitfall 4: GIT_CHECKOUT Without --force Guard
**What goes wrong:** Tool discards working tree changes without explicit user intent.
**Why it happens:** Forgetting the force guard.
**How to avoid:** Check `args.force !== true` at the start of GIT_CHECKOUT handler and return `isError: true` with a descriptive message before executing.

### Pitfall 5: Registering Git Tools in tools.ts Directly
**What goes wrong:** `tools.ts` becomes a 2000-line file with git mixed into filesystem logic.
**Why it happens:** Adding everything to one file.
**How to avoid:** Create `server/git.ts` with `export function registerGitTools(server, storage)`, then call it from `registerTools()` in `tools.ts`. Same pattern the codebase would logically evolve toward.

### Pitfall 6: SITE_BINDING Types Not Exported
**What goes wrong:** The planner adds new ToolBinder entries but forgets to export the Input/Output types, causing type errors in the site plugin.
**Why it happens:** Copy-paste from existing entries omits the export.
**How to avoid:** Each tool in site.ts exports `type GIT_STATUS_Input` and `type GIT_STATUS_Output` (see how `ReadFileInput`, `ReadFileOutput` etc. are exported in site.ts).

## Code Examples

Verified patterns from the actual codebase:

### EXEC Tool Pattern (the model to copy)
```typescript
// Source: /Users/guilherme/Projects/mcps/local-fs/server/tools.ts lines 1312-1428
server.registerTool(
  "EXEC",
  {
    title: "Execute Command",
    description: "...",
    inputSchema: {
      command: z.string().describe("The command to execute"),
      timeout: z.number().optional().default(30000).describe("Timeout in ms"),
    },
    annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false },
  },
  withLogging("EXEC", async (args): Promise<CallToolResult> => {
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execPromise = promisify(exec);
      const { stdout, stderr } = await execPromise(args.command, {
        cwd: storage.root,
        timeout: args.timeout,
        maxBuffer: 10 * 1024 * 1024,
      });
      const result = { success: true, exitCode: 0, stdout: stdout.trim(), stderr: stderr.trim() };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        structuredContent: { success: false, error: error.message },
        isError: true,
      };
    }
  }),
);
```

### GIT_STATUS Implementation Sketch
```typescript
// Based on: live testing of git status --porcelain=v1 output
server.registerTool(
  "GIT_STATUS",
  {
    title: "Git Status",
    description: "Get working tree status. Returns staged and unstaged changes per file.",
    inputSchema: {
      path: z.string().optional().describe("File path relative to project root. Omit for full repo."),
    },
    annotations: { readOnlyHint: true },
  },
  withLogging("GIT_STATUS", async (args): Promise<CallToolResult> => {
    try {
      // Validate path if provided
      if (args.path) storage.resolvePath(args.path);  // throws on traversal

      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);

      const gitArgs = ['status', '--porcelain=v1', '--untracked-files=all'];
      if (args.path) gitArgs.push('--', args.path);

      const { stdout } = await execFileAsync('git', gitArgs, { cwd: storage.root });

      const files = parseGitStatus(stdout);
      const result = { files };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }),
);
```

### GIT_STATUS Parsing Function
```typescript
// Source: live testing of git status --porcelain=v1 output
type StatusEnum = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';

interface FileStatus {
  path: string;
  staged: StatusEnum | null;
  unstaged: StatusEnum | null;
  oldPath?: string;
}

const CHAR_MAP: Record<string, StatusEnum | null> = {
  'M': 'modified', 'A': 'added', 'D': 'deleted', 'R': 'renamed', ' ': null,
};

function parseGitStatus(stdout: string): FileStatus[] {
  if (!stdout.trim()) return [];
  return stdout.trim().split('\n').map(line => {
    const X = line[0];
    const Y = line[1];
    const rest = line.slice(3);

    if (X === '?' && Y === '?') {
      return { path: rest, staged: null, unstaged: 'untracked' };
    }

    if (X === 'R' || Y === 'R') {
      const [newPath, oldPath] = rest.split('\t');
      return { path: newPath, oldPath, staged: CHAR_MAP[X] ?? null, unstaged: CHAR_MAP[Y] ?? null };
    }

    return { path: rest, staged: CHAR_MAP[X] ?? null, unstaged: CHAR_MAP[Y] ?? null };
  });
}
```

### SITE_BINDING Extension Pattern
```typescript
// Source: /Users/guilherme/Projects/mesh/packages/bindings/src/well-known/site.ts
// Following the exact pattern of existing optional tools (GET_FILE_HISTORY, READ_FILE_AT)

const GitStatusInputSchema = z.object({
  path: z.string().optional().describe("File path relative to project root"),
});

const GitStatusOutputSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    staged: z.enum(['modified', 'added', 'deleted', 'renamed', 'untracked']).nullable(),
    unstaged: z.enum(['modified', 'added', 'deleted', 'renamed', 'untracked']).nullable(),
    oldPath: z.string().optional(),
  })),
});

export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;
export type GitStatusOutput = z.infer<typeof GitStatusOutputSchema>;

// In SITE_BINDING array:
{
  name: "GIT_STATUS" as const,
  inputSchema: GitStatusInputSchema,
  outputSchema: GitStatusOutputSchema,
  opt: true,
} satisfies ToolBinder<"GIT_STATUS", GitStatusInput, GitStatusOutput>,
```

### GIT_COMMIT with Identity Fallback
```typescript
// Based on live testing: git -c flags override without modifying config
const gitArgs = [
  '-c', 'user.name=Deco Editor',
  '-c', 'user.email=editor@deco.cx',
  'commit',
  '-m', message,  // safe because execFile uses array args, no shell
];
// Note: use execFile not exec — message goes as array element, no shell injection risk
const { stdout } = await execFileAsync('git', gitArgs, { cwd: storage.root });
// Parse hash from stdout: "[branch abc1234] message\n..."
const hashMatch = stdout.match(/\[[\w/]+\s+([a-f0-9]+)\]/);
const hash = hashMatch?.[1] ?? '';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `exec` with string commands | `execFile` with array args | Node.js best practice | Shell injection prevention for user input |
| `git status --porcelain` (v1) | `git status --porcelain=v2` (v2) | Git 2.11+ | v2 has richer data but harder to parse; v1 still recommended for simple cases |
| Installing simple-git for MCP servers | Raw child_process | N/A — project decision | Keeps local-fs dependency-free beyond MCP SDK |

**Deprecated/outdated:**
- `exec` with user-controlled strings: replaced by `execFile` with array args for security
- `isomorphic-git`: overkill for CLI-adjacent MCP servers; adds 20MB+ of JS

## Open Questions

1. **Shell escaping for `git -c` flag values with spaces**
   - What we know: `execFile(['git', '-c', 'user.name=Deco Editor', ...])` works — the array form of execFile passes args directly without shell interpretation
   - What's unclear: Whether the MCP SDK imposes any restrictions on tool output size for large diffs
   - Recommendation: Use execFile array form everywhere; cap diff output at 1MB if needed

2. **Whether to use `execFile` (import-time) vs dynamic import pattern**
   - What we know: Existing tools use `await import("node:child_process")` (dynamic imports in handlers). This is an established codebase pattern.
   - What's unclear: Whether this is intentional (lazy loading) or just copied pattern
   - Recommendation: Follow existing pattern — use `await import("node:child_process")` for consistency, or move to top-level import in the new `git.ts` file (cleaner for a dedicated file)

3. **GIT_LOG limit default**
   - What we know: The user decision says "no path = full repo log" but doesn't specify a default limit
   - What's unclear: Whether 50 (like GET_FILE_HISTORY) or another number is appropriate
   - Recommendation: Default `limit: 50` entries for GIT_LOG (matches GET_FILE_HISTORY precedent in site.ts)

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `/Users/guilherme/Projects/mcps/local-fs/server/tools.ts` — all tool patterns
- Direct code inspection: `/Users/guilherme/Projects/mcps/local-fs/server/storage.ts` — path resolution
- Direct code inspection: `/Users/guilherme/Projects/mesh/packages/bindings/src/well-known/site.ts` — SITE_BINDING structure
- Direct code inspection: `/Users/guilherme/Projects/mesh/packages/bindings/src/core/binder.ts` — ToolBinder type
- Live testing: `git status --porcelain=v1` output verified with staged, unstaged, untracked, renamed scenarios
- Live testing: `git -c user.name="X" commit -m "msg"` verified for identity override
- Live testing: `git add -A && git diff --quiet && git diff --cached --quiet` for dirty check

### Secondary (MEDIUM confidence)
- Reference project: `/Users/guilherme/Projects/git-as-fs/src/lib/git.ts` — simple-git usage patterns (shows what simple-git provides; confirms child_process approach covers all needed operations)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed by direct codebase inspection; no dependencies to add
- Architecture: HIGH — follows verified patterns from existing tools.ts
- Pitfalls: HIGH — shell injection and path scoping verified with live tests

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable — git CLI and Node APIs don't change)
