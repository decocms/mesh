import type { GuidePrompt, GuideResource } from "./index";

export const prompts: GuidePrompt[] = [
  {
    name: "store-search",
    description: "Find MCP servers in the Deco Store or a registry.",
    text: `# Search store

Goal: find good candidate connections in the Deco Store or another registry before recommending or installing anything.

Read docs://store.md for registry types, search patterns, and evaluation criteria. Read docs://connections.md if you need a refresher on how installed connections behave after discovery.

Recommended tool order:
1. Use COLLECTION_CONNECTIONS_LIST to check if the target is already installed.
2. If the user has not clearly described the target capability, data source, or authentication constraints, use user_ask.
3. Enable the registry discovery tools from the registry connection.
4. Use COLLECTION_REGISTRY_APP_SEARCH to find candidates by keyword or capability.
5. Use COLLECTION_REGISTRY_APP_GET on the most promising results. Read docs://store-inspect-item.md for detailed inspection criteria.
6. Summarize the best matches, key tradeoffs, and which one to install next.
7. Once the user picks a candidate and asks to install it, read docs://store-install-connection.md and follow the install workflow using CONNECTION_INSTALL.

Checks:
- Search by the user's outcome, not just product names.
- Prefer curated Deco Store results first when they satisfy the need.
- Note authentication expectations, verification status, and obvious capability gaps.
- Do not install anything until the user picks a candidate or asks you to proceed.
`,
  },
  {
    name: "store-install",
    description: "Install an MCP server from a store or registry.",
    text: `# Install MCP server from store

Goal: install a specific MCP server from a registry into the workspace as a working connection, then handle authentication if needed.

Read docs://install-workflow.md for the complete end-to-end install workflow including transport selection, parameter extraction, and verification.

Recommended tool order:
1. COLLECTION_CONNECTIONS_LIST — check for duplicates of the target server.
2. Enable registry tools from the chosen registry connection.
3. COLLECTION_REGISTRY_APP_SEARCH or the registry list tool — find the MCP server by name or capability.
4. COLLECTION_REGISTRY_APP_GET — load full details for the chosen item.
5. Extract connection parameters per docs://install-workflow.md (transport selection, URL, auth).
6. CONNECTION_INSTALL — install the connection. This tool checks for duplicates, validates the endpoint, detects auth requirements, and creates the connection in one step.
7. If CONNECTION_INSTALL returns needs_auth=true, use CONNECTION_AUTHENTICATE to show the inline auth card so the user can complete OAuth or enter an API key.
8. After auth, use CONNECTION_TEST to verify the connection is healthy.

Checks:
- Do not install until the user has chosen or confirmed the specific item.
- Prefer HTTP/SSE/Websocket transports over STDIO.
- Do not guess secrets, OAuth values, or env var values — ask the user.
- If CONNECTION_INSTALL returns is_existing=true, the connection already exists — check if it needs auth instead of creating a new one.
- Treat the install as incomplete until the user has authenticated (if needed) and CONNECTION_TEST succeeds.
`,
  },
];

