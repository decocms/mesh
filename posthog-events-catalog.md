# PostHog Events — Complete Catalog

**Branch**: `rafavalls/posthog-setup`
**Generated**: 2026-04-24
**Scope**: every tracked event in the repo (this branch + prior commits)

Legend:
- **Surface**: S = server-side (node), F = frontend (browser)
- **Trigger**: exact code location / user action that fires it
- **Props**: properties included on the event (beyond `groups.organization` auto-added server-side and the standard person/session context)

## ⚠️ How to read this catalog (avoiding misinterpretation)

Event names describe *what the code does at the moment of emit*, not the user's downstream intent or the business outcome. A few recurring traps:

- **"clicked" events are intent signals, not outcomes.** `credits_topup_clicked` means a button was clicked, not that the user paid. `agent_connect_action` with `install_cursor` means the install deeplink opened, not that the IDE actually installed it. `chat_message_copied` means the clipboard was written, not that the user pasted the content anywhere.
- **"succeeded" means local/mechanical success, not user success.** `chat_message_completed` means the stream finished without an error signal — it does NOT mean the agent solved the user's problem. `connection_oauth_succeeded` means the OAuth token exchange with *our* server completed, not that the downstream API works.
- **"created" / "configured" mean a DB row exists.** `organization_created` is the row, not an active user. `sso_configured` is the form-save, not a tested login. `brand_created` can be a "New Brand" placeholder row with default values.
- **No payment event exists in this taxonomy.** The server-side `credits_topup_requested` event was removed in commit `f8150dc8f` — it only meant "our server generated a Stripe URL", not that the user paid. Today the authoritative signals are `credits_topup_clicked` (intent) and `credits_topped_up_detected` (balance-delta heuristic).
- **Heuristic / inference events include `_detected` in the name.** `credits_topped_up_detected` is inferred from a balance delta between polls and will also trigger on admin-granted credits. Never treat as an authoritative payment event.
- **Exposure events ≠ interaction events.** `credits_empty_state_shown`, `credits_exhausted_shown`, `mcp_app_opened` measure *surface exposure*, not deliberate engagement.
- **Frontend vs server stop/abort signals are distinct.** `chat_message_stopped` is a frontend click intent. `chat_message_aborted` is the server-side stream termination. They usually correlate but are not the same lifecycle step.
- **`$autocapture` and `$pageview` should never drive decisions.** Use them for discovery only; prefer structured events on every dashboard tile.

Every caveat is repeated inline in the relevant row below so you don't have to remember them all.

---

## 0. Auto-captured (PostHog SDK built-ins)

| Event | Surface | Trigger | Notes |
|---|---|---|---|
| `$pageview` | F | SPA route change (history API) | Route change; says nothing about what the user did on the page. Use for page-level navigation counts only. |
| `$pageleave` | F | `beforeunload` / tab close | Tab closed OR backgrounded on some browsers. Not a "bounce" indicator by itself. |
| `$autocapture` | F | Any click / form submit | Very noisy. Captures clicks on arbitrary elements (including non-interactive divs). Use for discovery, never for a dashboard metric. |
| `$web_vitals` | F | Browser Core Web Vitals (LCP / CLS / FCP / INP) | Page performance; unrelated to product engagement. |
| `$identify` | F | User logs in via Better Auth session | Associates a person with a distinct-id. Does not imply an action. |
| `$set` | F | `identify` / `setPersonProperties` | Property write. Not an action event. |
| `$exception` | F | Unhandled JS error or promise rejection | Client-side error. Not a product-success signal; use with care (noisy from extensions). |
| `$groupidentify` (organization) | S | Organization is created | Fires for *both* the domain-setup path and the default-org path. The org row now exists; nothing else is implied. |

---

## 1. Auth / Identity / Organization

| Event | Surface | Trigger (file:line) | Props |
|---|---|---|---|
| `user_signed_up` | S | `auth/index.ts:442` Better Auth `databaseHooks.user.create.after` hook | `email`, `email_domain`, `email_verified`, `has_name` — **means**: user row created. Does NOT mean the email was verified (see `email_verified` prop), nor that the user ever returned. |
| `organization_created` | S | `auth/index.ts:524` default-org path AND `api/routes/auth.ts:563` domain-setup path | `organization_id`, `organization_slug`, `email_domain`, `brand_extracted`, `created_via` (`signup_default` on default-org path only) — **means**: org row created. Does NOT mean it has additional members or any activity. |
| `organization_domain_joined` | S | `api/routes/auth.ts:341` domain-join handler | `organization_id`, `slug`, `email_domain` — fires when a matching-email user auto-joins an existing domain-claimed org. |
| `organization_settings_updated` | F | `organization-form.tsx:81` on mutation success | `organization_id`, `fields` (top-level dirty fields, e.g. `name`, `slug`, `logo`) — fires once per successful save. NOT fired on failed saves. |
| `organization_domain_claimed` | F | `domain-settings.tsx:68` claim domain mutation success | `organization_id`, `email_domain` — the domain is now claimed. Does NOT mean auto-join is on (separate toggle). |
| `organization_domain_cleared` | F | `domain-settings.tsx:91` remove domain mutation success | `organization_id`, `email_domain` |
| `organization_auto_join_toggled` | F | `domain-settings.tsx:108` auto-join switch click (mutation fires inside) | `organization_id`, `enabled` — preference flip. Takes effect for future signups only. |
| `organization_member_added` | S | `tools/organization/member-add.ts:74` `ORGANIZATION_MEMBER_ADD` tool | `organization_id`, `added_user_id`, `role` — a user row is now a member. This is distinct from `member_invited` (which is just sending an invite). |
| `organization_member_role_updated` | S | `tools/organization/member-update-role.ts:79` | `organization_id`, `member_id`, `target_user_id`, `new_role` |
| `organization_member_removed` | S | `tools/organization/member-remove.ts:62` | `organization_id`, `member_id_or_email` |

---

## 2. Members / Roles (Settings → Members)

