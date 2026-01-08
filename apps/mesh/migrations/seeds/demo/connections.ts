/**
 * Demo MCP Connections
 *
 * All connections use real URLs, icons, and descriptions from the deco registry.
 */

import type { DemoConnection } from "./types";

export const DEMO_CONNECTIONS: Record<string, DemoConnection> = {
  notion: {
    title: "Notion",
    description: "Manage pages and databases in Notion workspaces",
    icon: "https://www.notion.so/images/logo-ios.png",
    appName: "Notion",
    connectionUrl: "https://mcp.notion.com/mcp",
    connectionToken: null,
    configurationState: "needs_auth",
    metadata: {
      provider: "notion",
      requiresOAuth: true,
      official: true,
    },
  },
  github: {
    title: "GitHub",
    description: "GitHub issues, PRs, and repository management (deco-hosted)",
    icon: "https://github.githubassets.com/favicons/favicon.svg",
    appName: "GitHub",
    connectionUrl: "https://api.decocms.com/apps/deco/github/mcp",
    connectionToken: "ghp_demo_fake_token_DO_NOT_USE_IN_PRODUCTION",
    configurationState: null,
    metadata: {
      provider: "github",
      requiresOAuth: true,
      decoHosted: true,
      demoToken: true,
      demoNote:
        "Demo token for testing. Replace with real OAuth in production.",
    },
  },
  openrouter: {
    title: "openrouter",
    description: "OpenRouter App Connection for LLM uses.",
    icon: "https://assets.decocache.com/decocms/b2e2f64f-6025-45f7-9e8c-3b3ebdd073d8/openrouter_logojpg.jpg",
    appName: "openrouter",
    connectionUrl: "https://sites-openrouter.decocache.com/mcp",
    connectionToken: null,
    configurationState: "needs_auth",
    metadata: {
      provider: "deco",
      requiresApiKey: true,
      decoHosted: true,
    },
  },
  nanoBanana: {
    title: "Nano Banana",
    description: "Use Nano Banana Integration to create images using AI.",
    icon: "https://assets.decocache.com/starting/62401ea6-55e6-433d-b614-e43196890e05/nanobanana.png",
    appName: "nanobanana",
    connectionUrl: "https://api.decocms.com/apps/deco/nanobanana/mcp",
    connectionToken: "nano_demo_token_fake",
    configurationState: null,
    metadata: {
      provider: "deco",
      decoHosted: true,
      demoToken: true,
    },
  },
  veo3: {
    title: "Google Veo 3.1",
    description:
      "Generate high-quality videos with audio using Google Gemini Veo 3 and Veo 3.1 models. Supports text-to-video, image-to-video, and video extension.",
    icon: "https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg",
    appName: "veo3",
    connectionUrl: "https://api.decocms.com/apps/deco/veo3/mcp",
    connectionToken: null,
    configurationState: "needs_auth",
    metadata: {
      provider: "deco",
      decoHosted: true,
      requiresApiKey: true,
    },
  },
  sora: {
    title: "OpenAI Sora 2",
    description: "Use OpenAI Sora 2 to generate professional videos using AI.",
    icon: "https://cdn.openai.com/nf2/nf2-lp/misc/dark-mode-icon.png?w=3840&q=100&fm=webp",
    appName: "sora",
    connectionUrl: "https://api.decocms.com/apps/deco/sora/mcp",
    connectionToken: "sora_demo_token_fake",
    configurationState: null,
    metadata: {
      provider: "deco",
      decoHosted: true,
      demoToken: true,
    },
  },
  grain: {
    title: "Grain mcp",
    description:
      "Grain Official MCP - Acesse e gerencie suas reuniões, transcrições e insights do Grain. Este é o MCP oficial da Grain para integração completa com a plataforma de gravação e análise de reuniões.",
    icon: "https://assets.decocache.com/mcp/1bfc7176-e7be-487c-83e6-4b9e970a8e10/Grain.svg",
    appName: "Grain mcp",
    connectionUrl: "https://api.grain.com/_/mcp",
    connectionToken: "grain_demo_token_fake",
    configurationState: null,
    metadata: {
      provider: "grain",
      official: true,
      demoToken: true,
    },
  },
} as const;
