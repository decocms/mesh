export const RUNTIME_DEFAULTS = {
  node: { install: "npm install", dev: "npm run dev" },
  bun: { install: "bun install", dev: "bun run dev" },
  deno: { install: "deno install", dev: "deno task start" },
} as const;

export type RuntimeType = keyof typeof RUNTIME_DEFAULTS;

export const RUNTIME_LABELS: Record<RuntimeType, string> = {
  node: "Node.js",
  bun: "Bun",
  deno: "Deno",
};
