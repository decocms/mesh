# Technology Stack

**Analysis Date:** 2026-02-14

## Languages

**Primary:**
- TypeScript - Full application codebase (server and client)
- JSX/TSX - UI components with Preact

**Secondary:**
- JavaScript - Deno runtime compatibility
- CSS/TailwindCSS - Styling

## Runtime

**Environment:**
- Deno 2.x (specified in CLAUDE.md, version 2.2.6)

**Package Manager:**
- Deno (uses `deno.json` for dependencies and tasks)
- Lockfile: Not detected (Deno uses content-addressed registry)
- Node modules directory enabled: `nodeModulesDir: true` in `deno.json`

## Frameworks

**Core:**
- Fresh 1.7.3 - Deno web framework with server-side rendering
- Preact 10.23.1 - Lightweight UI framework with React compatibility layer
- Deco 1.132.6 - Full-stack framework for content management

**Testing:**
- Puppeteer 16.2.0 - Component testing via `deno test`

**Build/Dev:**
- ESBuild - Module bundling
- Fresh plugins system - MCP server integration

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` 2.44.2 - PostgreSQL database client
- `@preact/signals` 1.2.2 - Client-side state management
- `preact-render-to-string` 6.4.2 - SSR support
- `djwt` v2.9 - JWT token creation and signing
- `octokit` 3.1.2 - GitHub API client
- `stripe` 12.6.0 - Payment processing

**Infrastructure:**
- `@aws-sdk/client-s3` 3.569.0 - S3 storage operations
- `@aws-sdk/client-identitystore` ^3.744.0 - AWS Identity Center integration
- `@google-cloud/storage` 6.12.0 - GCP Cloud Storage
- `@google-cloud/tasks` 3.1.2 - GCP Cloud Tasks for async jobs
- `@libsql/client` 0.6.0 - Turso SQLite client

**AI & LLM:**
- `ai` ^6.0.1 - Vercel AI SDK
- `@ai-sdk/openai-compatible` ^2.0.16 - OpenAI API integration
- `zod` ^3.22.4 - TypeScript schema validation
- `@modelcontextprotocol/sdk` 1.25.2 - Model Context Protocol for AI
- `@deco/mcp` 0.7.10 - Deco MCP integration

**Observability:**
- `prom-client` 14.2.0 - Prometheus metrics collection
- `posthog-node` 4.2.0 - Product analytics (server-side)

**UI Components:**
- `@dnd-kit/core` 6.1.0 - Drag and drop
- `@floating-ui/react` 0.24.3 - Popover/tooltip positioning
- `daisyui` 4.4.19 - Tailwind UI component library
- `flatpickr` 4.6.13 - Date picker
- `react-jsonschema-form` (via esm.sh) - Dynamic forms from JSON schemas
- `react-toastify` 10.0.5 - Toast notifications
- `react-image-crop` 11.0.5 - Image cropping

**Utilities:**
- `@std/crypto` 1.0.0-rc.1 - Cryptographic operations
- `@std/encoding` 1.0.0-rc.1 - Encoding/decoding
- `@std/fs` 0.229.1 - Filesystem operations
- `@std/http` 1.0.0 - HTTP utilities
- `fast-equals` 5.2.2 - Deep equality checking
- `fast-json-patch` 3.1.1 - JSON patching operations
- `lodash-es` 4.17.21 - Utility functions
- `simple-git` ^3.25.0 - Git operations
- `nanoid` 3.3.6 - ID generation
- `mustache` 4.2.0 - Template rendering
- `minisearch` 6.3.0 - Full-text search
- `json-schema-compare` 0.2.2 - JSON Schema comparison
- `json-schema-merge-allof` 0.8.1 - JSON Schema merging

**Additional:**
- `@rjsf/core` 5.23.2 - React JSON Schema Form core
- `ajv` 8.12.0 - JSON Schema validation
- `markdown-to-jsx` 7.2.0 - Markdown parsing to JSX
- `tldts` 6.1.1 - Top-level domain extraction
- `ansicolor` 2.0.3 - ANSI color styling
- `exponential-backoff` 3.1.0 - Retry with exponential backoff

## Configuration

**Environment:**
- Loads variables from `.env` file (via `std/dotenv`)
- Critical vars: `OCTOKIT_TOKEN`, `SUPABASE_KEY`, `STRIPE_SECRET_KEY`, `CLOUDFLARE_TOKEN`, etc.
- Env vars NOT stored in .env are loaded at runtime from system environment

**Build:**
- `fresh.config.ts` - Fresh/Deco initialization, MCP server setup
- `deno.json` - Import map, task definitions, linting/fmt rules, compiler options
- TypeScript config in `deno.json`:
  - `jsx: "react-jsx"`
  - `jsxImportSource: "preact"`
  - `lib: ["deno.unstable"]`
  - Experimental decorators enabled

**Linting:**
- Deno lint with custom rules (excludes: no-explicit-any, no-extra-boolean-cast, React rules)
- Tags: fresh, recommended

**Formatting:**
- Deno fmt (excludes .css files)

## Platform Requirements

**Development:**
- Deno 2.x installed
- Node.js (for npm packages via Deno's `nodeModulesDir`)
- Git for repository operations
- Chrome/Firefox (optional, for Puppeteer tests)

**Production:**
- Deno 2.x runtime
- Docker support (Kubernetes deployments)
- Multiple deployment targets supported via hosting platforms abstraction:
  - Kubernetes (EKS, GCP GKE)
  - Deno Deploy
  - Denocluster

---

*Stack analysis: 2026-02-14*
