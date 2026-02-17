# Codebase Concerns

**Analysis Date:** 2026-02-14

## Tech Debt

**Large Monolithic Files:**
- Issue: Multiple files exceed 1500+ lines, creating complexity hotspots that are difficult to test and maintain
- Files:
  - `engine/schema/transform.ts` (1595 lines) - TypeScript type transformation logic
  - `daemon/git.ts` (657 lines) - Git operations API
  - `scripts/upgrade.ts` (885 lines) - Application upgrade logic
  - `engine/core/resolver.ts` (694 lines) - Core resolution engine
- Impact: Harder to trace execution paths, test individual features, and identify failure points. Changes risk cascading effects across the module
- Fix approach: Break into smaller, focused modules organized by feature (e.g., `transform.ts` → `transform/objectTypes.ts`, `transform/utilities.ts`, `transform/unions.ts`). Extract utility functions to dedicated modules

**Schema Type Transformation Incomplete Support:**
- Issue: Multiple TODO comments indicate partial implementation of TypeScript utility types
- Files: `engine/schema/transform.ts` (lines 602, 627, 676)
  - Line 602: `Partial<T>` only supports objects, returns UNKNOWN for arrays/unions/intersections
  - Line 627: `Omit<T>` same limitation
  - Line 676: `Pick<T>` same limitation
- Impact: Complex generic types fail to generate correct schemas. Users cannot fully define advanced TypeScript patterns
- Fix approach: Implement union/intersection/array support in utility type handlers. Add test cases for each generic type with complex inner types

**Manifest Comparison Performance Issue:**
- Issue: Manifest equality check uses JSON.stringify comparison which is slow for large objects
- Files: `engine/manifest/manifestBuilder.ts` (line 336-337)
- Impact: Every manifest regeneration compares entire state as JSON strings. Degrades performance during development with large sites
- Fix approach: Implement deep equality check with early exit conditions, or use structural comparison instead of serialization

**deno-lint-ignore-file no-explicit-any Overuse:**
- Issue: 59 files use blanket `deno-lint-ignore-file no-explicit-any`, masking type safety issues across the codebase
- Files:
  - `engine/core/resolver.ts` - Core resolution logic uses `any` extensively
  - `engine/manifest/manifestBuilder.ts` - JSON builder uses `any`
  - `blocks/app.ts` - App configuration
  - `runtime/middleware.ts` - Request handling
- Impact: Type errors silently slip through. Impossible to identify real type-related bugs during development
- Fix approach: Remove blanket ignores. Fix actual type issues with proper `unknown` and type narrowing. Use `any` only where truly unavoidable with inline comments explaining why

**Batch File Processing Without Error Recovery:**
- Issue: Multiple batch operations process files without individual error handling
- Files:
  - `engine/decofile/fsFolder.ts` (lines 102-108) - Reads all block files in parallel with single catch
  - `daemon/main.ts` (lines 182-222) - Watch events processed in loose chain
- Impact: Single corrupted JSON file fails entire metadata generation. Cannot identify which file caused the problem
- Fix approach: Wrap each file operation in try-catch. Log error per-file. Continue processing others. Report summary of failures

**Unhandled Promise Rejections:**
- Issue: Watch loops and async operations have weak error handling
- Files:
  - `daemon/main.ts` (lines 255-257) - watch/watchMeta/watchFS called with `.catch(console.error)` but no recovery
  - `daemon/main.ts` (lines 114-119) - Global unhandledrejection listener only logs, doesn't recover
- Impact: Background processes silently fail. Development environment stops tracking file changes without obvious indication
- Fix approach: Implement restart logic with exponential backoff. Add health check endpoint to detect stalled watchers. Emit warnings to client if watchers fail

## Known Issues

**Git Merge Base Detection Complexity:**
- Symptoms: Multiple complex branches and tracking logic in merge base detection
- Files: `daemon/git.ts` (lines 37-52)
- Trigger: Using feature branches with custom tracking branches configured
- Root cause: Logic handles multiple branch scenarios but doesn't clearly separate happy path from edge cases
- Workaround: Ensure standard git branch setup with explicit upstream tracking

