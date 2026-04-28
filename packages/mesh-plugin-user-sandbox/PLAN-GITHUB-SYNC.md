# GitHub sync for thread work

## Goal

Make the per-thread branch the durable artifact. A user working in a thread
can hit "Publish" and have their work appear on GitHub as a branch (and
optionally a PR) attributed to them — without tokens landing on disk in the
pod, and without the first user's identity getting stamped on everyone
else's commits in a shared `(org, agent)` container.

## Non-goals

- No auto-push. Pushes are explicit user actions. A separate plan can
  revisit auto-publish if we want it later; the cost is surprise (and
  ugly WIP commits in GitHub) so it's not a default.
- No PR creation from inside the sandbox. PR creation needs org-level
  GitHub app context that doesn't belong in a user-code container.
  Mesh opens the PR, the daemon just handles `git push`.
- No GitHub App install flow. Assume the org already has an install and
  a token resolver exists in mesh. If it doesn't, that's a prereq, not
  this plan.
- No cross-remote sync (GitLab, Bitbucket). GitHub only for now. The
  design generalizes, but provider-specific quirks (PR API, auth flow)
  are deferred until there's demand.

## Invariants

1. Per-exec identity is the source of truth for who committed. No
   pod-global git config. A commit's author is whoever fired the tool
   call, resolved at `/bash` time, not whoever happened to start the
   pod.
2. Repo push tokens never touch disk in the pod. Not in `.git/config`,
   not in `~/.git-credentials`, not in env that outlives the exec.
   `GIT_ASKPASS` callback + short-lived tokens.
3. One thread → one branch. Pushes are idempotent re-publishes of that
   branch. `--force-with-lease` is acceptable; `--force` is not.
4. AI-assisted dev framing. This is not a prod deploy target. We don't
   need immutable commit-pinned containers, attestation, or supply-chain
   guarantees here.

## Identity: per-exec, not pod-global

Today: `bootstrapRepo` in `server/runner/docker.ts:885` runs
`gitIdentityScript(repo.userName, repo.userEmail)`, which does
`git config --global user.name/email`. In a `(org, agent)`-scoped pod,
the first user's identity stamps every subsequent user's commits. Data
integrity problem.

Fix:

- Delete the `gitIdentityScript` call from `bootstrapRepo`.
- Keep the `gitIdentityScript` export in `shared.ts` only if something
  else uses it; otherwise delete.
- Inject identity per `/bash` call via env:

  ```
  GIT_AUTHOR_NAME=<acting user name>
  GIT_AUTHOR_EMAIL=<acting user email>
  GIT_COMMITTER_NAME=<acting user name>
  GIT_COMMITTER_EMAIL=<acting user email>
  ```

  Git honors these without any config. The acting user is whoever's
  session fired the tool call, not `thread.created_by` — if Bob commits
  in Alice's thread, Bob is the author.

- Verify the daemon's `/bash` handler accepts `env` and passes it to
  the spawned child. If it doesn't, wire it. The endpoint signature
  already takes `{ command, timeoutMs, cwd }`; adding `env` is a
  one-line change to the spawn call.

- Runner's `exec()` contract grows an optional `env` field. Docker
  runner forwards it to the daemon. Freestyle runner already has its
  own env handling; plumb the same field through.

## Auth: ASKPASS callback

