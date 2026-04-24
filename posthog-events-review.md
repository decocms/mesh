# Events Review — Keep / Watch / Consider-Removing + Trigger-Correctness

**Purpose**: Triage what we actually care about and verify each trigger sits where the name says it does.
**Method**: Went through every event in `events-catalog.md`, checked the code at the cited line, reasoned about edge cases.
**Guiding principle** (per you): *"most we would like to know if the button is actually used or not — that might show it to us"*. So even unglamorous button-existence signals stay in **Keep** unless they're already covered by a better event.

---

## Criticality tiers

- **T1 — Core** : Product health signals we'd look at weekly. North-star-adjacent.
- **T2 — Feature telemetry** : Feature-usage and friction signals. Review when shipping, auditing, or improving a surface.
- **T3 — Validation-only** : "Does the button work at all?" Useful once, then rarely. Fine to keep but won't drive decisions.
- **T4 — Noise risk** : High cardinality / high volume / redundant with a better event. Candidate for dropping.

Nothing is in **T4** unless it's clearly redundant; the Sounds preview button doesn't drive decisions but it costs nothing to keep.

---

## North-star-ish events (T1)

| Event | Why it matters |
|---|---|
| `user_signed_up` | Top-of-funnel — counts new users |
| `organization_created` | Team sign-ups distinct from personal sign-ups |
| `organization_domain_joined` | Auto-join path working? |
| `chat_started` | Core value creation — user starts an agent thread |
| `chat_message_sent` | Volume of real work |
| `chat_message_completed` | Successful output — includes tokens + duration |
| `chat_message_failed` / `_aborted` | Failure surface — needs `error_category` breakdown |
| `chat_message_stopped` | Frontend stop intent — UX-side abandonment |
| `tool_called` | Tool adoption and latency profile |
| `connection_created` / `_deleted` | Integration breadth per org |
| `agent_created`* / `agent_deleted` | Agent inventory churn (*still a gap server-side) |
| `automation_created` / `_run` | Automation adoption — but cron/event runs not tracked yet |
| `credits_topup_clicked` + `credits_topped_up_detected` + `chat_message_failed{error_category=insufficient_funds}` | Revenue funnel proxy |
| `connection_oauth_succeeded` / `_failed` | OAuth completion rate (activation blocker if failing) |
| `ai_provider_connect_clicked` + provider-connect success variants | BYOK adoption funnel |

## Feature telemetry (T2)

These answer "is this feature used and by whom" questions:

- `chat_picker_opened` / `_closed` (outcome + duration) — / and @ abandonment rate
- `chat_mode_changed` + `chat_message_sent.mode` — which modes are used
- `chat_voice_started` / `_confirmed` / `_cancelled` — voice adoption
- `chat_message_copied` — do people copy assistant output? Signals agent-as-content-generator
- `chat_image_model_selected` / `chat_search_model_selected` — image/deep-research feature use
- `chat_prompt_inserted` — who uses slash-prompts
- `chat_model_changed` / `chat_credential_changed` — model-picker churn (do users experiment?)
- `home_agent_tile_clicked` + `home_create_agent_clicked` + `home_see_all_agents_clicked` + `connections_banner_clicked` — home conversion funnel
- `agents_list_template_clicked` + all `agent_recruit_confirmed/_failed` — template adoption per template_id
- `deco_site_import_*` — deco.cx migration funnel
- `agent_updated` (with `fields[]`) — which parts of an agent are configured most
- `agent_instructions_improve_clicked` + `agent_instructions_template_inserted` — prompt-engineering helpers
- `agent_layout_*` — layout customization depth
- `agent_connect_action` + `agent_connect_modal_opened` + `agent_typegen_*` — external-use funnel (IDE install + API-key distribution)
- `main_panel_tab_clicked` (with `was_active`) — tab bar usage per vMCP
- `agent_toolbar_toggled` — left/right panel usage
- ~~`agent_subtab_changed`~~ — **retired** (sub-tabs removed in agent detail consolidation)
- `connection_add_clicked` (per action + source) — connection-add mechanics
- `connections_dialog_opened` (per source + surface) — discovery path
- `connection_browse_clicked` + `agent_connection_detail_opened` — navigation into connection detail
- `connection_authorize_clicked` — re-auth frequency
- `automation_new_clicked`, `automation_improve_clicked`, `automation_test_clicked`, `automation_trigger_added` — automation engagement
- `automations_list_row_clicked` + `_empty_state_browse_agents_clicked` — org-wide automations page use
- `connections_page_tab_changed`, `connections_custom_dialog_opened`, `connection_custom_created`, `connections_community_warning_confirmed`, `connections_bulk_*` — settings-connections page
- `store_registry_toggled`, `store_private_registry_*` — registry mgmt
- `brand_created`, `brand_extract_*`, `brand_updated`, `brand_archived`, `brand_restored`, `brand_set_as_default` — brand-context adoption
- `ai_provider_*` (connect/oauth/cli/provision, succeeded/failed) — BYOK funnel
- `monitoring_tab_changed`, `monitoring_time_range_changed`, `monitoring_live_toggled` — monitoring-page use
- `member_invited`, `member_role_updated`, `member_removed`, `invitation_role_updated` — team-growth ops
- `role_created` / `_updated` / `_deleted` / `_members_updated` — RBAC adoption
- `sso_configured` / `_config_updated` / `_config_removed` / `_enforcement_toggled` — SSO funnel (paid-plan signal)
- `profile_updated` — profile completion
- `preferences_theme_changed`, `preferences_notifications_toggled` (+ `_permission_denied`), `preferences_sounds_toggled`, `preferences_tool_approval_changed`, `preferences_experimental_vibecode_toggled` — personalization
- `mcp_app_opened`, `vm_preview_loaded` — app/iframe usage
- `credits_exhausted_shown`, `credits_empty_state_shown` / `_dismissed` — banner exposure rate
- `tasks_panel_*` — task-panel navigation
- `chat_archived` / `_unarchived` / `_deleted` — chat hygiene
- `registry_publish_request_submitted` — marketplace submission flow