**JSON Parsing Silent Failures:**
- Symptoms: Invalid JSON in decofile blocks becomes null silently
- Files: `engine/decofile/fsFolder.ts` (lines 139-145)
- Trigger: User edits block JSON file with syntax error
- Root cause: `.catch(() => null)` swallows all parse errors without logging what failed
- Workaround: None - requires fix to log error details before suppressing

**Missing Git Rebase Conflict Handling:**
- Symptoms: Git operations fail with unclear error messages during merge conflicts
- Files: `daemon/git.ts` (lines 191-192) - TODO comments indicate unhandled rebase conflicts
- Trigger: Pulling changes from remote when local history diverges
- Current mitigation: None
- Recommendations: Implement conflict detection and user-friendly error messages. Provide UI for resolving conflicts

## Security Considerations

**Environment Variable Token Exposure in Watch Loop:**
- Risk: DENO_AUTH_TOKENS updated in main process env, may be visible in process listing
- Files: `daemon/main.ts` (lines 89-105) - `updateDenoAuthTokenEnv` sets auth tokens in `Deno.env`
- Current mitigation: Token set once, respawn interval prevents frequent updates
- Recommendations:
  - Pass tokens only to child process via secured channel, not via env vars
  - Use Deno's permission system to restrict subprocess env access
  - Add audit logging for token updates

**TypeScript to JSON Schema Conversion Non-Compliant:**
- Risk: Generated schemas may not fully comply with JSON Schema spec
- Files: `engine/schema/transform.ts` (line 795) - FIXME comment indicates non-compliant handling of literal types
- Current mitigation: None stated
- Recommendations:
  - Review JSON Schema spec compliance for all type conversions
  - Add schema validation against JSON Schema meta-schema
  - Document any intentional deviations

**Debug Cookie and Query Parameter Handling:**
- Risk: Debug mode enabled via URL parameter without authentication checks
- Files: `runtime/middleware.ts` (lines 108-154) - Debug mode activated by `DEBUG_QS` query parameter
- Current mitigation: Only enables debug for 1 hour (line 124), appears to check for admin/localhost
- Recommendations:
  - Verify admin-only enforcement in `isAdminOrLocalhost` function
  - Add rate limiting to debug mode activation attempts
  - Log all debug mode activations with user context

**Unvalidated Shell Command Execution:**
- Risk: Commands constructed from Deno.env values without escaping
- Files: `daemon/main.ts` (lines 60-68) - buildCmd from environment variable split and executed
- Current mitigation: Command comes from env var set by operator, not user input
- Recommendations:
  - Validate buildCmd syntax before execution
  - Use array-form of command execution (already done) - good
  - Add command timeout to prevent hanging

## Performance Bottlenecks

**Schema Generation Slow on Large Apps:**
- Problem: Manifest builder equality check and file I/O operations don't scale
- Files:
  - `engine/manifest/manifestBuilder.ts` (lines 336-337)
  - `engine/schema/transform.ts` - Complex recursive type analysis
- Cause: JSON string comparison for equality, no caching of transformation results, recursive type traversal without memoization
- Current throughput: Unknown, but marked as "slow" in TODO comment
- Improvement path:
  - Implement structural equality checking with early exit
  - Add transformation result caching keyed by type signature
  - Batch schema generation requests
  - Profile type traversal to identify hot paths

**Metadata Generation Blocks on Disk I/O:**
- Problem: Sequential file reads during metadata generation
- Files: `engine/decofile/fsFolder.ts` (lines 87-121)
- Cause: Uses `walk` and sequential reads for each file
- Improvement path:
  - Parallelize metadata generation across CPU cores
  - Implement incremental metadata updates (only regenerate changed blocks)
  - Add in-memory cache with TTL for frequently accessed metadata
  - Consider lazy loading metadata only on demand

**Git Operations Sequential with Single Process Limit:**
- Problem: Git operations serialized with max 1 concurrent process
- Files: `daemon/git.ts` (lines 25-28) - `maxConcurrentProcesses: 1`
- Cause: Simple-git configuration limits concurrency for safety, but blocks other operations
- Improvement path:
  - Profile git operations to find truly concurrent-unsafe operations
  - Allow concurrent read operations (log, status, show)
  - Serialize only write operations (commit, push, rebase)
  - Add queue with priority for critical operations