Initial clone keeps its current behavior (a short-lived token in the
clone URL, passed as env so it doesn't land in shell history). But
after clone:

- Rewrite `origin` to the tokenless URL so nothing sticks in
  `.git/config`. One line in `bootstrapRepo` after the clone succeeds:
  `git remote set-url origin <tokenless-url>`.
- Bake a `GIT_ASKPASS` helper script into the image. Tiny shell or
  node script: reads an exec token from env, POSTs to the daemon's
  credential endpoint, prints the token to stdout, exits. Git calls
  it for password prompts.
- Add `POST /credentials` (daemon) — takes the exec token, proxies to
  mesh (`POST /api/sandbox/credentials` or similar), mesh resolves the
  acting user's GitHub token from the vault, returns it. Short TTL on
  the exec token (10 min).
- Per-exec env for push calls:

  ```
  GIT_ASKPASS=/usr/local/bin/askpass
  DECO_EXEC_TOKEN=<hmac, 10min TTL>
  ```

  The token is minted by mesh at tool-call time, scoped to the acting
  user + sandbox handle. Never reused.

Resolving the user's GitHub token on the mesh side is a prereq. Needs
confirmation that the vault has a per-user token (from a user-level
GitHub OAuth grant) or that we can scope an org-level app install
token to the acting user. See open questions.

## Branch naming

`thread/<uuid>` is functional but ugly in the GitHub PR list. Before
push lands, switch to a human-friendly scheme:

- Default: `deco/<agent-slug>/<thread-title-slug>`.
- Fallback when title is missing/empty: `deco/thread/<shortId>` (first
  8 chars of the thread id).
- Slug sanitization: `[^a-z0-9-]` → `-`, collapse runs, trim to 60 chars.
- Collision handling: if the target branch already exists on remote
  with unrelated history, append `-<shortId>`. Rare in practice (title
  collisions within one agent).

Applies at worktree creation (`ensureThreadWorkspace` in
`server/ensure-worktree.ts:68`). Existing threads with `thread/<uuid>`
branches keep them — naming is sticky once the worktree exists.
Rename-on-first-push is possible but not worth the edge cases; leave
legacy threads alone.

## Push flow (happy path)

1. User clicks "Publish" in the thread UI.
2. UI calls mesh tool `THREAD_PUBLISH` (name TBD) with `{ threadId,
   message?, openPr? }`.
3. Mesh resolves acting user → mints exec token → resolves thread's
   worktree cwd (via `ensureThreadWorkspace`) → calls daemon `/bash`
   with per-exec env (`GIT_AUTHOR_*`, `GIT_COMMITTER_*`, `GIT_ASKPASS`,
   `DECO_EXEC_TOKEN`):

   ```
   set -e
   cd <worktree>
   if [ -n "$(git status --porcelain)" ]; then
     git add -A
     git commit -m "<message or 'Update from <thread-title>'>"
   fi
   git push --force-with-lease -u origin <branch-name>
   ```

4. If `openPr` is true, mesh (not daemon) calls the GitHub API to open
   a PR from `<branch-name>` to the repo's default branch. Returns the
   PR URL.
5. UI shows the branch URL (and PR URL if opened).

Failure modes to handle explicitly:

- Dirty index with no real changes (whitespace-only, etc): commit
  anyway if `git add -A` staged something; skip push if `git diff
  origin/<branch>` is empty after the commit.
- Push rejected (diverged remote): surface `git push` stderr verbatim
  so the user can act. `--force-with-lease` guards against clobbering
  unseen commits; don't swallow the error.
- No GitHub token for the acting user: fail fast with a structured
  `GITHUB_AUTH_MISSING` error; UI prompts the user to connect their
  GitHub account.
- Push auth failed (revoked token, expired): same — structured error,
  UI reconnect flow.

## Daemon surface

New endpoints (all bearer-authed via the existing `TOKEN`):

- `POST /credentials` — ASKPASS callback. Body: `{ execToken, remote? }`.
  Returns `{ token }` on success. Called only by the baked-in askpass
  helper, not by mesh directly. Proxies to mesh's credential endpoint.
  Logs the request (not the token) for audit.

Env additions on `/bash`:

- `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`
- `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`
- `GIT_ASKPASS` (set when pushing)
- `DECO_EXEC_TOKEN` (set when pushing)

No new endpoint for "publish" — the mesh tool composes the existing
`/bash` endpoint. Keeps the daemon ignorant of GitHub.

## Mesh surface

New tool:

```
THREAD_PUBLISH
  input:
    threadId: string
    message?: string         // commit message; defaults to thread title
    openPr?: boolean         // default false
    prTitle?: string
    prBody?: string
  output:
    branch: string
    branchUrl: string        // https://github.com/<org>/<repo>/tree/<branch>
    commitSha: string | null // null if nothing to commit
    prUrl?: string
```

Authorization: `ctx.access.check()` on the thread's project scope.
Same-org members can publish their own threads; cross-thread publish
is blocked (the tool resolves the thread's cwd from `threadId` and
refuses if the caller isn't the thread's owner or an org admin —
wire to existing thread ACL if present).

Credential resolver:

- Look up the acting user's GitHub token by `(userId, repo_host)`.
- If none, return `GITHUB_AUTH_MISSING` with the OAuth connect URL.
- Token scope needs `repo` (or `public_repo` if the target is public).

Small companion endpoint for UI polish (not blocking):

- `THREAD_STATUS` — returns `{ dirty: boolean, ahead: number, behind:
  number, branch: string }` by calling `git status --porcelain` and
  `git rev-list --left-right` in the worktree. UI uses it to show a
  dirty indicator and to gate the Publish button.

## UI

Out of scope for this plan beyond listing the touchpoints:

- Thread sidebar: "Publish" button, dirty indicator, last-pushed
  branch URL.
- Publish dialog: commit message (prefilled with thread title), PR
  checkbox, PR title/body (prefilled from thread).
- Post-publish: toast with branch URL, optional PR URL.
- GitHub connect flow when `GITHUB_AUTH_MISSING`. Reuse whatever
  OAuth connect screen mesh already has for other providers.

## File-by-file touchpoints

- `packages/mesh-plugin-user-sandbox/server/runner/docker.ts` — drop
  `gitIdentityScript` call in `bootstrapRepo` (line 885); add
  `git remote set-url origin <tokenless>` after the clone succeeds.
- `packages/mesh-plugin-user-sandbox/server/runner/types.ts` — add
  optional `env` to `ExecOptions` if not already there.
- `packages/mesh-plugin-user-sandbox/server/runner/freestyle.ts` —
  plumb `env` through to its exec equivalent.
- `packages/mesh-plugin-user-sandbox/image/daemon/http-helpers.mjs` —
  confirm `/bash` passes `env` to the spawned child.
- `packages/mesh-plugin-user-sandbox/image/daemon/` — new
  `credentials.mjs` for `POST /credentials`; router wire-up in
  `daemon.mjs`.
- `packages/mesh-plugin-user-sandbox/image/Dockerfile` — install the
  askpass helper script (`/usr/local/bin/askpass`) with `0755`.
- `packages/mesh-plugin-user-sandbox/image/askpass.sh` — new file,
  tiny shell script that POSTs to the daemon's `/credentials` with
  `DECO_EXEC_TOKEN`.
- `packages/mesh-plugin-user-sandbox/server/ensure-worktree.ts` —
  swap `thread/<safeId>` for the human-friendly branch naming in §
  Branch naming. Sanitization helper.
- `apps/mesh/src/tools/...` — new `thread-publish.ts` (or wherever
  thread-scoped tools live). `defineTool` with the input/output above.
- `apps/mesh/src/api/routes/...` — new `/api/sandbox/credentials`
  endpoint that validates the exec token, resolves the user's
  GitHub token, returns it. HMAC key shared with the sandbox token
  minter.
- `apps/mesh/src/...` — GitHub PR creation helper (Octokit). Only
  used if `openPr: true`. May already exist for other features.

## Work breakdown

Rough sizes, roughly ordered by dependency.

1. Per-exec identity env plumbing: daemon `/bash` accepts `env`,
   runner `exec` forwards, `bootstrapRepo` drops global config. (S)
2. `bootstrapRepo` origin URL rewrite. (XS)
3. Human-friendly branch naming in `ensureThreadWorkspace`. (XS)
4. Exec token HMAC mint + verify. Shared between mesh and the
   daemon's `/credentials` handler. (S)
5. `POST /credentials` in daemon; askpass helper in image;
   Dockerfile install. (S)
6. Mesh `/api/sandbox/credentials` endpoint: verify exec token,
   resolve user's GitHub token from vault, return. (S)
7. `THREAD_PUBLISH` mesh tool: compose the push `/bash` call with
   all the env. (S)
8. PR creation helper (Octokit) + wire into `THREAD_PUBLISH`. (S)
9. `THREAD_STATUS` tool (status + ahead/behind). (XS)
10. UI: publish button, dialog, dirty indicator. (M — separate PR)

Steps 1–3 land independently of the rest; they're cleanups that pay
off on their own even if push never ships. 4–7 are the meat of the
feature. 8 is optional-at-first. 9–10 are polish.

## Open questions to resolve before shipping

- **Where does the acting user's GitHub token come from?** If mesh
  has a per-user OAuth grant → straightforward. If only an org-level
  app install exists → PRs get attributed to the app, with
  `GIT_COMMITTER_*` carrying the human. Needs a look at what's in
  `apps/mesh/src/` for GitHub integration today.
- **Clone URL tokens — where does the initial short-lived clone
  token come from?** If we're using the same user OAuth token, the
  clone is already authenticated and the "rewrite origin after
  clone" step still matters (so the token doesn't survive in
  `.git/config`). Confirm clone flow with whoever owns
  `bootstrapRepo` originally.
