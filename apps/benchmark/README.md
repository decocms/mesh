# MCP Gateway Benchmark Suite

Benchmark suite for evaluating MCP Gateway strategies by measuring token consumption and success rates across different scenarios.

## Purpose

When you have many tools available (100+), directly exposing all tools to an LLM becomes expensive and may exceed context limits. The MCP Gateway offers different strategies to handle this:

| Strategy | Description | Trade-off |
|----------|-------------|-----------|
| `passthrough` | Exposes all tools directly to the LLM | Simple but expensive at scale |
| `smart_tool_selection` | Exposes meta-tools for discovery (`GATEWAY_SEARCH_TOOLS`, `GATEWAY_DESCRIBE_TOOLS`, `GATEWAY_CALL_TOOL`) | Fewer tokens but requires multi-step reasoning |
| `code_execution` | Exposes meta-tools with sandboxed code execution (`CODE_EXECUTION_RUN_CODE`) | Efficient for complex operations |

This benchmark measures **token consumption** to help you choose the right strategy for your use case.

## Quick Start

```bash
# Set your OpenRouter API key
export OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Run quick benchmark (GPT-4.1 + Claude Sonnet 4.5, 10/50 tools)
bun run benchmark:quick

# Run full benchmark (all models, all strategies, 10-500 tools)
bun run benchmark

# Run high tool count scenarios (100, 300, 500 tools)
bun run benchmark:high
```

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Benchmark Runner                          │
├─────────────────────────────────────────────────────────────┤
│  1. Start Fake MCP Server (with N generated tools)          │
│  2. Start Mesh Server (with temp database)                  │
│  3. Create Connection + Gateway with strategy               │
│  4. Connect LLM via OpenRouter                              │
│  5. Run chat loop until task complete or max attempts       │
│  6. Measure tokens, messages, duration                      │
└─────────────────────────────────────────────────────────────┘
```

### Scenario Structure

Each benchmark scenario combines:
- **Model**: Which LLM to use (GPT-4o, Claude 3.5 Sonnet, Gemini 2.0 Flash)
- **Tool Count**: How many tools are available (10, 50, 100, 300, 500)
- **Strategy**: Gateway strategy (`passthrough`, `smart_tool_selection`, `code_execution`)
- **Task**: What the LLM needs to accomplish

### Task Types

#### Simple Tasks
Single tool call to complete:
```typescript
{
  prompt: "Send an email to john@example.com with subject 'Meeting'",
  expectedToolCall: { tool: "send_email", args: { to: "john@example.com", ... } }
}
```

#### Chained Tasks
Require multiple tool calls to gather information before the final call:
```typescript
{
  prompt: "Find user 'alice', check her pending tasks, and email her a summary",
  expectedToolCall: { tool: "send_email", args: { ... } },
  isChained: true
}
```

Chained tasks are more realistic - the agent must:
1. Call intermediate tools to gather information
2. Use that information to make the final expected call

## Benchmark Modes

| Mode | Command | Description |
|------|---------|-------------|
| Quick | `--quick` | GPT-4.1 + Claude Sonnet 4.5, 10/50 tools |
| Full | (default) | All models, 10-500 tools, all tasks |
| High | `--high` | Claude Sonnet 4.5, 100/300/500 tools |

All modes include both simple (single tool call) and chained (multi-step) tasks.
Each scenario has a maximum of **4 steps** before giving up.

## Output

Results are saved to `apps/benchmark/results/` as Markdown files with visual dashboards:

```
📊 50 Tools:
  baseline               ██████████████████████████████ 1,888
  smart_tool_selection   ████████████████████████████████████ 2,889 (↑53%)
  code_execution         ██████████████████████████████████ 2,379 (↑26%)

📊 300 Tools:
  baseline               ██████████████████████████████████████████████ 15,234
  smart_tool_selection   ████████████████████ 3,456 (↓77%)
  code_execution         ██████████████████████ 4,123 (↓73%)
```

Summary table with savings vs baseline:

| Strategy | Tools | Avg Tokens | vs Baseline | Success |
|----------|-------|------------|-------------|---------|
| baseline (passthrough) | 50 | 1,888 | — | 100% |
| smart_tool_selection | 50 | 2,889 | ↑ 53% more | 100% |
| code_execution | 300 | 4,123 | ↓ 73% fewer | 100% |

## Contributing Scenarios

### Adding New Tasks

Edit `apps/benchmark/config.ts`:

```typescript
// Simple task - single tool call
export const SIMPLE_TASKS = [
  // ... existing tasks
  {
    prompt: "Your natural language prompt here",
    expectedToolCall: {
      tool: "tool_name",  // Must exist in generator.ts templates
      args: {
        param1: "value1",
        param2: "value2",
      },
    },
  },
];

