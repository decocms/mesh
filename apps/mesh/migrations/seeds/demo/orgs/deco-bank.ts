/**
 * Deco Bank Organization
 *
 * Large corporate banking environment simulating 3 months of usage:
 * - 12 users across multiple departments
 * - 35+ connections (3 well-known + verified MCPs from Deco Store)
 * - 6 gateways (Default Hub + 5 specialized)
 * - ~2500 synthetic + static monitoring logs
 */

import type { Kysely } from "kysely";
import type { Database } from "../../../../src/storage/types";
import type {
  OrgConfig,
  OrgSeedResult,
  OrgUser,
  MonitoringLog,
} from "../seeder";
import { createOrg, TIME, USER_AGENTS } from "../seeder";
import {
  getWellKnownConnections,
  pickConnections,
  pickGateways,
} from "../catalog";

// =============================================================================
// Configuration
// =============================================================================

const EMAIL_DOMAIN = "@decobank.com";

const USERS: Record<string, OrgUser> = {
  cto: {
    role: "admin",
    memberRole: "owner",
    name: "Carlos Mendes",
    email: `carlos.mendes${EMAIL_DOMAIN}`,
  },
  techLead: {
    role: "admin",
    memberRole: "admin",
    name: "Ana Silva",
    email: `ana.silva${EMAIL_DOMAIN}`,
  },
  seniorDev1: {
    role: "member",
    memberRole: "member",
    name: "Pedro Costa",
    email: `pedro.costa${EMAIL_DOMAIN}`,
  },
  seniorDev2: {
    role: "member",
    memberRole: "member",
    name: "Mariana Santos",
    email: `mariana.santos${EMAIL_DOMAIN}`,
  },
  midDev1: {
    role: "member",
    memberRole: "member",
    name: "Rafael Oliveira",
    email: `rafael.oliveira${EMAIL_DOMAIN}`,
  },
  junior: {
    role: "member",
    memberRole: "member",
    name: "Gabriel Lima",
    email: `gabriel.lima${EMAIL_DOMAIN}`,
  },
  analyst: {
    role: "member",
    memberRole: "member",
    name: "Lucas Fernandes",
    email: `lucas.fernandes${EMAIL_DOMAIN}`,
  },
  dataEngineer: {
    role: "member",
    memberRole: "member",
    name: "Beatriz Rodrigues",
    email: `beatriz.rodrigues${EMAIL_DOMAIN}`,
  },
  security: {
    role: "admin",
    memberRole: "admin",
    name: "Roberto Alves",
    email: `roberto.alves${EMAIL_DOMAIN}`,
  },
  compliance: {
    role: "member",
    memberRole: "member",
    name: "Julia Ferreira",
    email: `julia.ferreira${EMAIL_DOMAIN}`,
  },
  productManager: {
    role: "member",
    memberRole: "member",
    name: "Fernanda Souza",
    email: `fernanda.souza${EMAIL_DOMAIN}`,
  },
  qa: {
    role: "member",
    memberRole: "member",
    name: "Ricardo Martins",
    email: `ricardo.martins${EMAIL_DOMAIN}`,
  },
};

const USER_ACTIVITY_WEIGHTS: Record<string, number> = {
  techLead: 0.18,
  seniorDev1: 0.15,
  seniorDev2: 0.14,
  midDev1: 0.12,
  analyst: 0.11,
  dataEngineer: 0.1,
  junior: 0.08,
  security: 0.06,
  productManager: 0.04,
  qa: 0.01,
  cto: 0.01,
  compliance: 0.0,
};

