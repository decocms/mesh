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
    "introduction.mdx",
    "getting-started/ai-builders.mdx",
    "getting-started/developers.mdx",
    "no-code-guides/creating-tools.mdx",
    "no-code-guides/creating-agents.mdx",
    "full-code-guides/project-structure.mdx",
    "full-code-guides/building-tools.mdx",
    "full-code-guides/building-views.mdx",
    "full-code-guides/resources.mdx",
    "full-code-guides/deployment.mdx",
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
