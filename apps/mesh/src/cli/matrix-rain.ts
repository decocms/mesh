/**
 * Matrix-style falling characters effect.
 * External store so components subscribe via useSyncExternalStore.
 */

// Half-width katakana + digits + latin — all single-column in the terminal
const MATRIX_CHARS =
  "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const COLUMN_COUNT = 45;
const ROW_COUNT = 11;

// Green gradient from bright (head) to dark (tail)
const TRAIL_COLORS = [
  "#00ff64", // head
  "#00ee5e",
  "#00dc56",
  "#00c84e",
  "#00b444",
  "#00a03c",
  "#008832",
  "#006e28",
  "#005020",
  "#003818",
  "#002010",
];

interface Column {
  head: number; // current head row position
  speed: number; // rows per tick (can be fractional via accumulator)
  accum: number; // fractional accumulator
  chars: string[]; // character per row
  active: boolean;
}

export interface MatrixCell {
  char: string;
  color: string | null;
}

let columns: Column[] = [];
let grid: MatrixCell[][] = [];
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function randChar(): string {
  return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]!;
}

function initColumns() {
  columns = Array.from({ length: COLUMN_COUNT }, () => ({
    head: Math.floor(Math.random() * ROW_COUNT) - ROW_COUNT,
    speed: 0.3 + Math.random() * 0.7,
    accum: 0,
    chars: Array.from({ length: ROW_COUNT }, () => randChar()),
    active: Math.random() > 0.3,
  }));
}

function tick() {
  for (const col of columns) {
    if (!col.active) {
      // Random chance to reactivate
      if (Math.random() < 0.05) {
        col.active = true;
        col.head = -1;
        col.speed = 0.3 + Math.random() * 0.7;
        col.chars = Array.from({ length: ROW_COUNT }, () => randChar());
      }
      continue;
    }

    col.accum += col.speed;
    while (col.accum >= 1) {
      col.accum -= 1;
      col.head += 1;
    }

    // Randomly change the head character for shimmer effect
    if (Math.random() < 0.3) {
      const headRow = Math.floor(col.head);
      if (headRow >= 0 && headRow < ROW_COUNT) {
        col.chars[headRow] = randChar();
      }
    }

    // Deactivate if fully scrolled off
    if (col.head - TRAIL_COLORS.length > ROW_COUNT) {
      col.active = false;
    }
  }

  // Build grid
  grid = Array.from({ length: ROW_COUNT }, (_, row) => {
    return columns.map((col) => {
      if (!col.active) return { char: " ", color: null };
      const headRow = Math.floor(col.head);
      const dist = headRow - row;
      if (dist < 0 || dist >= TRAIL_COLORS.length) {
        return { char: " ", color: null };
      }
      return { char: col.chars[row]!, color: TRAIL_COLORS[dist]! };
    });
  });

  emit();
}

export function getMatrixGrid(): MatrixCell[][] {
  return grid;
}

export function subscribeMatrixGrid(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startMatrixRain(): void {
  if (timer !== null) return;
  initColumns();
  tick(); // initial state
  timer = setInterval(tick, 100); // 10 FPS, matching capy animation
}

export function stopMatrixRain(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  grid = [];
  emit();
}
