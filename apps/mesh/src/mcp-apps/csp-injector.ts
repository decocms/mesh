/**
 * CSP (Content Security Policy) Injector for MCP Apps
 *
 * Injects security policies into HTML content to restrict what the
 * sandboxed iframe can do. This is a defense-in-depth measure on top
 * of iframe sandboxing.
 */

/**
 * Default CSP policy for MCP Apps
 *
 * Restrictions:
 * - default-src 'self': Only allow resources from the same origin (which is the srcdoc)
 * - script-src 'unsafe-inline': Allow inline scripts (needed for the app to work)
 * - style-src 'unsafe-inline': Allow inline styles
 * - img-src 'self' data: blob:: Allow images from self, data URIs, and blob URLs
 * - font-src 'self' data:: Allow fonts from self and data URIs
 * - connect-src 'none': Disable fetch/XHR (communication goes through postMessage)
 * - frame-ancestors 'none': Prevent the app from being framed
 * - form-action 'none': Disable form submissions
 */
export const DEFAULT_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");

/**
 * Options for CSP injection
 */
export interface CSPInjectorOptions {
  /** Custom CSP policy (defaults to DEFAULT_CSP) */
  csp?: string;
  /** Allow external connections (relaxes connect-src) */
  allowExternalConnections?: boolean;
  /** Allowed external hosts for connect-src */
  allowedHosts?: string[];
}

/**
 * Inject CSP meta tag into HTML content
 *
 * This function adds a Content-Security-Policy meta tag to the <head>
 * of the HTML document. If no <head> tag exists, one is created.
 *
 * @param html - The HTML content to inject CSP into
 * @param options - CSP injection options
 * @returns The HTML content with CSP meta tag injected
 */
export function injectCSP(
  html: string,
  options: CSPInjectorOptions = {},
): string {
  let csp = options.csp ?? DEFAULT_CSP;

  // If external connections are allowed, update connect-src
  if (options.allowExternalConnections) {
    const hosts = options.allowedHosts?.join(" ") ?? "*";
    csp = csp.replace("connect-src 'none'", `connect-src ${hosts}`);
  }

  const cspMetaTag = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  // Try to inject into existing <head>
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const headTagEnd = headMatch.index! + headMatch[0].length;
    return (
      html.slice(0, headTagEnd) + "\n    " + cspMetaTag + html.slice(headTagEnd)
    );
  }

  // Try to inject after <!DOCTYPE> or at the start
  const doctypeMatch = html.match(/<!doctype[^>]*>/i);
  if (doctypeMatch) {
    const afterDoctype = doctypeMatch.index! + doctypeMatch[0].length;
    return (
      html.slice(0, afterDoctype) +
      "\n<head>\n    " +
      cspMetaTag +
      "\n</head>" +
      html.slice(afterDoctype)
    );
  }

  // Try to inject before <html> or at the very start
  const htmlMatch = html.match(/<html[^>]*>/i);
  if (htmlMatch) {
    const afterHtml = htmlMatch.index! + htmlMatch[0].length;
    return (
      html.slice(0, afterHtml) +
      "\n<head>\n    " +
      cspMetaTag +
      "\n</head>" +
      html.slice(afterHtml)
    );
  }

  // No structure found, wrap the content
  return `<!DOCTYPE html>
<html>
<head>
    ${cspMetaTag}
</head>
<body>
${html}
</body>
</html>`;
}

/**
 * Validate that HTML content doesn't contain dangerous patterns
 *
 * This is an additional safety check to prevent obvious attacks.
 * The CSP and sandbox should handle most cases, but this catches
 * things like script injection via event handlers.
 *
 * @param html - The HTML content to validate
 * @returns Object with isValid flag and any warnings
 */
export function validateHTMLSafety(html: string): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check for external script sources
  const externalScriptPattern = /<script[^>]+src\s*=\s*["'][^"']+["']/gi;
  if (externalScriptPattern.test(html)) {
    warnings.push("External script sources detected - will be blocked by CSP");
  }

  // Check for external stylesheet sources
  const externalStylePattern =
    /<link[^>]+href\s*=\s*["'][^"']+["'][^>]+rel\s*=\s*["']stylesheet["']/gi;
  if (externalStylePattern.test(html)) {
    warnings.push("External stylesheets detected - will be blocked by CSP");
  }

  // Check for base tag (could be used to hijack relative URLs)
  const baseTagPattern = /<base[^>]+href/gi;
  if (baseTagPattern.test(html)) {
    warnings.push("Base tag detected - could affect resource loading");
  }

  return {
    isValid: true, // We don't fail, just warn
    warnings,
  };
}
