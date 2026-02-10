import { getCollection } from "astro:content";

export interface NavigationLink {
  title: string;
  description?: string;
  href: string;
}

export async function getNavigationLinks(
  currentDocId: string,
  locale: string,
): Promise<{ previous?: NavigationLink; next?: NavigationLink }> {
  const allDocs = await getCollection("docs");
  const docs = allDocs.filter((doc) => doc.id.split("/")[0] === locale);

  // Define the correct order for navigation
  const order = [
    // 1. Quickstart & Overview
    "mcp-mesh/quickstart",
    "mcp-mesh/overview",

    // 2. Getting Started
    "getting-started/ai-builders",
    "getting-started/developers",

    // 4. Core Concepts
    "mcp-mesh/concepts",

    // 5. Working with MCP
    "mcp-mesh/connections",
    "mcp-mesh/virtual-mcps",
    "mcp-mesh/projects",
    "mcp-mesh/agents",

    // 6. Decopilot
    "mcp-mesh/decopilot/overview",
    "mcp-mesh/decopilot/quickstart",
    "mcp-mesh/decopilot/context",
    "mcp-mesh/decopilot/tasks-and-spawning",
    "mcp-mesh/decopilot/tools",
    "mcp-mesh/decopilot/scopes",
    "mcp-mesh/decopilot/architecture",

    // 7. Monitoring & Observability
    "mcp-mesh/monitoring",

    // 8. User Management
    "mcp-mesh/api-keys",
    "mcp-mesh/user-management",

    // 9. API Reference
    "mcp-mesh/api-reference/connection-proxy",
    "mcp-mesh/api-reference/built-in-tools",
    "mcp-mesh/api-reference/built-in-tools/tool-search",
    "mcp-mesh/api-reference/built-in-tools/tool-enable",
    "mcp-mesh/api-reference/built-in-tools/agent-search",
    "mcp-mesh/api-reference/built-in-tools/subtask-run",
    "mcp-mesh/api-reference/built-in-tools/user-ask",
    "mcp-mesh/api-reference/built-in-tools/resource-read",
    "mcp-mesh/api-reference/built-in-tools/prompt-read",

    // 10. Self-Hosting
    "mcp-mesh/self-hosting/quickstart",
    "mcp-mesh/self-hosting/authentication",
    "mcp-mesh/self-hosting/deploy/docker-compose",
    "mcp-mesh/self-hosting/deploy/kubernetes",

    // 11. Legacy Admin Guides (no-code and full-code guides)
    "no-code-guides/creating-tools",
    "no-code-guides/creating-agents",
    "full-code-guides/project-structure",
    "full-code-guides/building-tools",
    "full-code-guides/building-views",
    "full-code-guides/resources",
    "full-code-guides/deployment",
  ];

  // Sort docs according to the defined order
  const sortedDocs = docs.sort((a, b) => {
    const aPath = a.id.split("/").slice(1).join("/");
    const bPath = b.id.split("/").slice(1).join("/");

    const aIndex = order.indexOf(aPath);
    const bIndex = order.indexOf(bPath);

    // If both are in the order array, sort by their position
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    // If only one is in the order array, it comes first
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    // If neither is in the order array, sort alphabetically
    return aPath.localeCompare(bPath);
  });

  const currentIndex = sortedDocs.findIndex((doc) => doc.id === currentDocId);

  if (currentIndex === -1) {
    return {};
  }

  const previous = currentIndex > 0 ? sortedDocs[currentIndex - 1] : undefined;
  const next =
    currentIndex < sortedDocs.length - 1
      ? sortedDocs[currentIndex + 1]
      : undefined;

  return {
    previous: previous
      ? {
          title: previous.data.title,
          description: previous.data.description,
          href: `/${locale}/${previous.id.split("/").slice(1).join("/")}`,
        }
      : undefined,
    next: next
      ? {
          title: next.data.title,
          description: next.data.description,
          href: `/${locale}/${next.id.split("/").slice(1).join("/")}`,
        }
      : undefined,
  };
}
