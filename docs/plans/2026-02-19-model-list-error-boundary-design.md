# Model List Error Boundary — Design

## Problem

When an org configures a Gemini (or any OAuth-based) MCP as their model provider and the
connection is missing credentials, `COLLECTION_LLM_LIST` returns a 401. This error propagates
all the way to the page level and crashes the entire home page.

### Crash path

```
shell-layout <Chat.Provider>
  → ChatProvider
    → useModelState()
      → useModels(modelsConnection?.id)        ← throws here
        → useLLMsFromConnection()
          → useCollectionList<LLM>()
            → useSuspenseQuery
              → COLLECTION_LLM_LIST → 401
                → extractPayload throws
                  ↑ no ErrorBoundary around ChatProvider
                    → caught by OrgHomePage ErrorBoundary → page blank
```

`ChatProvider` lives in the shell layout and calls `useModels()` eagerly to auto-select a
default model. There is no ErrorBoundary wrapping it, so any MCP error escapes to the
nearest page-level boundary.

## Solution — Approach D: Silent child component for auto-selection

Move model fetching out of `ChatProvider`'s synchronous render path into a dedicated
`ModelAutoSelector` child component. That component is wrapped in its own
`ErrorBoundary + Suspense` so errors and suspensions are fully contained.

When models load successfully, `ModelAutoSelector` propagates the auto-selected model
back into context via the existing `setModel` callback. When it errors, it is caught
silently (`fallback={null}`) and the page continues to function normally.

### Component tree (after fix)

```
ChatProvider  (selectedModel = stored | null — no model fetching)
  ├─ <ErrorBoundary fallback={null}>
  │    <Suspense fallback={null}>
  │      <ModelAutoSelector onLoad={setModel} />  ← may throw/suspend freely
  │    </Suspense>
  │  </ErrorBoundary>
  └─ {children}  ← renders immediately, model arrives asynchronously
```

### Model selector popover (unchanged structure, new button)

The SELECT dropdown and the model list are already split by the existing ErrorBoundary:

```
ModelSelectorContent
  ├─ <search input + provider SELECT>   ← outside boundary, always visible
  └─ <ErrorBoundary key={connectionId}>
       <ConnectionModelList />           ← only this area errors
     </ErrorBoundary>
```

`key={connectionId}` resets the boundary when the user switches providers, so switching
to a healthy provider always gets a fresh attempt.

## Changes

### 1. `apps/mesh/src/web/components/chat/context.tsx`

- Remove `useModels()` call from `useModelState`. The hook now only reads/writes
  `{ id, connectionId }` from localStorage — no model fetching.
- Add `ModelAutoSelector` component rendered inside `ChatProvider`'s JSX, wrapped in
  `<ErrorBoundary fallback={null}><Suspense fallback={null}>`.
- `ModelAutoSelector` receives `modelsConnections`, `currentModel`, and `setModel` as
  props. It calls `useModels(firstConnection?.id)`, and on first load (no stored model)
  uses a `useEffect` (with oxlint disable comment) to call `setModel` with the first
  available model.

### 2. `apps/mesh/src/web/components/chat/select-model.tsx`

- Update `ModelListErrorFallback` to accept an optional `connectionId` prop.
- Add a "Configure connection" button that navigates to
  `/$org/org-admin/mcps/$connectionId` using `useProjectContext()` for the org slug and
  TanStack Router's `useNavigate`.
- Pass `connectionId={selectedConnectionId}` to the fallback from the ErrorBoundary in
  `ModelSelectorContent`.

## UX result

| Scenario | Before | After |
|---|---|---|
| Gemini 401 on page load | Entire home page crashes | Page loads, model shows null/placeholder |
| User opens model selector | N/A (page crashed) | Popover opens, SELECT visible |
| Model list area | N/A | Shows error fallback with Retry + Configure |
| User switches provider | N/A | SELECT works, new provider loads |
| Retry button | N/A | Resets ErrorBoundary, retries fetch |
| Configure button | N/A | Navigates to connection settings page |

## Tradeoffs

- **First-time users / cleared localStorage**: `selectedModel` is null until
  `ModelAutoSelector` resolves. The model selector trigger shows "Select model"
  placeholder briefly. Acceptable — same as any async load.
- **`limits` / `capabilities` on auto-selected model**: Preserved. `ModelAutoSelector`
  has access to the full `LLM` object when it calls `setModel`, so the stored config can
  include capabilities if needed. (Current `setModel` stores only `{ id, connectionId }`;
  this is sufficient for routing — limits/capabilities are loaded fresh in the selector.)
- **`cheapestModel` (fast model)**: Currently computed in `useModelState` from the full
  list. Removing that computation means `fast` is null until user explicitly picks a model
  in the selector. Acceptable — the `fast` field is advisory and falls back to `thinking`.