| Event | Surface | Trigger (file:line) | Props |
|---|---|---|---|
| `member_invited` | F | `invite-member-dialog.tsx:137` mutation onSuccess — fires once per batch-invite submission | `count`, `role` — **means**: N invitations were sent. Does NOT mean any invite was accepted; use `organization_member_added` for acceptance. |
| `member_removed` | F | `routes/orgs/members.tsx:526` mutation success (user-initiated removal from Members table) | (no props — the server `organization_member_removed` has the ids) — the initiating user removed another member. |
| `member_role_updated` | F | `routes/orgs/members.tsx:555` role dropdown change success | `new_role` — changed an existing member's role. |
| `invitation_role_updated` | F | `routes/orgs/members.tsx:594` editing a pending invite's role (cancel + re-invite under the hood) | `new_role` — a pending invite had its role edited. The original invite was cancelled and a new one sent. |
| `role_created` | F | `manage-roles-dialog.tsx` save path when creating a new custom role | `role_slug`, `member_count` (members assigned at creation time) |
| `role_updated` | F | same, when editing an existing custom role's permissions/members | `role_slug`, `member_count` |
| `role_members_updated` | F | same, when *only* changing members on a built-in role (owner/admin/user — no permission edit) | `role_slug`, `member_count` |
| `role_deleted` | F | `manage-roles-dialog.tsx:1565` delete confirmation success | `role_id` — custom role only; built-ins can't be deleted. |

---

## 3. Navigation / Shell

| Event | Surface | Trigger (file:line) | Props |
|---|---|---|---|
| `nav_item_clicked` | F | `sidebar/navigation.tsx:59` any item from `useProjectSidebarItems()` | `nav_key`, `nav_label`, `is_active`, `is_mobile` — click intent; does NOT guarantee the target loaded. Pair with `$pageview` for arrival. |
| `settings_nav_clicked` | F | `settings-layout.tsx:219` settings sidebar link click | `section_key`, `section_label`, `group_label` — click intent. |
| `agent_toolbar_toggled` | F | `agent-shell-layout/toggle-buttons.tsx:48/64/83` top-right panel toggle buttons | `button` (`tasks`/`chat`/`main_view`), `next_state` (`open`/`closed`) — `next_state` is the state AFTER the toggle. |
| `main_panel_tab_clicked` | F | `main-panel-tabs/main-panel-tabs-bar.tsx:64` top tab bar in agent shell | `virtual_mcp_id`, `tab_id`, `tab_kind` (`system`/`agent`/`expanded`), `was_active` — when `was_active=true` the user clicked the currently-active tab (which closes the panel). Do NOT dedupe these when analyzing. |
| `sidebar_agent_pin_clicked` | F | `sidebar/agents-section.tsx:137` pinned agent icon in sidebar | `agent_id`, `agent_title` — navigation intent to that agent. |
| `agent_browser_opened` | F | `sidebar/agents-section.tsx:579/598` the `+` button opens the browser popover/drawer | `surface` (`mobile_drawer`/`desktop_popover`) — popover opened, not yet any action inside. |
| `agent_create_new_clicked` | F | `sidebar/agents-section.tsx:409` "Create new" inside the `+` popover | `source: "browse_popover"` — click intent from one specific surface; create may still fail. |
| `agent_import_clicked` | F | `sidebar/agents-section.tsx:426/448` Import Deco / GitHub buttons in `+` popover | `source` (`deco_cx`/`github`) — click intent; import flow may be abandoned. |
| `agent_template_clicked` | F | `sidebar/agents-section.tsx:486` template tile in `+` popover | `template_id`, `template_title` — template selected in the sidebar popover (distinct from home-surface `home_agent_tile_clicked` and from settings/agents `agents_list_template_clicked`). Does not mean the recruit modal was confirmed. |

---

## 4. Home surface

