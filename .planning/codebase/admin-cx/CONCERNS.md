# Codebase Concerns

**Analysis Date:** 2026-02-14

## Tech Debt

### Permission & Authorization Gaps

**Unprotected Loaders:**
- Files: `loaders/roles/listTeamRoles.ts`, `loaders/roles/listTeamRolesWithCount.ts`, `loaders/teams/loadTeamMembers.ts`
- Issue: Multiple loaders have explicit TODO comments marking them as unprotected with no authorization checks
- Impact: Potential data exposure of role and team information to unauthorized users
- Fix approach: Add `authContext` exports enforcing team/org membership validation before returning sensitive role and member data

**Lack of Transaction Support:**
- Files: `clients/supabase/invites.ts:84`
- Issue: Invite acceptance involves two separate operations (insert member + delete invite) without transaction support
- Impact: Possible race conditions where invite deletion succeeds but member insertion fails, leaving orphaned state
- Fix approach: Implement Supabase transaction support when SDK adds capability, or use RPC functions with atomic guarantees

### Database Query Limitations

**Hard-coded 1000 Row Limit:**
- Files: `loaders/apps/list.ts:9`
- Issue: FIXME comment noting Supabase query limited to 1000 rows without pagination
- Impact: Cannot load more than 1000 apps; incomplete data representation for large deployments
- Fix approach: Implement cursor-based pagination with offset/limit parameters

**Missing Rate Limiting:**
- Files: `clients/supabase/tasks.ts:168, 288, 301, 308, 315, 322`
- Issue: Six separate TODO comments for rate limiting on task insertion per site
- Impact: Unbounded task creation allows DOS-style attacks or accidental resource exhaustion
- Fix approach: Implement per-site rate limiting with configurable thresholds and quota enforcement

**No Query Transaction Wrapping:**
- Files: `clients/supabase/invites.ts:84`
- Issue: Multi-step operations (invite + member insertion) happen sequentially without atomic guarantees
- Impact: Data inconsistency if operations fail mid-sequence
- Fix approach: Use database RPC functions or implement local transaction semantics when Supabase SDK adds support

### Type Safety Issues

**Excessive `any` Usage:**
- Count: 472 occurrences across 222 files
- Files: `components/spaces/siteEditor/sdk.ts`, `clients/supabase/sites.ts`, `hosting/kubernetes/common/cmds/build.ts`
- Issue: Type coercions with `any` bypass TypeScript's safety guarantees
- Impact: Silent failures, unexpected behavior at runtime, difficult debugging
- Fix approach: Replace `any` with explicit union types or generics; use `@ts-expect-error` sparingly with explanations

**Generated Types File Large and Fragile:**
- Files: `clients/supabase/types.ts` (3,736 lines)
- Issue: Auto-generated database types file is massive and directly committed to codebase
- Impact: Large diffs on schema changes, difficult to review, merge conflicts
- Fix approach: Generate types into separate `generated/` directory or at build time only

### Component Size and Complexity

**Giant Files Hard to Maintain:**
- `components/spaces/siteEditor/sdk.ts` (2,206 lines) - Core editor SDK
- `components/editor/JSONSchema/widgets/ArrayFieldTemplate.tsx` (1,686 lines) - Array widget template
- `components/spaces/siteEditor/DecopilotWidget.tsx` (1,579 lines) - AI widget component
- `components/spaces/siteEditor/extensions/Deco/views/Retrospective.tsx` (1,542 lines) - Retrospective view
- Issue: Files exceed maintainable single-responsibility principle sizes
- Impact: Increased cognitive load, harder to test, difficult to debug, merge conflicts
- Fix approach: Split into domain-specific modules; extract reusable state machines and utilities

### GitHub Rate Limiting Issues

**GitHub API Rate Limit Workarounds:**
- Files: `loaders/adminData.ts:330, 335`
- Issue: FIXME comments indicating rate limit reached; background refresh commented out
- Impact: GitHub collaborators data stale, cannot refresh without user interaction
- Fix approach: Implement exponential backoff with server-side caching, use GraphQL batching for bulk queries

**Hardcoded Default Branch Assumption:**
- Files: `clients/github/listeners/handler.ts:238`
- Issue: FIXME comment: assumes main is default branch, hopes users won't change it
- Impact: Deployments for repos with non-main default branches will fail
- Fix approach: Query repo settings to get actual default branch; support branch configuration in deployment

---

## Known Bugs

### Environment Variable Handling

**Deprecated Pagespeed Integration:**
- Files: `routes/admin/[site]/pagespeed.ts:8, 18`
- Issue: API key environment variable not being used, marked as TODO
- Symptoms: PageSpeed insights feature doesn't actually work with API; falls back to public endpoint
- Workaround: Manual configuration not exposed; feature incomplete

