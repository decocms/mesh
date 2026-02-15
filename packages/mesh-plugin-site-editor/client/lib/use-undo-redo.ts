/**
 * useUndoRedo Hook
 *
 * Generic snapshot-based undo/redo state manager using useReducer
 * for atomic transitions between past/present/future stacks.
 *
 * - push(next): Records current as past, sets next as present, clears future
 * - undo(): Moves present to future, restores last past entry
 * - redo(): Moves present to past, restores first future entry
 * - reset(value): Replaces all state with a new initial value
 * - clearFuture(): Clears redo stack (used after save to prevent divergence)
 *
 * Past stack is capped at 100 entries to prevent unbounded memory growth.
 */

import { useReducer } from "react";

const MAX_PAST_SIZE = 100;

type Action<T> =
  | { type: "PUSH"; value: T }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET"; value: T }
  | { type: "CLEAR_FUTURE" };

interface State<T> {
  past: T[];
  present: T;
  future: T[];
}

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case "PUSH": {
      const newPast = [...state.past, state.present];
      // Cap past stack at MAX_PAST_SIZE, dropping oldest entries
      if (newPast.length > MAX_PAST_SIZE) {
        newPast.splice(0, newPast.length - MAX_PAST_SIZE);
      }
      return {
        past: newPast,
        present: action.value,
        future: [],
      };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      };
    }
    case "RESET":
      return { past: [], present: action.value, future: [] };
    case "CLEAR_FUTURE":
      return state.future.length === 0 ? state : { ...state, future: [] };
  }
}

export interface UseUndoRedoResult<T> {
  /** Current value */
  value: T;
  /** Push a new state snapshot (clears redo stack) */
  push: (next: T) => void;
  /** Revert to previous state */
  undo: () => void;
  /** Re-apply a previously undone state */
  redo: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Reset to a new initial value (clears both stacks) */
  reset: (newInitial: T) => void;
  /** Clear redo stack only (used after save to prevent divergence) */
  clearFuture: () => void;
}

export function useUndoRedo<T>(initial: T): UseUndoRedoResult<T> {
  const [state, dispatch] = useReducer(reducer<T>, {
    past: [],
    present: initial,
    future: [],
  });

  const push = (next: T) => dispatch({ type: "PUSH", value: next });
  const undo = () => dispatch({ type: "UNDO" });
  const redo = () => dispatch({ type: "REDO" });
  const reset = (newInitial: T) =>
    dispatch({ type: "RESET", value: newInitial });
  const clearFuture = () => dispatch({ type: "CLEAR_FUTURE" });

  return {
    value: state.present as T,
    push,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
    clearFuture,
  };
}
