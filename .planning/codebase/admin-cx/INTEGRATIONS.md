# External Integrations

**Analysis Date:** 2026-02-14

## APIs & External Services

**GitHub:**
- Service: GitHub API for repository management
  - SDK/Client: `octokit` 3.1.2 (`npm:@octokit/rest@19.0.4`)
  - Auth: `OCTOKIT_TOKEN` env var
  - File: `clients/github.ts`
  - Features: Repository creation, PR management, branch operations, commit tracking

**Stripe:**
- Service: Payment processing and billing
  - SDK/Client: `stripe` 12.6.0
  - Auth: `STRIPE_SECRET_KEY` env var
  - Webhook signing: `STRIPE_WEBHOOK_SECRET` for webhook validation
  - File: `clients/stripe.ts`
  - Endpoint: `routes/webhooks/stripe.ts` handles webhook events
  - Events: Subscription lifecycle, billing events

**Deno Deploy:**
- Service: Serverless platform for Deno applications
  - Authentication: `DECO_DENO_TOKEN` and `DECO_DENO_ORG_ID` env vars
  - API Host: `https://api.deno.com/v1` and `https://dash.deno.com`
  - File: `clients/deno.ts`
  - Features: Project creation, deployment, domain linking, logs retrieval

**Cloudflare:**
- Service: DNS management, CDN, R2 storage
  - DNS API: Token-based auth via `CLOUDFLARE_TOKEN`
  - Page Rules API: Separate token `CLOUDFLARE_TOKEN_PAGE_RULES`
  - Legacy API: `CLOUDFLARE_API_EMAIL` and `CLOUDFLARE_API_KEY`
  - R2 Storage: S3-compatible via `CLOUDFLARE_R2_ACCESS_KEY`, `CLOUDFLARE_R2_SECRET_KEY`, `CLOUDFLARE_R2_ENDPOINT`
  - API Host: `https://api.cloudflare.com/client/v4`
  - File: `clients/cloudflare.ts`
  - Zone IDs configured for: deco.sites, deco.cx, deco.cdn, deco.cache, deco.cluster, deco.page

**OpenAI:**
- Service: LLM completion and embeddings
  - SDK: Direct fetch API usage
  - Auth: `OPENAI_API_DECOCX_KEY` env var
  - Models: GPT-3.5-turbo-16k for completions, text-embedding-ada-002 for embeddings
  - API Host: `https://api.openai.com/v1`
  - File: `clients/openai/client.ts`
  - Features: Chat completions, text embeddings

**Turso (LibSQL):**
- Service: SQLite database hosting
  - SDK/Client: `@libsql/client` 0.6.0
  - Auth: API token-based (custom class in `clients/turso.ts`)
  - API Host: `https://api.turso.tech/v1`
  - File: `clients/turso.ts`
  - Features: Database configuration management (size limits, read/write control)

**Google Cloud:**
- Cloud Tasks: Async job scheduling
  - SDK: `@google-cloud/tasks` 3.1.2
  - Auth: `GCP_TASKS_CREDENTIAL` (service account JSON), `BILLING_TASK_API_KEY`
  - Project ID: "dataanalytics-429613"
  - File: `clients/gcpTasks.ts`

- Cloud Storage: File storage
  - SDK: `@google-cloud/storage` 6.12.0
  - File: Used in `apps/admin.ts` via `createGCPStorageProvider`

**AWS:**
- IAM (Identity & Access Management):
  - Auth: `AWS_IAM_ACCESS_KEY_ID`, `AWS_IAM_SECRET_ACCESS_KEY` env vars
  - File: `clients/iam.ts`

- Identity Center:
  - Auth: `AWS_IDENTITY_CENTER_ACCESS_KEY_ID`, `AWS_IDENTITY_CENTER_SECRET_ACCESS_KEY` env vars
  - File: `clients/identityCenter.ts`

