/**
 * Workflow Event Handler
 *
 * Handles workflow-related events from the mesh event bus.
 * Each event is processed independently -- failures don't affect other events.
 * The returned promise resolves only after all handlers have settled,
 * ensuring the event bus doesn't ack events before processing completes.
 */

import {
  handleExecutionCreated,
  handleStepCompleted,
  handleStepExecute,
  type OrchestratorContext,
} from "../engine/orchestrator";

// ---------------------------------------------------------------------------
// Debug logger — lightweight, prefixed, with high-resolution timestamps
// ---------------------------------------------------------------------------

class WorkflowLog {
  private prefix: string;
  private t0: number;

  constructor(prefix: string) {
    this.prefix = prefix;
    this.t0 = performance.now();
  }

  private ts(): string {
    return `+${(performance.now() - this.t0).toFixed(1)}ms`;
  }

  info(msg: string, extra?: Record<string, unknown>): void {
    const parts = [`[${this.prefix}] ${this.ts()} ${msg}`];
    if (extra) parts.push(JSON.stringify(extra));
    console.log(parts.join(" "));
  }

  error(msg: string, err?: unknown): void {
    console.error(`[${this.prefix}] ${this.ts()} ${msg}`, err);
  }
}

export const WORKFLOW_EVENTS = [
  "workflow.execution.created",
  "workflow.execution.resumed",
  "workflow.step.execute",
  "workflow.step.completed",
] as const;

interface WorkflowEvent {
  type: string;
  data?: unknown;
  subject?: string;
  id: string;
}

/**
 * Internal implementation of workflow event handling.
 * Launches all handlers as fire-and-forget background tasks.
 *
 * IMPORTANT: This function does NOT await handler promises.
 * The background tasks run independently so the event bus worker can release its
 * processing lock immediately. If we awaited the handlers, the worker would
 * hold the lock for the entire duration of tool calls (~400ms+), causing
 * follow-up events (e.g. step.completed) published during execution to be
 * orphaned until the next poll interval (~5s).
 */
function fireWorkflowEventHandlers(
  events: WorkflowEvent[],
  ctx: OrchestratorContext,
): void {
  const log = new WorkflowLog("WF:fire");
  log.info(`received ${events.length} event(s)`, {
    types: events.map((e) => e.type),
  });

  for (const event of events) {
    if (!event.subject) continue;

    const subject = event.subject;
    const executionId = subject.slice(0, 8);
    const data = event.data as Record<string, unknown> | undefined;
    const iter =
      data?.iterationIndex !== undefined ? `[${data.iterationIndex}]` : "";

    switch (event.type) {
      case "workflow.execution.created":
      case "workflow.execution.resumed":
        log.info(`→ ${event.type} ${executionId}`);
        handleExecutionCreated(ctx, subject).catch((error: Error) => {
          log.error(`${event.type} FAILED ${executionId}`, error);
        });
        break;

      case "workflow.step.execute":
        if (data?.stepName) {
          log.info(`→ step.execute ${executionId}/${data.stepName}${iter}`);
          handleStepExecute(
            ctx,
            subject,
            data.stepName as string,
            data.iterationIndex as number | undefined,
          ).catch(async (error: Error) => {
            log.error(
              `step.execute FAILED ${executionId}/${data.stepName}${iter}`,
              error,
            );
            // Persist error to DB and publish notification so workflow doesn't get stuck
            const stepId =
              data.iterationIndex !== undefined
                ? `${data.stepName}[${data.iterationIndex}]`
                : (data.stepName as string);
            try {
              await ctx.storage.updateStepResult(subject, stepId, {
                error: error.message,
                completed_at_epoch_ms: Date.now(),
              });
              await ctx.publish("workflow.step.completed", subject, {
                stepName: data.stepName as string,
                iterationIndex: data.iterationIndex as number | undefined,
              });
            } catch (publishError) {
              log.error(
                `Failed to publish step.completed error event`,
                publishError,
              );
            }
          });
        }
        break;

      case "workflow.step.completed":
        if (data?.stepName) {
          log.info(`→ step.completed ${executionId}/${data.stepName}${iter}`);
          handleStepCompleted(
            ctx,
            subject,
            data.stepName as string,
            data.iterationIndex as number | undefined,
          ).catch((error: Error) => {
            log.error(
              `step.completed FAILED ${executionId}/${data.stepName}${iter}`,
              error,
            );
          });
        }
        break;
    }
  }
  log.info("fire-and-forget dispatch done (handlers running in background)");
}

/**
 * Handle a batch of workflow events for testing purposes.
 *
 * Returns a promise that resolves after all handlers have settled.
 * Tests can await this to verify handlers completed.
 * The event bus plugin uses fireWorkflowEventHandlers() directly
 * to avoid blocking the event bus worker.
 */
export async function handleWorkflowEvents(
  events: WorkflowEvent[],
  ctx: OrchestratorContext,
): Promise<void> {
  const promises: Promise<void>[] = [];

  for (const event of events) {
    if (!event.subject) continue;

    const executionId = event.subject;
    const data = event.data as Record<string, unknown> | undefined;

    switch (event.type) {
      case "workflow.execution.created":
      case "workflow.execution.resumed":
        promises.push(
          handleExecutionCreated(ctx, executionId).catch((error: Error) => {
            console.error(
              `[EVENT] ${event.type} failed for ${executionId}:`,
              error,
            );
          }),
        );
        break;

      case "workflow.step.execute":
        if (data?.stepName) {
          promises.push(
            handleStepExecute(
              ctx,
              executionId,
              data.stepName as string,
              data.iterationIndex as number | undefined,
            ).catch(async (error: Error) => {
              console.error(
                `[EVENT] workflow.step.execute failed for ${executionId}/${data.stepName}:`,
                error,
              );
              // Persist error to DB and publish notification so workflow doesn't get stuck
              const stepId =
                data.iterationIndex !== undefined
                  ? `${data.stepName}[${data.iterationIndex}]`
                  : (data.stepName as string);
              try {
                await ctx.storage.updateStepResult(executionId, stepId, {
                  error: error.message,
                  completed_at_epoch_ms: Date.now(),
                });
                await ctx.publish("workflow.step.completed", executionId, {
                  stepName: data.stepName as string,
                  iterationIndex: data.iterationIndex as number | undefined,
                });
              } catch (publishError) {
                console.error(
                  `[EVENT] Failed to publish step.completed error event:`,
                  publishError,
                );
              }
            }),
          );
        }
        break;

      case "workflow.step.completed":
        if (data?.stepName) {
          promises.push(
            handleStepCompleted(
              ctx,
              executionId,
              data.stepName as string,
              data.iterationIndex as number | undefined,
            ).catch((error: Error) => {
              console.error(
                `[EVENT] workflow.step.completed failed for ${executionId}/${data.stepName}:`,
                error,
              );
            }),
          );
        }
        break;
    }
  }

  await Promise.allSettled(promises);
}

/**
 * Export the fire-and-forget handler for use in the plugin event handler.
 */
export { fireWorkflowEventHandlers as handleWorkflowEventsFireAndForget };