export const resources: GuideResource[] = [
  {
    name: "store-install-connection",
    uri: "docs://store-install-connection.md",
    description:
      "How to turn a chosen registry/store item into an installed and authenticated connection.",
    text: `# Install connection from store item

## Goal

Take a registry item the user already chose, install it with CONNECTION_INSTALL, handle authentication if needed, and verify health.

## Recommended tool order

1. Use COLLECTION_REGISTRY_APP_GET to load the full chosen item.
2. Extract the connection URL from the registry item's remote endpoints.
3. Use CONNECTION_INSTALL with the extracted parameters. This tool handles duplicate detection, endpoint validation, auth detection, and connection creation in one step.
4. If CONNECTION_INSTALL returns needs_auth=true, use CONNECTION_AUTHENTICATE to render the inline auth card so the user can complete OAuth or enter an API key directly in the chat.
5. After auth, use CONNECTION_TEST to verify the connection is healthy.

## How to map a registry item into CONNECTION_INSTALL

### Base fields
- title: prefer the store-friendly title from the item.
- description: copy the server description when available.
- icon: use the item or publisher icon when available.
- app_name and app_id: copy the registry/server identifiers when present.

### Transport selection
- Always prefer remote endpoints (HTTP, SSE, or Websocket) over package commands.
- If the item exposes a remote endpoint, use its type and URL.
- For Deco-hosted MCPs, the URL pattern is: https://[app-name].mcp.deco.cx/mcp
- If the item exposes multiple remotes, prefer HTTP > SSE > Websocket.
- If the item exposes neither a usable remote nor a package command, stop and report that the item cannot be installed automatically.

### Auth and configuration metadata
- oauth_config: copy it from the registry item when present.
- configuration_state: copy when the registry item includes it.
- configuration_scopes: copy when available.
- metadata: preserve store provenance such as source=store, registry item ID, verification state.

## Authentication flow

After CONNECTION_INSTALL:
- If needs_auth=true: call CONNECTION_AUTHENTICATE with the connection_id. This returns auth card data that the frontend renders as an inline OAuth button or API key input.
- If needs_auth=false: the connection is ready — verify with CONNECTION_TEST.
- If is_existing=true: the connection already existed. If it needs auth, guide the user to authenticate it.

## Checks

- Do not install until the user has chosen the specific item.
- Do not guess secrets, OAuth values, headers, or env var values.
- CONNECTION_INSTALL handles duplicate detection — no need to check separately.
- Treat the install as incomplete until the user has authenticated (if needed) and CONNECTION_TEST returns healthy.
`,
  },
  {
    name: "store-inspect-item",
    uri: "docs://store-inspect-item.md",
    description:
      "How to inspect a registry/store item in detail before recommending or installing it.",
    text: `# Inspect store item

## Goal

Validate that a specific store or registry item actually matches the user's requirements.

## Recommended tool order

1. Enable the relevant registry detail tools from the registry connection.
2. Use COLLECTION_REGISTRY_APP_GET to inspect the candidate item.
3. If multiple versions are available and a versions tool exists, use COLLECTION_REGISTRY_APP_VERSIONS.
4. Report whether the item fits the user's use case and what the next step should be.

## Checks

- Confirm the item exposes the capability the user asked for.
- Look for auth requirements, transport type, and tool coverage.
- Prefer verified or clearly maintained items when the registry exposes that signal.
- Call out uncertainty instead of over-promising.
`,
  },
  {
    name: "store",
    uri: "docs://store.md",
    description:
      "How to search registries, compare candidates, and decide what to install.",
    text: `# Store and registry discovery

## Purpose

Use the Deco Store or another registry connection when the user needs a capability that is not already installed.

## Common registry sources

### Deco Store
- Curated official registry.
- Usually the best first place to search.
- Good default when the user wants reliable, common integrations.

### Community registry
- Broader catalog with more variety.
- Useful when Deco Store does not have a match.
- Expect more variation in quality and maintenance.

## Discovery workflow

1. Confirm the user's goal, target system, and any auth or hosting constraints.
2. Find the registry connection that should be queried.
3. Search broadly first.
4. Inspect the most promising items in detail.
5. Recommend the best candidate and only then move to installation.

## Search patterns

- Search by business outcome: "send email", "sync orders", "query postgres".
- Search by product or vendor when the user names one directly.
- Use tags or categories when the registry supports them.
- If search tools are unavailable, use list tools with a filtered query.

## What to evaluate

### Capability fit
- Does the item actually expose the tools the user needs?
- Is it a close fit or only adjacent?

### Trust and maintenance
- Prefer verified, curated, or clearly maintained items when that metadata exists.

### Authentication
- Note whether the item likely requires OAuth, API keys, or no auth.
- Flag cases where setup may require user credentials or admin approval.

### Transport and setup complexity
- Prefer simpler HTTP-based integrations when multiple options are otherwise equivalent.
- Call out if an item looks experimental or operationally heavy.

## After discovery

- Present a short shortlist with the main tradeoffs.
- Ask the user which item to proceed with before installing.
- Once the user chooses, read docs://store-install-connection.md and switch to the connection-creation flow.
`,
  },
  {
    name: "install-workflow",
    uri: "docs://install-workflow.md",
    description:
      "Complete end-to-end workflow for installing an MCP server from a registry, including transport selection, parameter extraction, authentication, and verification.",
    text: `# Install workflow

## Purpose

End-to-end guide for installing an MCP server from a registry into the workspace. Covers discovery, installation with CONNECTION_INSTALL, authentication, and verification.

## 1. Search the registry

Use COLLECTION_REGISTRY_APP_SEARCH to find MCP servers by keyword or capability. Search by the user's intended outcome (e.g. "send email", "query database") rather than just product names.

## 2. Inspect the registry item

Use COLLECTION_REGISTRY_APP_GET on the chosen item. The response typically includes:
- \`server.remotes[]\` — remote transport endpoints (HTTP, SSE, Websocket)
- \`server.packages[]\` — STDIO package commands (npx, uvx, docker, etc.)
- \`_meta["mcp.mesh"]\` — Mesh-specific metadata (tags, categories, tools, verified status)
- Tool listings and publisher info

## 3. Extract connection parameters

### Transport selection rules
1. **Prefer remote transports** (HTTP, SSE, Websocket) over STDIO packages.
2. If multiple remotes exist, prefer HTTP > SSE > Websocket.
3. For Deco-hosted MCPs, the URL pattern is: \`https://[app-name].mcp.deco.cx/mcp\`
4. If neither remote nor package is available, stop and report that the item cannot be installed.

### CONNECTION_INSTALL payload
\`\`\`json
{
  "title": "<item title>",
  "connection_url": "<remote URL>",
  "description": "<server description>",
  "icon": "<item or publisher icon>",
  "app_name": "<registry/server name>",
  "app_id": "<registry item ID>",
  "connection_type": "HTTP",
  "oauth_config": "<from registry item if present>",
  "configuration_state": "<from registry item if present>",
  "configuration_scopes": "<from registry item if present>",
  "metadata": {
    "source": "store",
    "registry_item_id": "<item ID>"
  }
}
\`\`\`

## 4. Install the connection

Use CONNECTION_INSTALL with the payload from step 3. This tool:
- Checks for duplicate connections by URL or app_name
- Validates the endpoint by fetching tools
- Detects auth requirements (OAuth, scopes, MCP_CONFIGURATION)
- Creates the connection and returns the result

The response includes:
- \`connection_id\` — the new connection ID
- \`needs_auth\` — whether authentication is required
- \`is_existing\` — whether a duplicate was found (no new connection created)
- \`message\` — human-readable status

## 5. Handle authentication

If CONNECTION_INSTALL returns \`needs_auth: true\`:
1. Call CONNECTION_AUTHENTICATE with the \`connection_id\`.
2. This returns auth card data that the frontend renders as an inline OAuth button or API key input.
3. The user completes auth directly in the chat UI — no need to redirect them elsewhere.
4. After auth, proceed to verification.

If \`needs_auth: false\`, skip to verification.

## 6. Verify

Use CONNECTION_TEST on the connection. Expect \`{ healthy: true, latencyMs: ... }\`.
- If the connection was just authenticated, it should now be healthy.
- If it fails, use CONNECTION_AUTH_STATUS to check if auth is still needed.

## Common patterns

### Install by name
User says "install HyperDX" → search "hyperdx" → find deco/hyperdx → extract URL → CONNECTION_INSTALL → authenticate if needed.

### Install by capability
User says "I need to send emails" → search "gmail" or "send email" → pick best match → CONNECTION_INSTALL → authenticate.

### Duplicate handling
CONNECTION_INSTALL automatically detects duplicates by URL or app_name. If \`is_existing: true\`, the connection already exists — check if it needs auth and guide the user accordingly.

### OAuth flow
After CONNECTION_INSTALL returns needs_auth=true, call CONNECTION_AUTHENTICATE. The frontend renders an OAuth button. The user clicks it, completes consent, and the auth card updates to show success.

### API key flow
After CONNECTION_INSTALL returns needs_auth=true with auth_type="token", call CONNECTION_AUTHENTICATE. The frontend renders a token input field. The user pastes their API key and saves it.
`,
  },
];