- S3: File storage (via AWS SDK)
  - SDK: `@aws-sdk/client-s3` 3.569.0
  - File: Used in `apps/admin.ts` via `createAwsStorageProvider`

**HyperDX:**
- Service: Observability and error tracking
  - API Host: `https://api.hyperdx.io/api/v1`
  - Auth: `HYPERDX_PASSWORD` env var
  - Email: `suporte@deco.cx`
  - File: `clients/hyperdx.ts`
  - Features: Error patterns, error analytics over time, series data queries

**Plausible Analytics:**
- Service: Privacy-focused analytics
  - SDK: Custom client
  - Auth: `PLAUSIBLE_TOKEN` env var
  - Files: `clients/plausible.ts`, `clients/plausible.v2.ts`
  - Query: Custom analytics queries

**BigQuery:**
- Service: Google's data warehouse for analytics
  - SDK: Direct fetch via JSPM
  - Auth: Service account via `BIGQUERY_SERVICE_KEY` and `BIGQUERY_SERVICE_ID` env vars
  - File: `clients/bigquery.ts`

**ClickHouse:**
- Service: Analytics database (time-series)
  - Auth: `CLICKHOUSE_ADDRESS`, `CLICKHOUSE_PASSWORD` env vars
  - File: `clients/clickhouse.ts`

- Analytics-specific instance:
  - Auth: `CLICKHOUSE_ANALYTICS_ADDRESS`, `CLICKHOUSE_ANALYTICS_PASSWORD` env vars
  - Username: `CLICKHOUSE_ANALYTICS_USERNAME` (defaults to "default")
  - File: `clients/clickhouseAnalytics.ts`

**Prometheus:**
- Service: Metrics and monitoring
  - Host: `PROMETHEUS_HOST` env var
  - API: Query range endpoint for metrics
  - File: `clients/prometheus.ts`
  - Queries: Request count tracking by namespace

**Airtable:**
- Service: Content/data management
  - Auth: `AIRTABLE_TOKEN`, `AIRTABLE_BASE` env vars
  - File: `clients/airtable.ts`

**HubSpot:**
- Service: CRM integration
  - Auth: `HUBSPOT_TOKEN` env var
  - File: `clients/hubspot.ts`

**Unsplash:**
- Service: Image API
  - Auth: `UNSPLASH_KEY` env var
  - File: `clients/unsplash.ts`

**Instatus:**
- Service: Status page monitoring
  - File: `loaders/instatus/loadStatus.ts`

**PostHog:**
- Service: Product analytics
  - SDK: `posthog-node` 4.2.0
  - API Key (Admin): `phc_cTNAUDgVFqt6MXNWfccJMQ9iSrmT5W8whLQYzCyNLbM`
  - API Key (Webdraw): `phc_SBZ2fxlXX671FVuSSwPdqzIgrS10hCL1mKFBbAfrmnB`
  - Host: `https://us.i.posthog.com`
  - File: `sdk/posthogServerSide.ts`
  - Features: Event capture with user tracking, site tracking

**Discord:**
- Service: Error notifications
  - Webhook: `DISCORD_ALARM_HOOK` env var
  - File: `clients/discord.ts`
  - Purpose: Alarm notifications for system errors

**One Dollar Stats:**
- Service: Custom analytics service
  - Auth: `ONEDOLLAR_BACKEND_API_KEY` env var
  - File: `clients/onedollarstats.ts`

**Webdraw:**
- Service: Design/drawing integration
  - Auth: `X_WEBDRAW_API_KEY` env var
  - File: `clients/webdraw.ts`

## Data Storage

**Databases:**
- Supabase (PostgreSQL):
  - Connection: `SUPABASE_LIVE_ENDPOINT` (default: `https://ozksgdmyrqcxcwhnbepg.supabase.co`)
  - Anon Key: `SUPABASE_LIVE_ANON_KEY`
  - JWT Secret: `SUPABASE_JWT_SECRET` (for user impersonation)
  - Client: `@supabase/supabase-js` 2.44.2
  - File: `clients/supabase/index.ts`
  - Features: Main app database with RLS policies, user impersonation support
  - Decobot Instance: `https://nmaczsddofknqxjyvwyj.supabase.co` (separate Supabase project)
  - Auto-generated types: `clients/supabase/types.ts` (112KB)

