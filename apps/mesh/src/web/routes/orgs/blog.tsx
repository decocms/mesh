/**
 * Blog workspace — /$org/$project/blog
 *
 * Full-width centered blog post editor. No chat panel.
 * The post content, title, and meta are directly editable inline.
 * All content is mocked; taskId search param selects the active draft.
 */

import { useState } from "react";
import { Page } from "@/web/components/page";
import { Button } from "@deco/ui/components/button.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@deco/ui/components/breadcrumb.tsx";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk";
import { Check, Edit01, Edit05, File06, Plus } from "@untitledui/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeoMetrics {
  score: number;
  keywordDensity: string;
  keywordInTitle: boolean;
  readability: number;
  metaLength: number;
  internalLinks: number;
}

interface Draft {
  id: string;
  title: string;
  keyword: string;
  volume: string;
  metaDescription: string;
  wordCount: number;
  readTime: number;
  category: string;
  content: Block[];
  seo: SeoMetrics;
}

type Block =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string };

// ─── Mocked drafts ────────────────────────────────────────────────────────────

const DRAFTS: Record<string, Draft> = {
  "bp-1": {
    id: "bp-1",
    title: "Como usar estampas tropicais no dia a dia",
    keyword: "estampas tropicais moda",
    volume: "22K/mo",
    metaDescription:
      "Descubra como incorporar as estampas tropicais da FARM Rio no seu look do dia a dia. Dicas de styling para todas as ocasiões.",
    wordCount: 1180,
    readTime: 5,
    category: "Style Guide",
    seo: {
      score: 84,
      keywordDensity: "1.4%",
      keywordInTitle: true,
      readability: 72,
      metaLength: 152,
      internalLinks: 2,
    },
    content: [
      {
        type: "h2",
        text: "The Art of Tropical Dressing",
      },
      {
        type: "p",
        text: "Tropical prints have been at the heart of FARM Rio since our very first collection in 2008. What started as a reflection of Rio de Janeiro's vibrant culture has become a global fashion movement — one that celebrates joy, nature, and unapologetic color.",
      },
      { type: "h2", text: "Starting Your Tropical Print Journey" },
      { type: "h3", text: "The One-Statement-Piece Rule" },
      {
        type: "p",
        text: "If you're new to tropical prints, start with one statement piece. A bold floral dress paired with neutral sandals and minimal accessories lets the print do all the talking. Our Vitória Dress in the Amazônia print is the perfect starting point.",
      },
      { type: "h3", text: "Mixing Prints Like a Pro" },
      {
        type: "p",
        text: "Confidence is the only rule. Pair our striped linen pants with a floral blouse in the same color family. The key is finding a shared color that ties both prints together — in our collections, that's often a warm coral or tropical green.",
      },
      { type: "h2", text: "Dressing for the Occasion" },
      {
        type: "p",
        text: "Tropical prints aren't just for beach holidays. A wrap dress in our signature leafy print works beautifully for brunch, gallery openings, and even casual Fridays at the office. The secret is in the silhouette — a structured cut elevates any print.",
      },
      { type: "h2", text: "Caring for Your Prints" },
      {
        type: "p",
        text: "All FARM Rio pieces are made with low-impact dyes to preserve the vibrancy of our prints wash after wash. Turn garments inside out, wash in cold water, and hang dry to keep your tropicals looking their best for years.",
      },
    ],
  },
  "bp-2": {
    id: "bp-2",
    title: "Bastidores: como criamos nossas estampas",
    keyword: "farm rio estampas exclusivas",
    volume: "8K/mo",
    metaDescription:
      "Um olhar nos bastidores do processo criativo da FARM Rio — da inspiração na natureza à estampa final nas nossas peças.",
    wordCount: 1420,
    readTime: 6,
    category: "Behind the Brand",
    seo: {
      score: 61,
      keywordDensity: "0.6%",
      keywordInTitle: false,
      readability: 58,
      metaLength: 168,
      internalLinks: 0,
    },
    content: [
      { type: "h2", text: "Where Every Print Begins" },
      {
        type: "p",
        text: "Every FARM Rio print starts with a walk. Our designers spend hours in Rio's botanical gardens, Atlantic Forest trails, and coastal markets, gathering colors, textures, and shapes that become the raw material of our collections.",
      },
      { type: "h2", text: "From Sketch to Fabric" },
      { type: "h3", text: "The Design Process" },
      {
        type: "p",
        text: "Each season, our team creates over 300 original illustrations before narrowing down to the prints that make it into the collection. Every stroke is drawn by hand before being digitized and refined into the final pattern.",
      },
      { type: "h3", text: "Color Selection" },
      {
        type: "p",
        text: "Our color palette isn't chosen from a Pantone book — it's chosen from life. The specific shade of coral in our Ipanema Sunset print was matched to a photograph taken at 6:47pm on a Tuesday in February. That's the level of detail our color team brings.",
      },
      { type: "h2", text: "Sustainable by Design" },
      {
        type: "p",
        text: "Since 2020, all FARM Rio prints use water-based, low-impact dyes certified by OEKO-TEX. We've reduced water consumption in our dyeing process by 40% while maintaining the intensity of color our customers love.",
      },
    ],
  },
  "bp-3": {
    id: "bp-3",
    title: "FARM Rio chega aos EUA: nossa história internacional",
    keyword: "farm rio usa stores",
    volume: "18K/mo",
    metaDescription:
      "Como a FARM Rio levou as estampas cariocas para o mundo. A história da nossa expansão internacional e o que aprendemos pelo caminho.",
    wordCount: 1860,
    readTime: 7,
    category: "Brand Story",
    seo: {
      score: 78,
      keywordDensity: "1.1%",
      keywordInTitle: true,
      readability: 65,
      metaLength: 144,
      internalLinks: 1,
    },
    content: [
      {
        type: "h2",
        text: "Taking Tropical to the World",
      },
      {
        type: "p",
        text: "When FARM Rio opened its first international store in New York's Nolita neighborhood in 2018, we weren't sure how a brand built on Brazilian beaches and Rio's carnival spirit would translate to Manhattan. The answer surprised us.",
      },
      { type: "h2", text: "The New York Experiment" },
      { type: "h3", text: "Finding Our International Customer" },
      {
        type: "p",
        text: "Our New York customer turned out to be someone who had been looking for exactly what we offered: genuine Brazilian craftsmanship, prints that felt alive, and clothing that made getting dressed an act of joy rather than obligation.",
      },
      { type: "h3", text: "What We Learned" },
      {
        type: "p",
        text: "We learned that the language of tropical prints is universal. Whether you're in São Paulo or San Francisco, when you put on a FARM Rio dress, something happens — you stand differently, you smile more, you move with more intention.",
      },
      { type: "h2", text: "From 1 to 100" },
      {
        type: "p",
        text: "Today FARM Rio operates over 100 stores across Brazil and internationally, with a growing presence in the US, Europe, and the Middle East. Each new market teaches us something new about how our brand translates and evolves.",
      },
      { type: "h2", text: "What's Next" },
      {
        type: "p",
        text: "We're building toward a future where FARM Rio isn't just a fashion brand but a cultural ambassador for the Brazilian way of living — colorful, joyful, and deeply connected to the natural world.",
      },
    ],
  },
};