## Validation-only (T3)

These are *is this button reachable?* signals — useful once, then rarely queried:

- `nav_item_clicked`, `settings_nav_clicked` — nav-level clicks; individual labels eventually covered by `$pageview`
- `sidebar_agent_pin_clicked`, `agent_browser_opened`, `agent_create_new_clicked`, `agent_import_clicked`, `agent_template_clicked` — once we see they happen, volume is less interesting than *which templates*
- `preferences_sounds_previewed` — "does the preview button work?" — 100% validation-only
- `tasks_panel_new_clicked` — subset of `chat_started.created_via="stream_auto"`
- `connections_dialog_custom_clicked` — second-step of `connections_custom_dialog_opened` when inside the Add dialog specifically
- `connections_bulk_status_toggled` / `_delete` / `_add_to_agent` — low-volume ops

Keep all of them — cost is zero.

## Noise-risk / redundant (worth a second look)

**Everything below should stay for now**, but these are the candidates if we ever want to trim:

1. **`chat_message_stopped`** (F) vs **`chat_message_aborted`** (S)
   - `_stopped` = user hit stop
   - `_aborted` = server saw registrySignal.aborted
   - Both usually fire together. `_stopped` adds the *user intent* signal (distinct from tab-close). Keep, but document clearly: `_stopped` ≠ end-of-message event.

2. **`credits_topup_requested`** (S) — **REMOVED** in commit `f8150dc8f`. It was a near-duplicate of the frontend `credits_topup_clicked` in the standard UI flow and captured no payment signal either. If a non-UI caller of `AI_PROVIDER_TOPUP_URL` ever starts hitting the tool, re-introduce it then.

3. **`chat_opened`** vs **`chat_started`**
   - A brand-new thread fires BOTH. Use `chat_started` for "new thread", `chat_opened` for "loaded an existing thread".

4. **`tool_called`** (S) — the highest-volume event in the app. Already has good filter surface (`tool_source`, `tool_name`, `is_error`, `read_only`). Keep but monitor PostHog cost.

5. **`$autocapture`** — very noisy, low precision. Keep for discovery, but don't base any dashboards on it.

6. ~~**`agent_updated`** — fires on every debounced save (~1s throttle). For a 500-char instructions edit, user sends ~10–20 events. High but acceptable.~~ **FIXED** in commit `f8150dc8f`: both `agent_updated` and `automation_updated` are now session-based. Auto-saves still persist every 1s but PostHog receives ONE event per edit-session (30s-quiet-to-flush, or explicit flush on sub-tab / test / improve / delete). Events carry `save_count` and `edit_duration_ms` so session depth is preserved.

---

## Trigger-correctness review (issues found + fixes applied)

I walked every event and checked whether the code at the cited line actually does what the event name suggests.

### Already fixed in `f8150dc8f`

0. **`credits_topup_requested` removed.** Server-side near-duplicate of `credits_topup_clicked`. Neither proved payment. Left `credits_topup_clicked` as the sole intent event until we wire a real Stripe/gateway webhook.

0. **Session-based tracking for `agent_updated` and `automation_updated`.** Auto-saves still run at the 1s debounce; PostHog now only emits one event per edit-session, with `save_count` and `edit_duration_ms` preserving session depth. Cut event volume ~10-15× per typical edit.

### Already fixed in `63edfb0fe`

