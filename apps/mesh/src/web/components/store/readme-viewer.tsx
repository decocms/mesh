import { useQuery } from "@tanstack/react-query";
import { Icon } from "@deco/ui/components/icon.tsx";
import { extractGitHubRepo } from "@/web/utils/github-icon";
import { KEYS } from "@/web/lib/query-keys";
import "github-markdown-css/github-markdown-light.css";

/**
 * Remove GitHub's anchor link icons from heading elements
 * These are the chain-link icons that appear next to headings
 */
function removeGitHubAnchorIcons(html: string): string {
  return html.replace(/<a[^>]*class="[^"]*anchor[^"]*"[^>]*>.*?<\/a>/gi, "");
}

/**
 * Add external link attributes to all links in the HTML
 * Ensures links open in new tabs with proper security attributes
 */
function addExternalLinkAttributes(html: string): string {
  return html.replace(/<a\s+([^>]*href="[^"]*"[^>]*)>/gi, (match, attrs) => {
    // Check if target is already set
    if (attrs.includes("target=")) {
      return match.replace(/target="[^"]*"/gi, 'target="_blank"');
    }
    // Add target and rel attributes
    return `<a ${attrs} target="_blank" rel="noopener noreferrer">`;
  });
}

/**
 * Sanitize README HTML by removing unwanted elements and adding security attributes
 */
function sanitizeReadmeHtml(html: string): string {
  let result = removeGitHubAnchorIcons(html);
  result = addExternalLinkAttributes(result);
  return result;
}

interface ReadmeViewerProps {
  repository?: {
    url?: string;
    source?: string;
    subfolder?: string;
  } | null;
}

export function ReadmeViewer({ repository }: ReadmeViewerProps) {
  const repo = repository ? extractGitHubRepo(repository) : null;

  const { data: readmeData, isLoading: isLoadingReadme } = useQuery({
    queryKey: KEYS.githubReadme(repo?.owner, repo?.repo),
    queryFn: async () => {
      if (!repo) return null;
      try {
        const response = await fetch(
          `https://api.github.com/repos/${repo.owner}/${repo.repo}/readme`,
          {
            headers: {
              Accept: "application/vnd.github.v3.html",
            },
          },
        );
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(`Failed to fetch README: ${response.statusText}`);
        }
        const html = await response.text();
        return sanitizeReadmeHtml(html);
      } catch (error) {
        console.error("Error fetching README:", error);
        return null;
      }
    },
    enabled: !!repo && !!repository,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  if (isLoadingReadme) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon
          name="progress_activity"
          size={32}
          className="animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  if (!readmeData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <Icon
          name="description"
          size={48}
          className="text-muted-foreground mb-4"
        />
        <h3 className="text-lg font-medium mb-2">README not found</h3>
        <p className="text-muted-foreground max-w-md">
          This repository doesn't have a README file, or it's not publicly
          accessible.
        </p>
      </div>
    );
  }

  return (
    <div
      className="p-5 markdown-body"
      style={{
        backgroundColor: "transparent",
      }}
      dangerouslySetInnerHTML={{ __html: readmeData }}
    />
  );
}
