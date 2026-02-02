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
    let result = match;
    if (attrs.includes("target=")) {
      result = result.replace(/target="[^"]*"/gi, 'target="_blank"');
    } else {
      result = result.replace(/>/, ' target="_blank">');
    }
    if (attrs.includes("rel=")) {
      result = result.replace(/rel="[^"]*"/gi, 'rel="noopener noreferrer"');
    } else {
      result = result.replace(/>/, ' rel="noopener noreferrer">');
    }
    return result;
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

/**
 * Fetch README HTML from GitHub API
 */
export async function fetchGitHubReadme(
  owner: string,
  repo: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
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
}