// Include well-known connections (Mesh MCP, MCP Registry, Deco Store) + business connections
const CONNECTIONS = {
  ...getWellKnownConnections(),
  ...pickConnections([
    // Development & Infrastructure
    "github",
    "vercel",
    "supabase",
    "prisma",
    "cloudflare",
    "aws",
    // AI & LLM
    "openrouter",
    "perplexity",
    "elevenlabs",
    // Automation & Scraping
    "apify",
    "browserUse",
    // Google Workspace
    "gmail",
    "googleCalendar",
    "googleSheets",
    "googleDocs",
    "googleDrive",
    "googleTagManager",
    "youtube",
    // Productivity & Documentation
    "notion",
    "grain",
    "airtable",
    "jira",
    "hubspot",
    // Communication
    "discord",
    "discordWebhook",
    "slack",
    "resend",
    // Payments
    "stripe",
    // Brazilian APIs
    "brasilApi",
    "queridoDiario",
    "datajud",
    // Design & E-commerce
    "figma",
    "shopify",
    "vtex",
    "superfrete",
  ]),
};

// Default Hub (production-like) + specialized gateways
const GATEWAYS = pickGateways([
  "defaultHub",
  "llm",
  "devGateway",
  "compliance",
  "dataGateway",
  "allAccess",
]);

// =============================================================================
// Static Logs - Hand-crafted story moments over 90 days
// =============================================================================

