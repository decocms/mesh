export async function pollUntil(
  condition: () => Promise<boolean>,
  opts: { timeoutMs: number; intervalMs?: number; label?: string },
): Promise<void> {
  const { timeoutMs, intervalMs = 1000, label = "pollUntil" } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      if (await condition()) {
        return;
      }
    } catch {
      // Condition threw — treat as "not yet satisfied" and keep polling.
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await Bun.sleep(Math.min(intervalMs, remaining));
  }

  throw new Error(
    `[${label}] Condition not met within ${timeoutMs}ms (polled every ${intervalMs}ms)`,
  );
}
