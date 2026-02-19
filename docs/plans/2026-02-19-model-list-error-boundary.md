# Model List Error Boundary — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent a failing model-list MCP call (e.g. Gemini 401) from crashing the entire page, while preserving auto-selection and giving users clear recovery actions.

**Architecture:** Extract `useModels()` out of `ChatProvider`'s synchronous render path into a silent `ModelAutoSelector` child component wrapped in its own `ErrorBoundary + Suspense`. `ChatProvider` builds `selectedModelsConfig` from localStorage only (no fetch). `ModelAutoSelector` runs the fetch, propagates the auto-selected model via a callback, and is silently swallowed on error. The model selector popover already has an `ErrorBoundary` around the list area only — we extend its fallback to include a "Configure connection" button.

**Tech Stack:** React 19, TanStack Query (`useSuspenseQuery`), TanStack Router (`useNavigate`), `useLocalStorage`, `ErrorBoundary` (class component in `error-boundary.tsx`)

---

### Task 1: Extend `ModelChangePayload` and update `handleModelSelect`

**Files:**
- Modify: `apps/mesh/src/web/components/chat/select-model.tsx`

The payload that flows from model selection back to `ChatProvider` currently carries only `{ id, connectionId, provider }`. We need `capabilities` so the stored state can restore `modelSupportsFiles` without a live fetch.

**Step 1: Add `capabilities` to `ModelChangePayload`**

Find this block (around line 520):

```typescript
export interface ModelChangePayload {
  id: string;
  connectionId: string;
  provider?: string;
}
```

Replace with:

```typescript
export interface ModelChangePayload {
  id: string;
  connectionId: string;
  provider?: string;
  capabilities?: string[];
}
```

**Step 2: Update `handleModelSelect` to include capabilities**

Find this block inside `ModelSelectorContent` (around line 640):

```typescript
const handleModelSelect = (model: LLM) => {
  if (!selectedConnectionId) return;

  onModelChange({
    id: model.id,
    connectionId: selectedConnectionId,
    provider: model.provider ?? undefined,
  });
  setSearchTerm("");
  onClose();
};
```

Replace with:

```typescript
const handleModelSelect = (model: LLM) => {
  if (!selectedConnectionId) return;

  onModelChange({
    id: model.id,
    connectionId: selectedConnectionId,
    provider: model.provider ?? undefined,
    capabilities: model.capabilities ?? undefined,
  });
  setSearchTerm("");
  onClose();
};
```

**Step 3: Run type-check**

```bash
bun run check
```

Expected: no new errors related to `ModelChangePayload`.

**Step 4: Commit**

```bash
git add apps/mesh/src/web/components/chat/select-model.tsx
git commit -m "feat(chat): extend ModelChangePayload with capabilities"
```

---

### Task 2: Update `ModelListErrorFallback` with "Configure connection" button

**Files:**
- Modify: `apps/mesh/src/web/components/chat/select-model.tsx`

**Step 1: Add new imports at the top of the file**

The current import block from `@untitledui/icons` (around line 17) already has several icons. Add `Settings01` to it:

```typescript
import {
  AlertTriangle,
  ChevronDown,
  ChevronSelectorVertical,
  CurrencyDollar,
  File06,
  Grid01,
  Image01,
  LogOut04,
  RefreshCcw01,
  SearchMd,
  Settings01,
  Stars01,
} from "@untitledui/icons";
```

Add new imports after the existing react import (around line 30):

```typescript
import { useNavigate } from "@tanstack/react-router";
import {
  ORG_ADMIN_PROJECT_SLUG,
  useProjectContext,
} from "@decocms/mesh-sdk";
```

**Step 2: Replace `ModelListErrorFallback`**

Find the full `ModelListErrorFallback` function (around line 343–370) and replace it:

