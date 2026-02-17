# Phase 10: Documentation & Validation - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Two deliverables: (1) a comprehensive blocks framework specification document (BLOCKS_FRAMEWORK.md) for AI agents and developers, and (2) end-to-end validation of the deco CMS site editor using anjo.chat as the reference site. The spec documents how to make any TypeScript site deco-compatible. The validation proves the full integration works.

</domain>

<decisions>
## Implementation Decisions

### Spec document structure
- Goal-first organization: start with "what you're trying to achieve" (make a site deco-compatible), then explain how each piece fits — top-down narrative
- Audience is both AI agents and developers — clear structure for machine parsing, but also human-readable
- Include full JSON Schema examples for blocks (e.g., a real Hero section) so agents can pattern-match
- Cover both integration paths: (1) making an existing site deco-compatible, and (2) what the starter template provides out of the box

### Integration guide tone
- Explained walkthrough for initEditorBridge() — step-by-step: what it does, where it goes, what each part means, then the code
- Full postMessage protocol specification — document every message type, payload shape, and expected response (someone could reimplement the bridge)
- Include a troubleshooting / common mistakes section with fixes (missing data-block-id, wrong message origin, etc.)
- Include a machine-checkable compatibility checklist — structured with file paths to verify, attributes to check, so an agent could automate verification

### Validation scope
- Scripted verification checklist — the executor follows step-by-step, recording pass/fail for each item
- Core flow only: connect, scan, preview, click-to-select, prop editing (Phases 1-9 features). Multi-site switching (09.1) excluded
- If validation reveals bugs in the deco CMS site editor: fix everything — the goal is a working end-to-end demo
- anjo.chat already has .deco/ scaffolding from prior manual setup — no initial setup needed in the plan

### Spec file location
- Canonical version in the mesh repo (apps/mesh/docs/ or similar)
- Full copy in the starter template — same BLOCKS_FRAMEWORK.md, one source of truth, no condensed version
- Also exposed as a Claude Code skill (/deco:blocks-framework) for agent discoverability
- Cross-references with the Astro docs site (apps/docs/) — spec links to docs for deeper topics, docs links back to spec

### Claude's Discretion
- Exact file path within apps/mesh/ for the canonical spec
- How to structure the Claude skill (wrapper vs direct content)
- Ordering of troubleshooting items by likelihood
- Specific pass/fail criteria thresholds for the validation checklist

</decisions>

<specifics>
## Specific Ideas

- The spec should be sufficient for any AI agent to make a site deco-compatible without additional context
- anjo.chat is the validation target site, not the subject — the integration being validated is the deco CMS site editor itself
- Validation fixes bugs in the CMS/plugin, not in anjo.chat's application code

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-documentation-validation*
*Context gathered: 2026-02-16*
