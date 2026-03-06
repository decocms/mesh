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

## Code Quality

- **Thread/Task naming asymmetry** — UI says "task" but backend API still uses "thread" in some places
- **`org-billing.tsx` (1,732 lines)** should be split into smaller components
- **`monitoring.tsx` (1,510 lines)** should be split into smaller components
