/**
 * Event Handler Routing Tests
 *
 * Tests that handleWorkflowEvents correctly routes events to orchestrator functions.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Kysely } from "kysely";
import type { WorkflowDatabase } from "../../storage/types";
import { WorkflowExecutionStorage } from "../../storage/workflow-execution";
import { handleWorkflowEvents } from "../../events/handler";
import {
  createTestDb,
  createMockOrchestratorContext,
  makeCodeStep,
  TEST_ORG_ID,
  TEST_VIRTUAL_MCP_ID,
} from "../../__tests__/test-helpers";

// ============================================================================
// Setup
// ============================================================================

let db: Kysely<WorkflowDatabase>;
let storage: WorkflowExecutionStorage;

beforeEach(async () => {
  db = await createTestDb();
  storage = new WorkflowExecutionStorage(db);
});

afterEach(async () => {
  await db.destroy();
});

// ============================================================================
// Tests
// ============================================================================

describe("handleWorkflowEvents", () => {
  it("routes workflow.execution.created to handleExecutionCreated", async () => {
    const ctx = createMockOrchestratorContext(storage);

    // Create an execution to process
    const { id } = await storage.createExecution({
      organizationId: TEST_ORG_ID,
      virtualMcpId: TEST_VIRTUAL_MCP_ID,
      steps: [
        makeCodeStep(
          "step1",
          "export default function(input) { return { result: 'ok' }; }",
        ),
      ],
    });

    // Fire the event and await completion
    await handleWorkflowEvents(
      [
        {
          type: "workflow.execution.created",
          subject: id,
          id: "evt_1",
        },
      ],
      ctx,
    );

    // Execution should be claimed (running)
    const execution = await storage.getExecution(id, TEST_ORG_ID);
    expect(execution!.status).toBe("running");
  });

  it("routes workflow.step.execute to handleStepExecute", async () => {
    const ctx = createMockOrchestratorContext(storage);

    // Create and claim an execution
    const { id } = await storage.createExecution({
      organizationId: TEST_ORG_ID,
      virtualMcpId: TEST_VIRTUAL_MCP_ID,
      steps: [
        makeCodeStep(
          "step1",
          "export default function(input) { return input; }",
        ),
      ],
    });
    await storage.claimExecution(id);

    // Fire step execute notification (no input in event — handler resolves from DB)
    await handleWorkflowEvents(
      [
        {
          type: "workflow.step.execute",
          subject: id,
          data: {
            stepName: "step1",
          },
          id: "evt_2",
        },
      ],
      ctx,
    );

    // Step should have been claimed and a step.completed event published
    const stepResult = await storage.getStepResult(id, "step1");
    expect(stepResult).not.toBeNull();
    expect(stepResult!.started_at_epoch_ms).not.toBeNull();
  });

  it("routes workflow.step.completed to handleStepCompleted", async () => {
    const ctx = createMockOrchestratorContext(storage);

    // Create and claim an execution
    const { id } = await storage.createExecution({
      organizationId: TEST_ORG_ID,
      virtualMcpId: TEST_VIRTUAL_MCP_ID,
      steps: [
        makeCodeStep(
          "step1",
          "export default function(input) { return input; }",
        ),
      ],
    });
    await storage.claimExecution(id);

    // Pre-create step result and persist output (simulating handleStepExecute)
    await storage.createStepResult({
      execution_id: id,
      step_id: "step1",
    });
    await storage.updateStepResult(id, "step1", {
      output: { result: "done" },
      completed_at_epoch_ms: Date.now(),
    });

    // Fire step completed notification (no output/error in event data)
    await handleWorkflowEvents(
      [
        {
          type: "workflow.step.completed",
          subject: id,
          data: {
            stepName: "step1",
          },
          id: "evt_3",
        },
      ],
      ctx,
    );

    // Step result should already have output (persisted before event)
    const stepResult = await storage.getStepResult(id, "step1");
    expect(stepResult).not.toBeNull();
    expect(stepResult!.completed_at_epoch_ms).not.toBeNull();
    expect(stepResult!.output).toEqual({ result: "done" });
  });

  it("skips events without subject", async () => {
    const ctx = createMockOrchestratorContext(storage);

    // Fire event without subject -- should be silently skipped
    await handleWorkflowEvents(
      [
        {
          type: "workflow.execution.created",
          subject: undefined as unknown as string,
          id: "evt_4",
        },
      ],
      ctx,
    );

    // No events should have been published
    expect(ctx.capturedEvents).toHaveLength(0);
  });

  it("skips workflow.step.execute without stepName in data", async () => {
    const ctx = createMockOrchestratorContext(storage);

    await handleWorkflowEvents(
      [
        {
          type: "workflow.step.execute",
          subject: "some_execution_id",
          data: {}, // Missing stepName
          id: "evt_5",
        },
      ],
      ctx,
    );

    // No step results should have been created
    expect(ctx.capturedEvents).toHaveLength(0);
  });

  it("handler errors don't affect other events in the batch", async () => {
    const ctx = createMockOrchestratorContext(storage);

    // Create a valid execution
    const { id } = await storage.createExecution({
      organizationId: TEST_ORG_ID,
      virtualMcpId: TEST_VIRTUAL_MCP_ID,
      steps: [
        makeCodeStep(
          "step1",
          "export default function(input) { return input; }",
        ),
      ],
    });

    // Batch: first event has invalid subject, second is valid
    await handleWorkflowEvents(
      [
        {
          type: "workflow.execution.created",
          subject: "non_existent_execution",
          id: "evt_6",
        },
        {
          type: "workflow.execution.created",
          subject: id,
          id: "evt_7",
        },
      ],
      ctx,
    );

    // The valid execution should still be claimed
    const execution = await storage.getExecution(id, TEST_ORG_ID);
    expect(execution!.status).toBe("running");
  });

  it("on handleStepExecute failure, publishes workflow.step.completed with error", async () => {
    const ctx = createMockOrchestratorContext(storage);

    // Create and claim an execution with a step that will fail
    const { id } = await storage.createExecution({
      organizationId: TEST_ORG_ID,
      virtualMcpId: TEST_VIRTUAL_MCP_ID,
      steps: [makeCodeStep("failStep", "this is not valid code!!!")],
    });
    await storage.claimExecution(id);

    // Fire step execute event and await completion
    await handleWorkflowEvents(
      [
        {
          type: "workflow.step.execute",
          subject: id,
          data: {
            stepName: "failStep",
          },
          id: "evt_8",
        },
      ],
      ctx,
    );

    // A step.completed event with error should have been published
    // (either from the handler's catch or from the code execution itself)
    const stepResult = await storage.getStepResult(id, "failStep");
    // The step was claimed
    expect(stepResult).not.toBeNull();

    // Check that a step.completed event was published (from the orchestrator)
    const completedEvents = ctx.capturedEvents.filter(
      (e) => e.type === "workflow.step.completed",
    );
    expect(completedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("returned promise resolves only after all handlers complete", async () => {
    const ctx = createMockOrchestratorContext(storage);

    // Create two executions
    const { id: id1 } = await storage.createExecution({
      organizationId: TEST_ORG_ID,
      virtualMcpId: TEST_VIRTUAL_MCP_ID,
      steps: [
        makeCodeStep(
          "step1",
          "export default function(input) { return { result: 'ok' }; }",
        ),
      ],
    });
    const { id: id2 } = await storage.createExecution({
      organizationId: TEST_ORG_ID,
      virtualMcpId: TEST_VIRTUAL_MCP_ID,
      steps: [
        makeCodeStep(
          "step1",
          "export default function(input) { return { result: 'ok' }; }",
        ),
      ],
    });

    // Fire both events in a single batch and await the returned promise
    await handleWorkflowEvents(
      [
        {
          type: "workflow.execution.created",
          subject: id1,
          id: "evt_9",
        },
        {
          type: "workflow.execution.created",
          subject: id2,
          id: "evt_10",
        },
      ],
      ctx,
    );

    // After the promise resolves, both executions should be claimed
    const execution1 = await storage.getExecution(id1, TEST_ORG_ID);
    const execution2 = await storage.getExecution(id2, TEST_ORG_ID);
    expect(execution1!.status).toBe("running");
    expect(execution2!.status).toBe("running");
  });
});