1. **Recruit modals missing events** — `lean-canvas-recruit-modal.tsx` and `studio-pack-recruit-modal.tsx` had NO tracking; the other 3 recruit modals did. Added `agent_recruit_confirmed` / `_failed` with `template_id: "lean-canvas"` / `"studio-pack"`. Studio-pack also gets `installed_count` since it creates multiple agents in one go.

2. **`ai_provider_oauth_failed` silent on timeout** — The 2-minute `setTimeout` path in `org-ai-providers.tsx` reset `isOAuthPending` but didn't fire the event. Now fires with `error: "timeout"`.

3. **`brand_extract_failed` missing** — `BRAND_CONTEXT_EXTRACT` had `_started` and `_succeeded` but no `_failed`. Added.

4. **`agent_deleted` source inconsistency** — `virtual-mcp/index.tsx` fired without a `source`, `routes/agents-list.tsx` fired with `source: "agents_list"`. Standardized by adding `source: "agent_detail"` to the agent-detail caller.

### Correct but worth flagging (not changed)

5. **`chat_message_stopped`** — name suggests end-of-message but it's actually **user-clicked-stop intent**. The server-side `_aborted` or `_completed` still fires for the actual termination. Documented in catalog; no code change.

6. **`agent_updated` is debounced** — `saveForm` is called from `form.watch(() => debouncedSave())` at 1000 ms. Blur also calls `saveForm` directly. Net effect: one save per idle-second of typing, plus one on blur. Acceptable volume.

7. **`connections_dialog_opened` `surface` prop inconsistent** — Only the `agent_settings` source currently passes a `surface`. Other sources (`home_banner`, `tools_popover`, `sidebar_footer`) would benefit from a `surface` too. Minor — left for future cleanup.

8. **`connection_add_clicked` shape varies by caller** — some callers include `source`, some don't; prop keys vary (`app_name` vs `registry_item_id` vs `base_connection_id` depending on action). This is semantically correct (different actions carry different context), but analysts should be aware. Document in PostHog rather than unify.

9. **`credits_empty_state_shown`** — fires on every `open=true` transition. If the banner mounts and unmounts repeatedly in one session this over-counts. Ranked T2 — accept the skew, use unique-users-with-event rather than raw counts.

10. **`credits_topped_up_detected`** — heuristic based on balance delta. Admin-granted credits trigger it too. Name includes `_detected` to signal inference; documented.

11. **`automation_run`** — covers manual runs only; cron/event-triggered runs are *not tracked yet*. Handoff explicitly deferred this. Note in any dashboard using this event.

12. **No-op re-click dedupe** — `connections_page_tab_changed`, `tasks_panel_*_filter_changed`, `connections_dialog_tab_changed`, `tasks_panel_task_clicked` all check `if (next !== current)` before firing. Consistent and correct. ✅

13. **`main_panel_tab_clicked` has `was_active`** — intentionally does NOT dedupe, because clicking the active tab closes the panel and that's a meaningful signal. Documented. ✅

14. **`PreferenceRow` stopPropagation** — re-read the component: the control's wrapper has `onClick={(e) => e.stopPropagation()}`. So clicking the switch does NOT also trigger the row's onClick. No double-fire on sounds/vibecode. Catalog now reflects this correctly.

### Still-open gaps (NOT fixed in this pass — follow-up work)

- **Server-side `agent_created`** — no event fires when a virtual MCP is created. Today we infer it from 5+ frontend events (home tile / recruit modals / deco import / agents-list create / sidebar popover / API). A single server-side event at `tools/virtual/create.ts` would give us a clean "new agent" signal regardless of UI path. **Recommend adding.**

- **Server-side `agent_updated` / `automation_updated`** — currently only frontend. If the user edits via API or another tool, we miss it. Low priority — most edits happen in the UI.

- **Cron/event-triggered `automation_run`** — still deferred per handoff.

- **`ai_provider_key_created` frontend intent vs server event** — we have server `ai_provider_key_created` and frontend `ai_provider_connect_clicked{method:"api-key"}`. These are distinct (intent vs success), which is correct, but analysts should not subtract them as a funnel — user may close the form, or the create may fail mid-way. We have no `ai_provider_key_create_failed`. Minor gap.

- **`organization_logo_uploaded`** — we track `organization_settings_updated` with `fields`, so logo upload is captured inside that. But for narrower funnels (e.g. "set up your brand"), a dedicated event might help. Low priority.

- **Empty-state CTA tracking broadly** — we track some (`agents_list_empty`, `credits_empty_state_shown`, `connections_settings_empty_state`, `automations_empty_state_browse_agents_clicked`), but many empty states still just render without an event. Handoff called this out; not comprehensively addressed.

- **Onboarding step events** — still not instrumented. Requires defining what "onboarding" means post-signup.
