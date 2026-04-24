# Dashboard Ideas — PostHog Studio

**Goal**: Turn `events-catalog.md` into a set of dashboards a product/growth team would use weekly. Each dashboard section lists: purpose, tiles (insights), events backing them, key filters & breakdowns, and the specific question it answers.

**Pre-work before building:**
1. Rename existing dashboards built on old `decopilot_stream_*` / `thread_created` names to use the current taxonomy (`chat_message_*` / `chat_started`).
2. Wire `setOrganizationGroup(id)` from a frontend provider that knows the current org slug, so frontend events gain the `organization` group automatically (right now only server events do).
3. Apply `$pageview` filter "exclude /login, /oauth-callback*, /reset-password" everywhere so auth redirects don't skew funnels.

---

## ⚠️ Interpretation guide — read before reading any tile

Every tile below is annotated with what it ACTUALLY measures. This reminder applies throughout:

- **"top-up click" ≠ payment.** `credits_topup_clicked` is a button press. We have no payment webhook today. The closest proxy is `credits_topped_up_detected`, which is a *heuristic* that ALSO fires on admin grants and internal adjustments. A previous server-side `credits_topup_requested` event was removed in `f8150dc8f` — it only proved "our server returned a Stripe URL", never that the user paid.
- **"OAuth succeeded" ≠ provider actually works.** It means our proxy got a token. The first successful `tool_called{is_error=false}` for that connection is the real validation.
- **"Install on Cursor/Claude" click ≠ installed.** `agent_connect_action{action=install_cursor}` opens the deeplink; the OS may not handle it. `install_claude_code` copies a shell command to the clipboard; the user still has to paste it.
- **"Message completed" ≠ user got what they wanted.** It means the stream ended without an error. Quality of the agent's answer is not captured here.
- **"Created" events are DB rows, not usage.** `organization_created`, `brand_created`, `agent_recruit_confirmed`, `sso_configured` all say "this thing exists now", not "this thing is being used".
- **Exposure events aren't engagement.** `credits_exhausted_shown`, `credits_empty_state_shown`, `mcp_app_opened`, `$pageview` — these all say the user saw something rendered; they do not imply the user interacted with it.
- **Anything containing `_clicked`, `_opened`, `_started`, `_requested` is intent.** The companion `_completed` / `_succeeded` / server-side row creation is the outcome. Always pair them when measuring funnels.

Whenever a tile caption says something like "Orgs that paid", check the underlying event first.

---

## 1. Product Pulse (rebuild)

**Purpose**: The "is the product alive" board. Glanceable weekly.

| Tile | What it measures (and what it does NOT) | Event | Breakdown |
|---|---|---|---|
| Weekly Active Orgs | Orgs that dispatched at least one chat message from the frontend. Does NOT include orgs that just viewed the UI. | `chat_message_sent` unique `groups.organization` | none |
| Weekly Active Users | Users who submitted at least one message. Does NOT count logged-in users who only browsed. | `chat_message_sent` unique distinct-id | none |
| Messages dispatched / week | Frontend submit count. Server-side reception is slightly lower (network failures). | `chat_message_sent` sum | none |
| Messages that completed cleanly / week | Server stream finished without an error signal. Does NOT measure answer quality. | `chat_message_completed` sum | by `finish_reason` |
| Tokens used / week | Sum of `total_tokens` on completed messages only. | `chat_message_completed.total_tokens` sum | by `model_provider` |
| Threads started | New threads created (tool + auto-on-first-message). | `chat_started` | by `created_via` |
| Tool calls (successful) | Tool attempts that did not error. | `tool_called{is_error=false}` count distinct `tool_name` | none |
| Tool calls (errored) | Tool attempts that errored (for sanity). | `tool_called{is_error=true}` | top 10 by `tool_name` |
| New orgs | Org rows created this week. Does NOT mean they used the product. | `organization_created` | by `created_via` |
| Session replay sample | Qualitative glance — 10 recent replays. | — | — |
| Front-page exceptions | Unhandled JS errors. Noisy from extensions; use as a trend line, not absolute. | `$exception` | top 10 by `$exception_type` |

