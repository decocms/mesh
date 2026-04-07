import { useQuery } from "@tanstack/react-query";
import { Loading01, File06 } from "@untitledui/icons";
import { extractGitHubRepo, fetchGitHubReadme } from "@/web/utils/github";
import { KEYS } from "@/web/lib/query-keys";
import { useLayoutEffect } from "react";
import lightCss from "github-markdown-css/github-markdown-light.css?raw";
import darkCss from "github-markdown-css/github-markdown-dark.css?raw";

// Inject scoped markdown CSS once into the document head.
// Light styles apply by default; dark styles are scoped to .dark to follow
// the app's class-based dark mode instead of prefers-color-scheme.
const STYLE_ID = "readme-markdown-css";
function useMarkdownStyles() {
  useLayoutEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    // Scope dark styles to the .dark class and override GitHub's palette
    // so the readme blends with the app's own dark theme tokens.
    const scopedDark = darkCss.replaceAll(
      ".markdown-body",
      ".dark .markdown-body",
    );
    const overrides = `
.dark .markdown-body {
  color-scheme: dark;
  color: var(--foreground);
  background-color: transparent;
}
.dark .markdown-body code,
.dark .markdown-body pre {
  background-color: var(--sidebar);
}
`;
    const lightOverrides = `
.markdown-body {
  background-color: transparent;
}
`;
    style.textContent = [lightCss, lightOverrides, scopedDark, overrides].join(
      "\n",
    );
    document.head.appendChild(style);
  }, []);
}

interface ReadmeViewerProps {
  /**
   * Repository info - can be a URL string or object with url property
   */
  repository?: {
    url?: string;
    source?: string;
    subfolder?: string;
  } | null;
  /**
   * Pre-fetched HTML content. If provided, repository prop is ignored.
   */
  html?: string | null;
  /**
   * Loading state when using pre-fetched content
   */
  isLoading?: boolean;
  /**
   * Custom query key for caching (optional)
   */
  queryKey?: readonly unknown[];
}

/**
 * Component to display a GitHub README with proper styling.
 *
 * Can be used in two modes:
 * 1. Pass `repository` prop - component fetches README automatically
 * 2. Pass `html` prop - component just renders the provided HTML
 */
export function ReadmeViewer({
  repository,
  html: providedHtml,
  isLoading: providedIsLoading,
  queryKey,
}: ReadmeViewerProps) {
  useMarkdownStyles();

  const repo = repository ? extractGitHubRepo(repository) : null;

  // Only fetch if repository is provided and no pre-fetched HTML
  const shouldFetch = !!repo && providedHtml === undefined;

  const { data: fetchedHtml, isLoading: isFetching } = useQuery({
    queryKey: queryKey ?? KEYS.githubReadme(repo?.owner, repo?.repo),
    queryFn: async () => {
      if (!repo) return null;
      return fetchGitHubReadme(repo.owner, repo.repo);
    },
    enabled: shouldFetch,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const html = providedHtml ?? fetchedHtml;
  const isLoading = providedIsLoading ?? (shouldFetch && isFetching);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loading01 size={32} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!html) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <File06 size={48} className="text-muted-foreground mb-4" />
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
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
