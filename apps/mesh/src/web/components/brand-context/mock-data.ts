// ── Types ──────────────────────────────────────────────────────────────────

export type BrandColor = {
  name: string;
  hex: string;
};

export type BrandIdentity = {
  name: string;
  tagline: string;
  url: string;
  logoUrl: string | null;
  ogImage: string | null;
  colors: BrandColor[];
  fonts: { heading: string; body: string };
  toneAdjectives: string[];
  toneSpectrum: { formal: number; minimal: number };
  persona: { age: string; values: string[]; lifestyle: string };
};

export type ToneExamples = {
  good: string[];
  avoid: string[];
};

export type AudienceProfile = {
  title: string;
  age: string;
  values: string[];
  lifestyle: string;
  psychographics: string[];
  channels: string[];
};

export type ProductDetail = {
  id: string;
  name: string;
  description: string;
  category: string;
  accentColor: string;
  imageUrl: string | null;
};

export type CompetitorDetail = {
  id: string;
  name: string;
  url: string;
  initials: string;
  level: "direct" | "indirect" | "adjacent";
  strengths: string[];
  differentiator: string;
};

export type SeasonalPeak = {
  month: number;
  intensity: number;
  label: string | null;
};

export type SeoSignal = {
  id: string;
  label: string;
  value: string;
  status: "pass" | "warn" | "fail";
};

export type SeoFinding = {
  id: string;
  issue: string;
  impact: string;
  severity: "critical" | "medium" | "low";
};

export type SeoHealth = {
  score: number;
  label: string;
  critical: number;
  medium: number;
  low: number;
  findings: SeoFinding[];
};

export type BrandContextData = {
  brand: BrandIdentity;
  toneExamples: ToneExamples;
  audience: AudienceProfile;
  products: ProductDetail[];
  competitors: CompetitorDetail[];
  seasonality: SeasonalPeak[];
  seoHealth: SeoHealth;
  seoOnPage: SeoSignal[];
};

// ── Mock Data ──────────────────────────────────────────────────────────────

export const MOCK_BRAND_IDENTITY: BrandIdentity = {
  name: "Modern Goods Co.",
  tagline: "Fewer, better things.",
  url: "moderngoods.example.com",
  logoUrl: null,
  ogImage: null,
  colors: [
    { name: "Warm Stone", hex: "#C9A87A" },
    { name: "Sage", hex: "#6B8F6B" },
    { name: "Charcoal", hex: "#2D2D2D" },
    { name: "Cream", hex: "#F6F1EB" },
  ],
  fonts: { heading: "Playfair Display", body: "Inter" },
  toneAdjectives: ["Warm", "Purposeful", "Crafted", "Honest", "Calm"],
  toneSpectrum: { formal: 0.55, minimal: 0.78 },
  persona: {
    age: "28–42",
    values: ["Quality", "Sustainability", "Simplicity", "Aesthetics"],
    lifestyle:
      "Urban professionals who value intentional choices over fast consumption.",
  },
};

export const MOCK_TONE_EXAMPLES: ToneExamples = {
  good: [
    "Built to last. Designed to disappear into your daily routine.",
    "Fewer things, chosen well, used daily.",
    "We believe the best objects are the ones you stop noticing.",
  ],
  avoid: [
    "BUY NOW! Limited time offer! Don't miss out!!!",
    "Our products are the absolute best on the market.",
    "You NEED this in your life right now!",
  ],
};

export const MOCK_AUDIENCE: AudienceProfile = {
  title: "The Intentional Urbanite",
  age: "28–42",
  values: ["Quality", "Sustainability", "Simplicity", "Aesthetics"],
  lifestyle:
    "Urban professionals who value intentional choices over fast consumption. They prefer fewer, better objects and are willing to invest in products that last.",
  psychographics: [
    "Research before purchasing — reads reviews and comparisons",
    "Prefer brands with transparent sourcing and manufacturing",
    "Willing to pay more for durability and craftsmanship",
    "Influenced by design blogs, Instagram, and word-of-mouth",
    "Value experiences over accumulation of things",
    "Environmentally conscious but not activist-level",
  ],
  channels: ["Instagram", "Pinterest", "Email", "Design blogs", "Reddit"],
};

export const MOCK_PRODUCTS: ProductDetail[] = [
  {
    id: "p1",
    name: "Chef's Knife Set",
    description:
      "Professional-grade Japanese steel knives for the home kitchen.",
    category: "Kitchen",
    accentColor: "#C9A87A",
    imageUrl: null,
  },
  {
    id: "p2",
    name: "Workspace Organizer",
    description: "Minimalist desk organization in natural walnut.",
    category: "Office",
    accentColor: "#6B8F6B",
    imageUrl: null,
  },
  {
    id: "p3",
    name: "Storage Essentials Kit",
    description: "Stackable linen storage for closets and shelves.",
    category: "Home",
    accentColor: "#8B7355",
    imageUrl: null,
  },
  {
    id: "p4",
    name: "Cast Iron Skillet",
    description: "Pre-seasoned cast iron, handmade in Tennessee.",
    category: "Kitchen",
    accentColor: "#2D2D2D",
    imageUrl: null,
  },
  {
    id: "p5",
    name: "Ceramic Mug Set",
    description: "Hand-thrown stoneware mugs, set of 4.",
    category: "Kitchen",
    accentColor: "#A0917B",
    imageUrl: null,
  },
];

