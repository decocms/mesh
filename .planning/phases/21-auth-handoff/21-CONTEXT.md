# Phase 21: Auth Handoff - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

After viewing the diagnostic report, user is prompted to log in. Diagnostic state survives the full OAuth redirect cycle. After login: org created (name from crawled company name), project created (one project = one storefront URL), diagnostic report associated with org/project.

</domain>

<decisions>
## Implementation Decisions

### Login Prompt
- After the report loads, show a login/signup CTA — clicking navigates to login without losing the diagnostic session token
- The token must survive multi-step OAuth redirects (Google, GitHub, etc.)
- Use `?next=` URL param + `sessionStorage` fallback for token preservation (from STATE.md decisions)

### Org Creation
- Org name derived from **crawled company name** (from diagnostic's company context AI description), NOT email domain
- If user's email domain matches an existing org → ask "Join existing team or start fresh?"
- If no match → create new org automatically

### Project Creation
- One project = one storefront URL
- Project created automatically after org is resolved
- Diagnostic report associated with the project (via nullable org_id/project_id on session)

### Retroactive Association
- Phase 19 schema already has nullable org_id and project_id on diagnostic_sessions
- After login: update the session with the org and project IDs
- The report URL (`/report/<token>`) still works — it's public

### Architecture
- Better Auth handles the actual auth flow (OAuth 2.1, SSO, API keys)
- The onboarding-specific logic hooks into the post-login callback
- RPT-05: Company context editable after login — the edit affordance from Phase 20 links to login, after login it becomes functional

### Claude's Discretion
- Exact implementation of the `?next=` flow with Better Auth's redirect handling
- How to extract company name from the diagnostic results for org naming
- UI for the "Join existing team or start fresh?" prompt
- Whether to create org/project inline during redirect or via a dedicated post-login page

</decisions>

<specifics>
## Specific Ideas

- The transition from public report → login → back to report with org context should be seamless
- User should never feel like they "lost" their diagnostic work
- Keep the auth flow as short as possible — minimize steps between "click login" and "back in the product"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-auth-handoff*
*Context gathered: 2026-02-25*
