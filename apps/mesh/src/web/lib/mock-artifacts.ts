/**
 * Mock artifact data for the filesystem UX prototype.
 * In production, this would come from MCP app queries and a Studio artifact registry.
 */

export type ArtifactType = "deck" | "report" | "site";

export interface Artifact {
  id: string;
  title: string;
  type: ArtifactType;
  /** Which folder this belongs to, null = unfiled */
  folderId: string | null;
  /** Preview snippet or summary */
  preview: string;
  /** When last modified */
  updatedAt: string;
  /** Which MCP app connection this came from */
  connectionId: string;
  /** Tool name to open this artifact */
  toolName: string;
  /** External ID in the MCP app */
  externalId: string;
}

export interface Folder {
  id: string;
  title: string;
  icon: string;
  color: string;
  itemCount: number;
}

const ARTIFACT_TYPE_META: Record<
  ArtifactType,
  { label: string; icon: string }
> = {
  deck: { label: "Slide Deck", icon: "presentation" },
  report: { label: "Report", icon: "report" },
  site: { label: "Website", icon: "globe" },
};

export function getArtifactTypeMeta(type: ArtifactType) {
  return ARTIFACT_TYPE_META[type];
}

// ---------- Mock Folders ----------

export const MOCK_FOLDERS: Folder[] = [
  {
    id: "fld_deco",
    title: "Deco",
    icon: "building",
    color: "#8B5CF6",
    itemCount: 5,
  },
  {
    id: "fld_farm",
    title: "Farm",
    icon: "shopping",
    color: "#10B981",
    itemCount: 3,
  },
  {
    id: "fld_clients",
    title: "Clients",
    icon: "users",
    color: "#F59E0B",
    itemCount: 4,
  },
];

// ---------- Mock Artifacts ----------

const now = Date.now();
const HOUR = 3600_000;
const DAY = 86400_000;

export const MOCK_ARTIFACTS: Artifact[] = [
  // Deco folder
  {
    id: "art_pitch_v3",
    title: "Pitch Deck v3",
    type: "deck",
    folderId: "fld_deco",
    preview: "12 slides - Company overview, product demo, market opportunity",
    updatedAt: new Date(now - 2 * HOUR).toISOString(),
    connectionId: "conn_slide_maker",
    toolName: "slide_maker",
    externalId: "deck_pitch_v3",
  },
  {
    id: "art_health_report",
    title: "Site Health Report",
    type: "report",
    folderId: "fld_deco",
    preview: "Health score: 87/100 - Performance, SEO, accessibility audit",
    updatedAt: new Date(now - 1 * DAY).toISOString(),
    connectionId: "conn_diagnostics",
    toolName: "diagnose",
    externalId: "diag_deco_health",
  },
  {
    id: "art_deco_site",
    title: "decocms.com",
    type: "site",
    folderId: "fld_deco",
    preview: "Main marketing site - Next.js, 24 pages",
    updatedAt: new Date(now - 3 * DAY).toISOString(),
    connectionId: "conn_site_editor",
    toolName: "site_editor",
    externalId: "site_deco",
  },
  {
    id: "art_brand_guide",
    title: "Brand Guidelines",
    type: "deck",
    folderId: "fld_deco",
    preview: "8 slides - Colors, typography, logo usage, brand voice",
    updatedAt: new Date(now - 7 * DAY).toISOString(),
    connectionId: "conn_slide_maker",
    toolName: "slide_maker",
    externalId: "deck_brand_guide",
  },
  {
    id: "art_seo_analysis",
    title: "SEO Analysis",
    type: "report",
    folderId: "fld_deco",
    preview: "Health score: 72/100 - Keyword ranking, backlink audit",
    updatedAt: new Date(now - 14 * DAY).toISOString(),
    connectionId: "conn_diagnostics",
    toolName: "diagnose",
    externalId: "diag_deco_seo",
  },
  // Farm folder
  {
    id: "art_farm_site",
    title: "farm.com.br",
    type: "site",
    folderId: "fld_farm",
    preview: "E-commerce - 156 products, 12 categories",
    updatedAt: new Date(now - 2 * DAY).toISOString(),
    connectionId: "conn_site_editor",
    toolName: "site_editor",
    externalId: "site_farm",
  },
  {
    id: "art_product_strategy",
    title: "Product Strategy",
    type: "deck",
    folderId: "fld_farm",
    preview: "15 slides - PLP optimization, conversion funnel, A/B tests",
    updatedAt: new Date(now - 4 * DAY).toISOString(),
    connectionId: "conn_slide_maker",
    toolName: "slide_maker",
    externalId: "deck_product_strategy",
  },
  {
    id: "art_farm_diagnostic",
    title: "Performance Audit",
    type: "report",
    folderId: "fld_farm",
    preview: "Health score: 64/100 - Core Web Vitals, image optimization",
    updatedAt: new Date(now - 5 * DAY).toISOString(),
    connectionId: "conn_diagnostics",
    toolName: "diagnose",
    externalId: "diag_farm_perf",
  },
  // Clients folder
  {
    id: "art_client_proposal",
    title: "Client Proposal Template",
    type: "deck",
    folderId: "fld_clients",
    preview: "10 slides - Services overview, case studies, pricing",
    updatedAt: new Date(now - 1 * DAY).toISOString(),
    connectionId: "conn_slide_maker",
    toolName: "slide_maker",
    externalId: "deck_client_proposal",
  },
  {
    id: "art_acme_site",
    title: "acme-store.com",
    type: "site",
    folderId: "fld_clients",
    preview: "Client site - Shopify integration, 89 products",
    updatedAt: new Date(now - 6 * DAY).toISOString(),
    connectionId: "conn_site_editor",
    toolName: "site_editor",
    externalId: "site_acme",
  },
  {
    id: "art_acme_diagnostic",
    title: "Acme Store Audit",
    type: "report",
    folderId: "fld_clients",
    preview: "Health score: 91/100 - Excellent performance and SEO",
    updatedAt: new Date(now - 8 * DAY).toISOString(),
    connectionId: "conn_diagnostics",
    toolName: "diagnose",
    externalId: "diag_acme",
  },
  {
    id: "art_q4_review",
    title: "Q4 Review",
    type: "deck",
    folderId: "fld_clients",
    preview: "20 slides - Quarterly results, client satisfaction, roadmap",
    updatedAt: new Date(now - 10 * DAY).toISOString(),
    connectionId: "conn_slide_maker",
    toolName: "slide_maker",
    externalId: "deck_q4_review",
  },
  // Unfiled
  {
    id: "art_quick_deck",
    title: "Quick Notes",
    type: "deck",
    folderId: null,
    preview: "3 slides - Meeting notes from standup",
    updatedAt: new Date(now - 30 * 60_000).toISOString(),
    connectionId: "conn_slide_maker",
    toolName: "slide_maker",
    externalId: "deck_quick_notes",
  },
];

// ---------- Helper functions ----------

export function getArtifactsByFolder(folderId: string): Artifact[] {
  return MOCK_ARTIFACTS.filter((a) => a.folderId === folderId).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getRecentArtifacts(limit = 8): Artifact[] {
  return [...MOCK_ARTIFACTS]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, limit);
}

export function getFolderById(id: string): Folder | undefined {
  return MOCK_FOLDERS.find((f) => f.id === id);
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / HOUR);
  const days = Math.floor(diff / DAY);
  const weeks = Math.floor(days / 7);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return `${weeks}w ago`;
}