export const MOCK_COMPETITORS: CompetitorDetail[] = [
  {
    id: "c1",
    name: "Muji",
    url: "muji.com",
    initials: "MJ",
    level: "direct",
    strengths: ["Minimal aesthetic", "Global reach", "Brand trust"],
    differentiator:
      "We focus on sourcing transparency and American craftsmanship vs. mass production.",
  },
  {
    id: "c2",
    name: "Crate & Barrel",
    url: "crateandbarrel.com",
    initials: "CB",
    level: "direct",
    strengths: ["Wide catalog", "Strong retail", "Wedding registry"],
    differentiator:
      "We offer curated essentials instead of overwhelming variety.",
  },
  {
    id: "c3",
    name: "West Elm",
    url: "westelm.com",
    initials: "WE",
    level: "indirect",
    strengths: ["Modern design", "Large catalog", "B&M stores"],
    differentiator:
      "We prioritize durability and timelessness over seasonal trends.",
  },
  {
    id: "c4",
    name: "Our Place",
    url: "fromourplace.com",
    initials: "OP",
    level: "indirect",
    strengths: ["DTC brand", "Social-first", "Hero product strategy"],
    differentiator:
      "We have a broader product range and focus on whole-home essentials.",
  },
];

export const MOCK_SEASONALITY: SeasonalPeak[] = [
  { month: 0, intensity: 0.3, label: null },
  { month: 1, intensity: 0.25, label: null },
  { month: 2, intensity: 0.55, label: "Spring Refresh" },
  { month: 3, intensity: 0.6, label: "Spring Refresh" },
  { month: 4, intensity: 0.4, label: null },
  { month: 5, intensity: 0.35, label: null },
  { month: 6, intensity: 0.3, label: null },
  { month: 7, intensity: 0.65, label: "Back to School" },
  { month: 8, intensity: 0.6, label: "Back to School" },
  { month: 9, intensity: 0.5, label: null },
  { month: 10, intensity: 0.9, label: "Black Friday" },
  { month: 11, intensity: 0.85, label: "Holiday Gifting" },
];

export const MOCK_SEO_HEALTH: SeoHealth = {
  score: 34,
  label: "Needs Work",
  critical: 3,
  medium: 7,
  low: 4,
  findings: [
    {
      id: "f1",
      issue: "Missing meta descriptions on 60% of pages",
      impact:
        "Search engines show auto-generated snippets, reducing CTR by ~15%",
      severity: "critical",
    },
    {
      id: "f2",
      issue: "No structured data (Schema.org) detected",
      impact:
        "Missing rich results in SERPs — competitors show ratings, prices, FAQs",
      severity: "critical",
    },
    {
      id: "f3",
      issue: "Blog posts lack internal linking",
      impact:
        "PageRank not flowing to product pages. Missed cross-sell opportunities",
      severity: "critical",
    },
    {
      id: "f4",
      issue: "Images missing alt text on 40% of product pages",
      impact: "Accessibility issue and missed image search traffic",
      severity: "medium",
    },
    {
      id: "f5",
      issue: "Slow LCP on mobile (4.2s)",
      impact: "Core Web Vital failing. May affect mobile rankings",
      severity: "medium",
    },
  ],
};

export const MOCK_SEO_ON_PAGE: SeoSignal[] = [
  { id: "s1", label: "SSL Certificate", value: "Valid", status: "pass" },
  { id: "s2", label: "Sitemap", value: "Found", status: "pass" },
  { id: "s3", label: "Robots.txt", value: "Found", status: "pass" },
  {
    id: "s4",
    label: "Meta Descriptions",
    value: "40% coverage",
    status: "warn",
  },
  { id: "s5", label: "Structured Data", value: "Not found", status: "fail" },
  { id: "s6", label: "Internal Links", value: "Avg 1.2/page", status: "warn" },
  { id: "s7", label: "Mobile Friendly", value: "Yes", status: "pass" },
  { id: "s8", label: "Core Web Vitals", value: "LCP failing", status: "fail" },
  { id: "s9", label: "HTTP/2", value: "Enabled", status: "pass" },
  { id: "s10", label: "Image Alt Text", value: "60% coverage", status: "warn" },
];

export function buildMockContextData(): BrandContextData {
  return {
    brand: MOCK_BRAND_IDENTITY,
    toneExamples: MOCK_TONE_EXAMPLES,
    audience: MOCK_AUDIENCE,
    products: MOCK_PRODUCTS,
    competitors: MOCK_COMPETITORS,
    seasonality: MOCK_SEASONALITY,
    seoHealth: MOCK_SEO_HEALTH,
    seoOnPage: MOCK_SEO_ON_PAGE,
  };
}