// ─── BlogEditor ───────────────────────────────────────────────────────────────

function BlogEditor({ draft }: { draft: Draft }) {
  const [approved, setApproved] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[900px] mx-auto px-8 py-12">
        {/* Category + meta row */}
        <div className="flex items-center gap-3 mb-6">
          <Badge variant="secondary" className="text-xs font-medium">
            {draft.category}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {draft.wordCount.toLocaleString()} words
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            {draft.readTime} min read
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs font-mono text-muted-foreground">
            {draft.volume} searches
          </span>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Edit01 size={12} />
            Click to edit
          </span>
        </div>

        {/* Title */}
        <h1
          contentEditable
          suppressContentEditableWarning
          className="text-4xl font-bold text-foreground leading-tight mb-4 outline-none focus:ring-2 focus:ring-ring/30 rounded-sm px-1 -mx-1 cursor-text"
        >
          {draft.title}
        </h1>

        {/* Meta description */}
        <div className="mb-8 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
            Meta description
          </p>
          <p
            contentEditable
            suppressContentEditableWarning
            className="text-sm text-muted-foreground leading-relaxed outline-none focus:text-foreground cursor-text"
          >
            {draft.metaDescription}
          </p>
        </div>

        {/* SEO metrics */}
        <div className="mb-8 grid grid-cols-3 gap-2">
          {/* Score */}
          <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              SEO Score
            </p>
            <div className="flex items-center gap-2">
              <span
                className={`text-lg font-bold ${draft.seo.score >= 75 ? "text-emerald-600" : draft.seo.score >= 50 ? "text-amber-500" : "text-red-500"}`}
              >
                {draft.seo.score}
              </span>
              <span className="text-xs text-muted-foreground">/100</span>
              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${draft.seo.score >= 75 ? "bg-emerald-500" : draft.seo.score >= 50 ? "bg-amber-400" : "bg-red-500"}`}
                  style={{ width: `${draft.seo.score}%` }}
                />
              </div>
            </div>
          </div>
          {/* Keyword density */}
          <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              Keyword density
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">
                {draft.seo.keywordDensity}
              </span>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${parseFloat(draft.seo.keywordDensity) >= 1 && parseFloat(draft.seo.keywordDensity) <= 2 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
              >
                {parseFloat(draft.seo.keywordDensity) >= 1 &&
                parseFloat(draft.seo.keywordDensity) <= 2
                  ? "Good"
                  : "Low"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                · target 1–2%
              </span>
            </div>
          </div>
          {/* Readability */}
          <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              Readability
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">
                {draft.seo.readability}
              </span>
              <span className="text-[10px] text-muted-foreground">Flesch</span>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${draft.seo.readability >= 60 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
              >
                {draft.seo.readability >= 70
                  ? "Easy"
                  : draft.seo.readability >= 60
                    ? "OK"
                    : "Complex"}
              </span>
            </div>
          </div>
          {/* Meta length */}
          <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              Meta length
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">
                {draft.seo.metaLength}
              </span>
              <span className="text-[10px] text-muted-foreground">chars</span>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${draft.seo.metaLength >= 120 && draft.seo.metaLength <= 160 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
              >
                {draft.seo.metaLength >= 120 && draft.seo.metaLength <= 160
                  ? "Good"
                  : draft.seo.metaLength > 160
                    ? "Too long"
                    : "Short"}
              </span>
            </div>
          </div>
          {/* Keyword in title */}
          <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              Keyword in title
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-sm font-semibold ${draft.seo.keywordInTitle ? "text-emerald-600" : "text-amber-500"}`}
              >
                {draft.seo.keywordInTitle ? "Yes" : "No"}
              </span>
              {!draft.seo.keywordInTitle && (
                <span className="text-[10px] text-amber-600">
                  — add to title
                </span>
              )}
            </div>
          </div>
          {/* Internal links */}
          <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              Internal links
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-sm font-semibold ${draft.seo.internalLinks > 0 ? "text-foreground" : "text-amber-500"}`}
              >
                {draft.seo.internalLinks}
              </span>
              {draft.seo.internalLinks === 0 && (
                <span className="text-[10px] text-amber-600">— add some</span>
              )}
            </div>
          </div>
        </div>

        {/* Article body */}
        <article className="flex flex-col gap-4">
          {draft.content.map((block, i) => {
            if (block.type === "h2") {
              return (
                <h2
                  key={i}
                  contentEditable
                  suppressContentEditableWarning
                  className="text-2xl font-bold text-foreground mt-8 first:mt-0 mb-1 outline-none focus:ring-2 focus:ring-ring/30 rounded-sm px-1 -mx-1 cursor-text"
                >
                  {block.text}
                </h2>
              );
            }
            if (block.type === "h3") {
              return (
                <h3
                  key={i}
                  contentEditable
                  suppressContentEditableWarning
                  className="text-lg font-semibold text-foreground mt-4 mb-0.5 outline-none focus:ring-2 focus:ring-ring/30 rounded-sm px-1 -mx-1 cursor-text"
                >
                  {block.text}
                </h3>
              );
            }
            return (
              <p
                key={i}
                contentEditable
                suppressContentEditableWarning
                className="text-base text-foreground leading-[1.75] outline-none focus:ring-2 focus:ring-ring/30 rounded-sm px-1 -mx-1 cursor-text"
              >
                {block.text}
              </p>
            );
          })}
        </article>

        {/* Footer actions */}
        <div className="mt-16 pt-8 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono bg-muted px-2 py-1 rounded-md">
              {draft.keyword}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Edit05 size={13} />
              Regenerate
            </Button>
            <Button
              size="sm"
              variant={approved ? "outline" : "default"}
              className={approved ? "text-emerald-600 border-emerald-300" : ""}
              onClick={() => setApproved(true)}
            >
              {approved ? (
                <>
                  <Check size={13} />
                  Approved
                </>
              ) : (
                <>
                  <Check size={13} />
                  Approve & publish
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BlogList ─────────────────────────────────────────────────────────────────

const LIST_POSTS: {
  id: string;
  title: string;
  status: "draft" | "published" | "scheduled";
  category: string;
  wordCount: number;
  updatedAt: string;
}[] = [
  {
    id: "bp-1",
    title: DRAFTS["bp-1"]!.title,
    status: "draft",
    category: DRAFTS["bp-1"]!.category,
    wordCount: DRAFTS["bp-1"]!.wordCount,
    updatedAt: "2h ago",
  },
  {
    id: "bp-2",
    title: DRAFTS["bp-2"]!.title,
    status: "draft",
    category: DRAFTS["bp-2"]!.category,
    wordCount: DRAFTS["bp-2"]!.wordCount,
    updatedAt: "1d ago",
  },
  {
    id: "bp-3",
    title: DRAFTS["bp-3"]!.title,
    status: "published",
    category: DRAFTS["bp-3"]!.category,
    wordCount: DRAFTS["bp-3"]!.wordCount,
    updatedAt: "3d ago",
  },
];

const STATUS_STYLES = {
  draft: "bg-amber-50 text-amber-700 border-amber-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
};

function BlogList({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[900px] mx-auto px-8 py-8 flex flex-col gap-4">
        {LIST_POSTS.map((post) => (
          <button
            key={post.id}
            type="button"
            onClick={() => onOpen(post.id)}
            className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 text-left hover:bg-muted/20 transition-colors group"
          >
            <div className="flex items-center justify-center size-9 rounded-lg bg-violet-100 text-violet-600 shrink-0">
              <File06 size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {post.title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {post.category} · {post.wordCount.toLocaleString()} words ·{" "}
                {post.updatedAt}
              </p>
            </div>
            <span
              className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLES[post.status]}`}
            >
              {post.status}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BlogPage() {
  const { org, project } = useProjectContext();
  const navigate = useNavigate();
  const { taskId } = useSearch({ strict: false }) as { taskId?: string };

  const draft = taskId ? ((DRAFTS[taskId] ?? DRAFTS["bp-1"]) as Draft) : null;

  function handleOpenPost(id: string) {
    navigate({
      to: "/$org/$project/blog",
      params: { org: org.slug, project: project.slug },
      search: { taskId: id },
    });
  }

  function handleBackToList() {
    navigate({
      to: "/$org/$project/blog",
      params: { org: org.slug, project: project.slug },
      search: {},
    });
  }

  return (
    <Page>
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {draft ? (
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Blog
                  </button>
                ) : (
                  <BreadcrumbPage>Blog</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {draft && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{draft.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
        {!draft && (
          <Page.Header.Right>
            <Button size="sm" variant="outline">
              <Plus size={13} />
              New post
            </Button>
          </Page.Header.Right>
        )}
      </Page.Header>

      <Page.Content className="flex flex-col overflow-hidden">
        {draft ? (
          <BlogEditor draft={draft} />
        ) : (
          <BlogList onOpen={handleOpenPost} />
        )}
      </Page.Content>
    </Page>
  );
}