- **Force-with-lease semantics under concurrent thread edits**: two
  threads on the same agent won't touch each other's branches
  (distinct `thread/...` names), so the classic force-push footgun
  doesn't apply. But a single thread with two publish clicks
  racing could — sequence the publish tool in mesh so concurrent
  calls for the same thread queue instead of racing.
- **Exec token scope**: `(userId, sandboxHandle, threadId)`?
  `(userId, sandboxHandle)`? Narrower is safer; wider is simpler.
  I'd start narrower — bind to thread — and widen only if a real
  use case emerges.
- **Askpass helper language**: shell is simplest; node gives better
  error handling but adds a dep. Shell with `curl -sSf` is fine.
  Confirm `curl` is in the base image (it is in most distros, but
  `Dockerfile` should pin).
- **Commit author for the auto-`git add -A` commit when there's
  untracked junk the user didn't mean to stage**: worth a
  `.gitignore` check? Probably. A `node_modules` symlink shouldn't
  end up committed, but a stray `.env` could. Mitigation: daemon's
  `ensureThreadWorkspace` could ensure a sane `.gitignore` exists,
  or the publish tool could refuse to push if obvious secrets
  patterns are in the diff. Start permissive, add guardrails
  driven by real near-misses.

## Interactions with other plans

- **PLAN.md (k8s move)**: per-exec identity (§Identity) and ASKPASS
  callback (§Auth) are already listed in PLAN.md's work breakdown
  items 6 and 7. This plan fleshes them out and extends them into
  the actual push flow. No conflicts.
- **PLAN-PER-THREAD-DEV.md**: each thread already has its own
  worktree and dev process. Push is scoped to the worktree's cwd,
  so no new interaction — `THREAD_PUBLISH` resolves the worktree
  via `ensureThreadWorkspace` and calls `/bash` with that cwd,
  same as any other tool.
- **Sandbox identity** is unaffected. A thread's branch and commit
  are thread state, not sandbox state. `(org, agent)` stays the
  container key; the branch name is a per-thread property and
  GitHub is the durable store for it.

## Not in this plan

- Auto-push on idle or on "task complete" heuristics. Explicit
  trigger by default per the decision above.
- Rebasing thread branches onto default branch. Can be a separate
  tool (`THREAD_REBASE`) that runs the rebase via `/bash` in the
  worktree. No new infra needed.
- Multi-file commit curation (pick which hunks to include). The
  publish is all-or-nothing on the worktree's dirty state for v1.
- Non-GitHub remotes. Provider-specific — revisit when a concrete
  ask lands.
- Credential rotation beyond the per-exec token. User-scope token
  rotation is the OAuth provider's job.