**Incomplete OAuth Token Exchange:**
- Files: `routes/webhooks/stripe.ts:110`
- Issue: TODO comment marking subscription bill items as undefined
- Symptoms: Subscription billing data incomplete; cannot accurately track usage-based charges
- Trigger: Any Stripe webhook for new subscription

**Missing Plausible Analytics API:**
- Files: `routes/admin/[site]/analytics/plausible.tsx:26`
- Issue: TODO comment for Plausible API integration
- Symptoms: Analytics dashboard displays no data from Plausible integration
- Trigger: Navigating to analytics page for sites with Plausible enabled

### State Synchronization Issues

**Preact Signals ID Generation Bug:**
- Files: `components/ui/Menu.tsx:272`, `islands/TopbarUserMenu.tsx:124`
- Issue: useFloatingNodeId differs from parent; workaround comments indicate Preact hooks are buggy
- Symptoms: Floating UI positioning incorrect; menus misaligned or clipped
- Trigger: Opening dropdown menus with floating UI in certain viewport sizes
- Workaround: CSS positioning hacks applied

**Image Thumbnail Not Updating:**
- Files: `islands/ReloadThumb.tsx:23`
- Issue: TODO comment about being "more smart" - currently forces full reload
- Symptoms: Image updates require full page refresh to see thumbnail changes
- Trigger: After uploading new version of same image
- Workaround: Full page reload forces thumbnail refresh

### Form & Validation Issues

**Textarea Disabled State Not Respected:**
- Files: `components/editor/JSONSchema/widgets/TextareaWidget.tsx:47`
- Issue: TODO comment noting disabled prop is false when form is disabled
- Symptoms: Text can be entered in disabled form fields
- Trigger: Submitting form while still rendering

**Schema Ref Resolution Incomplete:**
- Files: `components/editor/JSONSchema/widgets/ObjectFieldTemplate.tsx:229`
- Issue: TODO comment for blockRefs resolution fallback to old admin
- Symptoms: Some block configurations not loading correctly from form context
- Trigger: Editing blocks that use schema references

---

## Security Considerations

### Unprotected API Endpoints

**Dangerously Exported Functions Without Auth:**
- Files: `loaders/environments/list.ts:14, 39`, `clients/github/listeners/handler.ts:3, 4, 12`
- Risk: `dangerouslyListEnvironmentsNoAccessCheck`, `dangerouslyGetEnvironmentByNameNoAccessCheck`, `dangerouslyDeleteEnvironmentNoAccessCheck` called from handlers
- Files: `clients/github/listeners/handler.ts` - GitHub webhook handler with no auth context visible on functions
- Current mitigation: Webhook signature validation via GitHub; explicit "dangerously" naming warns developers
- Recommendations:
  - Document webhook signature validation for GitHub endpoints
  - Add explicit permission checks even in "dangerous" functions
  - Consider renaming to clarify admin-only usage

**Insufficient Input Validation:**
- Files: `components/supabase/query.ts:43` uses `eval()` on modified queries
- Risk: Query injection or code execution if query replacement logic is bypassed
- Current mitigation: Query string replacements before eval
- Recommendations: Use parameterized queries exclusively; remove eval entirely

### Data Exposure via DOM

**Dangerous HTML Injection:**
- Files: `components/deployments/DeploymentLogs.tsx:91`, `sections/DesignSystem.tsx:127, 131, 551`, `components/analytics/OneDollarStats.tsx:141`
- Issue: Multiple `dangerouslySetInnerHTML` calls with user-generated or external content
- Risk: XSS attacks if injected HTML contains malicious scripts
- Current mitigation: Content sources appear to be internal (logs, fonts, CSS snippets)
- Recommendations:
  - Audit each `dangerouslySetInnerHTML` for content source
  - Add Content Security Policy headers
  - Use HTML sanitization library for any user-provided content
  - Document justified usage with comments

### Permission Boundary Violations

**Bypass Functions Used in GitHub Listeners:**
- Files: `clients/github/listeners/handler.ts:3-5, 12`
- Risk: Public GitHub webhook events (push, PR, status) trigger admin actions without user permission check
- Current mitigation: GitHub webhooks signed and verified; deployment only for authorized repos
- Recommendations:
  - Add explicit team/org membership verification before deployment
  - Log all webhook-triggered actions with audit trail
  - Implement GitHub App permission scoping per team

---

## Performance Bottlenecks

### GitHub API Rate Limiting

**Disabled Background Refresh:**
- Files: `loaders/adminData.ts:330-336`
- Problem: GitHub collaborators cache refresh commented out due to rate limits
- Impact: Stale data for 1+ hour; users see outdated team member list
- Cause: No rate limit management strategy; requests fail during peak usage
- Improvement path:
  - Implement GraphQL API batching to reduce request count
  - Use GitHub Actions webhook events instead of polling
  - Add request deduplication and caching layer

