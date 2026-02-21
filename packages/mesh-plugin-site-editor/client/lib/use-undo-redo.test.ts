import { describe, test, expect } from "bun:test";
// Import will fail until use-undo-redo.ts exists with this export
import {
  undoRedoReducer,
  type UndoRedoState,
  type UndoRedoAction,
} from "./use-undo-redo";

describe("undoRedoReducer", () => {
  function initial<T>(value: T): UndoRedoState<T> {
    return { past: [], present: value, future: [] };
  }

  test("PUSH adds to past, clears future, sets present", () => {
    const s0 = initial(0);
    const s1 = undoRedoReducer(s0, { type: "PUSH", payload: 1 });
    expect(s1.present).toBe(1);
    expect(s1.past).toEqual([0]);
    expect(s1.future).toEqual([]);
  });

  test("initial state has canUndo=false, canRedo=false", () => {
    const s = initial("hello");
    expect(s.past.length).toBe(0);
    expect(s.future.length).toBe(0);
  });

  test("UNDO moves present to future, last past to present", () => {
    let s = initial(0);
    s = undoRedoReducer(s, { type: "PUSH", payload: 1 });
    s = undoRedoReducer(s, { type: "PUSH", payload: 2 });
    s = undoRedoReducer(s, { type: "UNDO" });
    expect(s.present).toBe(1);
    expect(s.past).toEqual([0]);
    expect(s.future).toEqual([2]);
  });

  test("UNDO at initial state is a no-op", () => {
    const s = initial(42);
    const s2 = undoRedoReducer(s, { type: "UNDO" });
    expect(s2).toEqual(s);
  });

  test("REDO moves present to past, first future to present", () => {
    let s = initial(0);
    s = undoRedoReducer(s, { type: "PUSH", payload: 1 });
    s = undoRedoReducer(s, { type: "PUSH", payload: 2 });
    s = undoRedoReducer(s, { type: "UNDO" });
    s = undoRedoReducer(s, { type: "REDO" });
    expect(s.present).toBe(2);
    expect(s.future).toEqual([]);
  });

  test("REDO with empty future is a no-op", () => {
    const s = initial(42);
    const s2 = undoRedoReducer(s, { type: "REDO" });
    expect(s2).toEqual(s);
  });

  test("PUSH clears future (new branch)", () => {
    let s = initial(0);
    s = undoRedoReducer(s, { type: "PUSH", payload: 1 });
    s = undoRedoReducer(s, { type: "PUSH", payload: 2 });
    s = undoRedoReducer(s, { type: "UNDO" });
    s = undoRedoReducer(s, { type: "PUSH", payload: 99 });
    expect(s.future).toEqual([]);
    expect(s.present).toBe(99);
  });

  test("PUSH caps history at 100 entries", () => {
    let s = initial(0);
    for (let i = 1; i <= 101; i++) {
      s = undoRedoReducer(s, { type: "PUSH", payload: i });
    }
    // past should have at most 100 entries (present is the 101st value)
    expect(s.past.length).toBeLessThanOrEqual(100);
  });

  test("RESET clears all history", () => {
    let s = initial(0);
    s = undoRedoReducer(s, { type: "PUSH", payload: 1 });
    s = undoRedoReducer(s, { type: "PUSH", payload: 2 });
    s = undoRedoReducer(s, { type: "RESET", payload: 99 });
    expect(s.present).toBe(99);
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
  });
});
