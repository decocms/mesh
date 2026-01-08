# Demo Seed

A comprehensive demo seed for MCP Mesh, creating a complete environment for demonstrations and testing.

## Structure

```
demo/
├── index.ts              # Main seed orchestration (283 lines)
├── config.ts             # Configuration and constants (45 lines)
├── connections.ts        # MCP connection definitions (142 lines)
├── gateways.ts          # Gateway configurations (38 lines)
├── monitoring-logs.ts   # Demo monitoring data (597 lines)
├── factories.ts         # Factory functions for records (205 lines)
├── types.ts             # TypeScript types (59 lines)
└── README.md            # This file
```

**Total: ~1,369 lines** (down from 1,513 lines in the monolithic version)

## What it Creates

### Organization
- **Name**: Demo Company
- **Slug**: demo-company

### Users (5)
All users have password: `demo123`

1. **Admin** (`admin@demo.local`) - Owner role
2. **Developer** (`developer@demo.local`) - Member role
3. **Analyst** (`analyst@demo.local`) - Member role (read-only focus)
4. **Billing** (`billing@demo.local`) - Member role
5. **Viewer** (`viewer@demo.local`) - Member role (guest-like)

### API Keys (2)
- Admin API key
- Developer API key

### Connections (7)
1. **Notion** - Official MCP, requires OAuth
2. **GitHub** - Deco-hosted, demo token
3. **OpenRouter** - LLM routing, requires API key
4. **Nano Banana** - AI image generation, demo token
5. **Google Veo 3.1** - Video generation, requires API key
6. **OpenAI Sora 2** - Video generation, demo token
7. **Grain** - Meeting transcription, demo token

### Gateways (3)
1. **OpenRouter Gateway** - Dedicated LLM gateway (passthrough)
2. **All Tools Gateway** - Default gateway with all tools (passthrough)
3. **Smart Gateway** - Intelligent tool selection (code_execution)

### Monitoring Logs (27)
Rich demo data spanning 7 days with:
- Successful operations
- Authentication errors
- Rate limits
- Various tools and services
- Different users and gateways
- Realistic durations and metadata

## Usage

```typescript
import { seed } from "./seeds/demo";
import type { DemoSeedResult } from "./seeds/demo/types";

const result = await seed(db);
console.log("Created org:", result.organizationName);
console.log("Admin email:", result.users.adminEmail);
```

Or from the old location (re-exported):

```typescript
import { seed } from "./seeds/demo.ts";
```

## Adding New Connections

Edit `connections.ts`:

```typescript
export const DEMO_CONNECTIONS: Record<string, DemoConnection> = {
  // ... existing connections
  myNewConnection: {
    title: "My Service",
    description: "Description of the service",
    icon: "https://example.com/icon.png",
    appName: "my-service",
    connectionUrl: "https://api.example.com/mcp",
    connectionToken: null,
    configurationState: "needs_auth",
    metadata: {
      provider: "example",
      requiresOAuth: true,
    },
  },
};
```

Then add it to a gateway in `gateways.ts`:

```typescript
allTools: {
  // ...
  connections: ["notion", "github", /* ... */ "myNewConnection"],
},
```

## Adding New Monitoring Logs

Edit `monitoring-logs.ts`:

```typescript
export const DEMO_MONITORING_LOGS: DemoMonitoringLog[] = [
  // ... existing logs
  {
    connectionKey: "myNewConnection",
    toolName: "my_tool",
    input: { param: "value" },
    output: { result: "success" },
    isError: false,
    durationMs: 123,
    offsetMs: -10 * MINUTES, // 10 minutes ago
    userRole: "developer",
    userAgent: "mesh-demo-client/1.0",
    gatewayKey: "allTools",
    properties: { cache_hit: "false" },
  },
];
```

## Customizing Users

Edit `config.ts`:

```typescript
export const DEMO_USERS: Record<string, DemoUser> = {
  // ... existing users
  myNewUser: {
    role: "member",
    name: "My User Name",
    email: `myuser${DEMO_CONFIG.EMAIL_DOMAIN}`,
  },
};

// Also add to member roles:
export const DEMO_MEMBER_ROLES: Record<string, "owner" | "member"> = {
  // ... existing roles
  myNewUser: "member",
};
```

## Factory Functions

Factories in `factories.ts` ensure consistent record creation:

- `generateId(prefix)` - Unique ID generation
- `createUserRecord(...)` - User records
- `createAccountRecord(...)` - Credential accounts
- `createMemberRecord(...)` - Organization membership
- `createApiKeyRecord(...)` - API keys
- `createConnectionRecord(...)` - MCP connections
- `createGatewayRecord(...)` - Gateways
- `createGatewayConnectionRecord(...)` - Gateway-connection links
- `createMonitoringLogRecord(...)` - Monitoring logs

## Benefits of This Structure

### Before (Monolithic `demo.ts`)
- ❌ 1,513 lines in a single file
- ❌ ~1,100 lines of hardcoded data
- ❌ Difficult to find and update specific data
- ❌ Lots of code duplication
- ❌ Poor maintainability

### After (Modular `demo/`)
- ✅ ~280 lines in main orchestration file
- ✅ Data separated by concern
- ✅ Easy to find and update
- ✅ Reusable factory functions
- ✅ Excellent maintainability
- ✅ -70% reduction in main file size

## Testing

The seed is automatically tested during migrations. To test manually:

```bash
# Run migrations (includes seed if configured)
bun run migrate

# Or import and run directly in a test
import { seed } from "./migrations/seeds/demo";
await seed(db);
```

## Related Files

- `benchmark.ts` - Performance testing seed
- `../index.ts` - Migration index
- `../../src/storage/types.ts` - Database types