```typescript
/**
 * Error fallback shown when fetching models from a connection fails.
 * Allows the user to retry or navigate to connection configuration.
 */
function ModelListErrorFallback({
  error,
  onRetry,
  connectionId,
}: {
  error: Error | null;
  onRetry: () => void;
  connectionId: string | null;
}) {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  const handleConfigure = () => {
    if (!connectionId) return;
    navigate({
      to: "/$org/$project/mcps/$connectionId",
      params: {
        org: org.slug,
        project: ORG_ADMIN_PROJECT_SLUG,
        connectionId,
      },
    });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <div className="bg-destructive/10 p-2 rounded-full">
        <AlertTriangle className="size-5 text-destructive" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          Failed to load models
        </p>
        <p className="text-xs text-muted-foreground max-w-[260px]">
          {error?.message || "Could not fetch models from this provider."}
          {" Try another provider or retry."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="gap-1.5"
        >
          <RefreshCcw01 className="size-3.5" />
          Retry
        </Button>
        {connectionId && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleConfigure}
            className="gap-1.5"
          >
            <Settings01 className="size-3.5" />
            Configure
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Pass `connectionId` to the fallback in `ModelSelectorContent`**

Find the `ErrorBoundary` wrapping `ConnectionModelList` (around line 709):

```typescript
<ErrorBoundary
  key={selectedConnectionId}
  fallback={({ error, resetError }) => (
    <ModelListErrorFallback error={error} onRetry={resetError} />
  )}
>
```

Replace with:

```typescript
<ErrorBoundary
  key={selectedConnectionId}
  fallback={({ error, resetError }) => (
    <ModelListErrorFallback
      error={error}
      onRetry={resetError}
      connectionId={selectedConnectionId}
    />
  )}
>
```

**Step 4: Run type-check and lint**

```bash
bun run check && bun run lint
```

Expected: no errors.

**Step 5: Commit**

```bash
git add apps/mesh/src/web/components/chat/select-model.tsx
git commit -m "feat(chat): add configure connection button to model list error fallback"
```

---

### Task 3: Restructure `useModelState` to remove `useModels()` fetch

**Files:**
- Modify: `apps/mesh/src/web/components/chat/context.tsx`

This removes the crash. `useModelState` will read from localStorage and build `selectedModelsConfig` from stored data — no MCP call.

**Step 1: Add `StoredModelState` interface near the top of `context.tsx`**

After the type definitions block (around line 82), add:

```typescript
/**
 * Shape persisted in localStorage for the selected model.
 * Capabilities are stored so modelSupportsFiles works on reload
 * without a live fetch.
 */
interface StoredModelState {
  id: string;
  connectionId: string;
  provider?: string;
  capabilities?: string[];
}
```

**Step 2: Replace the entire `useModelState` implementation**

Find the full `useModelState` function (lines 197–284) and replace it:

```typescript
/**
 * Hook to manage model selection state.
 * Builds ChatModelsConfig from localStorage only — no model fetching here.
 * Auto-selection is handled by ModelAutoSelector rendered in ChatProvider.
 */
const useModelState = (
  locator: ProjectLocator,
  modelsConnections: ReturnType<typeof useModelConnections>,
) => {
  const [modelState, setModelState] = useLocalStorage<StoredModelState | null>(
    LOCALSTORAGE_KEYS.chatSelectedModel(locator),
    null,
  );

  // Validate stored connectionId is still in the available connections list.
  // Falls back to first connection when stored one is gone.
  const modelsConnection = findOrFirst(
    modelsConnections,
    modelState?.connectionId,
  );

  // Reconstruct ChatModelsConfig from stored state — no fetch needed.
  const selectedModelsConfig: ChatModelsConfig | null =
    modelState && modelsConnection
      ? {
          connectionId: modelsConnection.id,
          thinking: {
            id: modelState.id,
            provider: modelState.provider,
            capabilities: modelState.capabilities
              ? {
                  vision: modelState.capabilities.includes("vision")
                    ? true
                    : undefined,
                  text: modelState.capabilities.includes("text")
                    ? true
                    : undefined,
                  tools: modelState.capabilities.includes("tools")
                    ? true
                    : undefined,
                }
              : undefined,
          },
        }
      : null;

  return [selectedModelsConfig, setModelState] as const;
};
```

**Step 3: Update `setSelectedModel` in `ChatProvider` to store capabilities**

Find this function inside `ChatProvider` (around line 740):

```typescript
const setSelectedModel = (model: ModelChangePayload) => {
  setModel({ id: model.id, connectionId: model.connectionId });
};
```

Replace with:

```typescript
const setSelectedModel = (model: ModelChangePayload) => {
  setModel({
    id: model.id,
    connectionId: model.connectionId,
    provider: model.provider,
    capabilities: model.capabilities,
  });
};
```

**Step 4: Run type-check**

```bash
bun run check
```

Fix any type errors before continuing.

**Step 5: Commit**

```bash
git add apps/mesh/src/web/components/chat/context.tsx
git commit -m "refactor(chat): remove useModels from useModelState, build config from localStorage"
```

---

### Task 4: Add `ModelAutoSelector` component

**Files:**
- Modify: `apps/mesh/src/web/components/chat/context.tsx`

This is the silent child component that handles auto-selection. It can throw/suspend freely inside its own boundary.

**Step 1: Add new import to `context.tsx`**

Find the existing imports block. Add `ErrorBoundary` import:

```typescript
import { ErrorBoundary } from "../error-boundary";
```

(`Suspense` is already imported from `react` on line 32.)

**Step 2: Add `ModelAutoSelector` component**

Add this component definition right before `ChatProvider` (around line 553):

```typescript
/**
 * Silent child component that auto-selects the first available model when
 * none is stored. Wrapped in ErrorBoundary + Suspense inside ChatProvider so
 * any MCP error (e.g. 401 from Gemini) is contained here and never propagates
 * to the parent provider or the page.
 *
 * Renders null — purely a behavior component.
 */
