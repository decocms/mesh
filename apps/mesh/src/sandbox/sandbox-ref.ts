/**
 * Mint a `sandbox_ref` for a new thread.
 *
 * Pod-per-thread: every thread gets its own container, keyed off a random
 * UUID. No sharing across threads — the `(userId, sandbox_ref)` tuple is
 * unique per thread.
 *
 * Deterministic seeding is unnecessary: VM_START / createMemory races on
 * the same thread row converge via the DB's primary key, not via a
 * deterministic ref formula.
 */
export function mintSandboxRef(): string {
  return crypto.randomUUID();
}
