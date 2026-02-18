---
phase: 11-git-site-binding-tools
verified: 2026-02-18T16:16:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 11: Git Site Binding Tools Verification Report

**Phase Goal:** The local-fs MCP exposes git operations as MCP tools and SITE_BINDING declares them, giving the editor a complete server-side git API to build on
**Verified:** 2026-02-18T16:16:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                               | Status     | Evidence                                                                                              |
|----|-------------------------------------------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------|
| 1  | GIT_STATUS returns typed file status list (modified/added/deleted/untracked/renamed) distinguishing staged vs unstaged per file     | VERIFIED   | git.ts lines 136-177: `--porcelain=v1` parsed by `parseGitStatus()`, returns `{ staged, unstaged }` fields with typed enum |
| 2  | GIT_DIFF returns raw unified diff string between working tree and HEAD for a given path (or whole repo)                             | VERIFIED   | git.ts lines 182-220: `git diff HEAD [-- path]`, returns `{ diff: string }` structuredContent        |
| 3  | GIT_LOG returns commits (hash, author, date, message) touching a file or the full repo, default limit 50                           | VERIFIED   | git.ts lines 225-273: `git log --max-count=50 --format=%H%x00%an%x00%aI%x00%s%x1F`, parsed into `{ commits: [{hash, author, date, message}] }` |
| 4  | GIT_SHOW returns file content string at a specific commit hash                                                                      | VERIFIED   | git.ts lines 278-311: `git show commitHash:path`, returns `{ content: string }` structuredContent    |
| 5  | GIT_CHECKOUT reverts file(s) to HEAD or a specified commit and requires force:true to execute (throws without it)                   | VERIFIED   | git.ts lines 316-360: throws "Pass force=true to confirm" when `!args.force`; test at mcp.test.ts:674 confirms error |
| 6  | GIT_COMMIT stages all changes (git add -A), auto-configures identity from fallback, commits with provided message, returns {hash, message} | VERIFIED | git.ts lines 365-427: `git add -A` then `git -c user.name=... -c user.email=... commit`, parses hash from output |
| 7  | SITE_BINDING in site.ts declares all 6 new tools as optional ToolBinder entries (opt:true)                                         | VERIFIED   | site.ts lines 433-467: all 6 entries with `opt: true` satisfying typed ToolBinder<...>              |
| 8  | tools.ts calls registerGitTools(server, storage) so all 6 tools are available at runtime                                           | VERIFIED   | tools.ts line 21: `import { registerGitTools } from "./git.js"`; line 1434: `registerGitTools(server, storage)` |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                                                  | Expected                                        | Status     | Details                                                                                               |
|---------------------------------------------------------------------------|-------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------|
| `/Users/guilherme/Projects/mcps/local-fs/server/git.ts`                  | All 6 git MCP tools implemented using execFile  | VERIFIED   | 429 lines, exports `registerGitTools`, uses `execFile` (not `exec`), includes `resolveRelative` traversal guard |
| `/Users/guilherme/Projects/mcps/local-fs/server/tools.ts`                | registerTools calls registerGitTools            | VERIFIED   | Import on line 21, call on line 1434 inside `registerTools()` body                                  |
| `/Users/guilherme/Projects/mesh/packages/bindings/src/well-known/site.ts` | SITE_BINDING extended with 6 optional git entries | VERIFIED | Lines 433-467: all 6 entries (GIT_STATUS through GIT_COMMIT) with `opt: true` and typed schemas     |
| `/Users/guilherme/Projects/mcps/local-fs/server/mcp.test.ts`             | Tests for all 6 git tools                       | VERIFIED   | 9 git-specific tests in `describe("git tools", ...)`, all 32 tests pass (0 failures)                |

### Key Link Verification

| From                                               | To                                        | Via                                          | Status  | Details                                                                      |
|----------------------------------------------------|-------------------------------------------|----------------------------------------------|---------|------------------------------------------------------------------------------|
| `tools.ts`                                         | `git.ts`                                  | `import { registerGitTools } from "./git.js"` | WIRED   | Line 21 import + line 1434 call site inside `registerTools()`               |
| `git.ts`                                           | `storage.resolvePath / storage.root`      | `resolveRelative()` + `cwd: storage.root`    | WIRED   | `resolveRelative()` at lines 34-38 calls `storage.resolvePath(path)`; `runGit()` at line 30 uses `cwd: storage.root` |
| `site.ts` SITE_BINDING                             | 6 new ToolBinder entries with `opt:true`  | `GIT_STATUS` entry                           | WIRED   | Grep confirms `GIT_STATUS.*opt.*true` pattern — all 6 entries verified      |

### Requirements Coverage