// Chained task - requires multiple tool calls
export const CHAINED_TASKS = [
  // ... existing tasks
  {
    prompt: "Complex prompt requiring multiple steps",
    expectedToolCall: {
      tool: "final_tool",  // The LAST tool that should be called
      args: { ... },
    },
    isChained: true,
  },
];
```

### Adding New Tools

Edit `apps/benchmark/tools/generator.ts`:

```typescript
const TOOL_TEMPLATES: Record<string, Array<{...}>> = {
  // Add a new category
  crm: [
    {
      name: "create_contact",
      description: "Create a new CRM contact",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Contact name" },
          email: { type: "string", description: "Contact email" },
          company: { type: "string", description: "Company name" },
        },
        required: ["name", "email"],
      },
    },
    // ... more tools
  ],
};
```

### Adding New Models

Edit `apps/benchmark/config.ts`:

```typescript
export const BENCHMARK_MODELS = [
  "openai/gpt-4o",
  "anthropic/claude-3.5-sonnet",
  "google/gemini-2.0-flash-001",
  // Add new models (must be valid OpenRouter model IDs)
  "meta-llama/llama-3.1-405b-instruct",
] as const;
```

### Creating Custom Scenario Generators

```typescript
// In config.ts
export function generateMyCustomScenarios(): BenchmarkScenario[] {
  const scenarios: BenchmarkScenario[] = [];
  
  // Your custom logic here
  for (const model of ["openai/gpt-4o"]) {
    for (const toolCount of [50, 200, 1000]) {
      scenarios.push({
        name: `custom/${model}/${toolCount}`,
        model,
        toolCount,
        task: SIMPLE_TASKS[0],
        strategy: "code_execution",
      });
    }
  }
  
  return scenarios;
}
```

## GitHub Actions

The benchmark can run automatically via GitHub Actions:

1. **Add your OpenRouter API key** to repository secrets as `OPENROUTER_API_KEY`
2. **Trigger manually** from Actions tab → "MCP Gateway Benchmark" → "Run workflow"
3. **Select mode**: `quick`, `high`, or `full`

Results are:
- 📄 Uploaded as artifacts (retained for 90 days)
- 📝 Added to the GitHub Actions summary
- 💬 Commented on PRs (if triggered from a PR)

```yaml
# .github/workflows/benchmark.yml
on:
  workflow_dispatch:
    inputs:
      mode:
        type: choice
        options: [quick, high, full]
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter API key |
| `BENCHMARK_DEBUG` | No | Set to `1` for verbose debug output |

## File Structure

```
apps/benchmark/
├── benchmark.ts        # CLI entry point
├── config.ts           # Scenarios, tasks, and models
├── runner.ts           # Benchmark execution logic
├── reporter.ts         # Markdown report generation
├── types.ts            # TypeScript definitions
├── llm/
│   ├── client.ts       # OpenRouter/AI SDK integration
│   └── guide.ts        # Chat simulation prompts
├── server/
│   ├── fake-mcp.ts     # Fake MCP server with tools
│   └── mesh.ts         # Mesh server setup
├── tools/
│   └── generator.ts    # Tool template generation
└── results/            # Generated benchmark reports
```

## Tips for Good Benchmarks

1. **Realistic prompts**: Write prompts as a real user would
2. **Clear tool mapping**: Ensure the expected tool exists in `generator.ts`
3. **Chained complexity**: For chained tasks, the intermediate steps should be logical
4. **Tool variety**: Add tools from different categories to test search/discovery
5. **Scale testing**: Test with 300+ tools to see strategy differences

## Interpreting Results

- **baseline (passthrough)** wins at low tool counts (<50) - direct exposure is efficient
- **smart_tool_selection** wins at medium counts (50-200) - discovery overhead pays off
- **code_execution** wins at high counts (300+) - batch operations reduce roundtrips

The "vs Baseline" column shows token savings compared to passthrough:
- `↓ 73% fewer` = uses 73% fewer tokens than baseline
- `↑ 53% more` = uses 53% more tokens than baseline

The crossover points depend on:
- Task complexity (simple vs chained)
- Tool schema sizes (more properties = more tokens)
- Model capabilities (better models may need fewer retries)

