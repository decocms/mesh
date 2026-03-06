# Technical Debt

Deferred issues from PR review of `feat/local-first-dx-core`. Items below were found in already-merged PRs and are not blocking the local-first DX changes.

## Security / Correctness

- **`PROJECT_PINNED_VIEWS_UPDATE` missing org ownership check** (PR #2567) — user can update pinned views for projects outside their org
- **`COLLECTION_CONNECTIONS_GET` write side-effect in readOnly tool** (PR #2567) — sets `readOnly: true` on binding but performs writes
- **`ondownloadfile` handler should validate URI scheme** before `window.open` (PR #2571) — potential open redirect

## Performance

- **N+1 query in `PROJECT_CONNECTION_LIST`** (PR #2567) — needs `findByIds()` batch method on connection storage
- **Monitoring fetches 2000 raw rows to browser** (PR #2554) — needs server-side aggregation

## Memory / Resource Leaks

- **`TaskStreamManager` `useSyncExternalStore` misuse / interval leak** (PR #2563) — subscribe function recreates interval on every call
- **ResizeObserver memory leak in monitoring dashboard** (PR #2554) — observer not disconnected on unmount

## Local Mode

- **Non-atomic seeding** — `seedLocalMode()` does signup + role update + org rename as separate operations without a transaction. If the process crashes mid-sequence, the user exists but isn't admin or org isn't renamed; restart skips seeding because `isDatabaseFresh()` returns false. Needs transaction wrapping or partial-seed recovery.
- **`markSeedComplete()` called after seed failure** — if `seedLocalMode()` throws, `waitForSeed()` still resolves, so `/local-session` attempts login on a potentially missing user and returns a cryptic 500. Consider gating on seed success or returning a descriptive error.
- **No timeout on `waitForSeed()`** — if seeding hangs, the `/local-session` endpoint blocks forever. Add a maximum wait (e.g. 30s).
- **`ENCRYPTION_KEY` fallback to `"dev-secret"`** in `dev-assets.ts` / `dev-assets-mcp.ts` — bootstrap always generates the key, but the hardcoded fallback remains as a defense-in-depth gap.

## Code Quality

- **Thread/Task naming asymmetry** — UI says "task" but backend API still uses "thread" in some places
- **`org-billing.tsx` (1,732 lines)** should be split into smaller components
- **`monitoring.tsx` (1,510 lines)** should be split into smaller components