function ModelAutoSelector({
  modelsConnections,
  currentConfig,
  onAutoSelect,
}: {
  modelsConnections: ReturnType<typeof useModelConnections>;
  currentConfig: ChatModelsConfig | null;
  onAutoSelect: (state: StoredModelState) => void;
}) {
  const firstConnection = modelsConnections[0];
  // This call may suspend (loading) or throw (MCP error).
  // Both are handled by the ErrorBoundary + Suspense wrapping this component.
  const models = useModels(firstConnection?.id);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    // Only auto-select when there is no stored model config yet.
    if (currentConfig || !firstConnection || models.length === 0) return;
    const first = models[0];
    onAutoSelect({
      id: first.id,
      connectionId: firstConnection.id,
      provider: first.provider ?? undefined,
      capabilities: first.capabilities ?? undefined,
    });
  }, [models, currentConfig, firstConnection, onAutoSelect]);

  return null;
}
```

**Step 3: Render `ModelAutoSelector` inside `ChatProvider`'s JSX**

Find the return statement of `ChatProvider` (around line 847):

```typescript
return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
```

Replace with:

```typescript
return (
  <ChatContext.Provider value={value}>
    {/* Auto-selects first model when none is stored.
        ErrorBoundary ensures MCP errors (e.g. auth failures) never crash the provider. */}
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <ModelAutoSelector
          modelsConnections={modelsConnections}
          currentConfig={selectedModel}
          onAutoSelect={setModel}
        />
      </Suspense>
    </ErrorBoundary>
    {children}
  </ChatContext.Provider>
);
```

**Step 4: Run type-check and lint**

```bash
bun run check && bun run lint
```

Expected: no errors.

**Step 5: Run tests**

```bash
bun test
```

Expected: all existing tests pass (829+ pass, 0 fail).

**Step 6: Commit**

```bash
git add apps/mesh/src/web/components/chat/context.tsx
git commit -m "fix(chat): isolate model list fetch in ModelAutoSelector to prevent page crash on MCP auth error"
```

---

### Task 5: Format, final check, and verify

**Step 1: Run formatter**

```bash
bun run fmt
```

**Step 2: Re-run full checks**

```bash
bun run check && bun run lint && bun test
```

Expected: clean.

**Step 3: Manual smoke test**

Start the dev server:

```bash
bun run dev
```

Scenarios to verify:
1. **Gemini 401 scenario** — configure a connection with wrong/missing API key as the model provider. Navigate to org admin home. Page should load without crash. Model selector trigger shows "Select model" placeholder.
2. **Model selector error state** — open the model selector. The provider SELECT dropdown is visible. The list area shows "Failed to load models" with both **Retry** and **Configure** buttons.
3. **Switch provider** — use the SELECT to switch to a working provider. List loads models correctly.
4. **Configure button** — click Configure. Should navigate to `/$org/org-admin/mcps/$connectionId`.
5. **Working provider** — with a valid connection, auto-selection works on page load. Model selector shows selected model.

**Step 4: Commit formatting changes (if any)**

```bash
git add -A
git commit -m "style: format after model list error boundary fix"
```
