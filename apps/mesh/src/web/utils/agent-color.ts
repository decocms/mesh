/**
 * Color palette for agent borders and backgrounds.
 * Each color includes border, background, and text variants.
 */
const AGENT_COLORS = [
  {
    border: "border-purple-400",
    bg: "bg-purple-400",
    text: "text-white",
    bgLight: "bg-purple-400/10",
  },
  {
    border: "border-blue-400",
    bg: "bg-blue-400",
    text: "text-white",
    bgLight: "bg-blue-400/10",
  },
  {
    border: "border-indigo-400",
    bg: "bg-indigo-400",
    text: "text-white",
    bgLight: "bg-indigo-400/10",
  },
  {
    border: "border-violet-400",
    bg: "bg-violet-400",
    text: "text-white",
    bgLight: "bg-violet-400/10",
  },
  {
    border: "border-pink-400",
    bg: "bg-pink-400",
    text: "text-white",
    bgLight: "bg-pink-400/10",
  },
  {
    border: "border-fuchsia-400",
    bg: "bg-fuchsia-400",
    text: "text-white",
    bgLight: "bg-fuchsia-400/10",
  },
  {
    border: "border-emerald-400",
    bg: "bg-emerald-400",
    text: "text-white",
    bgLight: "bg-emerald-400/10",
  },
  {
    border: "border-teal-400",
    bg: "bg-teal-400",
    text: "text-white",
    bgLight: "bg-teal-400/10",
  },
  {
    border: "border-cyan-400",
    bg: "bg-cyan-400",
    text: "text-white",
    bgLight: "bg-cyan-400/10",
  },
  {
    border: "border-sky-400",
    bg: "bg-sky-400",
    text: "text-white",
    bgLight: "bg-sky-400/10",
  },
  {
    border: "border-orange-400",
    bg: "bg-orange-400",
    text: "text-white",
    bgLight: "bg-orange-400/10",
  },
  {
    border: "border-amber-400",
    bg: "bg-amber-400",
    text: "text-white",
    bgLight: "bg-amber-400/10",
  },
  {
    border: "border-rose-400",
    bg: "bg-rose-400",
    text: "text-white",
    bgLight: "bg-rose-400/10",
  },
  {
    border: "border-lime-400",
    bg: "bg-lime-400",
    text: "text-white",
    bgLight: "bg-lime-400/10",
  },
] as const;

export type AgentColor = (typeof AGENT_COLORS)[number];

/**
 * Generate a deterministic hash from a string.
 */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/**
 * Get a deterministic color for an agent based on its ID.
 * Returns null for default agent (null/undefined = no special styling).
 *
 * @param agentId - The agent ID (null/undefined means default)
 * @returns AgentColor object or null for default
 */
export function getAgentColor(
  agentId: string | null | undefined,
): AgentColor | null {
  if (agentId == null) {
    return null;
  }

  const hash = hashString(agentId);
  const index = hash % AGENT_COLORS.length;
  return AGENT_COLORS[index]!;
}
