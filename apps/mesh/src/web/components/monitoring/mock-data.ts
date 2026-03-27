/**
 * Mock data for monitoring dashboard development.
 *
 * Set USE_MOCK_DATA to true to render the dashboard with realistic fake data
 * when the monitoring backend is unavailable (e.g. missing DuckDB).
 *
 * TODO: Remove this file once monitoring backend works locally.
 */

/** Flip to `false` to use real backend data. */
export const USE_MOCK_DATA = true;

function generateTimeseries(
  startDate: string,
  endDate: string,
  interval: "1m" | "1h" | "1d",
) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const step =
    interval === "1m" ? 60_000 : interval === "1h" ? 3_600_000 : 86_400_000;
  const points = [];
  for (let ts = start; ts <= end; ts += step) {
    const base = 5 + Math.random() * 30;
    const errors = Math.random() < 0.15 ? Math.floor(Math.random() * 3) : 0;
    points.push({
      timestamp: new Date(ts).toISOString(),
      calls: Math.floor(base),
      errors,
      errorRate: base > 0 ? (errors / base) * 100 : 0,
      avg: Math.floor(80 + Math.random() * 400),
      p50: Math.floor(60 + Math.random() * 200),
      p95: Math.floor(300 + Math.random() * 800),
    });
  }
  return points;
}

const TOOL_NAMES = [
  "COLLECTION_LIST",
  "COLLECTION_GET",
  "SEARCH_PRODUCTS",
  "CREATE_ORDER",
  "SEND_EMAIL",
  "GET_ANALYTICS",
  "UPDATE_INVENTORY",
  "GENERATE_REPORT",
];

const CONNECTION_IDS = [
  "conn_shopify",
  "conn_mailgun",
  "conn_analytics",
  "conn_stripe",
  "conn_inventory",
];

export function getMockStats(params: {
  startDate: string;
  endDate: string;
  interval: "1m" | "1h" | "1d";
}) {
  const timeseries = generateTimeseries(
    params.startDate,
    params.endDate,
    params.interval,
  );
  const totalCalls = timeseries.reduce((s, p) => s + p.calls, 0);
  const totalErrors = timeseries.reduce((s, p) => s + p.errors, 0);
  const avgDurationMs = Math.round(
    timeseries.reduce((s, p) => s + p.avg, 0) / Math.max(timeseries.length, 1),
  );
  const p50DurationMs = Math.round(
    timeseries.reduce((s, p) => s + p.p50, 0) / Math.max(timeseries.length, 1),
  );
  const p95DurationMs = Math.round(
    timeseries.reduce((s, p) => s + p.p95, 0) / Math.max(timeseries.length, 1),
  );

  const connectionBreakdown = CONNECTION_IDS.map((id) => {
    const calls = Math.floor(totalCalls * (0.1 + Math.random() * 0.3));
    const errors = Math.floor(calls * Math.random() * 0.08);
    return {
      connectionId: id,
      calls,
      errors,
      errorRate: calls > 0 ? (errors / calls) * 100 : 0,
      avgDurationMs: Math.floor(100 + Math.random() * 300),
    };
  });

  return {
    totalCalls,
    totalErrors,
    avgDurationMs,
    p50DurationMs,
    p95DurationMs,
    connectionBreakdown,
    timeseries,
  };
}

export function getMockTopTools(params: {
  startDate: string;
  endDate: string;
  interval: "1m" | "1h" | "1d";
  topN: number;
}) {
  const tools = TOOL_NAMES.slice(0, params.topN);
  const topTools = tools.map((name, i) => ({
    toolName: name,
    connectionId: CONNECTION_IDS[i % CONNECTION_IDS.length]!,
    calls: Math.floor(50 + Math.random() * 200),
  }));

  const timeseries = generateTimeseries(
    params.startDate,
    params.endDate,
    params.interval,
  );

  const topToolsTimeseries: Array<{
    timestamp: string;
    toolName: string;
    calls: number;
    errors: number;
    avg: number;
    p95: number;
  }> = [];

  for (const point of timeseries) {
    for (const tool of tools) {
      topToolsTimeseries.push({
        timestamp: point.timestamp,
        toolName: tool,
        calls: Math.floor(1 + Math.random() * 8),
        errors: Math.random() < 0.1 ? 1 : 0,
        avg: Math.floor(50 + Math.random() * 300),
        p95: Math.floor(200 + Math.random() * 600),
      });
    }
  }

  return {
    topTools,
    timeseries,
    topToolsTimeseries,
  };
}