**Large File Bundling During Development:**
- Problem: App bundler runs frequently on file changes, bundles entire app
- Files: `daemon/main.ts` (lines 121-131, 167-169) - createBundler called with throttle(300ms)
- Cause: Full rebuild on any TypeScript change, no incremental bundling
- Improvement path:
  - Implement incremental bundling (only changed modules)
  - Use esbuild or swc for faster builds
  - Split bundling from manifest generation (can be async)
  - Add build cache

## Fragile Areas

**Core Resolver Resolution Chain Mutation:**
- Files: `engine/core/resolver.ts` - Resolution chain and memo management
- Why fragile:
  - Complex state management with resolve chains and memoization
  - Shallow copy of monitoring object (line 461) could cause state leaks
  - resolverId calculation happens during request (TODO line 454) - timing-dependent
- Safe modification:
  - Add comprehensive unit tests for each resolver type
  - Document state flow through resolver execution
  - Test edge cases: circular references, dangling references, deeply nested resolution
  - Avoid mutating context object during resolution
- Test coverage gaps: No visible test files for resolver core logic

**Schema Transformation Type Dispatch:**
- Files: `engine/schema/transform.ts` - TypeScript AST to JSON Schema transformation
- Why fragile:
  - Multiple type cases with duplicated logic (Partial, Omit, Pick all have same pattern)
  - No validation of type parameters before processing
  - Silent fallback to UNKNOWN for unsupported patterns
- Safe modification:
  - Add type validation before case dispatch
  - Extract common type parameter handling to shared function
  - Add tests for each TypeScript utility type with edge cases
  - Make UNKNOWN fallback throw with helpful error message
- Test coverage gaps: `schemeable.test.ts` exists but may not cover all utility types

**Decofile State Synchronization:**
- Files: `engine/decofile/fsFolder.ts` - File watcher and state reconciliation
- Why fragile:
  - Race condition between batch updates and file watcher events (lines 159-194)
  - filesChangedBatch can accumulate faster than processing
  - Debounce may lose events if files change during debounce window
- Safe modification:
  - Add explicit lock/unlock tracing
  - Test with rapid file creation/deletion
  - Add event queue with overflow protection
  - Verify batching doesn't lose state changes
- Test coverage gaps: No visible tests for file watch scenarios

**Manifest Builder Data Structure Mutations:**
- Files: `engine/manifest/manifestBuilder.ts` - Builder methods mutate initial object
- Why fragile:
  - Methods return new builder but mutate shared state
  - Import deduplication logic complex (lines 344-366)
  - Multiple conditional mutations make tracing changes hard
