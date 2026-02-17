# Pitfalls Research: v1.1 Polish & Integration

**Domain:** Adding polish features to existing CMS plugin (connection wizards, iframe bridge refinement, i18n variants, specification docs)
**Researched:** 2026-02-15
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: postMessage Race Conditions From Disconnected Refs

**What goes wrong:** The composer has a disconnected `iframeRef` that doesn't receive the ready handshake. Messages are sent before the iframe's message listener is registered, causing them to be silently lost. The parent sends `deco:page-config` before the iframe dispatches `deco:ready`, resulting in the preview showing stale content or never updating.

**Why it happens:** React ref lifecycle confusion across component boundaries. The composer creates an `iframeRef` that never gets attached to the actual iframe element because `PreviewPanel` manages its own ref via `useIframeBridge`. The iframe loads asynchronously, and the parent's script executes before the iframe's HTML/JS has parsed. Without a ready handshake, there's no guarantee the listener exists when messages arrive.

**Consequences:** Preview panel shows blank or stale content. Prop changes don't reflect in the preview. Click-to-select doesn't work. Different timing in dev vs. production causes "works locally but not deployed" issues. Developers waste hours debugging postMessage with browser DevTools because the issue is in the ref lifecycle, not the protocol.

**How to avoid:**
- **Single source of truth for iframe ref:** Only `PreviewPanel` (or its `useIframeBridge` hook) should create and manage the iframe ref. Never create refs in parent components that won't be attached
- **Mandatory ready handshake:** Parent MUST wait for `deco:ready` from iframe before sending ANY content messages. Use `readyRef.current` gate in `useIframeBridge`
- **Message queuing during setup:** Queue messages sent before ready, flush after handshake completes
- **Clean up dead code:** Remove `iframeRef` and `useEditorMessages` from composer — they create false confidence that refs are connected
- **Ref callback pattern:** Use `setIframeRef` callback (not `ref={}`) so lifecycle is explicit and traceable

**Warning signs:**
- Preview works intermittently (race condition timing)
- Console shows postMessage being called but no effect in iframe
- Multiple refs to the same iframe in component tree
- `iframeRef.current` is null when message is sent
- Ready signal sent but parent didn't receive it

**Phase to address:** Phase 1 (Connection Setup) — must be rock-solid before building on top