// ============================================================================
// Mock Logs (for Audit tab)
// ============================================================================

const CONNECTION_TITLES: Record<string, string> = {
  conn_shopify: "Shopify",
  conn_mailgun: "Mailgun",
  conn_analytics: "Google Analytics",
  conn_stripe: "Stripe",
  conn_inventory: "Inventory Service",
};

const USER_NAMES = [
  "Alice Johnson",
  "Bob Smith",
  "Carol Lee",
  "Dave Patel",
  "Eve Costa",
];

const VIRTUAL_MCP_IDS = ["vmc_decopilot", "vmc_support", "vmc_sales"];
const VIRTUAL_MCP_TITLES: Record<string, string> = {
  vmc_decopilot: "Decopilot",
  vmc_support: "Support Agent",
  vmc_sales: "Sales Agent",
};

const USER_AGENTS = [
  "cursor/0.45.0",
  "claude-code/1.2.0",
  "vscode-mcp/0.8.3",
  null,
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export interface MockMonitoringLog {
  id: string;
  connectionId: string;
  connectionTitle: string;
  toolName: string;
  isError: boolean;
  errorMessage: string | null;
  durationMs: number;
  timestamp: string;
  organizationId: string;
  userId: string | null;
  requestId: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  userAgent: string | null;
  virtualMcpId: string | null;
  properties: Record<string, string> | null;
}

function generateMockInput(toolName: string): Record<string, unknown> {
  switch (toolName) {
    case "COLLECTION_LIST":
      return { collection: "products", limit: 20, offset: 0 };
    case "COLLECTION_GET":
      return {
        collection: "products",
        id: `prod_${Math.random().toString(36).slice(2, 8)}`,
      };
    case "SEARCH_PRODUCTS":
      return {
        query: "summer dresses",
        filters: { category: "clothing", inStock: true },
        limit: 10,
      };
    case "CREATE_ORDER":
      return {
        items: [
          { productId: "prod_abc123", quantity: 2, price: 29.99 },
          { productId: "prod_def456", quantity: 1, price: 49.99 },
        ],
        shippingAddress: {
          street: "123 Main St",
          city: "San Francisco",
          state: "CA",
          zip: "94102",
        },
      };
    case "SEND_EMAIL":
      return {
        to: "customer@example.com",
        subject: "Order Confirmation #12345",
        template: "order_confirmation",
        variables: { orderId: "12345", total: "$109.97" },
      };
    case "GET_ANALYTICS":
      return {
        metric: "page_views",
        startDate: "2026-03-01",
        endDate: "2026-03-25",
        granularity: "day",
      };
    case "UPDATE_INVENTORY":
      return { productId: "prod_abc123", delta: -2, reason: "order_fulfilled" };
    case "GENERATE_REPORT":
      return { reportType: "weekly_sales", format: "pdf", includeCharts: true };
    default:
      return { action: toolName };
  }
}

function generateMockOutput(
  toolName: string,
  isError: boolean,
): Record<string, unknown> {
  if (isError) {
    return {
      error: {
        code: randomItem(["NOT_FOUND", "RATE_LIMITED", "TIMEOUT", "INTERNAL"]),
        message: randomItem([
          "Resource not found",
          "Rate limit exceeded, retry after 30s",
          "Request timed out after 10s",
          "Internal server error",
        ]),
      },
    };
  }
  switch (toolName) {
    case "COLLECTION_LIST":
      return {
        items: Array.from({ length: 5 }, (_, i) => ({
          id: `prod_${i}`,
          title: `Product ${i + 1}`,
          price: +(10 + Math.random() * 90).toFixed(2),
        })),
        total: 142,
        hasMore: true,
      };
    case "SEARCH_PRODUCTS":
      return {
        results: [
          { id: "prod_1", title: "Floral Summer Dress", score: 0.95 },
          { id: "prod_2", title: "Linen Beach Dress", score: 0.87 },
        ],
        totalResults: 24,
      };
    case "CREATE_ORDER":
      return { orderId: "ord_xyz789", status: "confirmed", total: 109.97 };
    case "SEND_EMAIL":
      return { messageId: "msg_abc", status: "queued" };
    default:
      return { success: true, result: "completed" };
  }
}

export function getMockLogs(params: {
  startDate: string;
  endDate: string;
  limit: number;
  offset: number;
}): { logs: MockMonitoringLog[]; total: number } {
  const total = 127;
  const count = Math.min(params.limit, Math.max(0, total - params.offset));
  const start = new Date(params.startDate).getTime();
  const end = new Date(params.endDate).getTime();

  const logs: MockMonitoringLog[] = Array.from({ length: count }, (_, i) => {
    const idx = params.offset + i;
    const isError = Math.random() < 0.12;
    const toolName = TOOL_NAMES[idx % TOOL_NAMES.length]!;
    const connId = CONNECTION_IDS[idx % CONNECTION_IDS.length]!;
    const vmcpId = randomItem(VIRTUAL_MCP_IDS);
    // Distribute timestamps evenly within range, newest first
    const ts = end - ((end - start) * idx) / total;
    return {
      id: `log_${idx}_${Math.random().toString(36).slice(2, 8)}`,
      connectionId: connId,
      connectionTitle: CONNECTION_TITLES[connId] ?? connId,
      toolName,
      isError,
      errorMessage: isError
        ? randomItem([
            "Connection timeout after 10000ms",
            "Rate limit exceeded",
            "Resource not found: prod_expired",
            "Invalid input: missing required field 'id'",
          ])
        : null,
      durationMs: Math.floor(
        isError ? 500 + Math.random() * 9500 : 30 + Math.random() * 800,
      ),
      timestamp: new Date(ts).toISOString(),
      organizationId: "org_mock",
      userId: `user_${(idx % USER_NAMES.length) + 1}`,
      requestId: `req_${crypto.randomUUID().slice(0, 8)}`,
      input: generateMockInput(toolName),
      output: generateMockOutput(toolName, isError),
      userAgent: randomItem(USER_AGENTS),
      virtualMcpId: vmcpId,
      properties:
        Math.random() < 0.4
          ? {
              thread_id: `thread_${Math.random().toString(36).slice(2, 8)}`,
              session: randomItem(["web", "mobile", "api"]),
            }
          : null,
    };
  });

  return { logs, total };
}

// ============================================================================
// Mock Automations (for Overview tab)
// ============================================================================

export interface MockAutomation {
  id: string;
  name: string;
  active: boolean;
  trigger_count: number;
  schedule: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
}

export function getMockAutomations(): MockAutomation[] {
  const now = Date.now();
  return [
    {
      id: "auto_1",
      name: "Daily Inventory Sync",
      active: true,
      trigger_count: 1,
      schedule: "Every 24h",
      last_run_at: new Date(now - 2 * 3_600_000).toISOString(),
      next_run_at: new Date(now + 22 * 3_600_000).toISOString(),
    },
    {
      id: "auto_2",
      name: "Order Confirmation Emails",
      active: true,
      trigger_count: 2,
      schedule: "On event",
      last_run_at: new Date(now - 15 * 60_000).toISOString(),
      next_run_at: null,
    },
    {
      id: "auto_3",
      name: "Weekly Sales Report",
      active: true,
      trigger_count: 1,
      schedule: "Every 7d",
      last_run_at: new Date(now - 3 * 86_400_000).toISOString(),
      next_run_at: new Date(now + 4 * 86_400_000).toISOString(),
    },
    {
      id: "auto_4",
      name: "Abandoned Cart Recovery",
      active: false,
      trigger_count: 1,
      schedule: "Every 6h",
      last_run_at: new Date(now - 7 * 86_400_000).toISOString(),
      next_run_at: null,
    },
    {
      id: "auto_5",
      name: "Support Ticket Triage",
      active: true,
      trigger_count: 3,
      schedule: "Every 15m",
      last_run_at: new Date(now - 45 * 60_000).toISOString(),
      next_run_at: null,
    },
  ];
}

// ============================================================================
// Mock Agents (for Overview tab)
// ============================================================================

export interface MockAgent {
  id: string;
  title: string;
  calls: number;
  lastActiveAt: string | null;
}

export function getMockAgents(): MockAgent[] {
  const now = Date.now();
  return [
    {
      id: "vmc_decopilot",
      title: "Decopilot",
      calls: 312,
      lastActiveAt: new Date(now - 5 * 60_000).toISOString(),
    },
    {
      id: "vmc_support",
      title: "Support Agent",
      calls: 187,
      lastActiveAt: new Date(now - 12 * 60_000).toISOString(),
    },
    {
      id: "vmc_sales",
      title: "Sales Agent",
      calls: 94,
      lastActiveAt: new Date(now - 45 * 60_000).toISOString(),
    },
    {
      id: "vmc_onboarding",
      title: "Onboarding Assistant",
      calls: 56,
      lastActiveAt: new Date(now - 3 * 3_600_000).toISOString(),
    },
    {
      id: "vmc_analytics",
      title: "Analytics Bot",
      calls: 23,
      lastActiveAt: new Date(now - 8 * 3_600_000).toISOString(),
    },
  ];
}

const MODEL_NAMES = [
  "claude-sonnet-4-20250514",
  "claude-haiku-4-20250414",
  "gpt-4o",
];

export function getMockLlmStats(params: {
  startDate: string;
  endDate: string;
  interval: "1m" | "1h" | "1d";
}) {
  const timeseries = generateTimeseries(
    params.startDate,
    params.endDate,
    params.interval,
  );
  // Scale down for LLM calls
  const llmTimeseries = timeseries.map((p) => ({
    ...p,
    calls: Math.max(1, Math.floor(p.calls * 0.3)),
    errors: Math.random() < 0.05 ? 1 : 0,
    avg: Math.floor(800 + Math.random() * 2000),
    p50: Math.floor(600 + Math.random() * 1000),
    p95: Math.floor(2000 + Math.random() * 4000),
  }));

  const totalCalls = llmTimeseries.reduce((s, p) => s + p.calls, 0);
  const totalErrors = llmTimeseries.reduce((s, p) => s + p.errors, 0);
  const avgDurationMs = Math.round(
    llmTimeseries.reduce((s, p) => s + p.avg, 0) /
      Math.max(llmTimeseries.length, 1),
  );
  const p50DurationMs = Math.round(
    llmTimeseries.reduce((s, p) => s + p.p50, 0) /
      Math.max(llmTimeseries.length, 1),
  );
  const p95DurationMs = Math.round(
    llmTimeseries.reduce((s, p) => s + p.p95, 0) /
      Math.max(llmTimeseries.length, 1),
  );

  const topTools = MODEL_NAMES.map((name) => ({
    toolName: name,
    connectionId: null,
    calls: Math.floor(totalCalls * (0.2 + Math.random() * 0.4)),
  }));

  return {
    totalCalls,
    totalErrors,
    avgDurationMs,
    p50DurationMs,
    p95DurationMs,
    connectionBreakdown: [],
    topTools,
    timeseries: llmTimeseries,
  };
}