### Large Component Re-renders

**Shell SDK Size:**
- Files: `components/spaces/shell/sdk.ts` (824 lines)
- Problem: Core SDK with global effects and signals; any change triggers full re-render
- Impact: Lag on typing, slow interaction response
- Improvement path: Split by concern (auth, state, UI), memoize computed signals

**Site Editor SDK Complexity:**
- Files: `components/spaces/siteEditor/sdk.ts` (2,206 lines)
- Problem: Monolithic SDK managing editor state, UI, and backend sync
- Impact: 10+ second initial load; slow save operations
- Improvement path: Extract state machine to worker; lazy-load UI components

### Database Query Performance

**No Index Hints:**
- Files: `clients/supabase/tasks.ts`, `clients/supabase/sites.ts`
- Problem: Queries on large tables (tasks, sites) without explicit index usage hints
- Impact: Slow list operations with 10k+ tasks/sites
- Improvement path: Add database indexes on common filters (site, team_id, state)

**N+1 Query Potential:**
- Files: `loaders/adminData.ts:268` - `loadDomainsFromRepository` iteration
- Problem: Iterating deployments and building domain objects; each might trigger separate queries
- Impact: Slow admin data loading for sites with many deployments
- Improvement path: Use Supabase `.select()` with joins to fetch relationships in single query

### Frontend Asset Size

**Large Component Libraries:**
- Files: `components/pages/library/AssetGallery.tsx` (828 lines), `components/editor/JSONSchema/widgets/MediaUploadWidget.tsx` (722 lines)
- Problem: Full gallery/media widget loaded even when not needed
- Impact: Bundle size increase; slow initial render
- Improvement path: Implement code splitting; lazy-load gallery components

---

## Fragile Areas

### Editor State Management

**Complex Interdependencies:**
- Files: `components/pages/block-edit/state.tsx` (788 lines), `components/pages/block-edit/utils.ts` (688 lines), `components/pages/block-edit/inlineEditor.ts` (811 lines)
- Why fragile: State, utils, and inline editor tightly coupled; changes ripple across all three
- Safe modification:
  - Add integration tests for state transitions before refactoring
  - Use TypeScript strict mode to catch type changes
  - Document signal dependencies
- Test coverage: Gaps in inline editor behavior tests

**Block Action Batching Not Implemented:**
- Files: `components/pages/block-edit/useBlockActions.ts:43, 130, 137`
- Issue: TODO comments for batching; each action triggers separate save
- Safe modification: Create `BatchActionQueue` class with debouncing before implementing
- Test coverage: Need tests for concurrent action scenarios

### Kubernetes Platform Abstraction

**Hard-coded Assumptions:**
- Files: `hosting/kubernetes/common/envs/statefulset.ts:298, 335, 356`
- Issue: TODO comments noting Deno 2 will break these assumptions about deno dir location
- Why fragile: Brittle path-based logic that fails with runtime updates
- Safe modification:
  - Extract Deno directory path to configurable constant
  - Add feature detection instead of version-based logic
- Test coverage: Need tests for different Deno versions

**Denocluster Workaround:**
- Files: `hosting/denocluster/platform.ts:12`
- Issue: TODO as workaround assuming deployment also made by k8s platform
- Why fragile: Breaks if denocluster ever uses different platform
- Safe modification: Implement explicit platform delegation pattern
- Test coverage: Need tests for mixed-platform deployments

### GitHub Integration

**Monorepo Detection Unreliable:**
- Files: `clients/github/listeners/handler.ts:238`
- Issue: Assumes `main` is always default branch
- Why fragile: Fails silently for repos with different default branches
- Safe modification:
  - Query GitHub repo settings for default branch
  - Add configuration parameter for branch override
  - Add tests for common branch names (main, master, develop)
- Test coverage: Missing tests for non-main default branches

**Deploy File Parsing Error Handling:**
- Files: `clients/github/listeners/handler.ts:80-108`
- Issue: Returns null on any JSON parse error; no error logging for debugging
- Why fragile: Silent failures make debugging deployment issues hard
- Safe modification: Add detailed error logging; return error object instead of null
- Test coverage: Need tests for malformed deploy.json files

### TypeScript Type Issues

**Unresolved Type Assertions:**
- Files: `components/pages/block-edit/useBlockActions.ts:130`
- Issue: TODO for `__resolveType` replacement; workaround with identity function
- Why fragile: Type resolution incomplete; future Deco changes could break
- Safe modification: Implement proper block type resolution with tests
- Test coverage: Need tests for all block types

---

## Scaling Limits

### Database Connections

