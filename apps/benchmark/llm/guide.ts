/**
 * Guide Logic for Chat Simulation
 *
 * Provides prompts and responses to guide the target LLM
 * toward accomplishing the benchmark task.
 */

import type { BenchmarkTask, Guide } from "../types";

/**
 * Fixed response guide implementation
 *
 * Uses predetermined responses to guide the model.
 * Can be replaced with an LLM-based guide in the future.
 */
class FixedGuide implements Guide {
  /**
   * Get the initial prompt for the task
   */
  getInitialPrompt(task: BenchmarkTask): string {
    return `I need you to accomplish the following task using the available tools:

${task.prompt}

Please use the appropriate tool to complete this task. Look through the available tools and call the one that best matches what I'm asking for.`;
  }

  /**
   * Get a retry prompt after a failed attempt
   */
  getRetryPrompt(
    task: BenchmarkTask,
    attempt: number,
    _lastResponse: string,
  ): string {
    // Provide progressively more specific hints
    if (attempt <= 2) {
      return `That's not quite what I need. Let me clarify:

${task.prompt}

Please try again with a different tool that matches this request.`;
    }

    if (attempt <= 4) {
      return `I still need you to: ${task.prompt}

Hint: Look for a tool that can "${task.expectedToolCall.tool.replace(/_/g, " ")}".`;
    }

    // More direct hint after several attempts
    return `Please use the "${task.expectedToolCall.tool}" tool to: ${task.prompt}`;
  }
}

/**
 * Create the default guide
 */
export function createGuide(): Guide {
  return new FixedGuide();
}
