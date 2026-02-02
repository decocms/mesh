# Codebase Concerns

**Analysis Date:** 2026-02-01

## Tech Debt

**Static Tool Registry Caching:**
- Issue: Tools registered in virtual MCPs are cached at startup and never updated when new tools are added to the system
- Files: `apps/mesh/src/auth/org.ts` (line 37-38)
- Impact: New tools become available only after restarting the Mesh server. Dynamic tool registration requires server restart
- Fix approach: Implement periodic tool registry refresh or event-driven tool update mechanism in getTools() to reflect system changes

**Plugin Route Registration Limitation:**
- Issue: Plugins cannot register their own root-level client-side routes; routes must be manually registered in main app
- Files: `apps/mesh/src/web/routes/connect.tsx` (line 8-11)
- Impact: Plugins have limited extensibility and tightly coupled architecture requires changes to main application for new routes
- Fix approach: Build plugin route registration system that lets plugins declare root-level routes dynamically

**Service User Attribution in Background Processes:**
- Issue: Event-triggered handlers without real user context fallback to connection.created_by, causing misattribution of actions
- Files: `apps/mesh/src/mcp-clients/outbound/headers.ts` (line 48-51)
- Impact: Audit logs and monitoring incorrectly attribute background operations to the connection creator, degrading observability
- Fix approach: Create dedicated "Decopilot" service user per organization with appropriate audit tagging

**SQL Parameter Interpolation Instead of Native Parameterization:**
- Issue: Custom SQL queries use string interpolation with escape functions instead of native parameterized queries
- Files: `apps/mesh/src/tools/database/index.ts` (line 49-80)
- Impact: While escaping is implemented, this is more error-prone than parameterized queries and creates performance implications
- Fix approach: Use Kysely's native parameterization for all SQL queries; remove interpolation approach

**Environment-Based CORS Configuration:**
- Issue: CORS allowed origins default to allow all if not configured from environment
- Files: `apps/mesh/src/api/app.ts` (line 201-202)
- Impact: Misconfigured deployments could expose API to any origin; insecure by default
- Fix approach: Require explicit CORS origin configuration via environment variables; reject all origins by default

## Known Issues

**Promise Catch Handlers Not Found:**
- Symptoms: Zero promise .catch() handlers detected in codebase; potential unhandled promise rejections
- Files: Throughout `apps/mesh/src`
- Trigger: Async operations that fail without explicit error handling
- Workaround: Currently reliant on top-level error boundaries and global error handlers

**Empty Catch Block Patterns:**
- Symptoms: Two empty catch blocks that silently swallow errors
- Files:
  - `apps/mesh/src/tools/code-execution/utils.ts` (entry.proxy.close().catch(() => {}))
  - `apps/mesh/src/mcp-clients/virtual-mcp/passthrough-client.ts` (entry.close().catch(() => {}))
- Trigger: Resource cleanup operations fail silently
- Workaround: Errors during cleanup are ignored; may cause resource leaks

## Security Considerations

**Type Safety Gaps with `any` Usage:**
- Risk: 58 instances of TypeScript `any` type found in codebase; reduces type safety and increases runtime errors
- Files: `apps/mesh/src` (distributed across multiple files)
- Current mitigation: Compiler type checking still active for non-`any` code
- Recommendations:
  - Audit `any` usage and replace with proper types
  - Enable TypeScript strict mode if not already enabled
  - Use `unknown` with proper type guards instead of `any`

**Database Tool SQL Injection Surface:**
- Risk: User-provided SQL executed through database tool; relies on escape functions rather than parameterized queries
- Files: `apps/mesh/src/tools/database/index.ts` (lines 16-80)
- Current mitigation: Escape functions handle strings, numbers, dates, and objects; positions-based replacement reduces ambiguity
- Recommendations:
  - Validate SQL syntax before execution
  - Add whitelist for allowed SQL keywords
  - Consider read-only mode option for audit/debugging queries

**Configuration Secrets Management:**
- Risk: No detected secure secret vault; .env file usage for sensitive data
- Files: `apps/mesh/.env` (exists but not version-controlled)
- Current mitigation: .env not committed to git
- Recommendations:
  - Implement proper secret management (e.g., HashiCorp Vault, AWS Secrets Manager)
  - Add secret rotation policies
  - Audit secret access logs

## Performance Bottlenecks

**Large Monolithic Components:**
- Problem: Several UI components exceed 1500+ lines, creating complex render trees
- Files:
  - `apps/mesh/src/web/components/manage-roles-dialog.tsx` (1541 lines)
  - `apps/mesh/src/web/routes/orgs/connections.tsx` (1490 lines)
  - `apps/mesh/src/web/routes/orgs/monitoring.tsx` (1142 lines)
  - `apps/mesh/src/web/components/chat/context.tsx` (899 lines)
