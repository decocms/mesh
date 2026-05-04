export type TaskStatus = "running" | "done" | "failed";

export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  startedAt: number;
  doneAt: number | null;
  error?: string;
}

export interface TaskManagerDeps {
  onChange?: (tasks: Task[]) => void;
}

/**
 * Lightweight in-memory task registry. Tracks named setup phases (clone,
 * install, transition) and ad-hoc jobs so the LLM and the SSE stream have
 * a structured view of "what is the daemon doing right now."
 *
 * Not persisted — resets on each daemon boot.
 */
export class TaskManager {
  private readonly all: Task[] = [];
  private idCounter = 0;
  private readonly deps: TaskManagerDeps;

  constructor(deps: TaskManagerDeps = {}) {
    this.deps = deps;
  }

  begin(name: string): string {
    const id = `task${++this.idCounter}`;
    this.all.push({
      id,
      name,
      status: "running",
      startedAt: Date.now(),
      doneAt: null,
    });
    this.emit();
    return id;
  }

  done(id: string): void {
    const t = this.findRunning(id);
    if (!t) return;
    t.status = "done";
    t.doneAt = Date.now();
    this.emit();
  }

  fail(id: string, error?: string): void {
    const t = this.findRunning(id);
    if (!t) return;
    t.status = "failed";
    t.doneAt = Date.now();
    if (error) t.error = error;
    this.emit();
  }

  list(filter?: { status?: ReadonlyArray<TaskStatus> }): Task[] {
    if (!filter?.status) return this.all.slice();
    return this.all.filter((t) => filter.status!.includes(t.status));
  }

  /** Running tasks + last `maxFinished` completed/failed tasks. */
  recent(maxFinished = 20): Task[] {
    const running = this.all.filter((t) => t.status === "running");
    const finished = this.all
      .filter((t) => t.status !== "running")
      .slice(-maxFinished);
    return [...running, ...finished];
  }

  private findRunning(id: string): Task | undefined {
    return this.all.find((t) => t.id === id && t.status === "running");
  }

  private emit(): void {
    this.deps.onChange?.(this.all.slice());
  }
}
