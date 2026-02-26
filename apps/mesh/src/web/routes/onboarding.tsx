import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  ChevronsUpDown,
  AlertCircle,
  Info,
  MessageCircle,
  Lock,
  Loader2,
  CheckCircle2,
} from "lucide-react";

type OnboardingState = "idle" | "unskewing" | "loading" | "done";
type Tab = "overview" | "performance" | "seo" | "reputation";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "performance", label: "Performance" },
  { key: "seo", label: "SEO" },
  { key: "reputation", label: "Reputation" },
];

const AGENTS = [
  { name: "HTML Crawler", desc: "Detecting tech stack & structure" },
  { name: "PageSpeed Insights", desc: "Analyzing performance metrics" },
  { name: "Traffic Analyzer", desc: "Fetching audience & competitor data" },
  { name: "SEO Auditor", desc: "Scanning keywords & backlinks" },
  { name: "Brand Extractor", desc: "Reading visual identity & colors" },
];

const ACME = {
  domain: "acme.com",
  name: "Acme",
  description:
    "Global consumer electronics retailer with strong DTC presence. Multi-channel commerce spanning 3,000+ SKUs across North America and EMEA, focused on smart home and mobile accessories.",
  brandColors: ["#1a1a2e", "#e94560", "#f5f5f5", "#0f3460"],
  techStack: [
    "Shopify Plus",
    "Klaviyo",
    "Gorgias",
    "Google Ads",
    "Meta Pixel",
    "Hotjar",
  ],
  traffic: { monthly: "4.8M", bounce: "38%", duration: "4m 12s" },
  competitors: [
    { domain: "techgiant.com", traffic: "12M", delta: +150 },
    { domain: "shoptech.io", traffic: "2.1M", delta: -57 },
    { domain: "gadgethouse.com", traffic: "890K", delta: -82 },
  ],
};

const COMPANY = {
  description:
    "Brazilian fashion brand known for bold tropical prints and sustainable sourcing. Direct-to-consumer e-commerce with strong presence across Brazil, US, and Europe. Seasonal collections averaging 200+ SKUs.",
  brandColors: ["#1B5E20", "#F4E9D1", "#C8102E", "#2C2C2C"],
  techStack: [
    "VTEX",
    "Google Tag Manager",
    "Hotjar",
    "TrustVox",
    "Zendesk Chat",
    "Facebook Pixel",
    "Google Ads",
  ],
  traffic: {
    monthly: "2.1M",
    duration: "3m 42s",
    bounce: "41%",
    pagesPerVisit: "4.2",
  },
  competitors: [
    { domain: "animale.com.br", traffic: "1.8M", delta: -14 },
    { domain: "amaro.com", traffic: "2.4M", delta: +15 },
    { domain: "crisbarros.com.br", traffic: "890K", delta: -57 },
    { domain: "roupas.com.br", traffic: "3.1M", delta: +48 },
  ],
};

const VITALS = [
  {
    metric: "LCP",
    value: "4.2s",
    status: "poor" as const,
    threshold: "< 2.5s",
  },
  {
    metric: "CLS",
    value: "0.18",
    status: "needs" as const,
    threshold: "< 0.1",
  },
  {
    metric: "INP",
    value: "220ms",
    status: "needs" as const,
    threshold: "< 200ms",
  },
];

const ISSUES = [
  {
    id: 1,
    severity: "critical" as const,
    text: "38% drop-off between shipping → payment — industry avg is 22%",
    impact: "~$45K/yr",
  },
  {
    id: 2,
    severity: "critical" as const,
    text: "Purchase event missing transaction_id on 23% of checkouts — GA4 revenue data unreliable",
    impact: "~$45K/yr",
  },
  {
    id: 3,
    severity: "warning" as const,
    text: "23 product pages missing meta descriptions — CTR drops ~30% without them",
    impact: "-$29K/yr",
  },
  {
    id: 4,
    severity: "warning" as const,
    text: "404 on /collections/winter-sale — receiving 230 hits/hr from Google organic",
    impact: "~$45K/yr",
  },
  {
    id: 5,
    severity: "info" as const,
    text: "Newsletter popup fires immediately on mobile — 62% close rate, 18% exit rate",
    impact: "~$45K/yr",
  },
  {
    id: 6,
    severity: "info" as const,
    text: "Hero images not optimized — adding 2.1s to load time on landing pages",
    impact: "~$45K/yr",
  },
];