const STATIC_LOGS: MonitoringLog[] = [
  // 90 days ago: Q4 Planning
  {
    connectionKey: "notion",
    toolName: "create_page",
    input: { parent_id: "workspace_root", title: "Q1 2024 OKRs" },
    output: { page_id: "page_q1_okrs" },
    isError: false,
    durationMs: 345,
    offsetMs: -90 * TIME.DAY,
    userKey: "cto",
    userAgent: USER_AGENTS.notionDesktop,
    gatewayKey: "compliance",
  },
  {
    connectionKey: "grain",
    toolName: "get_transcript",
    input: { meeting_id: "meet_q4_review" },
    output: { transcript: "Q4 Review...", duration_minutes: 120 },
    isError: false,
    durationMs: 1847,
    offsetMs: -90 * TIME.DAY,
    userKey: "cto",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "compliance",
  },

  // 85 days ago: Security PR
  {
    connectionKey: "github",
    toolName: "create_pull_request",
    input: { repo: "payment-gateway", title: "SECURITY: SQL injection patch" },
    output: { number: 1892, state: "open" },
    isError: false,
    durationMs: 456,
    offsetMs: -85 * TIME.DAY,
    userKey: "security",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "devGateway",
  },

  // 75 days ago: Payment refund
  {
    connectionKey: "stripe",
    toolName: "create_refund",
    input: { charge: "ch_123", amount: 125000 },
    output: { id: "re_123", status: "succeeded" },
    isError: false,
    durationMs: 1234,
    offsetMs: -75 * TIME.DAY,
    userKey: "techLead",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "allAccess",
  },

  // 70 days ago: Deployment
  {
    connectionKey: "vercel",
    toolName: "list_deployments",
    input: { projectId: "prj_banking_mobile" },
    output: { deployments: [{ uid: "dpl_mobile_v2", state: "READY" }] },
    isError: false,
    durationMs: 234,
    offsetMs: -70 * TIME.DAY,
    userKey: "seniorDev1",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "devGateway",
  },

  // 65 days ago: AI code review
  {
    connectionKey: "openrouter",
    toolName: "chat_completion",
    input: {
      model: "anthropic/claude-3.5-sonnet",
      messages: [{ role: "user", content: "Review this code..." }],
    },
    output: { response: "Security concerns found...", tokens_used: 1847 },
    isError: false,
    durationMs: 3456,
    offsetMs: -65 * TIME.DAY,
    userKey: "seniorDev2",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "llm",
    properties: { cost_usd: "0.047" },
  },

  // 60 days ago: Analytics
  {
    connectionKey: "supabase",
    toolName: "run_sql",
    input: { project_id: "proj_analytics", query: "SELECT..." },
    output: { rows: [{ transactions: 12847 }] },
    isError: false,
    durationMs: 678,
    offsetMs: -60 * TIME.DAY,
    userKey: "analyst",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "allAccess",
  },

  // 55 days ago: Postmortem
  {
    connectionKey: "notion",
    toolName: "create_page",
    input: { title: "Postmortem: Payment Gateway Timeout" },
    output: { page_id: "page_postmortem" },
    isError: false,
    durationMs: 432,
    offsetMs: -55 * TIME.DAY,
    userKey: "techLead",
    userAgent: USER_AGENTS.notionDesktop,
    gatewayKey: "compliance",
  },

  // 45 days ago: Payment reconciliation
  {
    connectionKey: "stripe",
    toolName: "list_payments",
    input: { limit: 1000 },
    output: { data: [{ id: "pi_1", amount: 25000 }], total_count: 8734 },
    isError: false,
    durationMs: 1234,
    offsetMs: -45 * TIME.DAY,
    userKey: "analyst",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "allAccess",
  },

  // 30 days ago: LLM cost analysis
  {
    connectionKey: "openrouter",
    toolName: "get_usage_stats",
    input: { period: "last_30_days" },
    output: { total_requests: 45678, total_cost: 1234.56 },
    isError: false,
    durationMs: 234,
    offsetMs: -30 * TIME.DAY,
    userKey: "cto",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "llm",
  },

  // 20 days ago: Bug investigation
  {
    connectionKey: "github",
    toolName: "search_code",
    input: { query: "processRefund", org: "decobank" },
    output: {
      total_count: 8,
      items: [{ path: "src/services/refund-processor.ts" }],
    },
    isError: false,
    durationMs: 567,
    offsetMs: -20 * TIME.DAY,
    userKey: "seniorDev2",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "devGateway",
  },

  // 15 days ago: Compliance audit
  {
    connectionKey: "grain",
    toolName: "get_transcript",
    input: { meeting_id: "meet_compliance_audit" },
    output: { transcript: "BACEN Compliance Audit...", duration_minutes: 87 },
    isError: false,
    durationMs: 2134,
    offsetMs: -15 * TIME.DAY,
    userKey: "compliance",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "compliance",
  },

  // 7 days ago: Balance check
  {
    connectionKey: "stripe",
    toolName: "get_balance",
    input: {},
    output: { available: [{ amount: 12456789, currency: "brl" }] },
    isError: false,
    durationMs: 156,
    offsetMs: -7 * TIME.DAY,
    userKey: "qa",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "allAccess",
  },

  // 3 days ago: AI code generation
  {
    connectionKey: "openrouter",
    toolName: "chat_completion",
    input: {
      model: "openai/gpt-4-turbo",
      messages: [{ role: "user", content: "Generate TypeScript types..." }],
    },
    output: { response: "Here are the types...", tokens_used: 687 },
    isError: false,
    durationMs: 2345,
    offsetMs: -3 * TIME.DAY,
    userKey: "junior",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "llm",
  },

  // 2 days ago: Repository maintenance
  {
    connectionKey: "github",
    toolName: "list_repositories",
    input: { org: "decobank", type: "private" },
    output: { repositories: [{ name: "payment-gateway" }], total: 523 },
    isError: false,
    durationMs: 223,
    offsetMs: -2 * TIME.DAY,
    userKey: "techLead",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "devGateway",
  },

  // Today: Daily standup
  {
    connectionKey: "notion",
    toolName: "create_page",
    input: { parent_id: "db_standups", title: "Daily Standup" },
    output: { page_id: "page_standup_today" },
    isError: false,
    durationMs: 267,
    offsetMs: -2 * TIME.HOUR,
    userKey: "techLead",
    userAgent: USER_AGENTS.notionDesktop,
    gatewayKey: "compliance",
  },
];

// =============================================================================
// Synthetic Log Generator
// =============================================================================

interface ToolTemplate {
  toolName: string;
  connectionKey: string;
  weight: number;
  avgDurationMs: number;
  durationVariance: number;
  sampleInputs: object[];
  sampleOutputs: object[];
  properties?: Record<string, string>;
}

