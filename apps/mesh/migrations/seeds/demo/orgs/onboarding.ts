/**
 * Onboarding Organization
 *
 * Minimal setup for demonstrating first steps:
 * - 2 users (admin + developer)
 * - 6 connections (3 well-known + GitHub, OpenRouter, Notion)
 * - 1 gateway (Default Hub)
 * - ~16 logs showing early adoption
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

const EMAIL_DOMAIN = "@onboarding.local";

const USERS: Record<string, OrgUser> = {
  admin: {
    role: "admin",
    memberRole: "owner",
    name: "Alice Admin",
    email: `admin${EMAIL_DOMAIN}`,
  },
  developer: {
    role: "user",
    memberRole: "user",
    name: "Dev Developer",
    email: `developer${EMAIL_DOMAIN}`,
  },
};

// Include well-known connections (Mesh MCP, MCP Registry, Deco Store) + additional ones
const CONNECTIONS = {
  ...getWellKnownConnections(),
  ...pickConnections(["github", "openrouter", "notion"]),
};

// Override defaultHub to include only well-known connections (production behavior)
const GATEWAYS = {
  defaultHub: {
    title: "Default Hub",
    description: "Auto-created Hub for organization",
    toolSelectionStrategy: "passthrough" as const,
    toolSelectionMode: "inclusion" as const,
    icon: null,
    isDefault: true,
    connections: ["meshMcp", "mcpRegistry", "decoStore"],
  },
};

// =============================================================================
// Monitoring Logs - Early adoption pattern over 48 hours
// =============================================================================

const LOGS: MonitoringLog[] = [
  // 2 days ago: First connection test
  {
    connectionKey: "github",
    toolName: "list_repositories",
    input: { per_page: 10 },
    output: {
      repositories: ["my-first-project", "learning-mcp"],
      total_count: 2,
    },
    isError: false,
    durationMs: 234,
    offsetMs: -2 * TIME.DAY,
    userKey: "admin",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: null,
    properties: { cache_hit: "false" },
  },

  // 1.5 days ago: Trying OpenRouter without auth
  {
    connectionKey: "openrouter",
    toolName: "chat_completion",
    input: {
      model: "anthropic/claude-3.5-sonnet",
      messages: [{ role: "user", content: "Hello!" }],
    },
    output: { error: "API key required" },
    isError: true,
    errorMessage:
      "Authentication required. Please configure your OpenRouter API key.",
    durationMs: 45,
    offsetMs: -36 * TIME.HOUR,
    userKey: "admin",
    userAgent: USER_AGENTS.cursorAgent,
    gatewayKey: "defaultHub",
    properties: { auth_error: "true" },
  },

  // 1 day ago: Developer joins
  {
    connectionKey: "github",
    toolName: "get_repository",
    input: { owner: "onboarding-org", repo: "my-first-project" },
    output: {
      name: "my-first-project",
      description: "Learning MCP integration",
      default_branch: "main",
    },
    isError: false,
    durationMs: 156,
    offsetMs: -1 * TIME.DAY,
    userKey: "developer",
    userAgent: USER_AGENTS.vscode,
    gatewayKey: "defaultHub",
  },

  // 1 day ago: Trying Notion without auth
  {
    connectionKey: "notion",
    toolName: "search_pages",
    input: { query: "getting started" },
    output: { error: "OAuth authentication required" },
    isError: true,
    errorMessage: "Please connect your Notion account to use this tool.",
    durationMs: 67,
    offsetMs: -1 * TIME.DAY + 2 * TIME.HOUR,
    userKey: "admin",
    userAgent: USER_AGENTS.notionDesktop,
    gatewayKey: "defaultHub",
    properties: { auth_error: "true" },
  },

  // 20 hours ago: GitHub exploration
  {
    connectionKey: "github",
    toolName: "list_issues",
    input: { repo: "my-first-project", state: "open" },
    output: {
      issues: [
        { number: 1, title: "Set up CI/CD" },
        { number: 2, title: "Add README" },
      ],
      total_count: 2,
    },
    isError: false,
    durationMs: 189,
    offsetMs: -20 * TIME.HOUR,
    userKey: "developer",
    userAgent: USER_AGENTS.ghCli,
    gatewayKey: "defaultHub",
  },

  // 18 hours ago: Creating first issue
  {
    connectionKey: "github",
    toolName: "create_issue",
    input: {
      repo: "my-first-project",
      title: "Integrate MCP tools",
      labels: ["enhancement"],
    },
    output: {
      issue_number: 3,
      url: "https://github.com/onboarding-org/my-first-project/issues/3",
    },
    isError: false,
    durationMs: 312,
    offsetMs: -18 * TIME.HOUR,
    userKey: "admin",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "defaultHub",
  },

  // 12 hours ago: Admin exploring
  {
    connectionKey: "github",
    toolName: "list_branches",
    input: { repo: "my-first-project" },
    output: { branches: ["main", "feature/mcp-setup"], total_count: 2 },
    isError: false,
    durationMs: 145,
    offsetMs: -12 * TIME.HOUR,
    userKey: "admin",
    userAgent: USER_AGENTS.vscode,
    gatewayKey: "defaultHub",
    properties: { cache_hit: "true" },
  },

  // 10 hours ago: Developer working
  {
    connectionKey: "github",
    toolName: "get_file_contents",
    input: { repo: "my-first-project", path: "README.md" },
    output: { content: "# My First Project", encoding: "utf-8", size: 52 },
    isError: false,
    durationMs: 98,
    offsetMs: -10 * TIME.HOUR,
    userKey: "developer",
    userAgent: USER_AGENTS.cursorAgent,
    gatewayKey: "defaultHub",
  },

  // 8 hours ago: Another OpenRouter attempt
  {
    connectionKey: "openrouter",
    toolName: "list_models",
    input: {},
    output: { error: "API key required" },
    isError: true,
    errorMessage:
      "Authentication required. Please configure your OpenRouter API key.",
    durationMs: 34,
    offsetMs: -8 * TIME.HOUR,
    userKey: "developer",
    userAgent: USER_AGENTS.cursorAgent,
    gatewayKey: "defaultHub",
    properties: { auth_error: "true" },
  },

  // 6 hours ago: Creating PR
  {
    connectionKey: "github",
    toolName: "create_pull_request",
    input: {
      repo: "my-first-project",
      title: "Add MCP configuration",
      head: "feature/mcp-setup",
      base: "main",
    },
    output: {
      pr_number: 1,
      url: "https://github.com/onboarding-org/my-first-project/pull/1",
    },
    isError: false,
    durationMs: 287,
    offsetMs: -6 * TIME.HOUR,
    userKey: "developer",
    userAgent: USER_AGENTS.ghCli,
    gatewayKey: "defaultHub",
  },

  // 4 hours ago: Admin reviewing PR
  {
    connectionKey: "github",
    toolName: "get_pull_request",
    input: { repo: "my-first-project", pr_number: 1 },
    output: {
      number: 1,
      title: "Add MCP configuration",
      state: "open",
      mergeable: true,
    },
    isError: false,
    durationMs: 167,
    offsetMs: -4 * TIME.HOUR,
    userKey: "admin",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "defaultHub",
  },

  // 3 hours ago: Listing PRs
  {
    connectionKey: "github",
    toolName: "list_pull_requests",
    input: { repo: "my-first-project", state: "open" },
    output: {
      pull_requests: [{ number: 1, title: "Add MCP configuration" }],
      total_count: 1,
    },
    isError: false,
    durationMs: 134,
    offsetMs: -3 * TIME.HOUR,
    userKey: "developer",
    userAgent: USER_AGENTS.vscode,
    gatewayKey: "defaultHub",
    properties: { cache_hit: "true" },
  },

  // 2 hours ago: Checking issue
  {
    connectionKey: "github",
    toolName: "get_issue",
    input: { repo: "my-first-project", issue_number: 3 },
    output: {
      number: 3,
      title: "Integrate MCP tools",
      state: "open",
      comments: 1,
    },
    isError: false,
    durationMs: 112,
    offsetMs: -2 * TIME.HOUR,
    userKey: "admin",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "defaultHub",
  },

  // 1 hour ago: Recent activity
  {
    connectionKey: "github",
    toolName: "list_commits",
    input: {
      repo: "my-first-project",
      branch: "feature/mcp-setup",
      per_page: 5,
    },
    output: {
      commits: [{ sha: "abc123", message: "Add MCP config files" }],
      total_count: 2,
    },
    isError: false,
    durationMs: 178,
    offsetMs: -1 * TIME.HOUR,
    userKey: "developer",
    userAgent: USER_AGENTS.cursorAgent,
    gatewayKey: "defaultHub",
  },

  // 30 minutes ago: Last Notion attempt
  {
    connectionKey: "notion",
    toolName: "list_databases",
    input: {},
    output: { error: "OAuth authentication required" },
    isError: true,
    errorMessage: "Please connect your Notion account to use this tool.",
    durationMs: 52,
    offsetMs: -30 * TIME.MINUTE,
    userKey: "admin",
    userAgent: USER_AGENTS.notionDesktop,
    gatewayKey: "defaultHub",
    properties: { auth_error: "true" },
  },

  // Just now: Current activity
  {
    connectionKey: "github",
    toolName: "list_repositories",
    input: { per_page: 20 },
    output: {
      repositories: ["my-first-project", "learning-mcp", "mcp-experiments"],
      total_count: 3,
    },
    isError: false,
    durationMs: 198,
    offsetMs: 0,
    userKey: "admin",
    userAgent: USER_AGENTS.meshClient,
    gatewayKey: "defaultHub",
  },
];

// =============================================================================
// Seed Function
// =============================================================================

export const ONBOARDING_SLUG = "onboarding";

export async function seedOnboarding(
  db: Kysely<Database>,
): Promise<OrgSeedResult> {
  const config: OrgConfig = {
    orgName: "Onboarding",
    orgSlug: ONBOARDING_SLUG,
    users: USERS,
    apiKeys: [{ userKey: "admin", name: "Onboarding Admin Key" }],
    connections: CONNECTIONS,
    gateways: GATEWAYS,
    gatewayConnections: [
      // Default Hub with well-known connections (production-like)
      { gatewayKey: "defaultHub", connectionKey: "meshMcp" },
      { gatewayKey: "defaultHub", connectionKey: "mcpRegistry" },
      { gatewayKey: "defaultHub", connectionKey: "decoStore" },
    ],
    logs: LOGS,
    ownerUserKey: "admin",
  };

  return createOrg(db, config);
}
