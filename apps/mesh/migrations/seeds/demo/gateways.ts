/**
 * Demo Gateways Configuration
 */

import type { DemoGateway } from "./types";

export const DEMO_GATEWAYS: Record<string, DemoGateway> = {
  openrouter: {
    title: "OpenRouter Gateway",
    description: "Access hundreds of LLM models from a single API",
    toolSelectionStrategy: "passthrough",
    toolSelectionMode: "inclusion",
    icon: "https://assets.decocache.com/decocms/b2e2f64f-6025-45f7-9e8c-3b3ebdd073d8/openrouter_logojpg.jpg",
    isDefault: false,
    connections: ["openrouter"],
  },
  default: {
    title: "Default Gateway",
    description: "Auto-created gateway for organization",
    toolSelectionStrategy: "passthrough",
    toolSelectionMode: "inclusion",
    icon: null,
    isDefault: true,
    connections: ["notion", "github", "nanoBanana", "veo3", "sora", "grain"],
  },
} as const;