const TOOL_TEMPLATES: ToolTemplate[] = [
  // GitHub (25%)
  {
    toolName: "list_repositories",
    connectionKey: "github",
    weight: 0.08,
    avgDurationMs: 210,
    durationVariance: 90,
    sampleInputs: [{ org: "decobank" }],
    sampleOutputs: [{ repositories: [], total: 523 }],
  },
  {
    toolName: "create_pull_request",
    connectionKey: "github",
    weight: 0.05,
    avgDurationMs: 340,
    durationVariance: 120,
    sampleInputs: [{ repo: "payment-gateway", title: "Feature" }],
    sampleOutputs: [{ number: 1234, state: "open" }],
  },
  {
    toolName: "get_pr_status",
    connectionKey: "github",
    weight: 0.06,
    avgDurationMs: 180,
    durationVariance: 70,
    sampleInputs: [{ repo: "payment-gateway", pr_number: 1234 }],
    sampleOutputs: [{ state: "open", checks: { passed: 7 } }],
  },
  {
    toolName: "search_code",
    connectionKey: "github",
    weight: 0.03,
    avgDurationMs: 420,
    durationVariance: 180,
    sampleInputs: [{ query: "processPayment" }],
    sampleOutputs: [{ items: [], total: 127 }],
  },

  // OpenRouter (22%)
  {
    toolName: "chat_completion",
    connectionKey: "openrouter",
    weight: 0.15,
    avgDurationMs: 1850,
    durationVariance: 1200,
    sampleInputs: [{ model: "anthropic/claude-3.5-sonnet" }],
    sampleOutputs: [{ response: "...", tokens_used: 856 }],
    properties: { cost_usd: "0.018" },
  },
  {
    toolName: "list_models",
    connectionKey: "openrouter",
    weight: 0.04,
    avgDurationMs: 180,
    durationVariance: 60,
    sampleInputs: [{}],
    sampleOutputs: [{ models: [], total: 127 }],
  },
  {
    toolName: "get_usage_stats",
    connectionKey: "openrouter",
    weight: 0.03,
    avgDurationMs: 220,
    durationVariance: 80,
    sampleInputs: [{ period: "last_7_days" }],
    sampleOutputs: [{ total_requests: 12847, total_cost: 2456.78 }],
  },

  // Notion (18%)
  {
    toolName: "search_pages",
    connectionKey: "notion",
    weight: 0.07,
    avgDurationMs: 320,
    durationVariance: 140,
    sampleInputs: [{ query: "API documentation" }],
    sampleOutputs: [{ results: [], total: 234 }],
  },
  {
    toolName: "get_page",
    connectionKey: "notion",
    weight: 0.06,
    avgDurationMs: 240,
    durationVariance: 90,
    sampleInputs: [{ page_id: "page_123" }],
    sampleOutputs: [{ title: "Documentation", version: 34 }],
  },
  {
    toolName: "create_page",
    connectionKey: "notion",
    weight: 0.03,
    avgDurationMs: 380,
    durationVariance: 140,
    sampleInputs: [{ title: "New Page" }],
    sampleOutputs: [{ page_id: "page_new" }],
  },

  // Grain (12%)
  {
    toolName: "list_meetings",
    connectionKey: "grain",
    weight: 0.05,
    avgDurationMs: 280,
    durationVariance: 100,
    sampleInputs: [{ date_from: "2024-01-01" }],
    sampleOutputs: [{ meetings: [], total: 234 }],
  },
  {
    toolName: "get_transcript",
    connectionKey: "grain",
    weight: 0.04,
    avgDurationMs: 420,
    durationVariance: 180,
    sampleInputs: [{ meeting_id: "meet_123" }],
    sampleOutputs: [{ transcript: "...", duration_minutes: 87 }],
  },
  {
    toolName: "search_meetings",
    connectionKey: "grain",
    weight: 0.03,
    avgDurationMs: 380,
    durationVariance: 150,
    sampleInputs: [{ query: "compliance" }],
    sampleOutputs: [{ results: [], total: 67 }],
  },

  // Stripe (8%)
  {
    toolName: "list_payments",
    connectionKey: "stripe",
    weight: 0.03,
    avgDurationMs: 240,
    durationVariance: 90,
    sampleInputs: [{ limit: 100 }],
    sampleOutputs: [{ data: [], has_more: true }],
  },
  {
    toolName: "get_balance",
    connectionKey: "stripe",
    weight: 0.02,
    avgDurationMs: 150,
    durationVariance: 50,
    sampleInputs: [{}],
    sampleOutputs: [{ available: [{ amount: 1245678 }] }],
  },
  {
    toolName: "create_refund",
    connectionKey: "stripe",
    weight: 0.01,
    avgDurationMs: 320,
    durationVariance: 120,
    sampleInputs: [{ charge: "ch_123" }],
    sampleOutputs: [{ id: "re_456", status: "succeeded" }],
  },

  // Vercel (9%)
  {
    toolName: "list_deployments",
    connectionKey: "vercel",
    weight: 0.04,
    avgDurationMs: 220,
    durationVariance: 80,
    sampleInputs: [{ projectId: "prj_banking" }],
    sampleOutputs: [{ deployments: [] }],
  },
  {
    toolName: "get_deployment",
    connectionKey: "vercel",
    weight: 0.02,
    avgDurationMs: 180,
    durationVariance: 70,
    sampleInputs: [{ deployment_id: "dpl_123" }],
    sampleOutputs: [{ state: "READY" }],
  },
  {
    toolName: "list_projects",
    connectionKey: "vercel",
    weight: 0.02,
    avgDurationMs: 190,
    durationVariance: 60,
    sampleInputs: [{}],
    sampleOutputs: [{ projects: [] }],
  },

  // Supabase (6%)
  {
    toolName: "list_projects",
    connectionKey: "supabase",
    weight: 0.02,
    avgDurationMs: 210,
    durationVariance: 80,
    sampleInputs: [{}],
    sampleOutputs: [{ projects: [], total: 23 }],
  },
  {
    toolName: "get_project_health",
    connectionKey: "supabase",
    weight: 0.02,
    avgDurationMs: 180,
    durationVariance: 70,
    sampleInputs: [{ project_id: "proj_123" }],
    sampleOutputs: [{ status: "healthy" }],
  },
  {
    toolName: "run_sql",
    connectionKey: "supabase",
    weight: 0.01,
    avgDurationMs: 420,
    durationVariance: 180,
    sampleInputs: [{ query: "SELECT..." }],
    sampleOutputs: [{ rows: [] }],
  },

  // GitHub Copilot (8%)
  {
    toolName: "get_completions",
    connectionKey: "github",
    weight: 0.05,
    avgDurationMs: 450,
    durationVariance: 200,
    sampleInputs: [{ prompt: "function..." }],
    sampleOutputs: [{ completions: [] }],
  },
  {
    toolName: "explain_code",
    connectionKey: "github",
    weight: 0.02,
    avgDurationMs: 1200,
    durationVariance: 400,
    sampleInputs: [{ code: "..." }],
    sampleOutputs: [{ explanation: "..." }],
  },

  // Prisma (6%)
  {
    toolName: "generate_schema",
    connectionKey: "prisma",
    weight: 0.02,
    avgDurationMs: 890,
    durationVariance: 300,
    sampleInputs: [{ introspect: true }],
    sampleOutputs: [{ schema: "...", models_count: 23 }],
  },
  {
    toolName: "run_migration",
    connectionKey: "prisma",
    weight: 0.02,
    avgDurationMs: 2340,
    durationVariance: 800,
    sampleInputs: [{ migration_name: "add_index" }],
    sampleOutputs: [{ success: true }],
  },

  // Apify (5%)
  {
    toolName: "run_actor",
    connectionKey: "apify",
    weight: 0.02,
    avgDurationMs: 8500,
    durationVariance: 3000,
    sampleInputs: [{ actor_id: "apify/web-scraper" }],
    sampleOutputs: [{ run_id: "run_123", status: "SUCCEEDED" }],
  },
  {
    toolName: "get_dataset",
    connectionKey: "apify",
    weight: 0.015,
    avgDurationMs: 450,
    durationVariance: 180,
    sampleInputs: [{ dataset_id: "dataset_rates" }],
    sampleOutputs: [{ items: [], total: 1247 }],
  },
];

