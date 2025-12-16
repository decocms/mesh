/**
 * Notify Strategy Interface
 *
 * Abstraction for how to notify the event bus worker that new events are available.
 * This allows different notification mechanisms:
 * - PostgreSQL: LISTEN/NOTIFY
 * - Redis: Pub/Sub (future)
 * - NATS: Subscribe (future)
 *
 * If no strategy is provided, the worker falls back to polling.
 */

/**
 * NotifyStrategy allows the event bus to wake up the worker immediately
 * when new events are published, instead of waiting for the next poll interval.
 */
export interface NotifyStrategy {
  /**
   * Start listening for notifications.
   * When a notification is received, call onNotify to wake up the worker.
   */
  start(onNotify: () => void): Promise<void>;

  /**
   * Stop listening for notifications.
   */
  stop(): Promise<void>;

  /**
   * Send a notification that new events are available.
   * Called after publishing an event to wake up workers immediately.
   *
   * @param eventId - The ID of the newly published event (for debugging/logging)
   */
  notify(eventId: string): Promise<void>;
}
