# Fix Tool Output Deduplication Bug Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical bug where user_ask tool outputs are discarded during message deduplication, causing user responses to never persist.

**Architecture:** Modify the onFinish message deduplication logic to merge tool outputs from requestLast into responseMessage before deduplication, preserving client-side tool results while maintaining the full streamed content.

**Tech Stack:** TypeScript, Bun test runner, AI SDK v6.0.1

**Issue:** main-cf5

---

## Background

When a user responds to a user_ask tool call:
1. Client calls `addToolOutput` to add user's response
2. AI SDK auto-sends updated message (with tool output)
3. AI SDK reuses assistant message ID in persistence mode
4. **BUG**: Server deduplication keeps `responseMessage` (new response) and discards `requestLast` (has tool output)
5. Result: Tool outputs permanently lost

**Files Involved:**
- `apps/mesh/src/api/routes/decopilot/routes.ts` (main fix)

---

## Task 1: Implement Tool Output Merge Logic

**Files:**
- Modify: `apps/mesh/src/api/routes/decopilot/routes.ts:299-323`

**Step 1: Add merge logic before deduplication**

Replace lines 309-323 with:

```typescript
        const rawMessages = [requestLast, responseMessage].filter(Boolean);

        // Merge tool outputs from requestLast into responseMessage if IDs match
        // This preserves client-side tool results (e.g., user_ask responses)
        // while keeping the full streamed content from responseMessage
        if (
          requestLast?.id === responseMessage?.id &&
          requestLast?.role === "assistant" &&
          responseMessage?.role === "assistant"
        ) {
          // Extract tool output parts (state: output-available) from requestLast
          const toolOutputs = requestLast.parts.filter(
            (part): part is Extract<typeof part, { state: string }> =>
              "state" in part && part.state === "output-available",
          );

          if (toolOutputs.length > 0) {
            // Merge: tool outputs first, then new streamed content
            responseMessage.parts = [...toolOutputs, ...responseMessage.parts];
          }
        }

        // Deduplicate by id - avoid PostgreSQL "cannot affect row a second time" when
        // request echoes response (e.g. sendAutomaticallyWhen race).
        // After merge, responseMessage has both tool outputs AND streamed content.
        const seen = new Set<string>();
        const deduped = [...rawMessages]
          .reverse()
          .filter((m): m is ChatMessage => {
            if (!m) return false;
            const id = m.id?.trim() || "";
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          })
          .reverse();
```

**Step 2: Verify the change**

Check that:
- Lines before 309 remain unchanged
- Lines after 323 remain unchanged
- Only the deduplication section is modified

**Step 3: Save the file**

The change is complete. Proceed to next task.

---

## Task 2: Verify and Commit

**Files:**
- None (test verification and commit)

**Step 1: Run type checking**

Run: `bun run check`

Expected: No type errors

**Step 2: Run existing tests**

Run: `bun test apps/mesh/src/api/routes/decopilot/`

Expected: All existing tests pass

**Step 3: Run formatter**

Run: `bun run fmt`

Expected: Code formatted successfully

**Step 4: Run linter**

Run: `bun run lint`

Expected: No lint errors

**Step 5: Commit the fix**

```bash
git add apps/mesh/src/api/routes/decopilot/routes.ts
git commit -m "fix(decopilot): merge tool outputs before deduplication to preserve user_ask responses

Fixes main-cf5

When client adds tool output via addToolOutput and auto-sends, the AI SDK
reuses the assistant message ID. Previous deduplication logic kept
responseMessage and discarded requestLast (which had the tool output).

This fix merges tool outputs from requestLast into responseMessage before
deduplication, preserving client-side tool results while keeping the full
streamed content.
"
```

---

## Task 3: Manual Test and Close Issue

**Files:**
- None (manual testing and issue tracking)

**Step 1: Optional UI testing**

If you want to verify in the UI:
1. Run: `bun run dev`
2. Open chat interface
3. Send message: "Ask me a question"
4. Verify: AI responds with user_ask tool call
5. Provide response in UI
6. Verify: AI acknowledges your response
7. Refresh page and verify conversation history persists

**Step 2: Close issue**

Run: `bd close main-cf5`

Expected: Issue marked as closed

**Step 3: Push changes**

Run: `git push`

Expected: Changes pushed to remote branch

---

## Success Criteria

- [x] Fix implemented (merge tool outputs before deduplication)
- [ ] Type checking passes
- [ ] Existing tests pass
- [ ] Code formatted and linted
- [ ] Changes committed
- [ ] Issue main-cf5 closed

## Rollback Plan

If issues arise:
1. Revert commit: `git revert HEAD`
2. The merge logic is isolated and can be safely removed
3. Previous behavior: deduplication still works, just loses tool outputs

## Notes

- This fix only affects messages with matching IDs (AI SDK persistence mode)
- Non-matching IDs continue to work as before
- Tool outputs are placed BEFORE new content in parts array
- Only `output-available` state tool calls are merged (not `input-available`)
- No tests were written per user request (fast fix approach)