**Concurrent Request Handling:**
- Current capacity: Supabase connection pool (default 10 connections)
- Limit: During high traffic, connection exhaustion after ~1000 concurrent requests
- Scaling path:
  - Increase Supabase connection pool in production
  - Implement connection pooling middleware
  - Add queue for excess requests

### GitHub API Rate Limits

**Current capacity:** 5,000 requests/hour per token
- Limit: Reached with 50+ users checking repo status every 30 seconds
- Scaling path:
  - Use GitHub App with higher rate limit quota
  - Implement server-side GraphQL batching
  - Add request deduplication cache

### Kubernetes Resource Quotas

**Current capacity:** Defined per namespace in `hosting/kubernetes/actions/sites/create.ts:81`
- Limit: Resource quota not well-designed (TODO comment)
- Scaling path:
  - Implement autoscaling based on metrics
  - Add resource limit warnings/enforcement
  - Support multi-region deployments

---

## Dependencies at Risk

### Deprecated Browser APIs

**Screenshot Feature Waiting for Headless Chrome:**
- Risk: `routes/admin/[site]/screenshot/index.ts:13` references todo for refactoring
- Impact: Screenshot functionality incomplete or unreliable
- Migration plan: Implement with Puppeteer/playwright; move to background job

**Preact Component Type Issues:**
- Risk: `sections/AdminLayoutV2.tsx:55`, `sections/PlayLayout.tsx:63` have type casts for ComponentFunc
- Impact: Type safety lost; breaking changes in Deco updates undetected
- Migration plan: Wait for Deco fix; remove casts once available

### Migration Debt

**Old Admin Removal Incomplete:**
- Risk: Multiple files reference "old admin" removal todos
- Files: `routes/admin/invites/[invite]/accept.tsx:10`, `islands/PagesTable.tsx:29`, `islands/TopbarNotifications.tsx:63`
- Impact: Dead code paths not executed; confuses maintenance
- Migration plan: Remove old admin code in next major version; add deprecation warnings

**Legacy OAuth Token Support:**
- Risk: `loaders/github/getUserRepos.ts:62` still supports legacy OAuth tokens
- Impact: Security vulnerability if old tokens not rotated; dependency on old GitHub auth flow
- Migration plan: Force migration to GitHub App auth; deprecate legacy token support

---

## Missing Critical Features

### Observability Gaps

**Offline Detection Incomplete:**
- Files: `components/spaces/siteEditor/sdk.ts:2043`
- Problem: TODO comment noting no reliable offline detection method
- Blocks: Cannot reliably show user when editor is offline; saves may fail silently

**Build Logs Incomplete:**
- Files: `loaders/sites/deployments/reportIssues.ts:94`
- Problem: TODO for fetching logs from HyperDX; currently incomplete
- Blocks: Developers cannot debug failed builds without server access

### A/B Testing

**A/B Test State Missing:**
- Files: `components/pages/block-edit/usePageActions.ts:287`
- Problem: TODO marking A/B test running check as incomplete
- Blocks: Cannot verify if A/B test is active before showing UI

---

## Test Coverage Gaps

### Permission & Authorization Testing

**Untested Areas:**
- Files: `loaders/roles/listTeamRoles.ts`, `loaders/teams/loadTeamMembers.ts`
- What's not tested: Authorization checks on unprotected loaders
- Risk: Permission bypass vulnerabilities undetected
- Priority: High

### GitHub Webhook Handler Edge Cases

**Untested Areas:**
- Files: `clients/github/listeners/handler.ts`
- What's not tested:
  - Monorepo configuration parsing with invalid deploy.json
  - Non-main default branch handling
  - PR close events for multi-site deployments
  - Watch pattern matching for modified files
- Risk: Silent deployment failures in edge cases
- Priority: High

### Database Transaction Safety

**Untested Areas:**
- Files: `clients/supabase/invites.ts`, `clients/supabase/tasks.ts`
- What's not tested:
  - Race conditions on invite acceptance
  - Task state transitions with concurrent updates
  - Rollback scenarios on partial failures
- Risk: Data corruption in concurrent scenarios
- Priority: High

### Large Component Rendering

**Untested Areas:**
- Files: `components/spaces/siteEditor/sdk.ts`, `components/editor/JSONSchema/widgets/ArrayFieldTemplate.tsx`
- What's not tested:
  - Performance with 1000+ array items
  - Memory leaks on component unmount
  - Signal update batching
- Risk: Performance degradation on large datasets; memory leaks
- Priority: Medium

### Error Recovery Scenarios

**Untested Areas:**
- Files: `components/spaces/siteEditor/DecopilotChat.tsx`, `components/spaces/shell/sdk.ts`
- What's not tested:
  - Network timeout recovery
  - Partial state recovery on error
  - User-friendly error messaging
- Risk: Users stuck in error states
- Priority: Medium

---

*Concerns audit: 2026-02-14*
