/**
 * Demo Monitoring Logs
 *
 * Rich demo data spanning 7 days with realistic tool calls, errors, and usage patterns.
 * All logs are generated relative to the current time using offsetMs (in milliseconds).
 */

import type { DemoMonitoringLog } from "./types";

const DAYS = 24 * 60 * 60 * 1000;
const HOURS = 60 * 60 * 1000;
const MINUTES = 60 * 1000;

export const DEMO_MONITORING_LOGS: DemoMonitoringLog[] = [
  // === 7 days ago: Initial setup ===
  {
    connectionKey: "github",
    toolName: "list_repositories",
    input: { org: "decocms", per_page: 30 },
    output: {
      repositories: ["mesh", "runtime", "bindings", "ui", "cli"],
      total_count: 5,
    },
    isError: false,
    durationMs: 243,
    offsetMs: -7 * DAYS,
    userRole: "admin",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "allTools",
    properties: {
      cache_hit: "false",
      region: "us-east-1",
    },
  },

  // === 6 days ago: Developer working ===
  {
    connectionKey: "github",
    toolName: "create_issue",
    input: {
      repo: "mesh",
      title: "Add demo seed support",
      body: "Implement comprehensive demo seed for bank presentations",
      labels: ["enhancement", "demo"],
    },
    output: {
      issue_number: 156,
      url: "https://github.com/decocms/mesh/issues/156",
      state: "open",
    },
    isError: false,
    durationMs: 187,
    offsetMs: -6 * DAYS,
    userRole: "developer",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "allTools",
    properties: { cache_hit: "false" },
  },

  // === 5 days ago: OpenRouter LLM usage ===
  {
    connectionKey: "openrouter",
    toolName: "chat_completion",
    input: {
      model: "anthropic/claude-3.5-sonnet",
      messages: [
        {
          role: "user",
          content: "Explain the benefits of MCP for enterprise banking",
        },
      ],
      max_tokens: 500,
    },
    output: {
      response:
        "MCP provides enterprise banking with standardized AI integration, secure tool access, audit trails, and centralized policy management...",
      tokens: 412,
      finish_reason: "stop",
    },
    isError: false,
    durationMs: 1847,
    offsetMs: -5 * DAYS,
    userRole: "analyst",
    userAgent: "claude-desktop/1.2.0",
    gatewayKey: "openrouter",
    properties: {
      tokens_prompt: "18",
      tokens_completion: "412",
      cost_usd: "0.0082",
      model: "anthropic/claude-3.5-sonnet",
      cache_hit: "false",
    },
  },

  // === 5 days ago: Notion auth error ===
  {
    connectionKey: "notion",
    toolName: "search_pages",
    input: { query: "product roadmap", limit: 10 },
    output: { error: "Authentication required" },
    isError: true,
    errorMessage:
      "OAuth authentication required. Connect your Notion account to use this tool.",
    durationMs: 67,
    offsetMs: -5 * DAYS,
    userRole: "analyst",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "allTools",
    properties: { auth_error: "true" },
  },

  // === 4 days ago: Nano Banana image generation ===
  {
    connectionKey: "nanoBanana",
    toolName: "generate_image",
    input: {
      prompt: "Modern banking dashboard with AI assistant",
      style: "professional",
      size: "1024x1024",
    },
    output: {
      image_url: "https://assets.decocache.com/generated/abc123.png",
      seed: 42,
      model: "nano-banana-v2",
    },
    isError: false,
    durationMs: 3421,
    offsetMs: -4 * DAYS,
    userRole: "developer",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "smart",
    properties: {
      tokens: "856",
      cost_usd: "0.0342",
      gpu_time_ms: "3200",
      cache_hit: "false",
    },
  },

  // === 4 days ago: Grain meeting summary ===
  {
    connectionKey: "grain",
    toolName: "get_meeting_summary",
    input: {
      meeting_id: "meet_xyz789",
      include_transcript: true,
    },
    output: {
      summary:
        "Quarterly review: Discussed MCP integration roadmap, budget allocation for Q2, and demo requirements for Banco Itaú presentation.",
      duration_minutes: 45,
      participants: 8,
      key_points: [
        "MCP demo approval",
        "Budget increased by 15%",
        "Timeline: 2 weeks",
      ],
    },
    isError: false,
    durationMs: 892,
    offsetMs: -4 * DAYS,
    userRole: "analyst",
    userAgent: "grain-desktop/2.1.0",
    gatewayKey: "smart",
    properties: {
      transcript_length: "12547",
      speakers: "8",
      cache_hit: "false",
    },
  },

  // === 3 days ago: OpenRouter rate limit ===
  {
    connectionKey: "openrouter",
    toolName: "chat_completion",
    input: {
      model: "openai/gpt-4-turbo",
      messages: [{ role: "user", content: "Generate quarterly report" }],
    },
    output: {
      error: "Rate limit exceeded. Please try again in 60 seconds.",
    },
    isError: true,
    errorMessage: "Rate limit exceeded (429)",
    durationMs: 123,
    offsetMs: -3 * DAYS,
    userRole: "billing",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "openrouter",
    properties: {
      rate_limit: "true",
      retry_after: "60",
      requests_remaining: "0",
    },
  },

  // === 3 days ago: GitHub PR review ===
  {
    connectionKey: "github",
    toolName: "create_pull_request_review",
    input: {
      repo: "mesh",
      pr_number: 42,
      event: "APPROVE",
      body: "LGTM! Demo seed looks great.",
    },
    output: {
      review_id: 98765,
      state: "APPROVED",
      submitted_at: new Date(Date.now() - 3 * DAYS).toISOString(),
    },
    isError: false,
    durationMs: 234,
    offsetMs: -3 * DAYS,
    userRole: "admin",
    userAgent: "github-cli/2.40.0",
    gatewayKey: "allTools",
    properties: { cache_hit: "false" },
  },

  // === 2 days ago: Sora video generation ===
  {
    connectionKey: "sora",
    toolName: "generate_video",
    input: {
      prompt:
        "Professional banking environment with AI assistants helping customers",
      duration_seconds: 10,
      resolution: "1080p",
    },
    output: {
      video_url: "https://cdn.openai.com/sora/video_def456.mp4",
      duration: 10,
      frames: 240,
      model: "sora-2-turbo",
    },
    isError: false,
    durationMs: 12543,
    offsetMs: -2 * DAYS,
    userRole: "developer",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "smart",
    properties: {
      tokens: "2134",
      cost_usd: "0.567",
      gpu_time_ms: "11800",
      cache_hit: "false",
      resolution: "1920x1080",
    },
  },

  // === 2 days ago: Veo3 video auth error ===
  {
    connectionKey: "veo3",
    toolName: "generate_video",
    input: {
      prompt: "Banking app demo walkthrough",
      duration_seconds: 15,
    },
    output: { error: "API key required" },
    isError: true,
    errorMessage: "Authentication failed. Please add your Veo3 API key.",
    durationMs: 89,
    offsetMs: -2 * DAYS,
    userRole: "viewer",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "allTools",
    properties: { auth_error: "true" },
  },

  // === 1 day ago: Morning peak - Multiple operations ===
  {
    connectionKey: "openrouter",
    toolName: "chat_completion",
    input: {
      model: "anthropic/claude-3.5-sonnet",
      messages: [
        {
          role: "user",
          content: "Summarize this week's development progress",
        },
      ],
    },
    output: {
      response:
        "This week: Completed demo seed, added 7 MCP connections, implemented 3 gateways, and created rich monitoring data.",
      tokens: 234,
    },
    isError: false,
    durationMs: 1234,
    offsetMs: -1 * DAYS,
    userRole: "admin",
    userAgent: "cursor-agent/0.42.0",
    gatewayKey: "openrouter",
    properties: {
      tokens_prompt: "12",
      tokens_completion: "234",
      cost_usd: "0.0047",
      cache_hit: "true",
    },
  },
  {
    connectionKey: "github",
    toolName: "list_pull_requests",
    input: { repo: "mesh", state: "open", per_page: 20 },
    output: {
      pull_requests: [
        { number: 42, title: "Add demo seed", state: "open" },
        { number: 43, title: "Update docs", state: "open" },
      ],
      total_count: 2,
    },
    isError: false,
    durationMs: 167,
    offsetMs: -1 * DAYS,
    userRole: "developer",
    userAgent: "gh-cli/2.40.0",
    gatewayKey: "allTools",
    properties: { cache_hit: "true" },
  },
  {
    connectionKey: "nanoBanana",
    toolName: "upscale_image",
    input: {
      image_url: "https://assets.decocache.com/generated/abc123.png",
      scale: 2,
    },
    output: {
      image_url: "https://assets.decocache.com/generated/abc123_2x.png",
      resolution: "2048x2048",
    },
    isError: false,
    durationMs: 2156,
    offsetMs: -1 * DAYS,
    userRole: "developer",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "smart",
    properties: {
      tokens: "423",
      cost_usd: "0.0169",
      cache_hit: "false",
    },
  },

  // === 12 hours ago: Grain meeting ===
  {
    connectionKey: "grain",
    toolName: "list_recent_meetings",
    input: { limit: 10, days: 7 },
    output: {
      meetings: [
        {
          id: "meet_xyz789",
          title: "Quarterly Review",
          date: new Date(Date.now() - 4 * DAYS).toISOString(),
          duration: 45,
        },
        {
          id: "meet_abc123",
          title: "Demo Planning",
          date: new Date(Date.now() - 2 * DAYS).toISOString(),
          duration: 30,
        },
      ],
      total_count: 2,
    },
    isError: false,
    durationMs: 234,
    offsetMs: -12 * HOURS,
    userRole: "analyst",
    userAgent: "grain-desktop/2.1.0",
    gatewayKey: "smart",
    properties: { cache_hit: "false" },
  },

  // === 6 hours ago: Afternoon work ===
  {
    connectionKey: "github",
    toolName: "get_issue",
    input: { repo: "mesh", issue_number: 156 },
    output: {
      number: 156,
      title: "Add demo seed support",
      state: "closed",
      closed_at: new Date(Date.now() - 3 * DAYS).toISOString(),
      comments: 12,
    },
    isError: false,
    durationMs: 98,
    offsetMs: -6 * HOURS,
    userRole: "viewer",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "allTools",
    properties: { cache_hit: "true" },
  },
  {
    connectionKey: "openrouter",
    toolName: "list_models",
    input: { provider: "anthropic" },
    output: {
      models: [
        "anthropic/claude-3.5-sonnet",
        "anthropic/claude-3-opus",
        "anthropic/claude-3-haiku",
      ],
      total_count: 3,
    },
    isError: false,
    durationMs: 134,
    offsetMs: -6 * HOURS,
    userRole: "billing",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "openrouter",
    properties: { cache_hit: "true" },
  },

  // === 2 hours ago: Recent activity ===
  {
    connectionKey: "sora",
    toolName: "check_generation_status",
    input: { job_id: "job_def456" },
    output: {
      status: "completed",
      video_url: "https://cdn.openai.com/sora/video_def456.mp4",
      progress: 100,
    },
    isError: false,
    durationMs: 67,
    offsetMs: -2 * HOURS,
    userRole: "developer",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "smart",
    properties: { cache_hit: "false" },
  },

  // === 1 hour ago ===
  {
    connectionKey: "github",
    toolName: "merge_pull_request",
    input: {
      repo: "mesh",
      pr_number: 42,
      merge_method: "squash",
    },
    output: {
      merged: true,
      sha: "a1b2c3d4e5f6",
      message: "Merged PR #42: Add demo seed",
    },
    isError: false,
    durationMs: 432,
    offsetMs: -1 * HOURS,
    userRole: "admin",
    userAgent: "gh-cli/2.40.0",
    gatewayKey: "allTools",
    properties: { cache_hit: "false" },
  },

  // === 30 minutes ago ===
  {
    connectionKey: "notion",
    toolName: "create_page",
    input: {
      parent_id: "database-789",
      title: "Banco Itaú Demo Notes",
      content: "Preparation checklist for demo presentation",
    },
    output: { error: "Authentication required" },
    isError: true,
    errorMessage:
      "OAuth authentication required. Connect your Notion account to use this tool.",
    durationMs: 78,
    offsetMs: -30 * MINUTES,
    userRole: "analyst",
    userAgent: "notion-desktop/3.5.0",
    gatewayKey: "allTools",
    properties: { auth_error: "true" },
  },

  // === 10 minutes ago: High frequency usage ===
  {
    connectionKey: "openrouter",
    toolName: "chat_completion",
    input: {
      model: "openai/gpt-4o",
      messages: [
        {
          role: "user",
          content: "Review this demo seed implementation for best practices",
        },
      ],
      max_tokens: 1000,
    },
    output: {
      response:
        "The demo seed implementation looks excellent. It covers all key aspects: diverse users, comprehensive MCPs, realistic monitoring data, and proper error handling...",
      tokens: 876,
    },
    isError: false,
    durationMs: 2341,
    offsetMs: -10 * MINUTES,
    userRole: "developer",
    userAgent: "cursor-agent/0.42.0",
    gatewayKey: "openrouter",
    properties: {
      tokens_prompt: "15",
      tokens_completion: "876",
      cost_usd: "0.0175",
      model: "openai/gpt-4o",
      cache_hit: "false",
    },
  },

  // === 5 minutes ago ===
  {
    connectionKey: "nanoBanana",
    toolName: "generate_variations",
    input: {
      base_image_url: "https://assets.decocache.com/generated/abc123.png",
      variations: 3,
    },
    output: {
      variations: [
        "https://assets.decocache.com/generated/abc123_v1.png",
        "https://assets.decocache.com/generated/abc123_v2.png",
        "https://assets.decocache.com/generated/abc123_v3.png",
      ],
    },
    isError: false,
    durationMs: 4567,
    offsetMs: -5 * MINUTES,
    userRole: "developer",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "smart",
    properties: {
      tokens: "1245",
      cost_usd: "0.0498",
      cache_hit: "false",
    },
  },

  // === Just now: Real-time activity ===
  {
    connectionKey: "grain",
    toolName: "search_transcripts",
    input: {
      query: "demo presentation budget",
      limit: 5,
    },
    output: {
      results: [
        {
          meeting_id: "meet_xyz789",
          snippet: "...budget allocation for Q2 demo increased by 15%...",
          timestamp: "00:23:45",
        },
      ],
      total_count: 1,
    },
    isError: false,
    durationMs: 567,
    offsetMs: 0,
    userRole: "billing",
    userAgent: "grain-desktop/2.1.0",
    gatewayKey: "smart",
    properties: {
      search_index_size: "547823",
      cache_hit: "false",
    },
  },
];