- Cause: Multiple concerns mixed in single components; complex state management
- Improvement path:
  - Break components into smaller, focused sub-components
  - Extract state management logic into custom hooks
  - Memoize expensive computations with useMemo/useCallback
  - Use React Compiler (already in dependencies) for optimization

**Chat Context State Management:**
- Problem: Chat context component manages 899 lines handling interaction state, thread management, model selection, and virtual MCP routing
- Files: `apps/mesh/src/web/components/chat/context.tsx`
- Cause: Multiple concerns (215 useState/useReducer/useContext hooks in web components) combined in single provider
- Improvement path: Split into specialized sub-contexts (ChatInteractionContext, ThreadContext, ModelContext, MCPContext)

**Event Bus Claim Operation Complexity:**
- Problem: claimPendingDeliveries() has complex dual-path logic for PostgreSQL vs SQLite with nested joins and subqueries
- Files: `apps/mesh/src/storage/event-bus.ts` (lines 535-599)
- Cause: Database abstraction layer handles multiple database backends with different capabilities
- Improvement path: Create database-specific implementations; simplify common path

## Fragile Areas

**Tool Registration System:**
- Files: `apps/mesh/src/auth/org.ts`, `apps/mesh/src/tools/*`
- Why fragile:
  - Dynamic tool imports in getTools() to avoid circular dependencies suggests architectural coupling
  - Static tool list cached at organization creation never refreshed
  - No hot-reload mechanism for new tools
- Safe modification:
  - Document tool lifecycle and registration requirements
  - Add integration tests for tool discovery after system changes
  - Test circular dependency handling
- Test coverage: Tool registration has minimal test coverage; main concerns are:
  - New tool addition doesn't break registration
  - Tool list updates reflect system state
  - No permission escaping in tool definitions

**Virtual MCP Route Plugin System:**
- Files: `apps/mesh/src/core/plugin-loader.ts`, `apps/mesh/src/api/app.ts`
- Why fragile:
  - Plugins must register routes at app initialization time
  - No dynamic route addition/removal
  - Route conflicts undetected until registration
- Safe modification:
  - Plugin loading order must be explicit and tested
  - Route conflict detection with clear error messages
  - Document plugin hook requirements
- Test coverage: Plugin loading not extensively tested for conflicts or hot-reload scenarios

**Event Bus Database Abstraction:**
- Files: `apps/mesh/src/storage/event-bus.ts`
- Why fragile:
  - Dual-path database logic (PostgreSQL vs SQLite) increases surface area for bugs
  - Atomic claim operation relies on exception handling for fallback
  - Retry logic and delivery status transitions could race under load
- Safe modification:
  - Database selection should be explicit at deployment time
  - Create integration tests for both database backends
  - Test concurrent delivery claiming scenarios
- Test coverage: Concurrency testing for event delivery is missing; potential race conditions

**CORS and Origin Validation:**
- Files: `apps/mesh/src/api/app.ts` (lines 195-210)
- Why fragile:
  - Default permissive behavior creates security gaps
  - Environment variable missing doesn't fail safe
  - No validation that origin is valid URL format
- Safe modification:
  - Add CONFIG_STRICT_MODE that requires explicit origins
  - Validate origin format before acceptance
  - Log rejected origins for monitoring
- Test coverage: CORS configuration not tested with various origin formats

## Test Coverage Gaps

**Database Tool SQL Injection Testing:**
- What's not tested: SQL injection vectors for string escaping edge cases, parameter interpolation with special characters
- Files: `apps/mesh/src/tools/database/index.ts`
- Risk: Subtle escaping bugs could expose database to injection despite escape functions
- Priority: High

**Promise Error Handling Coverage:**
- What's not tested: Behavior when promises reject without .catch() handlers
- Files: Throughout async code in `apps/mesh/src`
- Risk: Unhandled rejections could crash server or leave connections in bad state
- Priority: High

**Plugin Route Registration Conflicts:**
- What's not tested: Multiple plugins registering same routes, route parameter conflicts
- Files: `apps/mesh/src/core/plugin-loader.ts`, route mounting
- Risk: Silent failures or unexpected behavior when plugins conflict
- Priority: Medium

**Concurrent Event Delivery:**
- What's not tested: Multiple workers claiming same events under high load, delivery status race conditions
- Files: `apps/mesh/src/storage/event-bus.ts`
- Risk: Duplicate deliveries or lost events in production with multiple workers
- Priority: High

