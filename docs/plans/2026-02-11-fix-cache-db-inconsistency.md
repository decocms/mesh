# Fix Cache/Database Inconsistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical cache consistency issues between React Query cache and database state to prevent data loss, stale UI, and silent failures.

**Architecture:** Implement proper error propagation, coordinate cache updates with database saves, and reduce stale time to ensure cache consistency. The fix follows the request-response pattern: server saves first, then notifies client to invalidate cache, triggering refetch with confirmed data.

**Tech Stack:** React Query, AI SDK, Kysely, Hono, React 19

---

## Task 1: Add Error Notification System

**Files:**
- Read: `apps/mesh/src/api/routes/decopilot/routes.ts:299-350` (understand current error handling)
- Read: `apps/mesh/src/web/components/chat/context.tsx:580-615` (understand client onFinish)
- Create: `apps/mesh/src/api/routes/decopilot/errors.ts` (error types and handlers)

### Step 1: Read current server-side error handling

Run: `bun run read apps/mesh/src/api/routes/decopilot/routes.ts --lines=299-350`

Expected: See the silent .catch() error handler

### Step 2: Read current client-side cache update

Run: `bun run read apps/mesh/src/web/components/chat/context.tsx --lines=580-615`

Expected: See immediate cache update without waiting for save confirmation

### Step 3: Create error types for decopilot

Create `apps/mesh/src/api/routes/decopilot/errors.ts`:

```typescript
/**
 * Decopilot error types and handlers
 */

export class MessageSaveError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MessageSaveError";
  }
}

export class CacheInvalidationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CacheInvalidationError";
  }
}

/**
 * Format error for client-side display
 */
export function formatErrorForClient(error: unknown): {
  message: string;
  code: string;
  recoverable: boolean;
} {
  if (error instanceof MessageSaveError) {
    return {
      message: "Failed to save message. Please try again.",
      code: "MESSAGE_SAVE_FAILED",
      recoverable: true,
    };
  }

  if (error instanceof CacheInvalidationError) {
    return {
      message: "Failed to update message cache. Please refresh.",
      code: "CACHE_INVALIDATION_FAILED",
      recoverable: true,
    };
  }

  return {
    message: "An unexpected error occurred.",
    code: "UNKNOWN_ERROR",
    recoverable: false,
  };
}
```

### Step 4: Run type check

Run: `bun run check`

Expected: No TypeScript errors

### Step 5: Format code

Run: `bun run fmt`

Expected: All files formatted

### Step 6: Commit

```bash
git add apps/mesh/src/api/routes/decopilot/errors.ts
git commit -m "feat(decopilot): add error types for cache/db consistency

- Create MessageSaveError and CacheInvalidationError types
- Add formatErrorForClient for user-friendly error messages
- Prepare for proper error propagation

Fixes: main-99k (part 1/7)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Add Save Confirmation Endpoint

**Files:**
- Modify: `apps/mesh/src/api/routes/decopilot/routes.ts` (add save status endpoint)

### Step 1: Read current routes structure

Run: `bun run read apps/mesh/src/api/routes/decopilot/routes.ts --lines=1-100`

Expected: See route definitions and structure

### Step 2: Add save tracking map

Modify `apps/mesh/src/api/routes/decopilot/routes.ts`, add at the top of the file (after imports):

```typescript
/**
 * Track save status for messages by thread ID
 * Key: thread_id, Value: { status, error?, timestamp }
 */
const saveStatusMap = new Map<
  string,
  {
    status: "pending" | "success" | "error";
    error?: string;
    timestamp: number;
  }
>();