const KEYWORDS = [
  { keyword: "farm rio", volume: "90K", position: 1 },
  { keyword: "vestidos estampados", volume: "34K", position: 3 },
  { keyword: "moda feminina", volume: "110K", position: 8 },
  { keyword: "farm rio usa", volume: "18K", position: 2 },
  { keyword: "vestidos florais", volume: "22K", position: 11 },
];

const REPUTATION = {
  score: 7.2,
  reviews: 1234,
  responseRate: 89,
  avgResolution: "2.1 days",
  sentiment: { positive: 62, neutral: 24, negative: 14 },
  themes: [
    { label: "Shipping delays", pct: 34 },
    { label: "Return process", pct: 22 },
    { label: "Product quality", pct: 18 },
    { label: "Customer support", pct: 15 },
    { label: "Other", pct: 11 },
  ],
};

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname;
  } catch {
    return url;
  }
}

function SeverityIcon({
  severity,
}: {
  severity: "critical" | "warning" | "info";
}) {
  if (severity === "critical") {
    return (
      <div className="flex shrink-0 items-center justify-center size-6 rounded-full border border-red-200 bg-red-50">
        <AlertCircle className="size-3.5 text-red-500" />
      </div>
    );
  }
  if (severity === "warning") {
    return (
      <div className="flex shrink-0 items-center justify-center size-6 rounded-full border border-orange-200 bg-orange-50">
        <AlertCircle className="size-3.5 text-orange-500" />
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center justify-center size-6 rounded-full border border-blue-200 bg-blue-50">
      <Info className="size-3.5 text-blue-500" />
    </div>
  );
}

function StatusBadge({ status }: { status: "good" | "needs" | "poor" }) {
  const config = {
    good: { dot: "bg-green-500", label: "Good", text: "text-green-600" },
    needs: {
      dot: "bg-orange-400",
      label: "Needs work",
      text: "text-orange-500",
    },
    poor: { dot: "bg-red-500", label: "Poor", text: "text-red-500" },
  }[status];
  return (
    <div className={`flex items-center gap-1.5 ${config.text}`}>
      <div className={`size-1.5 rounded-full ${config.dot}`} />
      <span className="text-xs">{config.label}</span>
    </div>
  );
}

function OverviewTab({ domain: _domain }: { domain: string }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {COMPANY.description}
      </p>
      <div className="grid grid-cols-2 gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
            Brand Colors
          </p>
          <div className="flex items-center gap-2">
            {COMPANY.brandColors.map((color) => (
              <div
                key={color}
                className="size-8 rounded-lg border border-border shadow-sm"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
            Traffic
          </p>
          <div className="flex items-center gap-5">
            <div>
              <p className="text-base font-semibold">
                {COMPANY.traffic.monthly}
              </p>
              <p className="text-xs text-muted-foreground">visits/mo</p>
            </div>
            <div>
              <p className="text-base font-semibold">
                {COMPANY.traffic.bounce}
              </p>
              <p className="text-xs text-muted-foreground">bounce rate</p>
            </div>
            <div>
              <p className="text-base font-semibold">
                {COMPANY.traffic.duration}
              </p>
              <p className="text-xs text-muted-foreground">avg. duration</p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          Tech Stack
        </p>
        <div className="flex flex-wrap gap-1.5">
          {COMPANY.techStack.map((tech) => (
            <span
              key={tech}
              className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-foreground"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          Competitors
        </p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50">
              <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                Site
              </th>
              <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                Traffic/mo
              </th>
              <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                vs you
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPANY.competitors.map((c) => (
              <tr key={c.domain} className="border-b border-border/30">
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=32`}
                      className="size-4 rounded-sm"
                      alt=""
                    />
                    <span className="text-xs font-medium">{c.domain}</span>
                  </div>
                </td>
                <td className="py-2.5 text-xs text-right text-muted-foreground">
                  {c.traffic}
                </td>
                <td
                  className={`py-2.5 text-xs text-right font-semibold ${c.delta > 0 ? "text-red-500" : "text-green-600"}`}
                >
                  {c.delta > 0 ? "+" : ""}
                  {c.delta}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PerformanceTab() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-5">
        <div className="flex shrink-0 flex-col items-center justify-center size-20 rounded-full border-4 border-orange-400 bg-orange-50">
          <span className="text-2xl font-bold text-orange-500">42</span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold text-sm">Needs attention</p>
          <p className="text-xs text-muted-foreground">
            Slower than 72% of e-commerce sites in your segment
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          Core Web Vitals
        </p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50">
              <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                Metric
              </th>
              <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                Value
              </th>
              <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                Target
              </th>
              <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {VITALS.map((v) => (
              <tr key={v.metric} className="border-b border-border/30">
                <td className="py-2.5 text-sm font-semibold">{v.metric}</td>
                <td className="py-2.5 text-sm">{v.value}</td>
                <td className="py-2.5 text-xs text-muted-foreground">
                  {v.threshold}
                </td>
                <td className="py-2.5">
                  <StatusBadge status={v.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          Findings
        </p>
        <div className="flex flex-col">
          {ISSUES.map((issue, i) => (
            <div
              key={issue.id}
              className="flex items-start gap-3 border-b border-border/30 py-3"
              style={{
                animation: "slideUpFade 0.4s ease-out both",
                animationDelay: `${i * 60}ms`,
              }}
            >
              <SeverityIcon severity={issue.severity} />
              <p className="flex-1 text-xs text-foreground leading-relaxed">
                {issue.text}
              </p>
              <p className="shrink-0 text-xs font-medium text-red-500">
                {issue.impact}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SeoTab() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Organic Traffic", value: "380K/mo" },
          { label: "Backlinks", value: "12.4K" },
          { label: "Authority Score", value: "34/100" },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-muted/50 p-3"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold mt-0.5">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          Top Keywords
        </p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50">
              <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                Keyword
              </th>
              <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                Searches/mo
              </th>
              <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                Position
              </th>
            </tr>
          </thead>
          <tbody>
            {KEYWORDS.map((kw) => (
              <tr key={kw.keyword} className="border-b border-border/30">
                <td className="py-2.5 text-xs font-medium">{kw.keyword}</td>
                <td className="py-2.5 text-xs text-right text-muted-foreground">
                  {kw.volume}
                </td>
                <td className="py-2.5 text-right">
                  <span
                    className={`text-xs font-semibold ${kw.position <= 3 ? "text-green-600" : kw.position <= 10 ? "text-orange-500" : "text-muted-foreground"}`}
                  >
                    #{kw.position}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          SEO Findings
        </p>
        <div className="flex flex-col">
          {ISSUES.filter((i) => i.severity !== "critical").map((issue, i) => (
            <div
              key={issue.id}
              className="flex items-start gap-3 border-b border-border/30 py-3"
              style={{
                animation: "slideUpFade 0.4s ease-out both",
                animationDelay: `${i * 60}ms`,
              }}
            >
              <SeverityIcon severity={issue.severity} />
              <p className="flex-1 text-xs text-foreground leading-relaxed">
                {issue.text}
              </p>
              <p className="shrink-0 text-xs font-medium text-red-500">
                {issue.impact}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReputationTab() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-5">
        <div className="flex shrink-0 flex-col items-center justify-center size-20 rounded-full border-4 border-green-400 bg-green-50">
          <span className="text-2xl font-bold text-green-600">
            {REPUTATION.score}
          </span>
          <span className="text-[10px] text-muted-foreground">/10</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="font-semibold text-sm">Good reputation</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{REPUTATION.reviews.toLocaleString()} reviews</span>
            <span>{REPUTATION.responseRate}% response rate</span>
            <span>Avg. {REPUTATION.avgResolution} resolution</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          Customer Sentiment
        </p>
        <div className="flex flex-col gap-2.5">
          {[
            {
              label: "Positive",
              pct: REPUTATION.sentiment.positive,
              color: "bg-green-500",
            },
            {
              label: "Neutral",
              pct: REPUTATION.sentiment.neutral,
              color: "bg-muted-foreground/30",
            },
            {
              label: "Negative",
              pct: REPUTATION.sentiment.negative,
              color: "bg-red-400",
            },
          ].map(({ label, pct, color }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-14 text-xs text-muted-foreground">
                {label}
              </span>
              <div className="flex-1 rounded-full bg-muted h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs font-medium">{pct}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          Top Complaint Themes
        </p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50">
              <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                Theme
              </th>
              <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {REPUTATION.themes.map((t) => (
              <tr key={t.label} className="border-b border-border/30">
                <td className="py-2.5 text-xs font-medium">{t.label}</td>
                <td className="py-2.5 text-xs text-right text-muted-foreground">
                  {t.pct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OnboardingRoute() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<OnboardingState>("idle");
  const [domain, setDomain] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [completedAgents, setCompletedAgents] = useState<number[]>([]);
  const [diagnosticToken, setDiagnosticToken] = useState<string | null>(null);

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  function handleSubmit() {
    const d = extractDomain(url);
    setDomain(d);
    setCompletedAgents([]);
    setState("unskewing");

    // Fire real scan in the background to get a token
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    fetch("/api/diagnostic/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: fullUrl }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.token) setDiagnosticToken(data.token);
      })
      .catch(() => {
        // Non-fatal — CTA will still work without a token (goes to login)
      });

    setTimeout(() => setState("loading"), 900);
    setTimeout(() => setCompletedAgents((a) => [...a, 0]), 2900);
    setTimeout(() => setCompletedAgents((a) => [...a, 1]), 4900);
    setTimeout(() => setCompletedAgents((a) => [...a, 2]), 6900);
    setTimeout(() => setCompletedAgents((a) => [...a, 3]), 8900);
    setTimeout(() => setCompletedAgents((a) => [...a, 4]), 10900);
    setTimeout(() => setState("done"), 11500);
  }

  const isUnskewing = state === "unskewing";
  const isLoading = state === "loading";
  const isDone = state === "done";
  const hasStarted = state !== "idle";

  const showAcme = state === "idle" || isUnskewing;
  const activeName = showAcme
    ? ACME.name
    : (domain.split(".")[0] ?? domain).charAt(0).toUpperCase() +
      (domain.split(".")[0] ?? domain).slice(1);

  const shareUrl = `https://deco.cx/diagnostic/${domain}`;

  // 3D transform: skewed in idle, straight from unskewing onward
  const cardTransform =
    state === "idle"
      ? "perspective(1200px) rotateY(0deg) rotateX(30deg) scale(1.05)"
      : "perspective(1200px) rotateY(0deg) rotateX(0deg) scale(1)";

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-background p-2">
      {/* Background SVG — always visible, pinned to bottom, full viewport */}
      <img
        src="/bgonboarding.png"
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 z-0 w-screen"
      />

      {/* Top bar */}
      <div className="absolute left-0 right-0 top-8 z-30 flex items-center justify-between px-8">
        <div className="flex items-center gap-2">
          <img src="/logos/deco logo.svg" alt="Deco" className="size-6" />
          {!hasStarted && (
            <button className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors">
              <ArrowLeft className="size-4" />
            </button>
          )}
        </div>
        <button className="flex h-7 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
          <Globe className="size-4" />
          English
          <ChevronsUpDown className="size-3 text-muted-foreground" />
        </button>
      </div>

      {/* Left: form — slides out when started */}
      <div
        className="relative z-10 flex flex-col items-center justify-center overflow-hidden shrink-0"
        style={{
          width: hasStarted ? "0%" : "50%",
          opacity: hasStarted ? 0 : 1,
          transition:
            "width 700ms cubic-bezier(0.4, 0, 0.2, 1), opacity 350ms ease-out",
          pointerEvents: hasStarted ? "none" : "auto",
        }}
      >
        <div className="flex flex-col gap-14 w-[400px]">
          <div className="flex flex-col gap-10 text-foreground">
            <div
              className="flex flex-col font-medium leading-[36px]"
              style={{ fontSize: "30px" }}
            >
              <p>Hire the best agents to</p>
              <p className="opacity-50">optimize your storefront.</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="text-sm font-medium">Website URL</p>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-6 py-4 text-sm focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-ring transition-[border-color,box-shadow]">
                <span className="opacity-50 shrink-0">https://</span>
                <input
                  className="flex-1 bg-transparent outline-none placeholder:opacity-50 min-w-0"
                  placeholder="yourstore.com"
                  value={url.replace(/^https?:\/\//, "")}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
                {url && (
                  <img
                    key={extractDomain(url)}
                    src={`https://www.google.com/s2/favicons?domain=${extractDomain(url)}&sz=64`}
                    alt=""
                    className="size-5 shrink-0 rounded-sm object-contain opacity-80 ml-2"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            className="flex w-fit items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium bg-primary text-primary-foreground transition-opacity hover:opacity-90"
          >
            Run diagnostic
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Right: diagnostic panel */}
      <div
        className="relative z-10 flex h-full shrink-0 flex-col rounded-2xl bg-muted border-muted border-2 overflow-hidden"
        style={{
          width: hasStarted ? "100%" : "50%",
          transition: "width 700ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Edge fades — visible when previewing Acme, dissolve on click */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-linear-to-b from-muted to-transparent transition-opacity duration-700"
          style={{ opacity: showAcme ? 1 : 0 }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-72 bg-linear-to-t from-muted to-transparent transition-opacity duration-700"
          style={{ opacity: showAcme ? 1 : 0 }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-linear-to-r from-muted to-transparent transition-opacity duration-700"
          style={{ opacity: showAcme ? 1 : 0 }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-linear-to-l from-muted to-transparent transition-opacity duration-700"
          style={{ opacity: showAcme ? 1 : 0 }}
        />

        <div className="flex flex-1 flex-col overflow-hidden px-8 py-8 min-h-0">
          {/* Inner wrapper — gets the 3D transform applied */}
          <div
            className="flex flex-1 flex-col w-full max-w-3xl mx-auto gap-4 min-h-0"
            style={{
              transform: cardTransform,
              transition: "transform 700ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {/* Card — content changes per state, size stays fixed */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background min-h-0">
              {/* ── ACME PREVIEW (idle + unskewing) ── */}
              {showAcme && (
                <>
                  {/* Acme card header */}
                  <div className="flex items-center gap-4 border-b border-border/50 p-6 shrink-0">
                    <div className="flex shrink-0 items-center justify-center size-14 rounded-xl border border-border bg-white shadow-sm overflow-clip">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${ACME.domain}&sz=64`}
                        alt={ACME.domain}
                        className="size-9 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xl font-semibold">
                        {ACME.name}'s diagnostic
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {ACME.domain}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                      <Globe className="size-3" />
                      Public report
                    </div>
                  </div>
                  <div className="flex shrink-0 border-b border-border px-6">
                    {TABS.map(({ key, label }) => (
                      <div
                        key={key}
                        className={`px-3 py-3 text-sm font-medium border-b-2 -mb-px select-none ${key === "overview" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 min-h-0">
                    <div className="flex flex-col gap-5">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {ACME.description}
                      </p>
                      <div className="grid grid-cols-2 gap-5">
                        <div className="flex flex-col gap-2">
                          <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                            Brand Colors
                          </p>
                          <div className="flex gap-2">
                            {ACME.brandColors.map((c) => (
                              <div
                                key={c}
                                className="size-8 rounded-lg border border-border shadow-sm"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                            Traffic
                          </p>
                          <div className="flex gap-4">
                            <div>
                              <p className="font-semibold">
                                {ACME.traffic.monthly}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                visits/mo
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold">
                                {ACME.traffic.bounce}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                bounce
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold">
                                {ACME.traffic.duration}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                avg. dur.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                          Tech Stack
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {ACME.techStack.map((t) => (
                            <span
                              key={t}
                              className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                          Competitors
                        </p>
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border/50">
                              <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                                Site
                              </th>
                              <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                                Traffic/mo
                              </th>
                              <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                                vs you
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {ACME.competitors.map((c) => (
                              <tr
                                key={c.domain}
                                className="border-b border-border/30"
                              >
                                <td className="py-2.5">
                                  <div className="flex items-center gap-2">
                                    <img
                                      src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=32`}
                                      className="size-4 rounded-sm"
                                      alt=""
                                    />
                                    <span className="text-xs font-medium">
                                      {c.domain}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 text-xs text-right text-muted-foreground">
                                  {c.traffic}
                                </td>
                                <td
                                  className={`py-2.5 text-xs text-right font-semibold ${c.delta > 0 ? "text-red-500" : "text-green-600"}`}
                                >
                                  {c.delta > 0 ? "+" : ""}
                                  {c.delta}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── LOADING: agents ── */}
              {isLoading && (
                <div
                  className="flex flex-col flex-1 overflow-hidden"
                  style={{ animation: "slideUpFade 0.4s ease-out both" }}
                >
                  <div className="flex items-center gap-4 px-7 py-5 border-b border-border/50 shrink-0">
                    <div className="flex shrink-0 size-12 items-center justify-center rounded-xl border border-border bg-white shadow-sm overflow-clip">
                      <img
                        src={faviconUrl}
                        alt=""
                        className="size-7 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">
                        Analyzing {domain}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Running {AGENTS.length} diagnostic agents
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col px-7 py-2 flex-1 justify-center">
                    {AGENTS.map((agent, i) => {
                      const done = completedAgents.includes(i);
                      const current = !done && completedAgents.length === i;
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-4 py-3.5 border-b border-border/30 last:border-0"
                        >
                          {/* Capybara avatar */}
                          <div
                            className={`shrink-0 size-9 rounded-full overflow-clip border transition-all ${done ? "border-green-200 opacity-100" : current ? "border-border opacity-100" : "border-border/40 opacity-30"}`}
                          >
                            <img
                              src={`/icons/capy-${[3, 7, 12, 18, 25][i]}.png`}
                              alt=""
                              className="size-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-medium transition-colors ${done || current ? "text-foreground" : "text-muted-foreground/40"}`}
                            >
                              {agent.name}
                            </p>
                            <p
                              className={`text-xs truncate transition-colors ${done || current ? "text-muted-foreground" : "text-muted-foreground/30"}`}
                            >
                              {agent.desc}
                            </p>
                          </div>
                          {/* Status on the right */}
                          <div className="shrink-0 flex items-center gap-1.5">
                            {done ? (
                              <>
                                <CheckCircle2 className="size-3.5 text-green-500" />
                                <span className="text-xs font-medium text-green-500">
                                  Done
                                </span>
                              </>
                            ) : current ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                                <span className="text-xs text-muted-foreground animate-pulse">
                                  Running...
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground/30">
                                Waiting
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── DONE: full diagnostic ── */}
              {isDone && (
                <>
                  {/* Privacy notice */}
                  <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-6 py-3 shrink-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Globe className="size-3.5 shrink-0" />
                      Anyone with this link can view this report
                    </div>
                    <button className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:underline">
                      <Lock className="size-3" />
                      Login to make it private
                    </button>
                  </div>

                  {/* Card header */}
                  <div
                    className="flex items-center gap-4 border-b border-border/50 p-6 shrink-0"
                    style={{ animation: "slideUpFade 0.4s ease-out both" }}
                  >
                    <div className="flex shrink-0 items-center justify-center size-14 rounded-xl border border-border bg-white shadow-sm overflow-clip">
                      <img
                        src={faviconUrl}
                        alt={domain}
                        className="size-9 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xl font-semibold">
                        {activeName}'s diagnostic
                      </p>
                      <p className="text-sm text-muted-foreground">{domain}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                      <Globe className="size-3" />
                      Public report
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex shrink-0 border-b border-border px-6">
                    {TABS.map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={`px-3 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  <div
                    className="flex-1 overflow-y-auto p-6 min-h-0"
                    style={{ animation: "slideUpFade 0.4s ease-out both" }}
                  >
                    {activeTab === "overview" && (
                      <OverviewTab domain={domain} />
                    )}
                    {activeTab === "performance" && <PerformanceTab />}
                    {activeTab === "seo" && <SeoTab />}
                    {activeTab === "reputation" && <ReputationTab />}
                  </div>

                  {/* CTA footer */}
                  <div className="flex items-center justify-between border-t border-border px-6 py-5 shrink-0">
                    <div>
                      <p className="text-sm font-semibold text-destructive">
                        $11.9M/yr at risk
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        6 findings · 2 critical
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={shareUrl}
                        className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <MessageCircle className="size-4" />
                        Share
                      </a>
                      <a
                        href={
                          diagnosticToken
                            ? `/login?next=${encodeURIComponent(`/onboard-auto?token=${diagnosticToken}`)}`
                            : `/login?next=${encodeURIComponent(`/onboard-auto`)}`
                        }
                        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        <ArrowRight className="size-4" />
                        See full diagnostic
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