const CONNECTION_TO_GATEWAY: Record<string, string> = {
  github: "devGateway",
  vercel: "devGateway",
  prisma: "devGateway",
  supabase: "devGateway",
  openrouter: "llm",
  githubCopilot: "llm",
  notion: "compliance",
  grain: "compliance",
  apify: "dataGateway",
  stripe: "allAccess",
};

function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

function generateSyntheticLogs(targetCount: number): MonitoringLog[] {
  const logs: MonitoringLog[] = [];
  const userWeights = Object.entries(USER_ACTIVITY_WEIGHTS).map(
    ([key, weight]) => ({ key, weight }),
  );

  for (let i = 0; i < targetCount; i++) {
    const template = weightedRandom(TOOL_TEMPLATES);
    const userEntry = weightedRandom(userWeights);
    const isError = Math.random() < 0.08;

    // Generate timestamp with recency bias (40% last 24h, 35% last 7d, 20% last 30d, 5% last 90d)
    const r = Math.random();
    let daysAgo =
      r < 0.4
        ? Math.random()
        : r < 0.75
          ? 1 + Math.random() * 6
          : r < 0.95
            ? 7 + Math.random() * 23
            : 30 + Math.random() * 60;

    const timestamp = new Date(Date.now() - daysAgo * TIME.DAY);
    // Adjust to working hours (8-20)
    const hour = timestamp.getHours();
    if (hour < 8 || hour > 20)
      timestamp.setHours(8 + Math.floor(Math.random() * 12));

    const duration =
      template.avgDurationMs +
      (Math.random() - 0.5) * 2 * template.durationVariance;
    const input = template.sampleInputs[
      Math.floor(Math.random() * template.sampleInputs.length)
    ] as Record<string, unknown>;
    const output = (
      isError
        ? { error: "Internal error" }
        : template.sampleOutputs[
            Math.floor(Math.random() * template.sampleOutputs.length)
          ]
    ) as Record<string, unknown>;

    logs.push({
      connectionKey: template.connectionKey,
      toolName: template.toolName,
      input,
      output,
      isError,
      durationMs: Math.max(50, Math.round(duration)),
      offsetMs: timestamp.getTime() - Date.now(),
      userKey: userEntry.key,
      userAgent: "mesh-client/1.0",
      gatewayKey: CONNECTION_TO_GATEWAY[template.connectionKey] || "allAccess",
      properties: template.properties,
    });
  }

  return logs.sort((a, b) => a.offsetMs - b.offsetMs);
}

// =============================================================================
// Seed Function
// =============================================================================

export const DECO_BANK_SLUG = "deco-bank";

export async function seedDecoBank(
  db: Kysely<Database>,
): Promise<OrgSeedResult> {
  // Generate ~2500 synthetic logs + static story logs
  const syntheticLogs = generateSyntheticLogs(2500);
  const allLogs = [...STATIC_LOGS, ...syntheticLogs];

  const config: OrgConfig = {
    orgName: "Deco Bank",
    orgSlug: DECO_BANK_SLUG,
    users: USERS,
    apiKeys: [
      { userKey: "cto", name: "CTO API Key" },
      { userKey: "techLead", name: "Tech Lead API Key" },
    ],
    connections: CONNECTIONS,
    gateways: GATEWAYS,
    gatewayConnections: [{ gatewayKey: "llm", connectionKey: "openrouter" }],
    logs: allLogs,
    ownerUserKey: "cto",
  };

  return createOrg(db, config);
}