/**
 * Clean up old save status entries (older than 5 minutes)
 */
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [threadId, status] of saveStatusMap.entries()) {
    if (status.timestamp < fiveMinutesAgo) {
      saveStatusMap.delete(threadId);
    }
  }
}, 60 * 1000); // Run every minute
```

### Step 3: Add GET endpoint for save status

In the same file, add a new route (before the stream endpoint):

```typescript
// GET /api/decopilot/:thread_id/save-status - Check message save status
decopilot.get("/:thread_id/save-status", async (c) => {
  const thread_id = c.req.param("thread_id");

  const status = saveStatusMap.get(thread_id);

  if (!status) {
    return c.json({
      status: "unknown",
      message: "No recent save operation found",
    });
  }

  return c.json({
    status: status.status,
    error: status.error,
    timestamp: status.timestamp,
  });
});
```

### Step 4: Format code

Run: `bun run fmt`

Expected: All files formatted

### Step 5: Run type check

Run: `bun run check`

Expected: No TypeScript errors

### Step 6: Commit

```bash
git add apps/mesh/src/api/routes/decopilot/routes.ts
git commit -m "feat(decopilot): add save status tracking endpoint

- Add saveStatusMap for tracking message save operations
- Create GET /api/decopilot/:thread_id/save-status endpoint
- Auto-cleanup old entries after 5 minutes

Fixes: main-99k (part 2/7)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Update Server to Track Save Status

**Files:**
- Modify: `apps/mesh/src/api/routes/decopilot/routes.ts:299-350` (update onFinish with status tracking)

### Step 1: Read current server onFinish implementation

Run: `bun run read apps/mesh/src/api/routes/decopilot/routes.ts --lines=299-350`

Expected: See current .catch() handler that only logs

### Step 2: Update onFinish to track save status

Modify `apps/mesh/src/api/routes/decopilot/routes.ts`, find the `onFinish` callback (around line 299-350) and replace the save logic:

Before:
```typescript
await memory.save(messagesToSave).catch((error) => {
  console.error('[decopilot:stream] Error saving messages', error);
});
```

After:
```typescript
// Import at top
import { MessageSaveError, formatErrorForClient } from "./errors";

// In onFinish callback
const thread_id = message.experimentalMeta?.thread_id as string | undefined;

if (thread_id) {
  // Set pending status
  saveStatusMap.set(thread_id, {
    status: "pending",
    timestamp: Date.now(),
  });
}

try {
  await memory.save(messagesToSave);

  // Set success status
  if (thread_id) {
    saveStatusMap.set(thread_id, {
      status: "success",
      timestamp: Date.now(),
    });
  }
} catch (error) {
  console.error("[decopilot:stream] Error saving messages", error);

  // Set error status
  if (thread_id) {
    const formatted = formatErrorForClient(
      new MessageSaveError("Failed to save messages", error),
    );
    saveStatusMap.set(thread_id, {
      status: "error",
      error: formatted.message,
      timestamp: Date.now(),
    });
  }

  // Re-throw to propagate error
  throw new MessageSaveError("Failed to save messages", error);
}
```

### Step 3: Format code

Run: `bun run fmt`

Expected: All files formatted

### Step 4: Run type check

Run: `bun run check`

Expected: No TypeScript errors

### Step 5: Commit

```bash
git add apps/mesh/src/api/routes/decopilot/routes.ts
git commit -m "feat(decopilot): track save status in onFinish handler

- Set pending status before save operation
- Set success status after successful save
- Set error status on save failure
- Re-throw errors for proper propagation
- Add thread_id-based status tracking

Fixes: main-99k (part 3/7)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update Client to Poll Save Status

**Files:**
- Create: `apps/mesh/src/web/components/chat/hooks/use-save-status.ts`
- Modify: `apps/mesh/src/web/components/chat/context.tsx:580-615`

### Step 1: Create save status hook

Create `apps/mesh/src/web/components/chat/hooks/use-save-status.ts`:

```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

interface SaveStatus {
  status: "pending" | "success" | "error" | "unknown";
  error?: string;
  timestamp?: number;
}

