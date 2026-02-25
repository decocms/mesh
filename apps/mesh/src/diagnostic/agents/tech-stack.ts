/**
 * Tech Stack Detection Agent
 *
 * Detects e-commerce platform, analytics, CDN, payment providers,
 * chat tools, and review widgets from HTML and response headers.
 * Standalone async function — no MeshContext dependency.
 */

import type { CrawlResult } from "../crawl";

export interface DetectedTechnology {
  name: string;
  confidence: number;
}

export interface PlatformDetection extends DetectedTechnology {
  category: "ecommerce" | "framework" | "cms";
}

export interface TechStackResult {
  platform?: PlatformDetection;
  analytics: DetectedTechnology[];
  cdn?: DetectedTechnology;
  paymentProviders: DetectedTechnology[];
  chatTools: DetectedTechnology[];
  reviewWidgets: DetectedTechnology[];
}

/**
 * Check if a string (html or header value) contains any of the given patterns.
 */
function containsAny(text: string, patterns: (string | RegExp)[]): boolean {
  const lowerText = text.toLowerCase();
  return patterns.some((pattern) => {
    if (typeof pattern === "string") {
      return lowerText.includes(pattern.toLowerCase());
    }
    return pattern.test(text);
  });
}

/**
 * Flatten all header values into a single string for pattern matching.
 */
