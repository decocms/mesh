# Phase 11: Git SITE_BINDING Tools - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The local-fs MCP server exposes 6 git operations as MCP tools (GIT_STATUS, GIT_DIFF, GIT_LOG, GIT_SHOW, GIT_CHECKOUT, GIT_COMMIT) and SITE_BINDING is extended to declare them. This gives the editor a server-side git API to build on. UI integration (diff badges, commit flow, history panel) belongs in Phases 12–14.

</domain>

<decisions>
## Implementation Decisions

### Path scoping
- All path arguments are **relative to the project root** — the MCP joins them with the root internally
- Paths are **enforced** to stay within the project root; `../` traversal is rejected with an error
- GIT_STATUS and GIT_DIFF: if no path provided, **default to full repo** (whole working tree)
- GIT_LOG and GIT_SHOW: path is optional — no path = full repo log

### Error responses
- Git failures use **MCP tool errors** (`isError: true`) — standard throw pattern, not `{ ok: false }` return values
- GIT_CHECKOUT is **destructive** and requires a `force: true` parameter to confirm intent; missing `force` throws an error
- GIT_COMMIT **auto-configures git identity** with a fallback (e.g. `'Deco Editor <editor@deco.cx>'`) if `user.name` / `user.email` are not set
- GIT_STATUS / GIT_DIFF returning no changes is **not an error** — return empty list / empty string

### GIT_STATUS granularity
- File status uses a **typed enum**: `'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'`
- Status **distinguishes staged vs unstaged per file**: `{ path, staged: StatusEnum | null, unstaged: StatusEnum | null }`
- Renamed files expose **both paths**: `{ path: 'new.json', oldPath: 'old.json', status: 'renamed' }`
- **Untracked files are included** by default (required for Phase 12's "(new)" badge on new page files)

### GIT_COMMIT staging
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

</decisions>

<specifics>
## Specific Ideas

- GIT_CHECKOUT `force: true` pattern mirrors how destructive CLI flags work — clear intent required from the caller
- GIT_COMMIT pre-check before staging avoids a confusing git error surfacing to the editor UI
- Fallback identity `'Deco Editor <editor@deco.cx>'` ensures commits always work on clean dev machines

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-git-site-binding-tools*
*Context gathered: 2026-02-18*