---

## 2. Activation Funnel (rebuild)

**Purpose**: Time-to-first-value. First 7-day journey.

> Note: `chat_message_completed` means "stream ended without error", NOT "user was satisfied with the answer". We use it as a mechanical activation proxy; true satisfaction would need explicit feedback events (don't exist).

| Tile | What it measures | Events |
|---|---|---|
| Signup → First thread started | Activation step 1: user created their first thread. | Funnel: `user_signed_up` → `chat_started` within 7d |
| Signup → First clean message completion | Activation step 2 (mechanical): a stream finished without error. | Funnel: `user_signed_up` → `chat_message_completed` within 7d |
| First message → First successful tool call | Activation step 3: the agent actually *did* something. | Funnel: `chat_message_sent` → `tool_called{is_error=false}` within 24h |
| First message → First connection created | User brought in external tools. Server event, authoritative. | Funnel: `chat_message_sent` → `connection_created` within 7d |
| First message → First BYOK success | BYOK = bring-your-own-key. `ai_provider_key_created` (S) is authoritative across all methods. | Funnel: `chat_message_sent` → `ai_provider_key_created` within 7d |
| First message → First own agent | Any agent creation beyond templates. Today we have 5 frontend-event proxies for this; once `agent_created` (S) ships, use that instead. | Funnel: `chat_message_sent` → (`agent_recruit_confirmed` OR `deco_site_import_succeeded` OR ...) within 7d |
| First message → First automation created | Deeper commitment — the user set up an automation. | Funnel: `chat_message_sent` → `automation_created` within 7d |

Drop-off analysis per step gives the activation chokepoint. **Do NOT confuse `user_signed_up` with "active user"** — it's just row creation.

---

## 3. Chat Health (new)

**Purpose**: Quality of the core chat experience — mechanical, not qualitative.

> "Completed" here means the stream terminated cleanly. It does NOT mean the user got a useful answer. If we ever add thumbs-up/down events we can supplement this; today we only have mechanical signals.

| Tile | What it measures (and what it does NOT) | Events |
|---|---|---|
| Clean-completion rate | Server-side clean stream terminations over server-started runs. Does NOT measure answer quality. Use `chat_message_started` as the denominator (authoritative server-received) not `chat_message_sent` (frontend intent). | `chat_message_completed` / `chat_message_started` |
| Failure rate by category | Distribution of errors — insufficient_funds, rate_limit, timeout, auth, model_error, tool_error, unknown. | `chat_message_failed` breakdown by `error_category` |
| Server-side abort rate | Server detected that the run was aborted (user stop, tab close, pod restart). | `chat_message_aborted` / `chat_message_started` |
| Frontend user-stop rate | User clicked stop — may or may not end up as server abort (race). Intent only. | `chat_message_stopped` / `chat_message_sent` |
| Duration P50 / P95 | Time from server `_started` to `_completed`, milliseconds. Completions only (failed / aborted excluded). | `chat_message_completed.duration_ms` |
| Tokens per message P50 / P95 | Completion-only token counts. | `chat_message_completed.total_tokens` |
| Resume rate | Share of completions that were picked up mid-stream by a reconnecting client. Proxy for network instability. | `chat_message_completed{is_resume=true}` / `chat_message_completed` |
| Mode distribution (sent) | Frontend mode mix — what users *tried* to do. | `chat_message_sent` breakdown by `mode` |
| Mode distribution (completed) | Server-side mode mix — what actually ran. | `chat_message_completed` breakdown by `mode` |
| Top 10 failing tools | Tools that returned errors most often. `tool_called.is_error=true` is authoritative. | `tool_called{is_error=true}` group-by `tool_name` |
| Tool latency distribution | Per-tool-call duration; split by MCP vs built-in. | `tool_called.latency_ms` by `tool_source` |
| Insufficient-funds incidents | Authoritative credits-ran-out signal during a message. | `chat_message_failed{error_category=insufficient_funds}` |

---

## 4. Credits funnel (NOT a revenue dashboard)

**Purpose**: See the CTA-exposure → click-intent → balance-change heuristic loop. We do NOT have authoritative payment data — name this dashboard "Credits funnel" in PostHog, not "Revenue", so nobody misreads it.

> **Read this before using any tile**: we measure clicks and heuristics, not payments. To actually count paid top-ups you need a Stripe webhook (doesn't exist yet) or a Deco AI Gateway webhook (also doesn't exist yet). Until one of those ships, any number called "revenue" on this board is a proxy at best.

| Tile | What it measures — and what it does NOT | Events |
|---|---|---|
| Orgs exposed to empty-state banner | Count distinct orgs that rendered the banner at least once. ⚠️ Banner can render multiple times per session; use *unique orgs* not raw count. | `credits_empty_state_shown` |
| Orgs exposed to exhausted banner | Same as above, for the exhausted modal. | `credits_exhausted_shown` |
| Banner-click-through (exhausted) | `credits_topup_clicked{source=exhausted_banner}` unique orgs / `credits_exhausted_shown` unique orgs. **Clicks a tier**, not pays. | ratio |
| Banner-click-through (empty state) | Same for empty state. | ratio |
| Tier choice distribution | Which top-up tier did users CLICK (not pay). | `credits_topup_clicked` breakdown by `tier_label` |
| Banner vs empty-state click source | Which surface drives top-up intent? | `credits_topup_clicked` breakdown by `source` |
| ~~Stripe URLs generated~~ | ~~Not payments.~~ **Tile removed.** `credits_topup_requested` server event was dropped in `f8150dc8f` (near-duplicate of `credits_topup_clicked`). If a real payment webhook ever ships, build this tile from that event instead. | — |
| Balance-increase detections (HEURISTIC) | ⚠️ Includes admin-granted credits, internal adjustments, refunds. Use as a *rough* signal, never for revenue reporting. Name the tile "Balance increased — heuristic" in PostHog. | `credits_topped_up_detected` |
| Insufficient-funds incidents | Authoritative "ran out of credits mid-message" signal. | `chat_message_failed{error_category=insufficient_funds}` |
| Intent funnel | **Click-intent funnel**, not payment funnel. Each step is a button press or heuristic signal. | Funnel: `chat_message_failed{error_category=insufficient_funds}` → `credits_topup_clicked` → `credits_topped_up_detected` → next `chat_message_completed` |
| Banner exposure → any click | Conversion from seeing a credits banner to clicking any CTA (including dismiss). | Funnel: `credits_empty_state_shown` → (`credits_topup_clicked` OR `credits_empty_state_dismissed`) |
| Dismissal rate on empty state | How often users click X vs click a tier. Tells us if the banner is annoying. | `credits_empty_state_dismissed` / `credits_empty_state_shown` |

**Explicit do-NOT list for this dashboard**:
- Do NOT label any tile as "revenue", "paid", "converted to paid", or "MRR". We don't measure payments.
- Do NOT use `credits_topped_up_detected` count as a top-up count; it's a polling heuristic.
- (`credits_topup_requested` was removed in `f8150dc8f` — don't expect to see it anywhere.)

---

## 5. Agent Adoption (new)

**Purpose**: Which agents and templates get traction.

> ⚠️ **There is no server-side `agent_created` today.** Frontend-event union is our workaround — it is imperfect (API-created agents are invisible). A future `agent_created` server event would make this dashboard trivial.

| Tile | What it measures (and what it does NOT) | Events |
|---|---|---|
| Agent creations / week (proxy) | Union of successful creation frontend events. Does NOT include API-direct creations. | union of `agent_recruit_confirmed`, `deco_site_import_succeeded`, `home_create_agent_clicked`, `agent_create_clicked{method=scratch}`, sidebar `agent_create_new_clicked`. Replace with server `agent_created` once instrumented. |
| Template confirm distribution | Which templates users finished creating (not just clicked). | `agent_recruit_confirmed` breakdown by `template_id` |
| Template tile-click → confirm funnel | Per-template abandonment: clicked but never confirmed. | Funnel: `home_agent_tile_clicked{action=open_modal}` → `agent_recruit_confirmed` per `template_id` |
| Deco-import completion rate | Full 3-step funnel including abandonment at each step. | Funnel: `agents_list_template_clicked{template_id=site-editor}` → `deco_site_import_started` → `_succeeded` |
| Deco-import failure rate | Of started imports, how many failed. | `deco_site_import_failed` / `_started` |
| Agent deletions / week | How often agents get deleted, broken down by surface. Signals friction (if many are deleted right after creation). | `agent_deleted` breakdown by `source` |
| Agents with ≥1 connection (estimate) | Agents that ever had their connection list touched. NOT a point-in-time snapshot. | distinct `agent_id` on `agent_updated{fields includes connections}` or `agent_connection_settings_opened` |
| Instructions length distribution | Char-count histogram across edit-sessions — one data point per session, not per save. Clean after the `f8150dc8f` session-based refactor. | `agent_updated.instructions_length` (non-null) |
| Edit-session depth | How many auto-saves per edit-session (proxy for "how long was this edit"). | `agent_updated.save_count` histogram |
| Edit-session duration | Wall-clock minutes per session. | `agent_updated.edit_duration_ms` histogram |
| "Improve" feature use | How often users invoke the prompt-improver. Does NOT measure whether the improved prompt got kept. | `agent_instructions_improve_clicked` |
| Template-scaffold insert rate | Fraction of instruction edits that start by inserting the scaffold. | `agent_instructions_template_inserted` / `agent_updated{fields includes instructions}` |
| Connect modal opens | Users opening the share-to-IDE modal. Does NOT mean they installed. | `agent_connect_modal_opened` |
| External-use intent funnel | ⚠️ Intent-only. Clicking install_cursor opens a deeplink; we cannot verify install. Clicking install_claude_code copies a shell command; we cannot verify it was pasted/run. | Funnel: `agent_connect_modal_opened` → `agent_connect_action{action in copy_url,install_cursor,install_claude_code}` |
| Typegen engagement | Users who generated a typegen API key. Does NOT mean they ran the typegen command. | `agent_typegen_key_generated` count, plus `agent_connect_action{action in typegen_copy_command, typegen_copy_env}` for later-step intent. |

---

## 6. Connection Integration (new)

**Purpose**: How users connect tools and where they give up.

> "OAuth succeeded" here means our proxy got a token back. It does NOT prove the upstream API actually works — scope mismatches, revoked tokens, and API outages show up later via `tool_called{is_error=true}` on that connection.

| Tile | What it measures (and what it does NOT) | Events |
|---|---|---|
| Connection creation volume | Authoritative count of `COLLECTION_CONNECTIONS_CREATE` tool successes. Fires for every creation path. | `connection_created` |
| Add-intent by source | Intent-level clicks grouped by where the user came from. Sums do NOT equal `connection_created` count (some clicks fail / are abandoned). | `connection_add_clicked` breakdown by `action` × `source` (when present) |
| Community-warning confirm count | Users who explicitly accepted the risk warning on a community-registry item. | `connections_community_warning_confirmed` |
| (GAP) Community-warning dismissal rate | Can't compute yet — we don't track the warning being SHOWN. Add `connections_community_warning_shown` to enable this tile. | — |
| OAuth completion rate | Succeeded ÷ (Succeeded + Failed). Breaks down by flow to isolate which connection path is worst. Does NOT tell us if the provider still works afterwards. | `connection_oauth_succeeded` / (`_succeeded` + `_failed`) by `flow` |
| OAuth failure reasons | Top errors — helps find broken provider configs. | `connection_oauth_failed` group-by `error` top 10 |
| (GAP) Top connected apps | `connection_created` does NOT have `app_name` in props today. Proxy: `connection_add_clicked{action=connect_new}` by `app_name` — but that's intent, not success. | gap |
| Connections-dialog opens by source | Discovery path mix — which surfaces drive people to the dialog. | `connections_dialog_opened` breakdown by `source` |
| Dialog → create funnel | Intent → outcome, crosses frontend + server. | Funnel: `connections_dialog_opened` → `connection_add_clicked` → `connection_created` |
| Bulk-ops adoption | Which bulk actions are used and at what size. | `connections_bulk_delete` + `_status_toggled` + `_add_to_agent` |
| Re-auth intent | Users who clicked "Authorize" on a broken-auth connection. Pair with `_oauth_succeeded{flow=agent_reauthenticate}` for fix rate. | `connection_authorize_clicked` |
| Custom-connection share | Custom-form creates vs all creates. | `connection_custom_created` / `connection_created` (⚠️ both events fire per custom create, so denominator is inclusive). |

---

## 7. Automations (new)

> ⚠️ **Half-blind dashboard.** Cron-triggered and event-triggered automation runs do NOT fire `automation_run` today. The "reliability" tiles below only reflect manual test runs; do NOT extrapolate to scheduled workloads.

| Tile | What it measures (and what it does NOT) | Events |
|---|---|---|
| Automations created / week | DB row creations. At creation time there are usually zero triggers yet. | `automation_created` |
| Triggers-added-ever / week | Users actually configured starters (the thing that makes an automation useful). Pair with `_created` to see "created but never configured". | `automation_trigger_added` |
| Trigger mix | Which starter type gets picked. | `automation_trigger_added` breakdown by `trigger_type` |
| Top event-trigger connections | Which MCPs are most used as event sources. | `automation_trigger_added{trigger_type=event}` group-by `connection_id` |
| Manual test rate | Did the author hit "Test" before leaving? | `automation_test_clicked` distinct `automation_id` / `automation_created` distinct `automation_id` |
| Manual-run status mix | For the runs we DO see (manual only). `skipped`/`error`/`started`. | `automation_run` breakdown by `status` |
| Improve-flow use | How often users invoke prompt improver on automations. | `automation_improve_clicked` |
| Browse-agents from empty state | Empty-state CTA conversion — first-time automation org behaviour. | `automations_empty_state_browse_agents_clicked` |
| Abandoned automations (estimate) | Created but never triggered and never tested — user probably gave up. | `automation_created` minus `automation_trigger_added` minus `automation_test_clicked` (per `automation_id`) |
| Edit-session depth (automations) | Saves per edit-session. Clean signal after the session-based refactor. | `automation_updated.save_count` histogram |
| Edit-session duration (automations) | Wall-clock time per session. | `automation_updated.edit_duration_ms` histogram |

---

## 8. Navigation & Surface Usage (new)

**Purpose**: Which parts of the product actually get visited — pure click-intent board. Does NOT measure what users *did* on each surface; for that, see feature-specific dashboards.

| Tile | What it measures | Events |
|---|---|---|
| ~~Agent sub-tab click distribution~~ | **Retired** — agent detail no longer has sub-tabs after the April 2026 consolidation. | — |
| Main-panel tab clicks | Which top-tabs in the agent shell get clicks. Includes re-click-to-close events (see below). | `main_panel_tab_clicked` group-by `tab_id` |
| Close-on-re-click rate | Share of main-panel-tab clicks that closed the panel vs opened a new tab. | `main_panel_tab_clicked{was_active=true}` / total |
| Agent toolbar toggles | Panel-toggle usage split by button and direction. | `agent_toolbar_toggled` group-by `button` × `next_state` |
| Settings sidebar click distribution | Click intent, NOT page arrival — use `$pageview{path~=/settings/*}` for arrival. | `settings_nav_clicked` group-by `section_key` |
| Tasks-panel row-click volume | How often users navigate via the tasks panel. | `tasks_panel_task_clicked` count |
| Task filter current preference | Last-written value per user. | `tasks_panel_filter_changed.to_value` via cohort |
| Home-surface click-through | Of users who landed on home, how many engaged with any CTA. | Funnel: `$pageview{path=/$org}` → any of (`home_agent_tile_clicked`, `home_create_agent_clicked`, `home_see_all_agents_clicked`, `connections_banner_clicked`, `chat_message_sent`) within 5 min |
| Connect-tools banner → actual connection | Intent → outcome. | Funnel: `connections_banner_clicked` → `connections_dialog_opened{source=home_banner}` → `connection_created` |

---

## 9. Feature Depth (new)

**Purpose**: Which advanced features get adopted beyond the basics.

| Tile | What it measures | Events |
|---|---|---|
| Layout customization usage | Orgs that touched any layout-tab control. Presence signal; does NOT weight by amount of editing. | Distinct orgs on any `agent_layout_*` |
| Pinned-view edit activity | Edits per agent — which agents are being polished. | `agent_layout_pin_toggled`, `_label_updated`, `_icon_changed` count per `agent_id` |
| Default main-view preference | What users choose as landing-view per agent. | `agent_layout_main_view_changed.to_value` breakdown |
| Chat mode mix | Which chat modes are actually used for outgoing messages. | `chat_mode_changed` breakdown by `to_mode` |
| Prompt picker usage | `/` vs `@` frequency. | `chat_picker_opened` breakdown by `picker` |
| Picker abandonment | Distribution of dismissed-picker durations. Long durations = confusion. | `chat_picker_closed{outcome=dismissed}.duration_ms` histogram |
| Voice permission grant rate | Of all mic clicks that *attempted* to record, how many actually started. | `chat_voice_started{outcome=started}` / `chat_voice_started` |
| Voice confirm rate | Of started recordings, how many got confirmed (vs cancelled). | `chat_voice_confirmed` / `chat_voice_started{outcome=started}` |
| Copy-to-clipboard rate | Fraction of completions where the user hit copy. Clipboard write only — does NOT mean they pasted. | `chat_message_copied` distinct `message_id` / `chat_message_completed` distinct `thread_id+step` |
| (GAP) Tools popover opens | We don't track popover opens separately. Add `chat_tools_popover_opened` to measure discovery vs engagement inside. | — |
| Image-model distribution | Which image models get selected when the submenu is used. | `chat_image_model_selected` group-by `model_id` |
| Search-model distribution | Same for deep research. | `chat_search_model_selected` group-by `model_id` |

---

## 10. Team & Governance (new)

| Tile | What it measures (and what it does NOT) | Events |
|---|---|---|
| Invites sent per week | Batch-invites aggregate `count`. Does NOT mean any invite was accepted. | `member_invited` sum `count` |
| Acceptance rate | Authoritative member additions. Includes invites AND domain auto-joins. | `organization_member_added` / `member_invited` sum `count` (rough — not every add is from an invite) |
| Role distribution changes | Volume of role updates; gives a churn signal. | `organization_member_role_updated` |
| Custom roles created | RBAC adoption signal. | `role_created` count |
| SSO configured | Orgs that finished the SSO form at least once. Does NOT mean a successful SSO login ever happened. | `sso_configured` distinct orgs |
| SSO enforcement on | Orgs in forced-SSO mode right now. | last-value `sso_enforcement_toggled.enforced` per org |
| Domain claim + auto-join | Orgs set up for team-growth. | `organization_domain_claimed` + `organization_auto_join_toggled{enabled=true}` distinct orgs |
| Member removals per week | Net churn within an org. | `member_removed` + `organization_member_removed` |

---

## 11. BYOK / AI Providers (new)

> "OAuth succeeded" means our proxy received a token. It does NOT guarantee the key works for model calls — that only shows up on the first `chat_message_completed` with that credential.

| Tile | What it measures | Events |
|---|---|---|
| Connect-click distribution | Intent mix across providers and methods. | `ai_provider_connect_clicked` by `provider_id` × `method` |
| OAuth success rate | Token exchange completion, per provider. | `_oauth_succeeded` / (`_succeeded` + `_failed`) by `provider_id` |
| Timeout-specific failure | Users who started OAuth but never completed within 2 minutes. | `_oauth_failed{error="timeout"}` / `_oauth_failed` |
| CLI activation success | CLI-based auth (Claude Code / Codex). Fails commonly when CLI not installed locally. | `_cli_activated` / (`_cli_activated` + `_cli_activate_failed`) |
| Provision success | Auto-provisioned managed keys (e.g. Deco Gateway). | `_provision_succeeded` / (`_succeeded` + `_failed`) |
| Key row creations vs deletions | Net BYOK inventory. | `ai_provider_key_created` vs `ai_provider_key_deleted` |
| First-successful-BYOK time | Activation metric — how long from org creation to first key. | Cohort: `organization_created` → first `ai_provider_key_created` |
| Real key-works validation | Successful message completions using a non-shared credential. This is the *real* "BYOK works" signal — not oauth_succeeded. | `chat_message_completed` distinct `credential_id` |

---

## 12. Brand Context (new)

| Tile | What it measures (and what it does NOT) | Events |
|---|---|---|
| Orgs that created a brand | At least one brand row exists (even if placeholder). Does NOT mean it's filled in. | `brand_created` distinct orgs |
| Auto-extract adoption | Fraction of brand creations that attempted auto-fill from a domain. | `brand_extract_started` / `brand_created` |
| Auto-extract success rate | How often auto-fill worked. Does NOT measure accuracy. | `brand_extract_succeeded` / `brand_extract_started` |
| Brands per org distribution | Multi-brand orgs. | `brand_created` count per org |
| Brands actually configured | Brand rows that received at least one post-create update (filtering out placeholder-only rows). | distinct `brand_id` on `brand_updated` |
| Default brand set | Orgs that picked a default brand. | `brand_set_as_default` distinct orgs |
| Archive vs restore balance | Net archive activity. | `brand_archived` minus `brand_restored` |

---

## 13. Monitoring Usage (meta)

**Purpose**: How often do orgs look at their own monitoring? This is the admins' observation surface, not the product itself.

| Tile | What it measures | Events |
|---|---|---|
| Monitor-page sessions | Distinct sessions where users landed on or interacted with monitoring. | Unique sessions with `monitoring_tab_changed` OR `$pageview{path=/settings/monitor}` |
| Tab preference | Which tab gets explored most. | `monitoring_tab_changed.to_tab` distribution |
| Live-mode usage | How often users turn on live streaming. | `monitoring_live_toggled{enabled=true}` / total `_toggled` |
| Time-range distribution | Common time windows. | `monitoring_time_range_changed.to` top 5 |

---

## 14. Retention (new)

| Tile | What it measures | Events |
|---|---|---|
| D1 / D7 / D30 retention | PostHog retention insight using `chat_message_sent` as both target and returning event — because *sending a message* is the most meaningful repeat action. Visits without sending don't count. | `chat_message_sent` |
| Cohort heatmap by signup path | Does the default-org path retain differently from the domain-setup path? | Retention cohorted on `organization_created.created_via` |
| Stickiness (DAU / MAU) | Ratio of daily to monthly unique users who sent messages. | `chat_message_sent` unique users / 7d / 30d |

---

## Correlations worth investigating

These are specific questions to run one-off, not dashboards. Framed to avoid cause-and-effect overreach — correlation, not causation.

1. **Template vs from-scratch retention.** Cohort orgs by their first agent-creation path (template vs scratch) and compare D7/D30 message-sending retention. Does NOT prove templates *cause* retention — templates may be chosen by more engaged users anyway.

2. **BYOK orgs vs shared-gateway orgs — weekly message volume.** `ai_provider_key_created` users vs not. Caveat: BYOK orgs may be heavier users who chose BYOK *because* they're heavy users.

3. **Automation-creating orgs → retention.** Same caveat as above.

4. **Layout-customizing users → retention.** Same caveat.

5. **Prompt picker → mechanical efficiency.** Does using a slash prompt correlate with lower `chat_message_completed.duration_ms` or token count? This measures efficiency, NOT answer quality.

6. **Voice → completion rate.** Compare `chat_message_completed` rate for sessions with `chat_voice_confirmed` before send vs pure-typed.

7. **Sidebar pin usage → engagement.** Users who pin agents — do they send more messages? Caveat: power users pin more.

8. **Connection breadth → activation speed.** Time from `organization_created` to 10th `chat_message_sent`, plotted against count of `connection_created` in first week.

9. **Improve-click → fewer failures after.** For agents where `agent_instructions_improve_clicked` fires AND new instructions get saved, compare `chat_message_failed` rate on that agent's messages in the 7 days before vs after. Caveat: new instructions may be worse.

10. **Copy-message frequency → retention.** Orgs that copy assistant messages frequently — writer-use-case signal. Cross with retention.

11. **Banner-type click-through → heuristic-detected top-up.** `credits_topup_clicked{source=exhausted_banner}` → `credits_topped_up_detected` rate vs `{source=empty_state}`. ⚠️ Neither side is a payment event; both are heuristic approximations.

12. **Mode → completion outcome.** `chat_message_sent.mode` cohort × `chat_message_completed` rate. Answers "which modes complete more cleanly" — NOT "which modes give better answers".

13. **Community-MCP reliability.** For connections created after `connections_community_warning_confirmed`, is the subsequent 7-day `tool_called{is_error=true}` rate higher than for verified-catalog or custom connections? This measures *actual* reliability, not intent.

14. **Domain-claim → team size.** Orgs that claimed domain in week 1 vs those that didn't — median members at day 30.

15. **SSO → seat expansion.** Orgs with `sso_configured` — do they add members at a higher rate after enabling? Compare pre-SSO vs post-SSO window.

16. **Automation "created but never triggered".** `automation_created` distinct IDs minus IDs that ever fired `automation_trigger_added`. This is the abandoned-automation pool; check how often these accounts also churn.

17. **OAuth succeeded but never used.** `connection_oauth_succeeded` connections that never appeared in a successful `tool_called{is_error=false}`. Could be broken provider configs, scope mismatches, or connections created for exploration.

---

## Follow-up instrumentation to unlock dashboards above

Several dashboards reference events that *don't exist yet*. To fully realize the ideas above, add:

1. **`agent_created`** (server) — closes the multi-path gap. Unifies "an agent now exists" regardless of UI.
2. **`automation_run`** for cron + event triggers — closes the existing deferred gap.
3. **`connections_community_warning_shown`** — we track the confirm but not the exposure; needed for dismissal-rate math.
4. **`chat_tools_popover_opened`** — tracking popover open separately from subsequent actions.
5. **`connection_created` should include `app_name` prop** server-side — currently missing, limits "top connected apps" breakdowns.
6. **Empty-state CTA events** for remaining surfaces (agents list empty, connections list empty, members empty if one exists).
7. **Server-side `agent_updated`** / `automation_updated` for API-only edits.
8. **`ai_provider_key_create_failed`** frontend — captures form-submit → mutation failure.
9. **Onboarding step events** — once onboarding is defined.
10. **`page_left_quickly`** custom event (or derive via `$pageleave` with `$session_duration < X`) — bounce rate on key pages.

---

## Suggested order to ship dashboards

If you only build 5, do these first:
1. **Product Pulse** (rebuild existing) — mechanical health, no interpretation required.
2. **Activation Funnel** (rebuild existing) — where orgs drop off in first 7d.
3. **Chat Health** — closes the loop on "is the product actually working" mechanically.
4. **Credits funnel** (not "Revenue") — actionable for top-up UX, not for MRR. Call it **"Credits funnel"** in PostHog, NOT "Revenue".
5. **Agent Adoption** — most actionable for product direction.

Everything else is depth; build as teams request it.

## Do-NOT labels (guardrails for dashboard builders)

When creating insights in PostHog, DO NOT use these titles — they misrepresent what the data says:
- ~~"Revenue"~~ → use "Credits funnel" or "Top-up intent & heuristic detection"
- ~~"Paid conversions"~~ → use "Top-up clicks" or "Stripe URLs generated"
- ~~"Agent satisfaction"~~ → we don't measure answer quality; use "Clean-completion rate"
- ~~"IDE installs"~~ → use "Install-deeplink clicks" / "Install-command copied"
- ~~"Connected apps that work"~~ → use "OAuth token exchange succeeded" AND cross-reference with successful `tool_called` for real validation.
- ~~"Automations that ran"~~ → today we only see *manual* runs; use "Manual automation runs" until cron/event instrumentation ships.