**Confidence:** HIGH — documented in [Securing Cross-Window Communication](https://www.bindbee.dev/blog/secure-cross-window-communication), [postmate library patterns](https://github.com/dollarshaveclub/postmate), known issue in mesh codebase (STATE.md line 44)

---

### Pitfall 2: iframe Remounting Breaks State on Locale Switch

**What goes wrong:** When switching locales, React Query refetches page data. Without `placeholderData`, the `page` prop becomes `undefined` during the fetch. The iframe unmounts (because its `src` depends on page path), loses all state (scroll position, highlight overlay, click handlers), and the ready handshake must restart. The user sees a flash of white, loses their scroll position, and selected block highlighting disappears.

**Why it happens:** React remounts components when their key changes or when critical props change from defined → undefined → defined. Locale switching triggers a query refetch, and between invalidation and new data arriving, `page` is briefly `null/undefined`. The iframe's `src` attribute depends on the page path, so React treats the new render as a different iframe element and unmounts the old one.

**Consequences:** Visual glitches (white flash) on locale switch. Loss of scroll position — user must scroll back to where they were editing. Selected block highlighting disappears, forcing them to re-select. In extreme cases, the ready handshake fails during the remount and the preview never recovers without a page refresh.

**How to avoid:**
- **placeholderData strategy:** Always use `placeholderData: (prev) => prev` in React Query for page data. Keep previous data visible while new data loads
- **Stable iframe src:** If possible, make iframe src locale-agnostic (pass locale via postMessage after load, not via URL)
- **React 19 ref awareness:** As of React 19, `useRef` requires an argument. Refs reset during remounts (not re-renders). Don't rely on refs persisting across locale changes unless you lift state to parent
- **Force remount with key:** If you WANT a remount (e.g., to reset iframe state), use `key={activeLocale}` on iframe element. But understand this is intentional, not accidental
- **Loading overlay:** If remount is unavoidable, show a loading overlay during the transition instead of a jarring white flash

**Warning signs:**
- iframe flashes white on locale switch
- Console shows multiple `deco:ready` handshakes in quick succession
- Scroll position resets to top when changing locale
- Preview works but briefly shows 404 or blank during locale change
- `page` prop is `undefined` between query invalidation and new data

**Phase to address:** Phase 2 (i18n Variants) — locale switching is a core workflow, must be smooth

**Confidence:** HIGH — documented in [React useRef lifecycle](https://www.wavether.com/blog/2025/07/21/understanding-the-lifecycle-of-useref-in-react-and-avoiding-stale-reference-bugs/), [React 19 useRef changes](https://github.com/Automattic/jetpack/issues/38763), implemented pattern in mesh codebase (page-composer.tsx line 96)

---

### Pitfall 3: MCP Connection Creation Race Conditions

**What goes wrong:** User clicks "Connect Site" button multiple times because the first click feels unresponsive. Each click triggers a new MCP connection creation request. Multiple connections are created for the same site, or the UI shows a stale connection while a new one is being created, or the app tries to use a connection that's still initializing and fails with "connection not ready" errors.

**Why it happens:** Connection creation is async (can take 2-5 seconds), and without loading states or optimistic UI, users don't know the first click worked. MCP client libraries don't deduplicate concurrent requests by default. The app doesn't track "pending" connections separately from "active" connections, so multiple creation flows race.

**Consequences:** Multiple redundant connections in MCP storage. User sees duplicate site entries in the sidebar. Toolcalls fail with "connection not ready" if they fire before initialization completes. Connection wizard shows "success" but the connection doesn't work yet. In distributed environments, race conditions between concurrent admin tabs create orphaned connections.

**How to avoid:**
- **pendingTransports map pattern:** Track connections being created in a separate `pendingTransports` map (distinct from active `transports`). Check BOTH before creating a new connection
- **Immediate optimistic UI:** Show the new connection in the sidebar immediately (with loading state) before MCP transport is ready. This gives instant feedback
- **Disable submit during creation:** Wizard submit button should disable + show spinner immediately after first click
- **Connection ID generation:** Generate the connection ID client-side (nanoid) BEFORE starting creation, use it to deduplicate requests
- **Graceful failure recovery:** If creation fails, remove the optimistic entry and show error. Don't leave ghost connections
- **Single active wizard:** Only allow one connection wizard open at a time. Close any open wizards when a new one opens

**Warning signs:**
- Multiple connections with identical configuration
- "Connection not ready" errors right after creation succeeds
- User reports "I clicked create and nothing happened" (no loading state)
- Duplicate sidebar entries for same site
- Wizard success modal appears but toolcalls fail

**Phase to address:** Phase 1 (Connection Wizards) — this is the entry point, must work flawlessly

**Confidence:** HIGH — documented in [MCP Best Practices 2026](https://www.philschmid.de/mcp-best-practices), [MCP Architecture Guide](https://modelcontextprotocol.info/docs/best-practices/), general async race condition patterns

---

### Pitfall 4: i18n Fallback Chain Breaks Unexpectedly

**What goes wrong:** User creates `page_home.en-US.json` variant, but the app tries to load `page_home.en.json` (which doesn't exist) and falls back to default instead of using the more specific variant. Or the fallback chain goes `pt-BR` → `pt` → default, but the app doesn't check the intermediate `pt` file, jumping straight from `pt-BR` (missing) to default. Users see wrong locale content or English when they expected Portuguese.

**Why it happens:** Locale fallback logic is hand-rolled instead of using standard i18n libraries. The file naming convention (`page_home.en-US.json`) follows BCP-47, but the loader doesn't understand region variants should fall back to base language. Or the loader checks `[specific].json → default.json` without the intermediate `[base].json` step.

**Consequences:** Localized content doesn't display even though files exist. Users waste time creating `en-US`, `en-GB`, and `en-AU` variants with identical content because fallback doesn't work. Content editors create region-specific variants thinking they're required, bloating storage. Support tickets: "I created the translation but it doesn't show."

**How to avoid:**
- **Standard fallback chain:** For locale `de-DE`, ALWAYS check: `de-DE` → `de` → default. Never skip the base language step
- **Normalize locale identifiers:** Convert `en_US` to `en-US` (BCP-47 standard) or `en_us` to `en-US` before file lookup. Inconsistent casing breaks lookup
- **Explicit fallback config:** Allow developers to configure fallback chains (e.g., `fr-CA` → `fr-FR` → `en`) for non-standard cases
- **File existence checks:** Before trying to load, check if file exists. Log warnings when fallback happens (helps debugging)
- **Test region variants:** Automated tests should verify `en-US` falls back to `en`, `pt-BR` falls back to `pt`, etc.
- **Use i18next conventions:** Follow [i18next fallback principles](https://www.i18next.com/principles/fallback) even if not using the library — it's battle-tested

**Warning signs:**
- `en-US.json` exists but app loads default
- Console logs "file not found" for `en.json` (missing intermediate step)
- Same content duplicated across `en-US`, `en-GB`, `en-AU` files
- Fallback works for some locales but not others (inconsistent implementation)
- Users report "translation doesn't load" but file exists in .deco/pages/

**Phase to address:** Phase 2 (i18n Variants) — fallback logic is core to multi-locale experience

**Confidence:** MEDIUM — based on [i18next fallback docs](https://www.i18next.com/principles/fallback), [Rails i18n guide](https://guides.rubyonrails.org/i18n.html), general i18n patterns. Not verified with mesh's specific file-based approach.

---

### Pitfall 5: Specification Documents Become Unreadable by Agents

**What goes wrong:** You write a beautiful Markdown specification document for how blocks and loaders work. An AI agent reads it and fails to extract structured information because the document is prose-heavy, uses inconsistent formatting, buries critical fields in paragraphs, or mixes conceptual explanations with technical schemas. The agent hallucinates field names, invents properties that don't exist, or produces invalid JSON because the spec didn't enforce structure.

**Why it happens:** Humans write specs for other humans (prose, examples, explanations). AI agents need **structured schemas** (JSON Schema, explicit types, required fields, enums). A sentence like "pages can have a title, path, and blocks array" doesn't tell the agent that `title` is required, `path` must start with `/`, or `blocks` has a specific nested structure. Without schema enforcement, agents guess and get it wrong.

**Consequences:** Agents generate invalid JSON (missing required fields, wrong types). Block registration fails because the agent invented properties. Loaders return data in unexpected formats. Developers spend hours debugging AI-generated code because the spec was ambiguous. The promise of "AI-powered CMS" falls apart when agents can't parse your own specifications.

**How to avoid:**
- **Schema-first design:** Define JSON Schema or TypeScript types BEFORE writing prose. Embed schemas directly in specification documents
- **Structured output examples:** Every concept gets a concrete JSON example, not just prose description
- **Explicit required fields:** JSON Schema `"required": [...]` arrays. Never rely on "usually" or "typically" language
- **Enum constraints:** If a field has fixed values, list them explicitly. `"type": { "enum": ["section", "loader", "page"] }`
- **Validation tooling:** Provide a CLI command to validate files against the schema. Agents can reference the validator in their output
- **Anti-pattern section:** Explicitly list what NOT to do, with examples of invalid JSON and why they're wrong
- **Separate human docs from agent specs:** Human-facing docs in `docs/`, agent-facing schemas in `.deco/spec/` or `SPEC.json`
- **Follow OpenAI structured output patterns:** Use [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) best practices even if not using OpenAI

**Warning signs:**
- Agents produce JSON that fails validation
- Agents invent field names not in the actual schema
- "It worked in the example but not with real data" (schema drift)
- Agents ask follow-up questions to clarify ambiguous specs
- High error rate on first generation, agents need multiple retries

**Phase to address:** Phase 3 (Sections/Loaders Browser) — agents will read block/loader metadata, must be machine-parseable

**Confidence:** HIGH — documented in [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs), [AI Agent Schema Best Practices](https://binarytrails.com/posts/2025/11/working_with_structured_data), [Production AI Agents with JSON](https://medium.com/@v31u/from-chaos-to-structure-building-production-ready-ai-agents-with-guaranteed-json-responses-dfd925bad7ea)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip pendingTransports map, track only active connections | Simpler state management | Race conditions on rapid connection creation | Never — the map is < 10 LOC |
| Use targetOrigin: "*" in postMessage | Works cross-origin without config | Security vulnerability (XSS, data leaks) | Only in local dev with tunnel URLs, NEVER in production |
| No ready handshake, send messages immediately | Simpler flow, fewer states to track | Intermittent message loss, race conditions | Never — handshake is 5 LOC and critical |
| Skip placeholderData, accept iframe remount | Simpler query config | Bad UX (white flash, scroll loss) | Only if locale switching is rare (< 1% of sessions) |
| Prose-only specs, no JSON Schema | Faster to write initially | Agents can't parse, high error rate | Only for human-only docs, NEVER for machine-consumed specs |
| Hard-code fallback to default, skip intermediate locales | Simple two-step fallback | Users must duplicate content across variants | Only for MVP with single locale, fix before multi-locale GA |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| React Query + iframe | Not using `placeholderData`, causing remount | Always use `placeholderData: (prev) => prev` for iframe-dependent queries |
| postMessage protocol | Sending before ready handshake | Wait for `deco:ready`, gate messages with `readyRef.current` |
| MCP connections | Creating connection without checking pending state | Check `pendingTransports` map AND `transports` map before creation |
| i18n file loading | Assuming file exists, throwing error on 404 | Graceful fallback chain: specific → base → default |
| Cross-origin iframe | Assuming same-origin localStorage/cookies work | Use postMessage for ALL state transfer, no cross-origin storage access |
| Locale detection | Reading `navigator.language` as-is | Normalize to BCP-47 (`en-US` not `en_us`), fall back to base language |
| Message ordering | Assuming postMessage delivers in order | Messages from SAME source are ordered, but add sequence numbers for safety |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-sending full page config on every prop change | iframe lags on rapid edits | Send `deco:update-block` with ONLY changed block, not full page | > 20 blocks on page + rapid typing |
| MutationObserver without debounce | CPU spikes, jank on scroll | Debounce observer callback (100ms) | Pages with heavy animations or video |
| Creating new highlight overlay on every click | Memory leak, DOM bloat | Reuse single overlay element, move it | > 50 section clicks in one session |
| Loading all blocks/loaders metadata on mount | Slow initial render, large payload | Lazy load metadata on browser open, paginate | > 100 blocks in codebase |
| No deduplication in fallback file checks | Multiple FS reads for same file | Cache file existence checks | Deep fallback chains (> 3 levels) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Not validating postMessage origin | Malicious iframe can send fake messages | ALWAYS check `event.source === iframeRef.current?.contentWindow` |
| Using targetOrigin: "*" in production | Data leaks to unintended origins | Use specific origin (even if cross-origin) or require secure context |
| Trusting message data without validation | XSS, code injection | Validate message shape + sanitize string fields before rendering |
| Exposing MCP connection secrets in client | Secrets leaked via DevTools | Never send full connection config to client, use server-side proxy |
| No CSP for iframe src | iframe can load arbitrary content | Set `Content-Security-Policy: frame-src 'self' <tunnel-domain>` |
| Eval-ing message content | Remote code execution | NEVER use `eval()` or `Function()` on postMessage data |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state during connection creation | User clicks multiple times, creates duplicates | Immediate loading UI, disable button |
| White flash on locale switch | Jarring, feels broken | Use placeholderData to keep old content visible during fetch |
| No feedback when ready handshake fails | Preview stuck loading forever | Timeout after 10s, show "Preview failed to load" with retry button |
| Silent fallback to default locale | User thinks translation is missing (it's not) | Toast notification: "Using [default] (pt-BR not found)" |
| Selected block highlight lost on locale switch | User must find and re-select their section | Persist selectedBlockId in URL query param, restore after switch |
| No visual difference between pending and active connections | User doesn't know if creation succeeded | Show spinner badge on pending connections |

## "Looks Done But Isn't" Checklist

- [ ] **iframe communication:** Handshake works in dev, but verify cross-origin production build
- [ ] **Locale fallback:** Test exists for `en-US` → `en` → default chain, not just single-level
- [ ] **MCP connection wizard:** Tested rapid double-click (should only create one connection)
- [ ] **postMessage security:** Origin validation exists, not just prefix check
- [ ] **Ref lifecycle:** Verified iframeRef is attached (not null) when sending messages
- [ ] **Specification docs:** AI agent can extract JSON Schema from spec (tested with Claude/GPT)
- [ ] **Error recovery:** Preview panel has timeout + retry when handshake fails
- [ ] **Loading states:** Every async operation (connection create, locale switch) has loading UI

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Disconnected iframeRef (race condition) | LOW | 1. Move ref to PreviewPanel, 2. Remove dead refs from Composer, 3. Test ready handshake |
| No placeholderData (iframe remount) | LOW | Add `placeholderData: (prev) => prev` to query config, verify no white flash |
| Missing pendingTransports map | MEDIUM | 1. Add map state, 2. Check before creation, 3. Test double-click, 4. Add optimistic UI |
| Broken fallback chain | MEDIUM | 1. Implement base language fallback, 2. Add tests for region variants, 3. Log fallback path |
| Prose-only specs (agents fail) | HIGH | 1. Extract JSON Schema from existing code, 2. Embed in spec docs, 3. Validate examples, 4. Test agent parsing |
| targetOrigin: "*" in production | CRITICAL | 1. Immediate hotfix: set specific origin, 2. Audit all postMessage calls, 3. Add CSP |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| postMessage race conditions | Phase 1 (Connection Setup) | Automated test: send message before ready, verify it's queued |
| Disconnected iframeRef | Phase 1 (Connection Setup) | Code review: only one ref creation, attached via callback |
| MCP connection races | Phase 1 (Connection Wizards) | Manual test: double-click submit, verify single connection |
| iframe remount on locale switch | Phase 2 (i18n Variants) | Manual test: switch locale, verify no white flash or scroll loss |
| Fallback chain breaks | Phase 2 (i18n Variants) | Automated test suite: en-US → en → default, pt-BR → pt → default |
| Unreadable specifications | Phase 3 (Sections/Loaders Browser) | Agent test: GPT-4 extracts schema from spec, validates against real data |
| Origin validation missing | Phase 1 (Connection Setup) | Security audit: grep for postMessage, verify origin checks |
| No loading states | Phase 1 (Connection Wizards) | UX review: all async ops show spinner + disable interaction |

## Phase-Specific Warnings

### Phase 1: Connection Setup Wizards

**High-risk areas:**
- MCP transport creation timing (async, can race)
- Wizard form state management (multiple fields, validation)
- Connection storage (must survive page refresh)

**Must verify:**
- [ ] Rapid double-click only creates one connection
- [ ] Wizard shows loading state immediately on submit
- [ ] Connection appears in sidebar as "pending" before transport ready
- [ ] Failed creation shows error and removes optimistic entry
- [ ] Existing connection with same ID is detected and reused

### Phase 2: i18n Variants

**High-risk areas:**
- File naming conventions (en-US vs en_US vs en-us)
- Fallback chain logic (easy to skip intermediate steps)
- Query invalidation causing iframe remount

**Must verify:**
- [ ] placeholderData prevents iframe white flash
- [ ] Fallback chain includes intermediate base language (en-US → en → default)
- [ ] Locale switcher shows loading state during query refetch
- [ ] Selected block highlight persists across locale switch
- [ ] File not found gracefully falls back (no console errors)

### Phase 3: Sections/Loaders Browser + MCP File Access

**High-risk areas:**
- Reading `.deco/blocks/` and `.deco/loaders/` from MCP filesystem
- Parsing block metadata (could be malformed)
- Lazy loading performance (100+ blocks)

**Must verify:**
- [ ] MCP file read errors are caught and logged (don't crash app)
- [ ] Block metadata is validated against JSON Schema
- [ ] Browser paginates or virtualizes long lists (> 50 items)
- [ ] Missing `.deco/` directory shows helpful onboarding message
- [ ] Specification documents are machine-parseable (test with agent)

### Phase 4: Specification Documents

**High-risk areas:**
- Schema extraction from existing TypeScript types
- Agent parsing validation (must actually test with Claude/GPT)
- Keeping specs in sync with code changes

**Must verify:**
- [ ] JSON Schema generated from TypeScript types (automated)
- [ ] Spec document includes concrete JSON examples for every concept
- [ ] AI agent successfully extracts schema and validates example
- [ ] Required fields explicitly marked (not inferred from prose)
- [ ] Specs versioned (if schema changes, old agents get clear error)

## Sources

**iframe postMessage patterns:**
- [Securing Cross-Window Communication](https://www.bindbee.dev/blog/secure-cross-window-communication) — HIGH confidence
- [postmate: promise-based postMessage library](https://github.com/dollarshaveclub/postmate) — HIGH confidence (battle-tested patterns)
- [MDN: Window.postMessage()](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) — HIGH confidence (official spec)
- [Can I Use postMessage Synchronously?](https://www.cyberangles.org/blog/can-i-do-synchronous-cross-domain-communicating-with-window-postmessage/) — MEDIUM confidence
- [PostMessage Vulnerabilities](https://medium.com/@instatunnel/postmessage-vulnerabilities-when-cross-window-communication-goes-wrong-4c82a5e8da63) — MEDIUM confidence

**React useRef and remounting:**
- [Understanding useRef Lifecycle and Stale Reference Bugs](https://www.wavether.com/blog/2025/07/21/understanding-the-lifecycle-of-useref-in-react-and-avoiding-stale-reference-bugs/) — HIGH confidence
- [React 19 useRef requires argument](https://github.com/Automattic/jetpack/issues/38763) — HIGH confidence (official issue)
- [React, Iframes, and Back-Navigation Bug](https://www.aleksandrhovhannisyan.com/blog/react-iframes-back-navigation-bug/) — MEDIUM confidence
- [React render reloads iframes](https://github.com/facebook/react/issues/4826) — HIGH confidence (official issue)

**MCP connection patterns:**
- [MCP Best Practices 2026](https://www.philschmid.de/mcp-best-practices) — HIGH confidence
- [MCP Architecture & Implementation Guide](https://modelcontextprotocol.info/docs/best-practices/) — HIGH confidence
- [15 Best Practices for Building MCP Servers](https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/) — MEDIUM confidence
- [MCP Server Best Practices for 2026](https://www.cdata.com/blog/mcp-server-best-practices-2026) — MEDIUM confidence

**i18n fallback chains:**
- [i18next: Fallback](https://www.i18next.com/principles/fallback) — HIGH confidence (official docs)
- [Rails i18n API Guide](https://guides.rubyonrails.org/i18n.html) — HIGH confidence (official docs)
- [Vue I18n: Fallback Localization](https://kazupon.github.io/vue-i18n/guide/fallback.html) — HIGH confidence
- [i18n Best Practices](https://www.i18next.com/principles/best-practices) — HIGH confidence

**AI agent specifications:**
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) — HIGH confidence (official docs)
- [Building Production-Ready AI Agents with JSON](https://medium.com/@v31u/from-chaos-to-structure-building-production-ready-ai-agents-with-guaranteed-json-responses-dfd925bad7ea) — MEDIUM confidence
- [Working with Structured Data in AI Agents](https://binarytrails.com/posts/2025/11/working_with_structured_data) — MEDIUM confidence
- [Guide to Structured Outputs and Function Calling](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms) — MEDIUM confidence

**Internal codebase evidence:**
- mesh/.planning/STATE.md (line 44: "Composer `iframeRef` + `useEditorMessages` are dead code")
- mesh/packages/mesh-plugin-site-editor/client/lib/use-iframe-bridge.ts (ready handshake pattern)
- mesh/packages/mesh-plugin-site-editor/client/components/page-composer.tsx (placeholderData implementation)
- anjo.chat/app/lib/deco-editor-bridge.ts (iframe-side message handler)
- anjo.chat/.deco/pages/ (file naming: page_home.en-US.json)

---

*Research for: deco.cx v2 — Milestone v1.1 Polish & Integration*
*Focus: Pitfalls when adding connection wizards, iframe refinement, i18n variants, specification docs to existing CMS plugin*
*Researched: 2026-02-15*
