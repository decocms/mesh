#!/usr/bin/env bun
/**
 * Virtual MCP Benchmark Suite
 *
 * Main entry point for running benchmarks.
 *
 * Usage:
 *   bun run benchmark/benchmark.ts [--quick|--high] [--verbose]
 *
 * Options:
 *   --quick    Run quick benchmark (2 models, 10 & 128 tools)
 *   --high     Run high tool count benchmark (100, 300, 500 tools)
 *   --verbose  Show detailed progress output
 *
 * Environment:
 *   OPENROUTER_API_KEY - Required for LLM access
 */

import { parseArgs } from "util";
import {
  DEFAULT_CONFIG,
  generateScenarios,
  generateQuickScenarios,
  generateHighToolCountScenarios,
} from "./config";
import { runBenchmarks } from "./runner";
import { saveReport, printSummary } from "./reporter";

async function main() {
  // Parse command line arguments
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      quick: {
        type: "boolean",
        default: false,
        description: "Run a smaller set of scenarios for quick testing",
      },
      high: {
        type: "boolean",
        default: false,
        description: "Run scenarios with high tool counts (100, 300, 500)",
      },
      verbose: {
        type: "boolean",
        default: true,
        description: "Show verbose output during benchmarking",
      },
      help: {
        type: "boolean",
        short: "h",
        default: false,
        description: "Show help",
      },
    },
  });

  if (values.help) {
    console.log(`
Virtual MCP Benchmark Suite

Usage:
  bun run benchmark/benchmark.ts [options]

Options:
  --quick     Run a smaller set of scenarios (GPT-4o, 10/50 tools)
  --high      Run high tool count scenarios (GPT-4o, 100/300/500 tools)
  --verbose   Show verbose output (default: true)
  --help, -h  Show this help message

Modes:
  Default (no flags): Full benchmark - all models, all strategies, 10-500 tools
                      Includes both simple and chained tasks
  --quick:            Quick test - GPT-4o, 10/50 tools, simple + chained
  --high:             High scale - GPT-4o, 100/300/500 tools, simple + chained

All modes include both simple (single tool call) and chained (multi-step) tasks.

Environment:
  OPENROUTER_API_KEY  Required for LLM access (OpenRouter API key)

Output:
  Results are saved to benchmark/results/YYYY-MM-DD-HHmmss.md
`);
    process.exit(0);
  }

  // Check for API key
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    console.error("Get your API key from https://openrouter.ai/keys");
    process.exit(1);
  }

  // Generate scenarios based on mode
  let scenarios;
  let modeName;

  if (values.quick) {
    scenarios = generateQuickScenarios();
    modeName = "Quick (simple + chained)";
  } else if (values.high) {
    scenarios = generateHighToolCountScenarios();
    modeName = "High Tool Count (simple + chained)";
  } else {
    scenarios = generateScenarios();
    modeName = "Full (simple + chained)";
  }

  console.log("=".repeat(60));
  console.log("Virtual MCP Benchmark Suite");
  console.log("=".repeat(60));
  console.log(`Mode: ${modeName}`);
  console.log(`Scenarios: ${scenarios.length}`);
  console.log("");

  // Configure benchmark
  const config = {
    ...DEFAULT_CONFIG,
    verbose: values.verbose ?? true,
  };

  // Run benchmarks
  const startTime = Date.now();
  const results = await runBenchmarks(scenarios, config);
  const totalDurationMs = Date.now() - startTime;

  // Print summary
  printSummary(results);

  // Save report
  const reportPath = await saveReport(results, totalDurationMs);
  console.log(`\nReport saved to: ${reportPath}`);
}

main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