- Turso (SQLite):
  - Connection: Turso API client
  - Purpose: Per-site SQLite databases
  - File: `clients/turso.ts`

**File Storage:**
- Cloudflare R2: Primary object storage (S3-compatible)
- AWS S3: Optional alternative storage
- Google Cloud Storage: Optional alternative storage
- Local filesystem: Development/testing

**Caching:**
- Deno KV: Optional (flag `--unstable-kv` in dev tasks)
- Custom CacheClient: In-memory cache for GitHub info, PRs, commit status
  - File: `clients/cache.ts`

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (PostgreSQL-based)
- JWT-based with DJWT for token signing

**Mechanisms:**
- Row-level security (RLS) via Supabase policies
- User impersonation via JWT creation
- Service token pattern (SERVICE_TOKEN_DO_NOT_EXPOSE)
- GitHub OAuth (implicit via Octokit)

## Monitoring & Observability

**Error Tracking:**
- HyperDX: Primary error tracking and pattern analysis

**Logs:**
- Deno Deploy: Deployment and runtime logs via API
- Pod logs: Kubernetes environment logs via API
- HyperDX: Error and trace logging

**Metrics:**
- Prometheus: Request count, resource metrics
- PostHog: Product analytics and events
- Plausible Analytics: Website analytics
- ClickHouse: Time-series analytics data

**Observability Decorator:**
- Custom `@measure()` decorator in `observability/measure.ts` for method tracing

## CI/CD & Deployment

**Hosting:**
- Multi-platform abstraction via `HostingPlatform` interface:
  - Kubernetes (EKS, GCP GKE)
  - Deno Deploy
  - Denocluster
  - KubeOOM strategy option

**CI Pipeline:**
- GitHub Actions: Format check, type check on PRs
- Pre-commit hooks: Run `deno task check` (format, lint, types, policies)

**API Integrations:**
- Kubernetes API: Direct cluster management
- Deno Deploy API: Project and deployment management

## Environment Configuration

**Required env vars (Critical):**
- `SUPABASE_LIVE_ENDPOINT` - Database host
- `SUPABASE_LIVE_ANON_KEY` - Database auth
- `SUPABASE_JWT_SECRET` - JWT signing
- `OCTOKIT_TOKEN` - GitHub API
- `DECO_DENO_ORG_ID`, `DECO_DENO_TOKEN` - Deno Deploy
- `CLOUDFLARE_TOKEN` - DNS/CDN management
- `STRIPE_SECRET_KEY` - Payments
- `STRIPE_WEBHOOK_SECRET` - Webhook signing

**Optional but recommended:**
- `HYPERDX_PASSWORD` - Error tracking
- `PROMETHEUS_HOST` - Metrics
- `OPENAI_API_DECOCX_KEY` - AI features
- `GCP_TASKS_CREDENTIAL` - Async jobs
- `CLOUDFLARE_R2_*` - Storage operations

**Secrets location:**
- `.env` file (git-ignored)
- 1Password (team secrets)
- System environment variables (production)

## Webhooks & Callbacks

**Incoming Webhooks:**
- Stripe: `routes/webhooks/stripe.ts` - Subscription/billing events
- Resend: `routes/webhooks/resend-*.ts` - Email events
- GitHub: Handled via webhook event listeners registered in app context

**Outgoing Webhooks:**
- None currently implemented (possible future integration)

**Listener Pattern:**
- GitHub event listeners: `clients/github/listeners/*.ts`
  - Push events: `push.ts`
  - PR events: `pr.ts`, `prClose.ts`
  - Status events: `status.ts`
  - BigQuery notification: `notifyBigQuery.ts`

---

*Integration audit: 2026-02-14*