- Safe modification:
  - Ensure truly immutable operations (don't reuse objects between calls)
  - Add builder snapshots for debugging
  - Test import deduplication thoroughly
- Test coverage gaps: No visible builder tests

**Daemon Process Multi-Component Initialization:**
- Files: `daemon/main.ts` - Complex startup sequence with multiple async dependencies
- Why fragile:
  - Multiple promises initialized sequentially (lines 227-257)
  - No explicit health checks between steps
  - Child process spawn timing depends on environment state
- Safe modification:
  - Add explicit wait-for-ready patterns
  - Separate concerns: git setup, manifest generation, file watching
  - Test startup sequence with missing dependencies
  - Add timeout and retry logic
- Test coverage gaps: No visible daemon startup tests

## Scaling Limits

**Single-Machine Git Repository Operations:**
- Current capacity: All git operations run on single daemon instance
- Limit: Concurrent site updates will serialize on git lock, becomes bottleneck
- Scaling path:
  - Move git operations to dedicated async queue (Bull, RabbitMQ)
  - Implement git push/pull batching
  - Cache git state locally to avoid repeated remote calls
  - Consider shallow clones for large repositories

**In-Memory Manifest Caching:**
- Current capacity: Manifest built on each significant file change
- Limit: Large sites with many blocks cause memory spikes and slow builds
- Scaling path:
  - Implement persistent manifest cache (Redis, local SQLite)
  - Split manifest by sections/routes for lazy loading
  - Use content hashing to skip unchanged blocks
  - Archive old manifests to disk

**File System Watch Recursion:**
- Current capacity: Watches entire site directory recursively
- Limit: Deep directory structures or large node_modules create event storms
- Scaling path:
  - Implement explicit path filtering (exclude node_modules, build output)
  - Use OS-level file watch limits (inotify on Linux has hard limits)
  - Rate-limit watch callbacks
  - Split into multiple watchers by region

**Batch Invocation API Throughput:**
- Current capacity: Unknown, single handler processes requests
- Limit: Large batch requests or concurrent requests will queue
- Scaling path:
  - Implement request queuing with priority
  - Process batch items in parallel (with concurrency limit)
  - Add response streaming for large results
  - Implement request timeout and cancellation

## Dependencies at Risk

**simple-git NPM Package:**
- Risk: Adds Node.js dependency in Deno project; potential version mismatch issues
- Files: `daemon/git.ts` imports from `simple-git`
- Impact: Git operations fail if package incompatible or out of date
- Migration plan:
  - Evaluate using Deno-native git binding (if available)
  - Or maintain separate git module wrapping deno processes
  - Add compatibility tests for each simple-git update

**Preact Version Pinning:**
- Risk: Pinned to 10.23.1; may not receive critical security updates
- Files: `deno.json` (line 95)
- Impact: Security vulnerabilities in older Preact versions
- Migration plan:
  - Establish update cadence (quarterly or on critical fixes)
  - Monitor Preact security advisories
  - Consider upgrading to latest minor versions regularly

**WASM Dependencies:**
- Risk: WASM packages (@deco/deno-ast-wasm) may have platform-specific issues
- Files: Imported from `engine/schema/transform.ts`
- Impact: AST parsing fails on unsupported platforms or with incompatible versions
- Migration plan:
  - Test WASM build on all deployment platforms
  - Maintain fallback non-WASM AST parser
  - Add explicit version compatibility matrix

## Test Coverage Gaps

**Core Resolver Engine Not Tested:**
- What's not tested: Resolver execution, memoization, dangling reference recovery, circular reference handling
- Files: `engine/core/resolver.ts` (694 lines of code, no visible test file)
- Risk: Bugs in core resolution silently affect entire app behavior. Breaking changes to resolver contract go undetected
- Priority: **High** - Core component with many edge cases

**Schema Transformation Incomplete Coverage:**
- What's not tested: Utility type transformations (Partial, Omit, Pick), union/intersection edge cases
- Files: `engine/schema/transform.ts` (1595 lines)
- Risk: Complex TypeScript types silently fail to generate correct schemas. User-defined types become invalid
- Priority: **High** - Frequent source of bugs based on TODO comments

**Daemon Startup and Initialization Untested:**
- What's not tested: Startup sequence, missing environment variables, git setup failures, watch initialization
- Files: `daemon/main.ts` (379 lines)
- Risk: Startup failures not caught in CI. Daemon hangs or crashes silently in production
- Priority: **High** - Critical path for dev environment

**Manifest Builder Mutations Untested:**
- What's not tested: Builder method chaining, import deduplication, manifest merging with conflicts
- Files: `engine/manifest/manifestBuilder.ts` (412 lines)
- Risk: Manifest generation bugs accumulate and become hard to trace. Breaking changes to manifest structure go undetected
- Priority: **Medium** - Important but not as critical as core resolver

**Decofile State Synchronization Untested:**
- What's not tested: File watcher event batching, race conditions, state rollback on error
- Files: `engine/decofile/fsFolder.ts` (247 lines)
- Risk: State inconsistencies between disk and in-memory state. Users experience stale data
- Priority: **Medium** - Can cause subtle data bugs

**Git Operations Error Scenarios:**
- What's not tested: Merge conflicts, rebase failures, auth errors, network timeouts
- Files: `daemon/git.ts` (657 lines)
- Risk: Git operation failures leave repository in unknown state. Users see cryptic error messages
- Priority: **Medium** - Error path coverage matters for reliability

**Error Handling and Recovery:**
- What's not tested: System behavior when background processes fail (watch, manifest gen, git ops)
- Files: `daemon/main.ts` (lines 255-257)
- Risk: One failed background process can cascade into complete system failure
- Priority: **Medium** - Resilience testing important for production stability

---

*Concerns audit: 2026-02-14*