function headersToString(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

/**
 * Detect the e-commerce platform or framework from HTML and headers.
 * Returns the first high-confidence match.
 */
function detectPlatform(
  html: string,
  headers: Record<string, string>,
): PlatformDetection | undefined {
  const headersStr = headersToString(headers);
  const combined = `${html}\n${headersStr}`;

  const candidates: Array<{
    name: string;
    category: "ecommerce" | "framework" | "cms";
    patterns: (string | RegExp)[];
    confidence: number;
  }> = [
    {
      name: "VTEX",
      category: "ecommerce",
      patterns: [
        "vtex.com",
        "/_v/",
        "vtexcommercestable",
        "vtexcommercebeta",
        /x-vtex/i,
        "vtex.min.js",
        "/__vtex__/",
      ],
      confidence: 0.95,
    },
    {
      name: "Shopify",
      category: "ecommerce",
      patterns: [
        "cdn.shopify.com",
        "shopify.com/s/files",
        /Shopify\.theme/,
        /x-shopify-stage/i,
        "myshopify.com",
        "shopify.analytics",
        /window\.Shopify\s*=/,
      ],
      confidence: 0.97,
    },
    {
      name: "WooCommerce",
      category: "ecommerce",
      patterns: [
        "woocommerce",
        "wp-content/plugins/woocommerce",
        "wp-json/wc/",
        "wc-block-editor",
      ],
      confidence: 0.88,
    },
    {
      name: "Magento",
      category: "ecommerce",
      patterns: [
        "mage/",
        "Magento_",
        /x-magento-/i,
        "requirejs/require.js",
        "mage/bootstrap",
        "Mage.Cookies",
      ],
      confidence: 0.88,
    },
    {
      name: "BigCommerce",
      category: "ecommerce",
      patterns: [
        "bigcommerce",
        "cdn11.bigcommerce.com",
        "bigcommercecdn.com",
        "BCData",
      ],
      confidence: 0.92,
    },
    {
      name: "Salesforce Commerce Cloud",
      category: "ecommerce",
      patterns: [
        "demandware",
        "sfcc",
        "commercecloud.salesforce.com",
        "demandware.net",
        "dwanalytics",
      ],
      confidence: 0.92,
    },
    {
      name: "PrestaShop",
      category: "ecommerce",
      patterns: ["prestashop", "modules/ps_", "presta_", "/themes/classic/"],
      confidence: 0.82,
    },
    {
      name: "Deco.cx",
      category: "ecommerce",
      patterns: [
        "deco.cx",
        "deco-sites",
        "__FRSH_STATE",
        "use-deco",
        "apps.deco.cx",
      ],
      confidence: 0.93,
    },
    {
      name: "Next.js",
      category: "framework",
      patterns: ["_next/", "__NEXT_DATA__", "/_next/static/", "next/dist/"],
      confidence: 0.82,
    },
    {
      name: "Gatsby",
      category: "framework",
      patterns: ["gatsby", "__gatsby", "gatsby-image", "gatsby-plugin"],
      confidence: 0.72,
    },
  ];

  for (const candidate of candidates) {
    if (containsAny(combined, candidate.patterns)) {
      return {
        name: candidate.name,
        category: candidate.category,
        confidence: candidate.confidence,
      };
    }
  }

  return undefined;
}

/**
 * Detect analytics tools from HTML.
 */
function detectAnalytics(html: string): DetectedTechnology[] {
  const detected: DetectedTechnology[] = [];

  const tools: Array<{
    name: string;
    patterns: (string | RegExp)[];
    confidence: number;
  }> = [
    {
      name: "Google Analytics 4",
      patterns: [
        /gtag\s*\(/,
        "googletagmanager.com/gtag/js",
        /G-[A-Z0-9]{6,}/,
        "ga4",
      ],
      confidence: 0.92,
    },
    {
      name: "Google Tag Manager",
      patterns: [
        "googletagmanager.com/gtm.js",
        /GTM-[A-Z0-9]+/,
        "googletagmanager.com/ns.html",
      ],
      confidence: 0.95,
    },
    {
      name: "Meta Pixel",
      patterns: [
        /fbq\s*\(/,
        "connect.facebook.net/en_US/fbevents.js",
        "connect.facebook.net/",
        "facebook.net/en_US/fbevents",
      ],
      confidence: 0.93,
    },
    {
      name: "Hotjar",
      patterns: ["hotjar.com", /hj\s*\(\s*['"]identify/, "static.hotjar.com"],
      confidence: 0.9,
    },
    {
      name: "Microsoft Clarity",
      patterns: ["clarity.ms", "microsoft clarity"],
      confidence: 0.9,
    },
  ];

  for (const tool of tools) {
    if (containsAny(html, tool.patterns)) {
      detected.push({ name: tool.name, confidence: tool.confidence });
    }
  }

  return detected;
}

/**
 * Detect CDN from response headers.
 */
function detectCdn(
  headers: Record<string, string>,
): DetectedTechnology | undefined {
  const headersStr = headersToString(headers);

  const cdns: Array<{
    name: string;
    patterns: (string | RegExp)[];
    confidence: number;
  }> = [
    {
      name: "Cloudflare",
      patterns: ["cf-ray:", "cf-cache-status:", /server:.*cloudflare/i],
      confidence: 0.97,
    },
    {
      name: "Fastly",
      patterns: [
        /x-served-by:.*cache-/i,
        "x-fastly-request-id:",
        /via:.*varnish/i,
      ],
      confidence: 0.92,
    },
    {
      name: "Akamai",
      patterns: [
        "x-akamai-transformed:",
        /x-check-cacheable/i,
        /server:.*akamai/i,
      ],
      confidence: 0.9,
    },
    {
      name: "AWS CloudFront",
      patterns: ["x-amz-cf-id:", /via:.*cloudfront/i, /server:.*cloudfront/i],
      confidence: 0.95,
    },
    {
      name: "Vercel",
      patterns: ["x-vercel-id:", /x-vercel-cache/i, /server:.*vercel/i],
      confidence: 0.95,
    },
  ];

  for (const cdn of cdns) {
    if (containsAny(headersStr, cdn.patterns)) {
      return { name: cdn.name, confidence: cdn.confidence };
    }
  }

  return undefined;
}

/**
 * Detect payment provider integrations from HTML.
 */
function detectPaymentProviders(html: string): DetectedTechnology[] {
  const detected: DetectedTechnology[] = [];

  const providers: Array<{
    name: string;
    patterns: (string | RegExp)[];
    confidence: number;
  }> = [
    {
      name: "Stripe",
      patterns: ["stripe.com/v3", /Stripe\s*\(/, "js.stripe.com"],
      confidence: 0.92,
    },
    {
      name: "PayPal",
      patterns: ["paypal.com/sdk", "paypalobjects.com", /paypal\.Buttons/],
      confidence: 0.9,
    },
    {
      name: "MercadoPago",
      patterns: ["mercadopago", "sdk.mercadopago.com", /mp\.checkout/i],
      confidence: 0.9,
    },
    {
      name: "PagSeguro",
      patterns: ["pagseguro", "pagseguro.uol.com.br", "pagsegurobrasil"],
      confidence: 0.88,
    },
  ];

  for (const provider of providers) {
    if (containsAny(html, provider.patterns)) {
      detected.push({ name: provider.name, confidence: provider.confidence });
    }
  }

  return detected;
}

/**
 * Detect chat / live support tools from HTML.
 */
function detectChatTools(html: string): DetectedTechnology[] {
  const detected: DetectedTechnology[] = [];

  const tools: Array<{
    name: string;
    patterns: (string | RegExp)[];
    confidence: number;
  }> = [
    {
      name: "Intercom",
      patterns: ["intercom", "widget.intercom.io", /intercomSettings/],
      confidence: 0.92,
    },
    {
      name: "Drift",
      patterns: ["drift.com", "driftt.com", /window\.drift\s*=/],
      confidence: 0.9,
    },
    {
      name: "Zendesk",
      patterns: ["zdassets.com", "zopim", "ekr.zdassets.com"],
      confidence: 0.9,
    },
    {
      name: "Tawk.to",
      patterns: ["tawk.to", /Tawk_API/],
      confidence: 0.92,
    },
    {
      name: "Tidio",
      patterns: ["tidiochat", "code.tidio.co"],
      confidence: 0.9,
    },
    {
      name: "LiveChat",
      patterns: ["livechatinc.com", /LC_API/],
      confidence: 0.9,
    },
    {
      name: "JivoSite",
      patterns: ["jivosite.com", "jivosite", /jivo_sid/],
      confidence: 0.88,
    },
  ];

  for (const tool of tools) {
    if (containsAny(html, tool.patterns)) {
      detected.push({ name: tool.name, confidence: tool.confidence });
    }
  }

  return detected;
}

/**
 * Detect review / rating widgets from HTML.
 */
function detectReviewWidgets(html: string): DetectedTechnology[] {
  const detected: DetectedTechnology[] = [];

  const widgets: Array<{
    name: string;
    patterns: (string | RegExp)[];
    confidence: number;
  }> = [
    {
      name: "Trustpilot",
      patterns: ["trustpilot.com", /trustpilot/i, "widget.trustpilot.com"],
      confidence: 0.9,
    },
    {
      name: "Yotpo",
      patterns: ["yotpo.com", /yotpoWidgetsContainer/, "staticw2.yotpo.com"],
      confidence: 0.9,
    },
    {
      name: "Judge.me",
      patterns: ["judge.me", /JudgeMe/, "cache.judge.me"],
      confidence: 0.9,
    },
    {
      name: "Stamped.io",
      patterns: ["stamped.io", /stamped/, "cdn1.stamped.io"],
      confidence: 0.88,
    },
    {
      name: "Bazaarvoice",
      patterns: [
        "bazaarvoice.com",
        /BVRRContainer/,
        "display.ugc.bazaarvoice.com",
      ],
      confidence: 0.88,
    },
  ];

  for (const widget of widgets) {
    if (containsAny(html, widget.patterns)) {
      detected.push({ name: widget.name, confidence: widget.confidence });
    }
  }

  return detected;
}

/**
 * Run the tech stack detection agent on a crawled page.
 */
export async function runTechStackAgent(
  crawl: CrawlResult,
): Promise<TechStackResult> {
  const { html, headers } = crawl;

  const platform = detectPlatform(html, headers);
  const analytics = detectAnalytics(html);
  const cdn = detectCdn(headers);
  const paymentProviders = detectPaymentProviders(html);
  const chatTools = detectChatTools(html);
  const reviewWidgets = detectReviewWidgets(html);

  return {
    platform,
    analytics,
    cdn,
    paymentProviders,
    chatTools,
    reviewWidgets,
  };
}