Per the PLAN frontmatter, Phase 11 claims requirements DIFF-01 through HIST-03. However, REQUIREMENTS.md maps all 11 IDs to Phases 12-14, not Phase 11. This is intentional per the phase objective: "This phase delivers the server-side API only — no UI." Phase 11 is the enabler; the requirements are satisfied end-to-end by Phases 12-14 consuming these tools.

| Requirement | Source Plan | Description                                                                                     | Status         | Evidence                                                                                         |
|-------------|-------------|-------------------------------------------------------------------------------------------------|----------------|--------------------------------------------------------------------------------------------------|
| DIFF-01     | 11-01-PLAN  | User sees deleted sections greyed-out (Phase 12 UI, enabled by GIT_STATUS + GIT_DIFF)          | ENABLED        | GIT_STATUS returns file-level status; GIT_DIFF returns diff — sufficient for Phase 12 to build diff badges |
| DIFF-02     | 11-01-PLAN  | User sees newly added sections with "(new)" badge (Phase 12 UI, enabled by GIT_STATUS)         | ENABLED        | GIT_STATUS detects added/untracked files                                                        |
| DIFF-03     | 11-01-PLAN  | User sees modified sections with "(edited)" indicator (Phase 12 UI, enabled by GIT_STATUS)     | ENABLED        | GIT_STATUS detects modified files per-path                                                      |
| DIFF-04     | 11-01-PLAN  | User can restore deleted section (Phase 12 UI, enabled by GIT_CHECKOUT)                        | ENABLED        | GIT_CHECKOUT with `force:true` reverts files to HEAD                                            |
| DIFF-05     | 11-01-PLAN  | User can discard all pending changes via "Discard changes" (Phase 12 UI, uses GIT_CHECKOUT)    | ENABLED        | GIT_CHECKOUT supports path argument for per-file revert                                         |
| COMMIT-01   | 11-01-PLAN  | Explicit Commit button (Phase 13 UI, uses GIT_COMMIT)                                          | ENABLED        | GIT_COMMIT tool available for Phase 13 to wire to UI                                            |
| COMMIT-02   | 11-01-PLAN  | AI-generated commit message (Phase 13 logic, uses GIT_COMMIT)                                  | ENABLED        | GIT_COMMIT accepts arbitrary `message` string — AI generation is Phase 13 concern               |
| COMMIT-03   | 11-01-PLAN  | Creates real git commit (Phase 13, uses GIT_COMMIT)                                            | ENABLED        | GIT_COMMIT runs `git add -A && git commit`, test confirms hash is returned                      |
| HIST-01     | 11-01-PLAN  | History panel with commit list (Phase 14 UI, uses GIT_LOG)                                     | ENABLED        | GIT_LOG returns `[{hash, author, date, message}]` for a file or full repo                      |
| HIST-02     | 11-01-PLAN  | Click commit to load that page version (Phase 14 UI, uses GIT_SHOW)                            | ENABLED        | GIT_SHOW returns file content at any commit hash                                                |
| HIST-03     | 11-01-PLAN  | "Revert here" restores historical version and creates new commit (Phase 14, uses GIT_SHOW + GIT_COMMIT) | ENABLED | GIT_SHOW retrieves historical content; GIT_COMMIT creates the subsequent commit               |

All 11 requirements are ENABLED by this phase's server-side API. End-to-end satisfaction requires Phases 12-14 to build the UI that consumes these tools. This matches the stated phase scope.

### Anti-Patterns Found

| File     | Line | Pattern              | Severity | Impact  |
|----------|------|----------------------|----------|---------|
| None     | -    | -                    | -        | -       |

No stubs, placeholders, or empty implementations detected. All 6 tool handlers perform real git subprocess calls. `resolveRelative()` is a genuine traversal guard (not a stub). `parseGitStatus()` and `parseGitLog()` are substantive parsers.

Security note: `execFile` is used throughout (not `exec`), preventing shell injection. Path arguments are validated through `storage.resolvePath()` before being passed to git.

### Human Verification Required

None required. All critical behaviors are covered by the 9 integration tests that pass against a real git repository:

- GIT_STATUS: verified for clean and dirty working trees
- GIT_DIFF: verified for both modified and clean files
- GIT_LOG: verified returns commits with hash and message
- GIT_SHOW: verified returns historical file content
- GIT_CHECKOUT: verified rejects without force:true; verified reverts file with force:true
- GIT_COMMIT: verified returns hash on success; verified rejects clean tree

### Gaps Summary

No gaps. All 8 must-haves are fully verified. The phase delivers a complete, substantive, wired server-side git API.

**Test results:** 32 pass, 0 fail (bun test server/mcp.test.ts)
**TypeScript check:** passes on `packages/bindings` (tsc --noEmit exits 0)
**Security:** execFile (no shell injection), resolvePath traversal guard in place for all path inputs

---

_Verified: 2026-02-18T16:16:00Z_
_Verifier: Claude (gsd-verifier)_
