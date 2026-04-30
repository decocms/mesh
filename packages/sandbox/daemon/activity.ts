let lastActivityAt = Date.now();

export function bumpActivity(now: number = Date.now()): void {
  lastActivityAt = now;
}

export function getIdleStatus(now: number = Date.now()): {
  lastActivityAt: string;
  idleMs: number;
} {
  return {
    lastActivityAt: new Date(lastActivityAt).toISOString(),
    idleMs: Math.max(0, now - lastActivityAt),
  };
}

export function __resetActivityForTests(now: number = Date.now()): void {
  lastActivityAt = now;
}
