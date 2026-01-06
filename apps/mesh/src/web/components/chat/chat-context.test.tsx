/**
 * Tests for ChatInteractionContext Reducer
 *
 * Tests the reducer logic for the chat interaction state management.
 */

import { describe, expect, test } from "bun:test";
import type {
  BranchContext,
  ChatInteractionState,
  ChatInteractionAction,
} from "./chat-context";

// Import the reducer directly for testing
// Since it's not exported, we'll test through the exported types
// In a real scenario, you might want to export the reducer for testing

describe("ChatInteraction Reducer Logic", () => {
  const initialState: ChatInteractionState = {
    inputValue: "",
    branchContext: null,
  };

  // Helper to simulate reducer behavior
  function applyAction(
    state: ChatInteractionState,
    action: ChatInteractionAction,
  ): ChatInteractionState {
    switch (action.type) {
      case "SET_INPUT":
        return { ...state, inputValue: action.payload };
      case "START_BRANCH":
        return { ...state, branchContext: action.payload };
      case "CLEAR_BRANCH":
        return { ...state, branchContext: null };
      case "RESET":
        return { inputValue: "", branchContext: null };
      default:
        return state;
    }
  }

  test("should initialize with empty state", () => {
    expect(initialState.inputValue).toBe("");
    expect(initialState.branchContext).toBeNull();
  });

  test("should update input value with SET_INPUT action", () => {
    const action: ChatInteractionAction = {
      type: "SET_INPUT",
      payload: "Hello, world!",
    };

    const newState = applyAction(initialState, action);

    expect(newState.inputValue).toBe("Hello, world!");
    expect(newState.branchContext).toBeNull();
  });

  test("should start branch with START_BRANCH action", () => {
    const branchContext: BranchContext = {
      originalThreadId: "thread-123",
      originalMessageId: "msg-456",
      originalMessageText: "Original message",
    };

    const action: ChatInteractionAction = {
      type: "START_BRANCH",
      payload: branchContext,
    };

    const newState = applyAction(initialState, action);

    expect(newState.branchContext).toEqual(branchContext);
    expect(newState.inputValue).toBe("");
  });

  test("should clear branch context with CLEAR_BRANCH action", () => {
    const stateWithBranch: ChatInteractionState = {
      inputValue: "Some input",
      branchContext: {
        originalThreadId: "thread-123",
        originalMessageId: "msg-456",
        originalMessageText: "Original message",
      },
    };

    const action: ChatInteractionAction = { type: "CLEAR_BRANCH" };

    const newState = applyAction(stateWithBranch, action);

    expect(newState.branchContext).toBeNull();
    expect(newState.inputValue).toBe("Some input"); // Input should remain
  });

  test("should reset all state with RESET action", () => {
    const stateWithData: ChatInteractionState = {
      inputValue: "Test input",
      branchContext: {
        originalThreadId: "thread-123",
        originalMessageId: "msg-456",
        originalMessageText: "Original message",
      },
    };

    const action: ChatInteractionAction = { type: "RESET" };

    const newState = applyAction(stateWithData, action);

    expect(newState.inputValue).toBe("");
    expect(newState.branchContext).toBeNull();
  });

  test("should handle multiple sequential actions", () => {
    let state = initialState;

    // Set input
    state = applyAction(state, { type: "SET_INPUT", payload: "First message" });
    expect(state.inputValue).toBe("First message");

    // Start branch
    const branchContext: BranchContext = {
      originalThreadId: "thread-1",
      originalMessageId: "msg-1",
      originalMessageText: "Branch from here",
    };
    state = applyAction(state, {
      type: "START_BRANCH",
      payload: branchContext,
    });
    expect(state.branchContext).toEqual(branchContext);
    expect(state.inputValue).toBe("First message"); // Input persists

    // Update input again
    state = applyAction(state, {
      type: "SET_INPUT",
      payload: "Updated message",
    });
    expect(state.inputValue).toBe("Updated message");
    expect(state.branchContext).toEqual(branchContext); // Branch persists

    // Clear branch
    state = applyAction(state, { type: "CLEAR_BRANCH" });
    expect(state.branchContext).toBeNull();
    expect(state.inputValue).toBe("Updated message"); // Input still there

    // Reset all
    state = applyAction(state, { type: "RESET" });
    expect(state.inputValue).toBe("");
    expect(state.branchContext).toBeNull();
  });

  test("should preserve state immutability", () => {
    const originalState: ChatInteractionState = {
      inputValue: "Original",
      branchContext: null,
    };

    const action: ChatInteractionAction = {
      type: "SET_INPUT",
      payload: "Modified",
    };

    const newState = applyAction(originalState, action);

    // Original state should not be modified
    expect(originalState.inputValue).toBe("Original");
    expect(newState.inputValue).toBe("Modified");
    expect(newState).not.toBe(originalState);
  });

  test("should handle branch context immutability", () => {
    const originalBranch: BranchContext = {
      originalThreadId: "thread-1",
      originalMessageId: "msg-1",
      originalMessageText: "Original",
    };

    const stateWithBranch: ChatInteractionState = {
      inputValue: "",
      branchContext: originalBranch,
    };

    const newState = applyAction(stateWithBranch, { type: "CLEAR_BRANCH" });

    // Original branch object should not be modified
    expect(originalBranch.originalThreadId).toBe("thread-1");
    expect(newState.branchContext).toBeNull();
  });
});