interface UseSaveStatusOptions {
  threadId: string | undefined;
  enabled: boolean;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

/**
 * Hook to poll save status and invalidate cache when save completes
 */
export function useSaveStatus({
  threadId,
  enabled,
  onSuccess,
  onError,
}: UseSaveStatusOptions) {
  const queryClient = useQueryClient();
  const previousStatus = useRef<string | null>(null);

  const { data: saveStatus } = useQuery<SaveStatus>({
    queryKey: ["save-status", threadId],
    queryFn: async () => {
      if (!threadId) throw new Error("No thread ID");

      const response = await fetch(
        `/api/decopilot/${threadId}/save-status`,
      );
      if (!response.ok) throw new Error("Failed to fetch save status");

      return response.json();
    },
    enabled: enabled && !!threadId,
    refetchInterval: (query) => {
      // Poll every 500ms while pending, stop when success/error/unknown
      const status = query.state.data?.status;
      return status === "pending" ? 500 : false;
    },
    staleTime: 0, // Always fetch fresh status
  });

  // Handle status changes
  useEffect(() => {
    if (!saveStatus || saveStatus.status === previousStatus.current) {
      return;
    }

    const { status, error } = saveStatus;
    previousStatus.current = status;

    if (status === "success") {
      // Invalidate messages cache to trigger refetch with confirmed data
      if (threadId) {
        queryClient.invalidateQueries({
          queryKey: ["messages", threadId],
        });
      }
      onSuccess?.();
    } else if (status === "error") {
      // Show error notification
      onError?.(error ?? "Failed to save message");
    }
  }, [saveStatus, threadId, queryClient, onSuccess, onError]);

  return { saveStatus };
}
```

### Step 2: Format code

Run: `bun run fmt`

Expected: All files formatted

### Step 3: Run type check

Run: `bun run check`

Expected: No TypeScript errors

### Step 4: Commit

```bash
git add apps/mesh/src/web/components/chat/hooks/
git commit -m "feat(chat): add save status polling hook

- Create useSaveStatus hook for polling save status
- Auto-invalidate cache on successful save
- Call onError callback on save failure
- Poll every 500ms while pending, stop when complete

Fixes: main-99k (part 4/7)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Integrate Save Status Hook in Chat Context

**Files:**
- Modify: `apps/mesh/src/web/components/chat/context.tsx:580-615`
- Read: `apps/mesh/src/web/components/chat/context.tsx` (full file to understand structure)

### Step 1: Read full chat context file

Run: `bun run read apps/mesh/src/web/components/chat/context.tsx`

Expected: See full context structure, useChat usage, and onFinish implementation

### Step 2: Add save status hook to chat context

Modify `apps/mesh/src/web/components/chat/context.tsx`:

Add import at top:
```typescript
import { useSaveStatus } from "./hooks/use-save-status";
import { useState } from "react";
```

Inside the ChatProvider component, add state and hook:
```typescript
// Track when to poll save status
const [pollSaveStatus, setPollSaveStatus] = useState(false);

// Poll save status after onFinish completes
useSaveStatus({
  threadId: thread?.thread_id,
  enabled: pollSaveStatus,
  onSuccess: () => {
    // Save completed successfully, cache invalidated
    setPollSaveStatus(false);
    console.log("[chat] Message save confirmed, cache invalidated");
  },
  onError: (error) => {
    // Save failed, show error to user
    setPollSaveStatus(false);
    console.error("[chat] Message save failed:", error);
    // TODO: Show toast notification with error
    alert(`Failed to save message: ${error}`);
  },
});
```

### Step 3: Update onFinish to trigger polling

In the same file, find the `onFinish` callback (around line 580-615) and modify:

Before:
```typescript
onFinish: async ({ message, messages }) => {
  // ... existing code ...
  threadManager.updateMessagesCache(thread_id, messages);
}
```

After:
```typescript
onFinish: async ({ message, messages }) => {
  // ... existing code ...

  // DON'T update cache immediately - wait for save confirmation
  // threadManager.updateMessagesCache(thread_id, messages);

  // Instead, trigger save status polling
  setPollSaveStatus(true);

  // Cache will be invalidated and refetched when save succeeds
  // via useSaveStatus hook
}
```

### Step 4: Format code

Run: `bun run fmt`

Expected: All files formatted

### Step 5: Run type check

Run: `bun run check`

Expected: No TypeScript errors

### Step 6: Commit

```bash
git add apps/mesh/src/web/components/chat/context.tsx
git commit -m "feat(chat): integrate save status polling in chat context

- Add useSaveStatus hook to ChatProvider
- Trigger polling after onFinish completes
- Remove immediate cache update (wait for save confirmation)
- Invalidate cache only after successful save
- Show error alert on save failure

Fixes: main-99k (part 5/7)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Reduce Stale Time for Messages Cache

**Files:**
- Read: `apps/mesh/src/web/components/chat/thread/types.ts:8`
- Modify: `apps/mesh/src/web/components/chat/thread/cache-operations.ts`
- Modify: `apps/mesh/src/web/components/chat/thread/types.ts`

### Step 1: Read current stale time configuration

Run: `bun run read apps/mesh/src/web/components/chat/thread/types.ts --lines=1-20`

Expected: See current stale time constant (probably 30 seconds)

### Step 2: Reduce stale time constant

Modify `apps/mesh/src/web/components/chat/thread/types.ts`:

Before:
```typescript
export const MESSAGES_STALE_TIME = 30_000; // 30 seconds
```

After:
```typescript
export const MESSAGES_STALE_TIME = 5_000; // 5 seconds - reduced for cache consistency
```

### Step 3: Add refetchOnMount option

Modify `apps/mesh/src/web/components/chat/thread/cache-operations.ts`:

Find the messages query configuration and add:
```typescript
refetchOnMount: true, // Always refetch on mount to ensure fresh data
refetchOnWindowFocus: true, // Refetch when window regains focus
```

### Step 4: Format code

Run: `bun run fmt`

Expected: All files formatted

### Step 5: Run type check

Run: `bun run check`

Expected: No TypeScript errors

### Step 6: Commit

```bash
git add apps/mesh/src/web/components/chat/thread/
git commit -m "feat(chat): reduce stale time and add refetch options

- Reduce MESSAGES_STALE_TIME from 30s to 5s
- Add refetchOnMount: true to ensure fresh data
- Add refetchOnWindowFocus: true for better UX
- Improve cache consistency with database

Fixes: main-99k (part 6/7)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Add Message Transformation Alignment

**Files:**
- Read: `apps/mesh/src/api/routes/decopilot/routes.ts:329-342` (server transformations)
- Modify: `apps/mesh/src/web/components/chat/context.tsx` (ensure client expects transformed data)

### Step 1: Read server message transformation

Run: `bun run read apps/mesh/src/api/routes/decopilot/routes.ts --lines=329-342`

Expected: See message transformation with ID generation, timestamps, metadata

### Step 2: Verify client handles transformed messages

Run: `bun run read apps/mesh/src/web/components/chat/context.tsx --lines=1-100`

Expected: See how messages are structured and typed

### Step 3: Add comment documenting transformation contract

Modify `apps/mesh/src/api/routes/decopilot/routes.ts`, add comment before transformation:

```typescript
/**
 * Transform messages before saving to database
 *
 * IMPORTANT: These transformations are applied server-side before save.
 * The client cache should NEVER be updated with untransformed messages.
 * Instead, the client should invalidate cache and refetch after save
 * to receive the properly transformed messages.
 *
 * Transformations:
 * - Generate IDs for messages without IDs
 * - Add/update metadata (title)
 * - Ensure consistent timestamp format
 * - Normalize message structure
 */
const messagesToSave = deduped.map((message, i) => ({
  // ... existing transformation code ...
}));
```

### Step 4: Add type assertion for message structure

In the same file, after the transformation, add:

```typescript
// Verify messages have required fields after transformation
for (const msg of messagesToSave) {
  if (!msg.id || !msg.createdAt) {
    throw new MessageSaveError(
      `Invalid message structure: missing id or createdAt`,
    );
  }
}
```

### Step 5: Format code

Run: `bun run fmt`

Expected: All files formatted

### Step 6: Run type check

Run: `bun run check`

Expected: No TypeScript errors

### Step 7: Commit

```bash
git add apps/mesh/src/api/routes/decopilot/routes.ts
git commit -m "docs(decopilot): document message transformation contract

- Add comments explaining server-side transformations
- Document why client must refetch after save
- Add validation for transformed message structure
- Ensure message consistency between cache and database

Fixes: main-99k (part 7/7)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Final Validation & Manual Testing

**Files:**
- All previously modified files

### Step 1: Run full test suite

Run: `bun test`

Expected: All tests pass

### Step 2: Run type checking

Run: `bun run check`

Expected: No TypeScript errors

### Step 3: Run linting

Run: `bun run lint`

Expected: No linting errors

### Step 4: Format all code

Run: `bun run fmt`

Expected: All files formatted consistently

### Step 5: Build mesh client

Run: `bun run --cwd=apps/mesh build:client`

Expected: Client builds successfully

### Step 6: Build mesh server

Run: `bun run --cwd=apps/mesh build:server`

Expected: Server builds successfully

### Step 7: Manual smoke test

1. Start dev environment: `bun run dev`
2. Open decopilot chat UI
3. Send a message
4. Open browser DevTools network tab
5. Verify save status polling happens
6. Check console for "[chat] Message save confirmed"
7. Refresh page
8. Verify message persists (no data loss)
9. Simulate database error (if possible)
10. Verify error alert appears
11. Verify message doesn't disappear without warning

Expected: Full flow works without data loss

### Step 8: Update bead task status

Run: `bd label add main-99k fixed`

Expected: Task marked as fixed in beads

### Step 9: Create final commit if needed

If any fixes were made during validation:

```bash
git add .
git commit -m "chore(decopilot): final validation and cleanup for cache consistency

- Ensure all tests pass
- Fix any type errors
- Apply consistent formatting
- Verify manual testing scenarios

Fixes: main-99k (final)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary

This plan fixes the cache/database inconsistency issues by:

✅ **Error Propagation (Priority 1)**
- Added MessageSaveError and formatErrorForClient
- Server now tracks save status (pending/success/error)
- Errors propagated to client via polling endpoint
- User notifications on save failure

✅ **Wait for Save Before Cache Update (Priority 2)**
- Client no longer updates cache immediately
- useSaveStatus hook polls save status endpoint
- Cache invalidated only after successful save
- Fresh data fetched from database after save

✅ **Reduce Stale Time (Priority 3)**
- Reduced MESSAGES_STALE_TIME from 30s to 5s
- Added refetchOnMount and refetchOnWindowFocus
- Improved cache consistency with database

✅ **Message Transformation Alignment**
- Documented transformation contract
- Added validation for transformed messages
- Ensured client receives properly transformed data

**Architecture Flow:**
1. User sends message → streams to UI
2. Server onFinish saves to database
3. Server updates saveStatusMap (pending → success/error)
4. Client onFinish triggers useSaveStatus polling
5. useSaveStatus polls /save-status endpoint every 500ms
6. On success: invalidate cache → refetch fresh data
7. On error: show alert → don't update cache

**Impact:**
- ❌ No more data loss from silent failures
- ❌ No more stale UI from cache mismatches
- ❌ No more structural divergence between cache and database
- ✅ Users see error notifications for failures
- ✅ Cache always consistent with database
- ✅ Messages persist across refresh

**Files Modified:**
- `apps/mesh/src/api/routes/decopilot/errors.ts` (new)
- `apps/mesh/src/api/routes/decopilot/routes.ts` (save status tracking)
- `apps/mesh/src/web/components/chat/hooks/use-save-status.ts` (new)
- `apps/mesh/src/web/components/chat/context.tsx` (integrate polling)
- `apps/mesh/src/web/components/chat/thread/types.ts` (reduce stale time)
- `apps/mesh/src/web/components/chat/thread/cache-operations.ts` (refetch options)

**Next Steps:**
- Implement actual E2E tests (currently stubs)
- Add toast notifications instead of alerts
- Consider WebSocket for real-time save status (instead of polling)
- Add retry mechanism for failed saves
- Add metrics/telemetry for save success rate

**Related Issues:**
- main-k0v: (EPIC) user_ask built-in tool (parent epic)