| Event | Surface | Trigger (file:line) | Props |
|---|---|---|---|
| `home_agent_tile_clicked` | F | `home/agents-list.tsx:65` click on any agent tile on the home surface | `template_id` (null for recent/existing), `agent_id`, `agent_title`, `tile_kind` (`template`/`existing`/`recent`), `action` (`new_chat`/`open_modal`/`navigate`) — the `action` tells you what the click *triggers*, NOT that the user completed that action (e.g. `open_modal` does not imply confirm). |
| `home_create_agent_clicked` | F | `home/agents-list.tsx:156` "Create agent" tile on home | (no props) — click intent to create; the actual creation fires from the `useCreateVirtualMCP` hook immediately after but is not surface-tagged. |
| `home_see_all_agents_clicked` | F | `home/agents-list.tsx:130` "See all" tile | (no props) — navigates to `/settings/agents`. |
| `connections_banner_clicked` | F | `chat/input.tsx:592` "Connect tools…" banner below the home chat input | `source: "home_chat_input"` — click intent only. Does NOT imply a connection was added (that's `connection_created` server-side). |

---

## 5. Chat lifecycle (thread / message / picker / voice)

### 5.1 Thread-level

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `chat_started` | S | `tools/thread/create.ts:73` (explicit tool call) AND `api/routes/decopilot/memory.ts:122/152` (auto-on-first-message in 2 branches) | `thread_id`, `created_via` (`tool`/`stream_auto`/`stream_client_id`/`automation`), `has_title`, `trigger_id`, `virtual_mcp_id` — **means**: a thread row was created. Does NOT mean a message was sent yet; `stream_auto` variants fire at first-message time though. |
| `chat_opened` | F | `chat/chat-context.tsx:621` ActiveTaskProvider render, deduped via module-level Set per `(page-session × thread_id)` | `thread_id` — ⚠️ brand-new threads fire BOTH `chat_started` (server) and `chat_opened` (frontend). Use `chat_started` for "new thread creation" and `chat_opened` minus new-thread opens for "revisited existing thread". |
| `chat_archived` | S | `tools/thread/update.ts:91` when `hidden` flips `false→true` via `COLLECTION_THREADS_UPDATE` | `organization_id`, `thread_id` — hover archive icon click is the usual source but the server event fires regardless of UI path. |
| `chat_unarchived` | S | same, `hidden` flips `true→false` | `organization_id`, `thread_id` |
| `chat_deleted` | S | `tools/thread/delete.ts:51` `COLLECTION_THREADS_DELETE` tool | `organization_id`, `thread_id` — permanent; distinct from archive. |

### 5.2 Message-level

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `chat_message_sent` | F | `chat/input.tsx:311` `handleSubmit` success branch (non-empty content, not streaming) | `thread_id`, `mode`, `model_id`, `model_provider`, `virtual_mcp_id`, `submission` — **means**: the user clicked send / pressed Enter and the frontend dispatched the request. Does NOT guarantee the server received it (network failures still fire this). Use `chat_message_started` for authoritative server-side receipt. |
| `chat_message_started` | S | `api/routes/decopilot/routes.ts:215` after validation + streamCore dispatch | `organization_id`, `agent_id`, `mode`, `thread_id`, `credential_id` — **means**: the server accepted the request and started streaming. |
| `chat_message_completed` | S | `api/routes/decopilot/stream-core.ts:1079` outer `createUIMessageStream.onFinish` — fires AFTER all steps / tools / subagents finish | `organization_id`, `thread_id`, `agent_id`, `model_id`, `model_title`, `mode`, `duration_ms`, `finish_reason`, `thread_status`, `input_tokens`, `output_tokens`, `total_tokens`, `is_resume` — **means**: stream terminated without an error signal. Does NOT mean the agent solved the user's problem. Check `finish_reason` (`stop`/`length`/`tool_calls`/...) for the mechanical cause of termination. |
| `chat_message_failed` | S | `stream-core.ts:1149` outer `onError` when NOT `registrySignal.aborted` | + `error_category` (`insufficient_funds`/`rate_limit`/`timeout`/`auth`/`model_error`/`tool_error`/`aborted`/`unknown`), `error_message` — **means**: the run hit a server-side error. `insufficient_funds` is the authoritative "credits ran out" signal. |
| `chat_message_aborted` | S | `stream-core.ts:1131` outer `onError` when `registrySignal.aborted` is true | same props as `_failed` minus error fields — **means**: the server stopped the run (user cancellation via stop button, tab close, pod restart, force-fail). Distinct from `_failed` which is error-driven. |
| `chat_message_stopped` | F | `chat/input.tsx:305/308` user pressed stop while `isStreaming` or `isRunInProgress` | `thread_id` — **frontend intent only**. The server will subsequently fire `_aborted` (most cases) or `_completed` (race — if the final chunk already returned before abort landed). Do NOT use this as a "message ended" event; use the server pair. |
| `chat_message_copied` | F | `message/parts/text-part.tsx:29` copy button on assistant message | `message_id`, `chars` — clipboard was written. Does NOT mean the user pasted it anywhere. |

### 5.3 Input / pickers / voice

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `chat_picker_opened` | F | `tiptap/mention-at.tsx:257` (@) / `mention-slash.tsx:252` (/) on `Suggestion.onStart` — only when the dropdown actually renders (regex + allow() gate) | `picker` (`/` or `@`) — `/` inside URLs or `@` inside emails do NOT trigger. |
| `chat_picker_closed` | F | `mention-at.tsx:260` / `mention-slash.tsx:255` `Suggestion.onExit` | `picker`, `outcome` (`selected`/`dismissed`), `duration_ms` — abandonment signal via `outcome=dismissed`. |
| `chat_picker_item_selected` | F | `mention-at.tsx:81` / `mention-slash.tsx:133` — fires when a dropdown item is clicked | `picker`, `item_kind`, `item_name` — ⚠️ for `@` picker, *category* items fire this but drill deeper into a sub-list (not terminal). The `close.outcome` prop reflects the terminal state. |
| `chat_voice_started` | F | `input.tsx:206` mic clicked + `startRecording()` resolves (does NOT fire on click alone) | `thread_id`, `outcome` (`started`/`unsupported`/`permission_denied`/`unknown`) — filter by `outcome=started` for actual recording starts. |
| `chat_voice_confirmed` | F | `input.tsx:210` user confirms completed voice recording | `thread_id` — NOT the same as message sent; the transcript still has to be submitted. |
| `chat_voice_cancelled` | F | `input.tsx:217` user cancels in-progress recording | `thread_id` |
| `chat_mode_changed` | F | `tools-popover.tsx:136/220/232` (popover toggles) + `input.tsx:431/453/479` (pill X dismiss) | `from_mode`, `to_mode`, `source` (`tools_popover`/`pill_dismiss`) — the mode the NEXT submitted message will use, until changed again. |
| `chat_prompt_inserted` | F | `tools-popover.tsx:178` selecting a prompt from the Prompts submenu | `prompt_name`, `with_arguments` — prompt text inserted into the editor. Does NOT mean the message was sent. |
| `chat_image_model_selected` | F | `tools-popover.tsx:197` image model picked in the Image submenu | `model_id`, `model_title`, `provider` — preference change only; does NOT imply an image was generated. |
| `chat_search_model_selected` | F | `tools-popover.tsx:208` deep-research model picked | `model_id`, `model_title`, `provider` — preference change only. |
| `chat_model_changed` | F | `select-model.tsx:1221` user picks a different base model | `from_model_id`, `to_model_id`, `to_model_provider`, `credential_id` — preference; the next `chat_message_sent` will carry `model_id`. |
| `chat_credential_changed` | F | `select-model.tsx:1215` user switches stored provider credential (API key) | `credential_id` — distinct from `chat_model_changed`; only the credential key changed, not the model selection. |

---

## 6. Tasks panel

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `tasks_panel_member_filter_changed` | F | `tasks-section.tsx:92` — dedupes no-op selections | `to_value` (`all`/`mine`) — filter UI preference. |
| `tasks_panel_filter_changed` | F | `tasks-section.tsx:128` — dedupes no-op selections | `to_value` (`all`/`manual`/`automation`) |
| `tasks_panel_new_clicked` | F | `tasks-section.tsx:145` pencil icon click | (no props) — creates a new blank task and navigates to it. Subset of the overall "new thread" intent — server-side `chat_started{created_via=stream_auto}` typically follows. |
| `tasks_panel_task_clicked` | F | `tasks-section.tsx:168` row click — dedupes same-task re-clicks | `thread_id`, `virtual_mcp_id`, `from_automation` — navigation intent from the tasks panel specifically. `chat_opened` will fire subsequently if the thread actually loads. |
| `tasks_panel_task_archived` | F | `tasks-section.tsx:177` archive icon on hover | `thread_id`, `virtual_mcp_id` — the archive intent from the tasks panel. The authoritative archive event is server `chat_archived` (fires via `COLLECTION_THREADS_UPDATE`). |

---

## 7. Agents list page (settings/agents)

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `agents_list_template_clicked` | F | `routes/agents-list.tsx:96` click on a template tile in the Agents settings page | `template_id` — click intent; the recruit modal / import dialog opens next. Does NOT mean the user completed creation. |
| `agent_create_clicked` | F | `routes/agents-list.tsx` dropdown items (6 call sites: header dropdown + empty-state dropdown, each with 3 methods) | `source` (`agents_list`/`agents_list_empty`), `method` (`scratch`/`github`/`deco`) — dropdown-item click intent. For `method=scratch` the creation happens immediately; for `github`/`deco` it opens a picker dialog that the user can abandon. |
| `agent_deleted` | F | `routes/agents-list.tsx:122` (`source: "agents_list"`) and `virtual-mcp/index.tsx:1502` (`source: "agent_detail"`) | `agent_id`, `source` |

---

## 8. Agent detail — header + sub-tabs (Instructions / Connections / Layout)

### 8.1 Header + sub-tab bar

| Event | Surface | Trigger | Props |
|---|---|---|---|
| ~~`agent_subtab_changed`~~ | — | **Retired** after main rebase. The agent detail view no longer uses sub-tabs (instructions/connections/layout) — it's now a single consolidated page. | — |
| `agent_test_clicked` | F | `virtual-mcp/index.tsx:1181` "Test Agent" button in the page title | `agent_id` — opens a new task with this agent; the resulting chat fires its own `chat_message_*` events. |
| `agent_delete_requested` | F | `virtual-mcp/index.tsx:1546` trash icon — opens the confirm dialog but does NOT delete | `agent_id` — the user wants to delete. The authoritative delete is `agent_deleted{source=agent_detail}` after confirm. |
| `agent_connect_modal_opened` | F | `virtual-mcp/index.tsx:1663` the Cursor/Claude "Connect" button in the instructions header | `agent_id` — opens the share/typegen modal (see section 8.5). Does NOT imply any external use. |

### 8.2 Instructions sub-tab

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `agent_updated` | F | **session-based** (commit `f8150dc8f`). Auto-saves still persist at the 1s debounce + on blur, but PostHog only receives ONE event per edit-session. A session ends after 30s of quiet OR on explicit flush (sub-tab switch, "Test Agent", "Improve", delete). | `agent_id`, `fields` (union of top-level dirty keys across all saves in the session — e.g. `title`, `description`, `icon`, `metadata`, `connections`), `instructions_length` (latest length when `metadata.instructions` was touched in the session; null otherwise), `save_count` (auto-saves within the session), `edit_duration_ms` (wall-clock from first save to flush). A 500-char instructions edit now fires **one** event, not 10-15. |
| `agent_instructions_template_inserted` | F | `virtual-mcp/index.tsx:1463` "+ Prompt template" button (only visible when instructions are empty) | `agent_id` — inserts a scaffold into the editor. Does NOT mean the user kept the scaffold or filled it in. |
| `agent_instructions_improve_clicked` | F | `virtual-mcp/index.tsx:1160` "Improve" button (disabled when instructions are empty) | `agent_id`, `instructions_length` — dispatches a `/writing-prompts` task in Decopilot. Does NOT mean the user took the suggestions. |

### 8.3 Connections sub-tab

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `agent_connection_detail_opened` | F | `virtual-mcp/index.tsx:355` clicking the connection card body (a `<Link>` to `/settings/connections/<slug>`) | `agent_id`, `connection_id`, `app_name` — navigation intent into the connection detail page; doesn't imply any action there. |
| `agent_connection_settings_opened` | F | `virtual-mcp/index.tsx:1372` gear icon → opens the tools/resources picker dialog | `agent_id`, `connection_id` — dialog opened; does NOT mean a selection was made. |
| `agent_connection_removed` | F | `virtual-mcp/index.tsx:1274` X icon | `agent_id`, `connection_id` — the connection is dropped from this agent's list (form change). The agent save will persist it; NOT the same as deleting the connection row globally (`connection_deleted`). |
| `agent_connection_instance_switched` | F | `virtual-mcp/index.tsx:1290` switch to another instance of the same app | `agent_id`, `from_connection_id`, `to_connection_id` — form change; agent save persists. |
| `agent_connection_new_instance_requested` | F | `virtual-mcp/index.tsx:1309` "+ New instance" in the sibling-instance dropdown | `agent_id`, `connection_id` — intent; creation may fail downstream (OAuth required, etc.). |
| `connection_authorize_clicked` | F | `virtual-mcp/index.tsx:391` "Authorize" button (when connection needs auth) | `agent_id`, `connection_id`, `source: "agent_settings"` — click intent BEFORE the OAuth popup opens. Pair with `connection_oauth_succeeded{flow=agent_reauthenticate}` for completion. |

### 8.4 Layout sub-tab

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `agent_layout_main_view_changed` | F | `virtual-mcp/index.tsx:856` "Main view" dropdown selection | `agent_id`, `from_value`, `to_value` — saves immediately via `saveLayout`. |
| `agent_layout_show_chat_toggled` | F | `virtual-mcp/index.tsx:945` "Show chat" switch | `agent_id`, `enabled` — disabled/forced-on when default main view is `chat`. |
| `agent_layout_pin_toggled` | F | `virtual-mcp/index.tsx:777` per-tool pin switch | `agent_id`, `connection_id`, `tool_name`, `pinned` (the NEW state, i.e. `pinned=true` means the user just pinned it). |
| `agent_layout_pin_label_updated` | F | `virtual-mcp/index.tsx:825` input blur on a pinned-view label (fires regardless of whether the value actually changed) | `agent_id` — slightly noisy: an unchanged-value blur still fires this. |
| `agent_layout_pin_icon_changed` | F | `virtual-mcp/index.tsx:834` icon picker onChange | `agent_id`, `connection_id`, `tool_name`, `has_icon` (null=cleared vs string=set). |
| `agent_layout_test_clicked` | F | `virtual-mcp/index.tsx:1070` "Test layout" button | `agent_id` — opens a new task with this agent in a fresh browser context. |

### 8.5 Connect modal (share → IDE / typegen)

> **Naming note**: this modal is called "Connect" in the UI but is about *exposing* the agent to external consumers (Cursor, Claude Code, the Deco typegen CLI). It is NOT about the agent *connecting to* a new upstream tool. Don't confuse with `connections_dialog_opened` (which is about adding MCPs to an agent).

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `agent_connect_action` | F | `virtual-mcp-share-modal.tsx:58/92/141/231/326` per-button handlers inside the Connect modal | `agent_id`, `action`, optional `has_api_key`. Actions: `copy_url` = URL copied to clipboard (NOT that it was pasted); `install_cursor` = Cursor deeplink opened (NOT that Cursor installed the MCP — the OS may have no handler or the user may cancel); `install_claude_code` = the `claude mcp add-json ...` command was copied to clipboard (the user still has to paste it into a terminal); `typegen_copy_command` / `typegen_copy_env` = typegen command/env block copied to clipboard. |
| `agent_typegen_key_generated` | F | `virtual-mcp-share-modal.tsx:221` `API_KEY_CREATE` for typegen succeeded | `agent_id` — an API key now exists scoped to this agent. Does NOT mean typegen was ever run with it. |
| `agent_typegen_key_failed` | F | `virtual-mcp-share-modal.tsx:223` key generation errored | `agent_id` |

### 8.6 Server-side agent lifecycle

| Event | Surface | Trigger | Props | ⚠️ |
|---|---|---|---|---|
| `agent_created` | — | not yet instrumented server-side | — | Gap — today we only have home / recruit / deco-import frontend events for creation |

---

## 9. Automations

### 9.1 Per-agent automation surface

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `automation_new_clicked` | F | `automations/automations-list.tsx:39` "New automation" button — this fires BEFORE the create mutation (not after), so it captures intent | `virtual_mcp_id`, `existing_count` (count at time of click, useful for "first automation" cohorts). The subsequent `automation_created` is the success signal. |
| `automation_created` | S | `tools/automations/create.ts:139` `AUTOMATION_CREATE` tool success | `organization_id`, `automation_id`, `agent_id`, `model_id`, `has_virtual_mcp`, `active` — **means**: automation row exists. At this moment there are 0 triggers configured; the user still has to add starters. Pair with `automation_trigger_added` for "ready to run". |
| `automation_updated` | F | **session-based** (commit `f8150dc8f`). Auto-saves still persist at the 1s debounce + on blur, but PostHog only receives ONE event per edit-session. A session ends after 30s of quiet OR on explicit flush ("Test", "Improve"). | `automation_id`, `agent_id`, `fields` (union of dirty keys across the session, including the synthetic `messages` key when the TipTap editor was edited), `save_count`, `edit_duration_ms`. |
| `automation_improve_clicked` | F | `automations/automation-detail.tsx:331` "Improve" button | `automation_id`, `agent_id`, `instructions_length` — intent to get prompt-engineering help; opens a Decopilot task. Does NOT mean the improved prompt was accepted back into the automation. |
| `automation_test_clicked` | F | `automations/automation-detail.tsx:453` "Test" button | `automation_id`, `agent_id` — test-run intent. The actual run lifecycle is captured by `chat_message_*` since Test reuses the chat runtime. |
| `automation_trigger_added` | F | `automation-detail.tsx:117` event-trigger submit, `:606` cron blur success | `automation_id`, `trigger_type` (`cron`/`event`), `connection_id?` (event only), `event_type?` (event only) |
| `automation_run` | S | `tools/automations/run.ts:53` `AUTOMATION_RUN` tool | `organization_id`, `automation_id`, `thread_id`, `status` (`started`/`skipped`/`error`), `skip_reason`, `error_message` — **⚠️ manual runs only**. Cron-triggered and event-triggered runs do NOT fire this event yet. Don't use this for "automation reliability" until that gap closes. |
| `automation_deleted` | S | `tools/automations/delete.ts:74` | `organization_id`, `automation_id`, `trigger_count` — trigger_count is the number of triggers that were attached at delete time (indicates whether this was a configured automation or a half-finished one). |

### 9.2 Settings → Automations (org-wide list)

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `automations_list_row_clicked` | F | `routes/orgs/settings/automations.tsx:35` row click on the org-wide automations list | `automation_id`, `agent_id`, `source: "settings_automations"` — navigation intent to the automation detail inside its agent shell. |
| `automations_empty_state_browse_agents_clicked` | F | same file:46 the empty-state "Browse agents" CTA | (no props) — we show this when an org has no automations yet; click navigates to the Agents settings page. |

---

## 10. Connections (server-wide)

### 10.1 Settings → Connections page

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `connections_page_tab_changed` | F | `routes/orgs/connections.tsx:1993` All/Connected tab switch — dedupes no-op re-clicks | `to_tab` (`all`/`connected`) |
| `connections_custom_dialog_opened` | F | `routes/orgs/connections.tsx:1321` "Custom Connection" button in the page header | `source: "connections_page"` — distinguished from `connections_dialog_custom_clicked` which fires inside the Add-Connection dialog (section 10.2). |
| `connection_custom_created` | F | `routes/orgs/connections.tsx:1374` form submit just BEFORE the create mutation runs | `connection_type` (HTTP/SSE/Websocket/STDIO), `ui_type` (HTTP/SSE/Websocket/NPX/STDIO) — click intent; the server-side `connection_created` is the authoritative success event. If the create fails this still fired. |
| `connections_community_warning_confirmed` | F | `routes/orgs/connections.tsx:584` user confirmed the community-MCP safety warning | `registry_item_id` — we do NOT track the warning being *shown* today, so we can't compute a dismissal rate without adding `connections_community_warning_shown`. |
| `connections_bulk_delete` | F | `routes/orgs/connections.tsx:907` bulk-delete confirmation accepted | `count` — intent to delete N connections; individual deletes may still fail. Server-side `connection_deleted` fires per successful delete. |
| `connections_bulk_status_toggled` | F | `routes/orgs/connections.tsx:929` Enable/Disable button in the bulk bar | `count`, `to_status` (`active`/`inactive`) — intent; not guaranteed success. |
| `connections_bulk_add_to_agent` | F | `routes/orgs/connections.tsx:954` Add-to-Agent dialog confirm | `agent_id`, `count` — intent to attach N connections to an agent. |

### 10.2 Add Connection dialog (shared component)

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `connections_dialog_opened` | F | 4 callers: chat input tools popover (`input.tsx:418`), home connect-tools banner (`input.tsx:595`), sidebar footer (`sidebar/footer/inbox.tsx:239`), agent settings Add-connection (`virtual-mcp/index.tsx:1234`) | `source` (`tools_popover`/`home_banner`/`sidebar_footer`/`agent_settings`), `mode` (`add`/`browse`), optional `surface` (only on `agent_settings`: `tab_bar`/`header`/`empty_state`) — the dialog opened; no connection is added yet. |
| `connections_dialog_tab_changed` | F | `virtual-mcp/add-connection-dialog.tsx:123` All/Connected tab switch inside the dialog — dedupes no-op | `to_tab` |
| `connections_dialog_custom_clicked` | F | `add-connection-dialog.tsx:430` "Custom Connection" button shown in the dialog header | (no props) — opens the create-connection form inside the dialog. |
| `connection_add_clicked` | F | 4 call sites: `add-connection-dialog.tsx:325` (use existing instance), `:332` (clone an existing connection), `:383` (connect a fresh catalog item), and `connections.tsx:770` (inline connect from the Connections settings page catalog) | `action` (`use_existing`/`clone`/`connect_new`), plus action-specific props: `app_name`+`connection_id` (use_existing); `app_name`+`base_connection_id` (clone); `registry_item_id`+`app_name` (connect_new); `source` is only on the `connections.tsx` catalog call (`connections_page`). Prop shape intentionally varies by action — document carefully in PostHog. |
| `connection_browse_clicked` | F | `add-connection-dialog.tsx:293` browse-mode card click (dialog opened in `mode=browse`) | `app_name`, `connection_id`, `instances_count` — navigation intent into that connection's detail page. |

### 10.3 OAuth boundary (frontend observation, server-blind)

> **What "success" means here**: the OAuth token exchange between the user's browser and *our* proxy completed, and we received an access token. This does NOT guarantee the downstream API (GitHub, Slack, etc.) will accept subsequent tool calls — tokens can be revoked, scopes may be insufficient, or the target's API may be down. First tool-call attempt is the real validation signal (`tool_called{is_error=false}` for that connection).

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `connection_oauth_succeeded` | F | 5 call sites: 3 in `add-connection-dialog.tsx` (clone / connect_new / custom_create flows), agent re-authenticate in `virtual-mcp/index.tsx`, and connections settings page inline connect | `connection_id`, `flow` (`clone`/`connect_new`/`custom_create`/`agent_reauthenticate`/`connections_page_connect`) — local token exchange OK. |
| `connection_oauth_failed` | F | same 5 sites on error | + `error` (string from the provider or our proxy). |
| `connection_authorize_clicked` | F | `virtual-mcp/index.tsx:391` "Authorize" button (intent before the OAuth popup opens) | `agent_id`, `connection_id`, `source: "agent_settings"` — click intent; NOT confirmation of OAuth start. Pair with `connection_oauth_succeeded{flow=agent_reauthenticate}` to see completion. |

### 10.4 Server-side connection lifecycle

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `connection_created` | S | `tools/connection/create.ts:140` `COLLECTION_CONNECTIONS_CREATE` — fires for EVERY creation path (agent dialog, connections settings page, recruit modals, deco import, registry inline connect, API-direct callers) | `connection_id`, `connection_type`, `organization_id`, `tools_count` — **means**: the connection row was created. An OAuth-requiring connection at this moment is NOT yet authenticated; pair with `connection_oauth_succeeded` to know if it's usable. `app_name` is NOT in props today (gap — hard to break down by provider). |
| `connection_deleted` | S | `tools/connection/delete.ts:120` `COLLECTION_CONNECTIONS_DELETE` | `connection_id`, `connection_type`, `organization_id`, `forced` — `forced=true` means the caller bypassed in-use checks. |

---

## 11. Tools (unified MCP + built-in)

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `tool_called` | S | MCP path: `api/routes/decopilot/helpers.ts:216` tool wrapper `finally` block. Built-in path: `api/routes/decopilot/built-in-tools/index.ts:227` wrapper `finally` block | `tool_source` (`mcp`/`builtin`), `tool_name`, `tool_safe_name`, `read_only`, `destructive`, `idempotent`, `open_world`, `latency_ms`, `is_error` — **fires for EVERY tool attempt, including errors**. Always filter by `is_error=false` when measuring successful usage. This is the highest-volume event in the app; cost-monitor it. |

Built-in annotation map (in `BUILTIN_TOOL_ANNOTATIONS`):
- `readOnly`: `agent_search`, `read_tool_output`, `read_resource`, `read_prompt`, `web_search`, `user_ask`, `propose_plan`, `enable_tools`
- `NOT readOnly`: `generate_image`, `open_in_agent`, `subtask`
- None are destructive in the built-in set.

---

## 12. AI Providers (settings/ai-providers)

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `ai_provider_connect_clicked` | F | `org-ai-providers.tsx:607/616/622/628` — fires inside `handleCardClick` ONLY when the card is in a connectable state and a method is chosen (provision / oauth-pkce / api-key / cli-activate) | `provider_id`, `method` — click intent; the method-specific success/fail event below will land (or nothing will, if the user closes the dialog for `api-key` flow). |
| `ai_provider_oauth_succeeded` | F | `org-ai-providers.tsx:471` OAuth token-exchange mutation succeeded | `provider_id` — **means**: the provider returned a valid token to our backend. Does NOT prove the token has model-call permissions; first successful `chat_message_completed` with this credential is the real validation. |
| `ai_provider_oauth_failed` | F | `org-ai-providers.tsx:479` OAuth error + 2-min timeout path (no popup response) | `provider_id`, `error` — `error="timeout"` on the timeout path specifically. |
| `ai_provider_cli_activated` | F | `org-ai-providers.tsx:513` CLI activate succeeded AND `data.activated === true` | `provider_id` — a credential using the local CLI (e.g. `claude` / `codex`) is now registered. Requires the CLI to be installed on the user's machine. |
| `ai_provider_cli_activate_failed` | F | `org-ai-providers.tsx:506/523` — either `activated=false` (common: CLI not installed / not logged in) OR thrown error | `provider_id`, `error` — common failure mode is "CLI not found". |
| `ai_provider_provision_succeeded` | F | `org-ai-providers.tsx:546` `AI_PROVIDER_PROVISION_KEY` succeeded | `provider_id` — we auto-provisioned a managed key (Deco Gateway etc.). |
| `ai_provider_provision_failed` | F | `org-ai-providers.tsx:554` provision errored | `provider_id`, `error` |
| `ai_provider_key_created` | S | `tools/ai-providers/key-create.ts:39` `AI_PROVIDER_KEY_CREATE` tool succeeded | `organization_id`, `provider_id`, `key_id`, `label` — authoritative "a BYOK key now exists" event; fires for both manual-paste and OAuth/provision paths. |
| `ai_provider_key_deleted` | S | `tools/ai-providers/key-delete.ts:24` `AI_PROVIDER_KEY_DELETE` | `organization_id`, `key_id` |

---

## 13. Credits / Revenue

> ⚠️ **This section is the #1 source of misinterpretation.** Read carefully before building any revenue dashboard.
>
> - There is **NO authoritative payment event** in this taxonomy. We do not receive a webhook from the Deco AI Gateway on successful Stripe payment.
> - `credits_topup_clicked` = the user clicked a tier button in a banner. Zero guarantee anything happened afterwards. This is the only "intent" event we have for top-ups (the server `credits_topup_requested` was dropped in commit `f8150dc8f` — it was a duplicate that never proved payment).
> - `credits_topped_up_detected` = a heuristic derived from balance polling. It will ALSO fire for admin-granted credits, internal re-accounting, refunds reversing, or anything else that increases the balance between two polls.
> - The most reliable "they ran out of credits" signal is `chat_message_failed{error_category=insufficient_funds}` on the server side.

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `credits_topup_clicked` | F | `credits-exhausted-banner.tsx:191/238` + `credits-empty-state.tsx:188/233` — any tier or custom-amount button inside one of the two top-up modals | `amount_cents`, `currency`, `tier_label`, `source` (`exhausted_banner`/`empty_state`) — **means**: user clicked a top-up CTA. Does NOT mean a Stripe URL was even generated (server request can fail); does NOT mean the user paid. Now the single authoritative top-up intent event. |
| ~~`credits_topup_requested`~~ | — | **REMOVED** (commit `f8150dc8f`). Was a near-duplicate of `credits_topup_clicked` in the standard UI flow and never captured actual payment. Re-introduce only when a non-UI caller needs the signal. | — |
| `credits_topped_up_detected` | F | `use-deco-credits.ts:66` balance-polling hook detects an INCREASE in the balance between two refetches | `organization_id`, `delta_cents`, `previous_balance_cents`, `new_balance_cents` — ⚠️ **HEURISTIC** — the `_detected` suffix flags this. Also fires on admin-granted credits, internal re-accounting, refunds, and any other positive delta. Do NOT quote this as "payments" or "revenue" without qualification. |
| `credits_exhausted_shown` | F | `credits-exhausted-banner.tsx:84` the `CreditsExhaustedBanner` modal mounts | `organization_id` — exposure; means the modal rendered. Does NOT mean the user read it. |
| `credits_empty_state_shown` | F | `credits-empty-state.tsx:91` the `CreditsEmptyState` banner's `open` prop transitions to true | `organization_id` — fires on every open→true transition; if a single session shows and hides the banner multiple times you'll get multiple events. Use unique-sessions or unique-users rather than raw count. |
| `credits_empty_state_dismissed` | F | `credits-empty-state.tsx:79` dismiss (X) click | `organization_id` — the empty-state was explicitly dismissed (session-local hide). |

**Authoritative "credits ran out" signal** = `chat_message_failed` with `error_category: "insufficient_funds"` (server-side). Pair with session replay to understand UX impact.

---

## 14. API Keys (org-level)

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `api_key_created` | S | `tools/apiKeys/create.ts:63` `API_KEY_CREATE` tool success | `key_id`, `key_name`, `organization_id`, `has_expiry` — **means**: an org-level API key for programmatic access to this mesh now exists. Does NOT mean it was used. Includes typegen-scoped keys created from the Connect modal. |
| `api_key_deleted` | S | `tools/apiKeys/delete.ts:75` `API_KEY_DELETE` tool success | `key_id`, `organization_id` |

---

## 15. Registry

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `registry_publish_request_submitted` | S | `api/routes/registry/public-publish-request.ts:396` public POST `/:org/registry/publish-requests` | `organization_id`, `request_id`, `requested_id`, `title`, `requester_email` — **means**: a publish request was submitted for review. Does NOT mean it was approved / listed. |

---

## 16. Store (settings/store)

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `store_private_registry_added` | F | `org-store.tsx:73` add-private-registry form submit succeeded | `connection_id` — the registry is now in the list; the subsequent toggle decides whether it's active. |
| `store_private_registry_removed` | F | `org-store.tsx:291` delete confirm | `connection_id` |
| `store_registry_toggled` | F | `org-store.tsx:276` switch flipped (fires for Deco Store, Private Registry "self", community, and private registries) | `connection_id`, `enabled` — the registry config flag was flipped. Does NOT mean items from that registry will actually load (they may 404 / 401). |

---

## 17. Brand Context (settings/brand-context)

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `brand_created` | F | `org-brand-context.tsx:891` `BRAND_CONTEXT_CREATE` success | (no props) — **means**: a placeholder brand row with default values ("New Brand", "example.com") now exists. Does NOT mean the user filled anything in. Pair with `brand_updated` for actual configuration. |
| `brand_extract_started` | F | `org-brand-context.tsx:900` before the `BRAND_CONTEXT_EXTRACT` tool call | `domain` — user submitted a domain to auto-fill brand fields. |
| `brand_extract_succeeded` | F | `org-brand-context.tsx:909` extract tool returned successfully | (no props) — brand data came back; accuracy depends on the target site. |
| `brand_extract_failed` | F | `org-brand-context.tsx` onError | `error` |
| `brand_updated` | F | `org-brand-context.tsx:638` save-section mutation success | `brand_id`, `fields` (top-level keys of the data argument passed to the mutation — e.g. `logo`, `fonts`, `colors`, `images`) |
| `brand_archived` | F | `org-brand-context.tsx` `BRAND_CONTEXT_DELETE` tool success (archive is a soft-delete) | `brand_id` |
| `brand_restored` | F | unarchive path — `BRAND_CONTEXT_UPDATE` with `archivedAt: null` | `brand_id` |
| `brand_set_as_default` | F | `org-brand-context.tsx:684` "Set as default" action | `brand_id` — makes this brand the org default; no prior default is captured. |

---

## 18. SSO (settings/sso)

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `sso_configured` | F | `org-sso.tsx:74` save success when `isConfigured` was false beforehand | `organization_id`, `email_domain` — **means**: the SSO form saved for the first time. Does NOT mean the OIDC flow actually works (user must attempt a login from the matching domain to validate). |
| `sso_config_updated` | F | `org-sso.tsx:74` save success when `isConfigured` was true beforehand | `organization_id`, `email_domain` — edited an existing SSO config. |
| `sso_config_removed` | F | `org-sso.tsx:91` delete config success | `organization_id` — SSO is no longer configured; any enforcement also implicitly off. |
| `sso_enforcement_toggled` | F | `org-sso.tsx:102` "Enforced" switch | `organization_id`, `enforced` — policy flip; future non-SSO logins for the domain will be rejected. |

---

## 19. Monitor (settings/monitor)

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `monitoring_tab_changed` | F | `monitoring/index.tsx:968` Overview/Audit/Threads switch — dedupes no-op re-clicks | `from_tab`, `to_tab` |
| `monitoring_time_range_changed` | F | `monitoring/index.tsx:956` TimeRangePicker onChange | `from`, `to` (expression strings like `-30m` / `now`) |
| `monitoring_live_toggled` | F | `monitoring/index.tsx:963` "Live" button | `enabled` — streams-mode toggle; does NOT affect saved time range. |

---

## 20. Profile & Preferences

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `profile_updated` | F | `profile-preferences.tsx:96` display name save success | `fields: ["name"]` — currently only the name is editable from this page; `fields` is kept as an array for forward-compatibility. |
| `preferences_theme_changed` | F | `profile-preferences.tsx:198` theme toggle group selection (guarded against null) | `to_value` (`light`/`dark`/`system`) |
| `preferences_notifications_toggled` | F | `profile-preferences.tsx:177` — fires whether enabling or disabling, AND only after permission was granted if enabling | `enabled` — reflects the eventual persisted state, not just the click. |
| `preferences_notifications_permission_denied` | F | `profile-preferences.tsx:169` the browser `Notification.requestPermission()` returned `denied` or `default` | (no props) — user declined the browser prompt; we auto-revert the toggle to off. |
| `preferences_sounds_toggled` | F | `profile-preferences.tsx:237` row click OR `:261` switch onCheckedChange | `enabled` — PreferenceRow wraps the control in `stopPropagation`, so exactly ONE of the two handlers fires per click. No double-count. |
| `preferences_sounds_previewed` | F | `profile-preferences.tsx:251` preview play button | (no props) — validation-only ("does the button work"); fires regardless of whether sounds are enabled. |
| `preferences_tool_approval_changed` | F | `profile-preferences.tsx:278` "Tool Approval" Select onValueChange | `to_value` (`readonly`/`auto`) — changing this retroactively affects the current chat session's tool gating. |
| `preferences_experimental_vibecode_toggled` | F | `profile-preferences.tsx:334` row click OR `:346` switch | `enabled` — same stopPropagation pattern; one handler per click. Controls whether "Import from GitHub" shows up in create-agent dropdowns. |

---

## 21. Apps / iframes

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `mcp_app_opened` | F | `mcp-apps/mcp-app-renderer.tsx:90` component mount (deduped per `(page-session × resource URI)` via module-level Set) | `resource_uri`, `display_mode` (`inline`/`fullscreen`/etc.), `tool_name` — exposure event: the MCP-app iframe was rendered on screen. Does NOT mean the user interacted with it. |
| `vm_preview_loaded` | F | `vm/preview/preview.tsx:370` the VM dev-server preview iframe fires its `onLoad` — this is the user's own running dev app, NOT an MCP app | `view_mode`, `vm_id` — iframe loaded; does NOT guarantee the dev server stayed up afterwards. |

---

## 22. Import from Deco.cx dialog

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `deco_site_import_started` | F | `import-from-deco-dialog.tsx:113` mutation start (fires before server round-trip) | `site_name` — user clicked Import on a specific deco.cx site. |
| `deco_site_import_succeeded` | F | `import-from-deco-dialog.tsx:216` onSuccess | `site_name`, `virtual_mcp_id`, `slug` — connection + virtual MCP (project-subtype agent) now exist and the user is being navigated to the new agent. |
| `deco_site_import_failed` | F | `import-from-deco-dialog.tsx:249` onError | `error` — does NOT indicate whether the connection was partially created (cleanup happens only on auth failure paths). |

---

## 23. Agent recruit modals (home templates)

| Event | Surface | Trigger | Props |
|---|---|---|---|
| `agent_recruit_confirmed` | F | 5 recruit modals: `home/site-diagnostics-recruit-modal.tsx`, `ai-research-recruit-modal.tsx`, `ai-image-recruit-modal.tsx`, `lean-canvas-recruit-modal.tsx`, `studio-pack-recruit-modal.tsx` — fires after the creation mutation succeeds | `template_id` (`site-diagnostics`/`ai-research`/`ai-image`/`lean-canvas`/`studio-pack`), `agent_id` (for single-agent templates; studio-pack installs multiple), `installed_count` (studio-pack only) — **means**: the template's agent(s) now exist in the DB. Does NOT mean the user then used them. Pair with `chat_message_sent{virtual_mcp_id=<new agent>}` to see activation. |
| `agent_recruit_failed` | F | same files, catch branch | `template_id`, `error` — mutation errored. User may retry and succeed; each failure is a separate event. |

---

# Issues & gaps surfaced while cataloging

See `events-review.md` for the triage + fixes pass.