**Large Component Re-render Behavior:**
- What's not tested: Performance impact of 1500+ line components re-rendering with large state changes
- Files: `apps/mesh/src/web/components/manage-roles-dialog.tsx`, `connections.tsx`, etc.
- Risk: Slow UI interactions, memory leaks from cached re-renders
- Priority: Medium

**CORS Configuration Scenarios:**
- What's not tested: Missing environment variables, invalid origins, localhost vs production origins
- Files: `apps/mesh/src/api/app.ts`
- Risk: Misconfigurations deploying without detection
- Priority: Medium

## Scaling Limits

**Virtual MCP Tool Registry Cache:**
- Current capacity: All tools loaded into memory at org creation; no limit on tool count
- Limit: Unbounded memory growth if org has 1000+ tools or tools with large schemas
- Scaling path: Lazy load tools on first use; cache with LRU eviction; implement tool registry service separate from auth

**Event Bus Delivery Worker:**
- Current capacity: Single worker claims batches of deliveries; sequential retry backoff
- Limit: Under high event volume (1000+ deliveries/sec), single worker becomes bottleneck; retry backoff causes delivery lag
- Scaling path:
  - Partition event subscriptions by shard key
  - Add worker pool with work-stealing queue
  - Implement exponential backoff with jitter
  - Consider dead-letter queue for permanently failed deliveries

**Database Query Performance:**
- Current capacity: SQLite for development works fine; PostgreSQL connection pool sized for moderate load
- Limit: Large result sets from custom SQL tool queries could timeout or exhaust memory
- Scaling path:
  - Add result set pagination
  - Implement query timeout limits
  - Add slow query logging via observability
  - Consider materialized views for complex reports

**Browser Chat State:**
- Current capacity: Chat context holds all threads/messages in memory; 215 useState hooks across web components
- Limit: 1000+ message threads cause significant browser memory/render lag
- Scaling path:
  - Implement virtual scrolling for message lists
  - Lazy load thread history
  - Paginate messages from API
  - Use IndexedDB for offline cache

## Dependencies at Risk

**BUN as Primary Runtime:**
- Risk: Project assumes Bun runtime; test and migration scripts hardcoded to Bun
- Files: `apps/mesh/package.json` (scripts use `bun run`), `apps/mesh/src/database/migrate.ts`
- Current: Works well for development; production support for Bun still maturing
- Migration plan:
  - Add Node.js compatibility layer
  - Test all scripts on both Bun and Node
  - Document deployment target requirements
  - Consider edge runtime support (Cloudflare Workers, Vercel Edge)

**Better Auth Dependency Chain:**
- Risk: Multiple better-auth packages with pinned versions; auth system tightly coupled
- Files: `apps/mesh/package.json` (better-auth 1.4.5, @better-auth/sso 1.4.1, @decocms/better-auth 1.5.17)
- Current: Version mismatch between better-auth and decocms/better-auth could cause API incompatibility
- Migration plan:
  - Monitor better-auth updates for breaking changes
  - Maintain compatibility matrix
  - Consider abstracting auth provider interface

**Quickjs WASM Runtime:**
- Risk: Sandbox execution using quickjs-emscripten; WASM module loading in browsers could fail
- Files: `apps/mesh/src/sandbox/run-code.ts`, `apps/mesh/package.json` (quickjs-emscripten-core)
- Current: Works in Node/Bun; WASM module path issues possible in edge runtimes
- Migration plan:
  - Add WASM module fallback
  - Test WASM loading in target environments
  - Consider SandBox API alternative if WASM problematic

## Missing Critical Features

**Hot-Reload Tool Registry:**
- Problem: New tools cannot be registered without server restart; MCP mesh requires server restart for new tool availability
- Blocks: Dynamic plugin loading, tool system extensions, production zero-downtime updates
- Priority: High - blocks operational excellence

**Plugin Client-Side Route Registration:**
- Problem: Plugins cannot define their own routes; all routes hardcoded in main React app
- Blocks: Plugin system completeness, independent plugin development
- Priority: High - needed for ecosystem

**Thread Pinning and Sharing:**
- Problem: Chat UI has placeholder buttons for pin/share that throw "coming soon" toasts
- Blocks: User collaboration features, chat persistence
- Files: `apps/mesh/src/web/routes/orgs/home/page.tsx` (lines 133, 152)
- Priority: Medium - UI feature debt

**Unhandled Promise Rejection Handler:**
- Problem: No global unhandledrejection event listener; silent promise failures
- Blocks: Production reliability; ops visibility into runtime errors
- Priority: High - production safety

**SQL Query Result Limits:**
- Problem: Custom SQL tool doesn't limit result set size; could OOM on large table scans
- Blocks: Safe use of database tool on production databases
- Priority: High - production safety

---

*Concerns audit: 2026-02-01*
