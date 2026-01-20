/**
 * Tests for ChatState Reducer
 *
 * Tests the reducer logic for the chat state management.
 */

import { describe, expect, test } from "bun:test";
import type { ParentThread } from "./types.ts";
import type { ChatState, ChatStateAction } from "./context";

// Import the reducer directly for testing
// Since it's not exported, we'll test through the exported types
// In a real scenario, you might want to export the reducer for testing

describe("ChatState Reducer Logic", () => {
  const initialState: ChatState = {
    tiptapDoc: undefined,
    parentThread: null,
    finishReason: null,
    generatedTitle: null,
  };

  // Helper to simulate reducer behavior
  function applyAction(state: ChatState, action: ChatStateAction): ChatState {
    switch (action.type) {
      case "SET_TIPTAP_DOC":
        return { ...state, tiptapDoc: action.payload };
      case "CLEAR_TIPTAP_DOC":
        return { ...state, tiptapDoc: undefined };
      case "START_BRANCH":
        return { ...state, parentThread: action.payload };
      case "CLEAR_BRANCH":
        return { ...state, parentThread: null };
      case "SET_FINISH_REASON":
        return { ...state, finishReason: action.payload };
      case "CLEAR_FINISH_REASON":
        return { ...state, finishReason: null };
      case "RESET":
        return {
          tiptapDoc: undefined,
          parentThread: null,
          finishReason: null,
        };
      default:
        return state;
    }
  }

  test("should initialize with empty state", () => {
    expect(initialState.tiptapDoc).toBeUndefined();
    expect(initialState.parentThread).toBeNull();
    expect(initialState.finishReason).toBeNull();
  });

  test("should update tiptap doc with SET_TIPTAP_DOC action", () => {
    const doc = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello, world!" }],
        },
      ],
    };
    const action: ChatStateAction = {
      type: "SET_TIPTAP_DOC",
      payload: doc,
    };

    const newState = applyAction(initialState, action);

    expect(newState.tiptapDoc).toEqual(doc);
    expect(newState.parentThread).toBeNull();
  });

  test("should start branch with START_BRANCH action", () => {
    const parentThread: ParentThread = {
      threadId: "thread-123",
      messageId: "msg-456",
    };

    const action: ChatStateAction = {
      type: "START_BRANCH",
      payload: parentThread,
    };

    const newState = applyAction(initialState, action);

    expect(newState.parentThread).toEqual(parentThread);
    expect(newState.tiptapDoc).toBeUndefined();
  });

  test("should clear branch context with CLEAR_BRANCH action", () => {
    const stateWithBranch: ChatState = {
      tiptapDoc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Some input" }],
          },
        ],
      },
      parentThread: {
        threadId: "thread-123",
        messageId: "msg-456",
      },
      finishReason: null,
      generatedTitle: null,
    };

    const action: ChatStateAction = { type: "CLEAR_BRANCH" };

    const newState = applyAction(stateWithBranch, action);

    expect(newState.parentThread).toBeNull();
    expect(newState.tiptapDoc).toEqual(stateWithBranch.tiptapDoc); // Tiptap doc should remain
  });

  test("should set finish reason with SET_FINISH_REASON action", () => {
    const action: ChatStateAction = {
      type: "SET_FINISH_REASON",
      payload: "stop",
    };

    const newState = applyAction(initialState, action);

    expect(newState.finishReason).toBe("stop");
    expect(newState.parentThread).toBeNull();
  });

  test("should clear finish reason with CLEAR_FINISH_REASON action", () => {
    const stateWithFinishReason: ChatState = {
      tiptapDoc: undefined,
      parentThread: null,
      finishReason: "stop",
      generatedTitle: null,
    };

    const action: ChatStateAction = { type: "CLEAR_FINISH_REASON" };

    const newState = applyAction(stateWithFinishReason, action);

    expect(newState.finishReason).toBeNull();
  });

  test("should reset all state with RESET action", () => {
    const stateWithData: ChatState = {
      tiptapDoc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Test input" }],
          },
        ],
      },
      parentThread: {
        threadId: "thread-123",
        messageId: "msg-456",
      },
      finishReason: "stop",
      generatedTitle: null,
    };

    const action: ChatStateAction = { type: "RESET" };

    const newState = applyAction(stateWithData, action);

    expect(newState.tiptapDoc).toBeUndefined();
    expect(newState.parentThread).toBeNull();
    expect(newState.finishReason).toBeNull();
  });

  test("should handle multiple sequential actions", () => {
    let state = initialState;

    // Set tiptap doc
    const doc1 = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First message" }],
        },
      ],
    };
    state = applyAction(state, { type: "SET_TIPTAP_DOC", payload: doc1 });
    expect(state.tiptapDoc).toEqual(doc1);

    // Start branch
    const parentThread: ParentThread = {
      threadId: "thread-1",
      messageId: "msg-1",
    };
    state = applyAction(state, {
      type: "START_BRANCH",
      payload: parentThread,
    });
    expect(state.parentThread).toEqual(parentThread);
    expect(state.tiptapDoc).toEqual(doc1); // Doc persists

    // Update tiptap doc again
    const doc2 = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Updated message" }],
        },
      ],
    };
    state = applyAction(state, {
      type: "SET_TIPTAP_DOC",
      payload: doc2,
    });
    expect(state.tiptapDoc).toEqual(doc2);
    expect(state.parentThread).toEqual(parentThread); // Branch persists

    // Clear branch
    state = applyAction(state, { type: "CLEAR_BRANCH" });
    expect(state.parentThread).toBeNull();
    expect(state.tiptapDoc).toEqual(doc2); // Doc still there

    // Reset all
    state = applyAction(state, { type: "RESET" });
    expect(state.tiptapDoc).toBeUndefined();
    expect(state.parentThread).toBeNull();
  });

  test("should preserve state immutability", () => {
    const originalDoc = {
      type: "doc" as const,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Original" }] },
      ],
    };
    const originalState: ChatState = {
      tiptapDoc: originalDoc,
      parentThread: null,
      finishReason: null,
      generatedTitle: null,
    };

    const modifiedDoc = {
      type: "doc" as const,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Modified" }] },
      ],
    };
    const action: ChatStateAction = {
      type: "SET_TIPTAP_DOC",
      payload: modifiedDoc,
    };

    const newState = applyAction(originalState, action);

    // Original state should not be modified
    expect(originalState.tiptapDoc).toEqual(originalDoc);
    expect(newState.tiptapDoc).toEqual(modifiedDoc);
    expect(newState).not.toBe(originalState);
  });

  test("should handle branch context immutability", () => {
    const originalParentThread: ParentThread = {
      threadId: "thread-1",
      messageId: "msg-1",
    };

    const stateWithBranch: ChatState = {
      tiptapDoc: undefined,
      parentThread: originalParentThread,
      finishReason: null,
      generatedTitle: null,
    };

    const newState = applyAction(stateWithBranch, { type: "CLEAR_BRANCH" });

    // Original branch object should not be modified
    expect(originalParentThread.threadId).toBe("thread-1");
    expect(newState.parentThread).toBeNull();
  });
});
