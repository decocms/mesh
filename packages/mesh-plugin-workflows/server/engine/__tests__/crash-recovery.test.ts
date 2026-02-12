/**
 * Crash Recovery Tests
 *
 * Tests the recoverStuckExecutions() flow that runs on server startup
 * to resume workflows that were interrupted by a crash/restart.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Kysely } from "kysely";
import type { WorkflowDatabase } from "../../storage/types";
import { WorkflowExecutionStorage } from "../../storage/workflow-execution";
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
// Helpers
// ============================================================================

const IDENTITY_CODE = "export default function(input) { return input; }";

async function startWorkflow(
  steps: Parameters<WorkflowExecutionStorage["createExecution"]>[0]["steps"],
  input?: Record<string, unknown>,
) {
  const { id } = await storage.createExecution({
    organizationId: TEST_ORG_ID,
    virtualMcpId: TEST_VIRTUAL_MCP_ID,
    steps,
    input: input ?? null,
  });
  return id;
}

// ============================================================================
// Tests
// ============================================================================

describe("Crash Recovery (recoverStuckExecutions)", () => {
  // --------------------------------------------------------------------------
  // Basic recovery
  // --------------------------------------------------------------------------

  describe("basic recovery", () => {
    it("recovers a running execution with no step results", async () => {
      const executionId = await startWorkflow([
        makeCodeStep("A", IDENTITY_CODE, {}),
      ]);

      // Simulate: execution was claimed (running) but crashed before any steps
      await storage.claimExecution(executionId);
      const execution = await storage.getExecution(executionId, TEST_ORG_ID);
      expect(execution!.status).toBe("running");

      // Recover
      const recovered = await storage.recoverStuckExecutions();
      expect(recovered).toHaveLength(1);
      expect(recovered[0].id).toBe(executionId);
      expect(recovered[0].organization_id).toBe(TEST_ORG_ID);

      // Execution should be back to enqueued
      const afterRecovery = await storage.getExecution(
        executionId,
        TEST_ORG_ID,
      );
      expect(afterRecovery!.status).toBe("enqueued");
    });

    it("recovered execution can be re-claimed and completed", async () => {
      const ctx = createMockOrchestratorContext(storage);

      const executionId = await startWorkflow([
        makeCodeStep("A", IDENTITY_CODE, {}),
        makeCodeStep("B", IDENTITY_CODE, { fromA: "@A" }),
      ]);

      // Simulate crash: claimed but no steps completed
      await storage.claimExecution(executionId);

      // Recover
      await storage.recoverStuckExecutions();

      // Re-publish and drain to completion
      await ctx.publish("workflow.execution.created", executionId);
      await ctx.drainEvents();

      const finalExecution = await storage.getExecution(
        executionId,
        TEST_ORG_ID,
      );
      expect(finalExecution!.status).toBe("success");
    });

    it("does not affect enqueued or completed executions", async () => {
      const enqueuedId = await startWorkflow([
        makeCodeStep("A", IDENTITY_CODE, {}),
      ]);

      const completedId = await startWorkflow([
        makeCodeStep("A", IDENTITY_CODE, {}),
      ]);
      await storage.claimExecution(completedId);
      await storage.updateExecution(completedId, {
        status: "success",
        completed_at_epoch_ms: Date.now(),
      });

      const recovered = await storage.recoverStuckExecutions();
      expect(recovered).toHaveLength(0);

      // Enqueued stays enqueued
      const enqueued = await storage.getExecution(enqueuedId, TEST_ORG_ID);
      expect(enqueued!.status).toBe("enqueued");

      // Completed stays completed
      const completed = await storage.getExecution(completedId, TEST_ORG_ID);
      expect(completed!.status).toBe("success");
    });
  });

  // --------------------------------------------------------------------------
  // Recovery with partial progress
  // --------------------------------------------------------------------------

  describe("recovery with partial progress", () => {
    it("preserves completed steps and clears stale claims", async () => {
      const ctx = createMockOrchestratorContext(storage);

      const executionId = await startWorkflow([
        makeCodeStep("A", IDENTITY_CODE, {}),
        makeCodeStep("B", IDENTITY_CODE, { fromA: "@A" }),
        makeCodeStep("C", IDENTITY_CODE, { fromB: "@B" }),
      ]);

      // Simulate: A completed, B claimed but crashed
      await storage.claimExecution(executionId);
      await storage.createStepResult({
        execution_id: executionId,
        step_id: "A",
        output: { result: "a" },
        completed_at_epoch_ms: Date.now(),
      });
      await storage.createStepResult({
        execution_id: executionId,
        step_id: "B",
        // No completed_at_epoch_ms -- stale claim
      });

      // Recover
      const recovered = await storage.recoverStuckExecutions();
      expect(recovered).toHaveLength(1);

      // Step A should still exist (completed)
      const stepA = await storage.getStepResult(executionId, "A");
      expect(stepA).not.toBeNull();
      expect(stepA!.completed_at_epoch_ms).not.toBeNull();

      // Step B should be cleared (stale claim)
      const stepB = await storage.getStepResult(executionId, "B");
      expect(stepB).toBeNull();

      // Re-publish and drain to completion
      await ctx.publish("workflow.execution.created", executionId);
      await ctx.drainEvents();

      const finalExecution = await storage.getExecution(
        executionId,
        TEST_ORG_ID,
      );
      expect(finalExecution!.status).toBe("success");

      // All three steps should be completed
      const stepResults = await storage.getStepResults(executionId);
      const completedSteps = stepResults.filter((r) => r.completed_at_epoch_ms);
      expect(completedSteps).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // ForEach crash recovery
  // --------------------------------------------------------------------------

  describe("forEach crash recovery", () => {
    it("recovers a forEach workflow that crashed mid-iteration", async () => {
      const ctx = createMockOrchestratorContext(storage);

      const executionId = await startWorkflow([
        makeCodeStep(
          "produce",
          "export default function() { return [1, 2, 3]; }",
        ),
        makeCodeStep(
          "process",
          "export default function(input) { return { doubled: input.value * 2 }; }",
          { value: "@item" },
          { forEach: { ref: "@produce", concurrency: 10 } },
        ),
      ]);

      // Simulate: produce completed, process parent claimed, some iterations in-flight
      await storage.claimExecution(executionId);
      await storage.createStepResult({
        execution_id: executionId,
        step_id: "produce",
        output: [1, 2, 3],
        completed_at_epoch_ms: Date.now(),
      });
      // Parent forEach step claimed
      await storage.createStepResult({
        execution_id: executionId,
        step_id: "process",
        // No completed_at_epoch_ms -- stale claim
      });
      // First iteration completed
      await storage.createStepResult({
        execution_id: executionId,
        step_id: "process[0]",
        output: { doubled: 2 },
        completed_at_epoch_ms: Date.now(),
      });
      // Second iteration claimed but crashed
      await storage.createStepResult({
        execution_id: executionId,
        step_id: "process[1]",
        // No completed_at_epoch_ms -- stale claim
      });

      // Recover
      const recovered = await storage.recoverStuckExecutions();
      expect(recovered).toHaveLength(1);

      // Completed steps should be preserved
      const produce = await storage.getStepResult(executionId, "produce");
      expect(produce).not.toBeNull();
      expect(produce!.completed_at_epoch_ms).not.toBeNull();

      const iteration0 = await storage.getStepResult(executionId, "process[0]");
      expect(iteration0).not.toBeNull();
      expect(iteration0!.completed_at_epoch_ms).not.toBeNull();

      // Stale claims should be cleared
      const parentStep = await storage.getStepResult(executionId, "process");
      expect(parentStep).toBeNull();

      const iteration1 = await storage.getStepResult(executionId, "process[1]");
      expect(iteration1).toBeNull();

      // Re-publish and drain to completion
      await ctx.publish("workflow.execution.created", executionId);
      await ctx.drainEvents();

      const finalExecution = await storage.getExecution(
        executionId,
        TEST_ORG_ID,
      );
      expect(finalExecution!.status).toBe("success");
    });

    it("recovers a forEach workflow where all iterations completed but parent not finalized", async () => {
      const ctx = createMockOrchestratorContext(storage);

      const executionId = await startWorkflow([
        makeCodeStep("produce", "export default function() { return [1, 2]; }"),
        makeCodeStep(
          "process",
          "export default function(input) { return { doubled: input.value * 2 }; }",
          { value: "@item" },
          { forEach: { ref: "@produce", concurrency: 10 } },
        ),
      ]);

      // Simulate: produce completed, all iterations completed, but parent step not finalized (crash)
      await storage.claimExecution(executionId);
      await storage.createStepResult({
        execution_id: executionId,
        step_id: "produce",
        output: [1, 2],
        completed_at_epoch_ms: Date.now(),
      });
      // Parent forEach step claimed but not completed
      await storage.createStepResult({
        execution_id: executionId,
        step_id: "process",
      });
      // Both iterations completed
      await storage.createStepResult({
        execution_id: executionId,
        step_id: "process[0]",
        output: { doubled: 2 },
        completed_at_epoch_ms: Date.now(),
      });
      await storage.createStepResult({
        execution_id: executionId,
        step_id: "process[1]",
        output: { doubled: 4 },
        completed_at_epoch_ms: Date.now(),
      });

      // Recover
      await storage.recoverStuckExecutions();

      // Parent claim should be cleared, iterations preserved
      const parentStep = await storage.getStepResult(executionId, "process");
      expect(parentStep).toBeNull();

      // Re-publish and drain to completion
      await ctx.publish("workflow.execution.created", executionId);
      await ctx.drainEvents();

      const finalExecution = await storage.getExecution(
        executionId,
        TEST_ORG_ID,
      );
      expect(finalExecution!.status).toBe("success");
    });
  });

  // --------------------------------------------------------------------------
  // Multiple stuck executions
  // --------------------------------------------------------------------------

  describe("multiple stuck executions", () => {
    it("recovers all running executions at once", async () => {
      const ctx = createMockOrchestratorContext(storage);

      const id1 = await startWorkflow([makeCodeStep("A", IDENTITY_CODE, {})]);
      const id2 = await startWorkflow([makeCodeStep("B", IDENTITY_CODE, {})]);

      // Both claimed (running)
      await storage.claimExecution(id1);
      await storage.claimExecution(id2);

      const recovered = await storage.recoverStuckExecutions();
      expect(recovered).toHaveLength(2);

      const recoveredIds = recovered.map((r) => r.id).sort();
      expect(recoveredIds).toEqual([id1, id2].sort());

      // Both should be enqueued
      const exec1 = await storage.getExecution(id1, TEST_ORG_ID);
      const exec2 = await storage.getExecution(id2, TEST_ORG_ID);
      expect(exec1!.status).toBe("enqueued");
      expect(exec2!.status).toBe("enqueued");

      // Both can complete
      await ctx.publish("workflow.execution.created", id1);
      await ctx.publish("workflow.execution.created", id2);
      await ctx.drainEvents();

      const final1 = await storage.getExecution(id1, TEST_ORG_ID);
      const final2 = await storage.getExecution(id2, TEST_ORG_ID);
      expect(final1!.status).toBe("success");
      expect(final2!.status).toBe("success");
    });
  });

  // --------------------------------------------------------------------------
  // No-op when nothing to recover
  // --------------------------------------------------------------------------

  describe("no-op when nothing to recover", () => {
    it("returns empty array when no running executions exist", async () => {
      const recovered = await storage.recoverStuckExecutions();
      expect(recovered).toHaveLength(0);
    });
  });
});
