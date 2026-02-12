# Workflow Auth Fix: `superUser` Propagation Through Virtual MCPs

> **Date:** 2026-02-11
> **Area:** MCP client pipeline (`mcp-clients/`), event bus (`event-bus/`), workflows plugin

---

## 1. Symptom

Every workflow execution failed immediately on the first tool step:

```
MCP error -32603: Authentication required. Please provide a valid OAuth token or API key.
```

The error came from `AuthTransport.authorizeToolCall()` — the transport-level guard that sits in front of every outbound MCP connection.

---

## 2. Root Cause Analysis

### 2.1 The Two Worlds: HTTP vs Background

Mesh has two execution contexts:

| | **HTTP request** | **Event bus worker** |
|---|---|---|
| Entry point | Hono route handler | `EventBusWorker.processEvents()` |
| `MeshContext` creation | `ContextFactory.create(request)` | `ContextFactory.create()` — **no request** |
| `auth.user` | Populated from OAuth session or API key | `undefined` |
| `auth.apiKey` | Populated if Bearer token is an API key | `undefined` |
| Organization | Derived from session/API key metadata | Inferred from connection's `organization_id` |

Workflows always execute in the background world. When a user calls `COLLECTION_WORKFLOW_EXECUTION_CREATE`, the tool publishes a `workflow.execution.created` event and returns immediately. The event bus worker picks it up later, in a headless context with no user.

### 2.2 The `superUser` Bypass

The system already accounts for this with a `superUser` flag. The call chain is:

```
EventBusWorker
  → createNotifySubscriber()
    → ContextFactory.create()          // headless — no user
    → dangerouslyCreateSuperUserMCPProxy(connectionId, ctx)
      → createMCPProxyDoNotUseDirectly(conn, ctx, { superUser: true })
        → clientFromConnection(conn, ctx, superUser=true)
```

When `superUser` is `true`, two things happen:

1. **`AuthTransport`** skips the authentication check entirely (`if (this.options.superUser) return;`)
2. **`buildRequestHeaders`** falls back to `connection.created_by` as the JWT subject when no user is present

### 2.3 Where the Flag Was Dropped

`clientFromConnection` routes based on `connection_type`:

```typescript
// client.ts
if (connection.connection_type === "VIRTUAL") {
  return createVirtualClient(connection, ctx, superUser);  // ← superUser passed here
}
return createOutboundClient(connection, ctx, superUser);
```

For **outbound** connections (HTTP, SSE, STDIO), `superUser` flows directly into `AuthTransport`:

```
createOutboundClient(conn, ctx, superUser=true)
  → new AuthTransport(transport, { ctx, connection, superUser: true })  ✅
```

For **Virtual MCP** connections, the flag was lost. A Virtual MCP is an aggregator — it doesn't connect to a single server. Instead, it creates sub-clients for each downstream connection. The internal `createClientMap` function in `PassthroughClient` hardcoded `superUser` to `false`:

```
createVirtualClient(conn, ctx, superUser=true)
  → createVirtualClientFrom(virtualMcp, ctx, "passthrough", superUser=true)
    → new PassthroughClient(options, ctx)
      → createClientMap(connections, ctx)  // ← superUser NOT passed, defaults to false
        → clientFromConnection(conn, ctx, false)  // ← each sub-client gets superUser=false
          → new AuthTransport(transport, { superUser: false })  ❌
```

Since workflows **always** reference a `virtual_mcp_id` (the workflow template requires it), every workflow tool step routes through a Virtual MCP, and every tool call fails.

### 2.4 Why This Only Affects Workflows (Not User Sandbox)

The user-sandbox plugin (`mesh-plugin-user-sandbox`) was checked as a comparison. It doesn't have this problem because:

- Its tools (`USER_SANDBOX_CREATE`, `USER_SANDBOX_CREATE_SESSION`) run inside HTTP request handlers with a fully authenticated `MeshContext`
- It has no `onEvents` handler — it never executes in the background worker context
- When it creates MCP proxies, the user's session is always present

The workflows plugin is the first (and currently only) plugin that combines **event-driven background execution** with **Virtual MCP tool routing**.

---

## 3. The Fix

Four files changed, all in `apps/mesh/src/mcp-clients/`:

### 3.1 `virtual-mcp/types.ts` — Add `superUser` to options interface

```typescript
export interface VirtualClientOptions {
  connections: ConnectionEntity[];
  virtualMcp: VirtualMCPEntity;
  virtualTools?: VirtualToolDefinition[];
  superUser?: boolean;  // ← added
}
```

### 3.2 `virtual-mcp/index.ts` — Thread `superUser` through factory functions

Both `createVirtualClient()` and `createVirtualClientFrom()` now accept and forward `superUser`:

```typescript
export async function createVirtualClient(conn, ctx, superUser = false) {
  // ...
  return createVirtualClientFrom(virtualMcp, ctx, "passthrough", superUser);
}

export async function createVirtualClientFrom(virtualMcp, ctx, strategy, superUser = false) {
  // ...
  const options: VirtualClientOptions = { connections, virtualMcp, virtualTools, superUser };
  // options passed to PassthroughClient / SmartToolSelectionClient / CodeExecutionClient
}
```

### 3.3 `virtual-mcp/passthrough-client.ts` — Propagate to sub-clients

```typescript
async function createClientMap(connections, ctx, superUser = false) {
  // Each sub-client now receives the superUser flag
  const client = await clientFromConnection(connection, ctx, superUser);
}

// In constructor:
this._clients = lazy(() =>
  createClientMap(this.options.connections, this.ctx, this.options.superUser ?? false)
);
```

### 3.4 `client.ts` — Already correct (no change needed)

`clientFromConnection` already forwarded `superUser` to both `createVirtualClient` and `createOutboundClient`. The break was inside the Virtual MCP layer.

### Design Principle

The parameter defaults to `false` everywhere. No existing user-facing code path is affected — `superUser: true` only enters the system through `dangerouslyCreateSuperUserMCPProxy`, which is exclusively used by the event bus worker.

---

## 4. Inheritance: All Three Virtual MCP Strategies Are Covered

Virtual MCPs support three tool selection strategies:

| Strategy | Class | Inherits from |
|---|---|---|
| `passthrough` | `PassthroughClient` | `Client` (MCP SDK) |
| `smart_tool_selection` | `SmartToolSelectionClient` | `BaseSelection` → `PassthroughClient` |
| `code_execution` | `CodeExecutionClient` | `BaseSelection` → `PassthroughClient` |

All three strategies inherit from `PassthroughClient`, which owns the `createClientMap` call. The fix in `PassthroughClient` automatically covers all strategies. `SmartToolSelectionClient` and `CodeExecutionClient` both delegate tool execution back to `PassthroughClient.callTool()` (via `routeToolCall`), so the auth bypass propagates correctly regardless of which strategy the Virtual MCP uses.

---

## 5. Nested Virtual MCPs

A Virtual MCP can include another Virtual MCP as a downstream connection (the only guard is `isSelfReferencingVirtual` which prevents direct self-loops). In this case:

```
Virtual MCP A (superUser=true)
  → createClientMap → clientFromConnection(Virtual MCP B, ctx, superUser=true)
    → createVirtualClient(B, ctx, superUser=true)
      → PassthroughClient(options={ superUser: true })
        → createClientMap → clientFromConnection(HTTP conn, ctx, superUser=true)
          → AuthTransport({ superUser: true })  ✅
```

The fix handles arbitrary nesting because `clientFromConnection` is the recursive entry point and it always forwards `superUser`.

---

## 6. Security Analysis

### 6.1 Trust Model: Workflow Creation Is the Authorization Gate

With `superUser: true`, workflow steps bypass **all** RBAC checks — `AuthTransport` skips both authentication and authorization. This means a workflow created by a restricted user still executes with full access to every tool in the Virtual MCP.

This is **intentional and consistent** with the existing trust model:

- `dangerouslyCreateSuperUserMCPProxy` (the function name itself signals this)
- Workflow creation (`COLLECTION_WORKFLOW_EXECUTION_CREATE`) calls `ctx.access.check()`, which verifies the user has permission to create executions
- The workflow template defines which `virtual_mcp_id` to use — the user can't choose arbitrary connections at runtime
- Steps are defined in the workflow template, not at execution time

**Risk:** If workflow creation is ever opened to lower-privilege roles (e.g., `viewer`), those users could trigger tool calls they wouldn't normally have access to. The mitigation would be to either:
- Add per-step permission checks in the orchestrator
- Validate that the workflow's Virtual MCP only contains connections the user has access to at creation time

### 6.2 Cross-Organization Isolation

The event bus stores `organization_id` on every event. When `createNotifySubscriber` processes an event for a SELF connection, it extracts the org ID from the connection ID format (`{orgId}_self`). The `MeshContext` created by `ContextFactory.create()` has no organization initially — it's set via `ctx.organization ??= { id: connection.organization_id }` inside `createMCPProxyDoNotUseDirectly`.

This means:
- The proxy can only access connections belonging to the event's organization
- `ctx.storage.connections.findById(id, orgId)` scopes lookups to the org
- Cross-org access is prevented by the storage layer, not by `AuthTransport`

**The `superUser` flag does NOT grant cross-organization access.** It only bypasses the per-tool RBAC check within the connection's own organization.

### 6.3 Virtual Tool Sandbox Implications

Virtual tools (JavaScript code defined on the Virtual MCP itself) execute in a QuickJS sandbox. They receive a `tools` object that lets them call any downstream tool in the same Virtual MCP:

```javascript
export default async (tools, args) => {
  const result = await tools.SOME_DOWNSTREAM_TOOL({ query: args.input });
  return result;
};
```

These calls go through the same `client.callTool()` path, which now has `superUser: true` in background contexts. This means virtual tool code running in a workflow can reach **any tool** in the Virtual MCP without per-call permission checks.

This is consistent — the virtual tool code is defined by an admin when configuring the Virtual MCP, not by the workflow user. But it's worth noting that virtual tools are a code execution surface that now operates with elevated privileges during background execution.

---

## 7. Monitoring & Audit Trail Gaps

### 7.1 `userId` Is `null` in Monitoring Logs

`MonitoringTransport.logToDatabase()` records:

```typescript
userId: ctx.auth.user?.id || ctx.auth.apiKey?.userId || null
```

In the event bus worker context, both are `undefined`, so monitoring logs for workflow tool calls have `userId: null`. This makes it impossible to trace which user triggered a workflow from the monitoring dashboard alone.

### 7.2 JWT Subject Falls Back to `connection.created_by`

`buildRequestHeaders` uses this fallback chain for the JWT subject:

```typescript
const userId = ctx.auth.user?.id
  ?? ctx.auth.apiKey?.userId
  ?? (superUser ? connection.created_by : undefined);
```

Downstream servers receiving the `x-mesh-token` JWT will see the connection creator's ID, not the workflow triggering user. This is misleading for:
- Audit trails on downstream services
- Rate limiting per-user on downstream services
- Any downstream logic that uses the JWT subject for authorization

### 7.3 The Data Exists — It's Just Not Threaded Through

The workflow execution record stores `created_by` (the user who triggered it):

```typescript
// workflow-execution.ts
await storage.executions.createExecution({
  // ...
  createdBy: meshCtx.auth.user?.id,  // ← the triggering user's ID
});
```

This value is available in the database but is never passed to the event context or the MCP proxy. The event bus only carries `type`, `subject`, and `data` — there's no mechanism to attach the originating user's identity to the event itself.

---

## 8. Proposals for Follow-Up Work

### 8.1 Thread Triggering User Through Event Context (Medium Priority)

**Problem:** Monitoring logs and downstream JWTs can't identify who triggered a workflow.

**Proposal:** Add an optional `actorId` field to `ServerPluginEventContext` and `CloudEvent.data`:

```typescript
// When publishing workflow.execution.created:
await meshCtx.eventBus.publish(orgId, connectionId, {
  type: "workflow.execution.created",
  subject: executionId,
  data: { actorId: meshCtx.auth.user?.id },  // ← carry the user
});

// In createNotifySubscriber, extract and inject into MeshContext:
const actorId = events[0]?.data?.actorId;
// Use actorId for monitoring and JWT issuance instead of connection.created_by
```

Alternatively, the orchestrator could look up `created_by` from the execution record when it claims the execution — this avoids changing the event schema.

### 8.2 Dedicated Service User for Background Actions (Low Priority)

**Problem:** `connection.created_by` is a real user ID being used as a service identity.

**Proposal:** Create a per-organization "Mesh System" user (similar to a service account). Background actions would be attributed to this user instead of the connection creator. This cleanly separates human actions from automated ones in monitoring dashboards and downstream audit trails.

### 8.3 Scoped `superUser` — Per-Connection Allow List (Future)

**Problem:** `superUser: true` bypasses auth for **all** tools on **all** connections in the Virtual MCP.

**Proposal:** Instead of a boolean flag, support a scoped mode:

```typescript
interface SuperUserScope {
  allowedConnections?: string[];  // Only bypass auth for these connections
  allowedTools?: string[];        // Only bypass auth for these tools
}
```

This would let workflows declare exactly which tools they need, following least-privilege. The workflow template already defines steps with explicit `toolName` values — this data could drive the scope automatically.

### 8.4 Integration Test for Background Virtual MCP Execution (High Priority)

**Problem:** This bug was only caught at runtime. There's no test that exercises the full path: event bus → plugin handler → Virtual MCP → downstream tool call in a headless context.

**Proposal:** Add an integration test that:
1. Creates a Virtual MCP with a downstream HTTP connection
2. Creates a `MeshContext` without a request (`ContextFactory.create()`)
3. Calls `dangerouslyCreateSuperUserMCPProxy` with the Virtual MCP's connection ID
4. Calls a tool through the proxy
5. Asserts the call succeeds (no auth error)
6. Asserts monitoring logs have `userId: null` (documents current behavior)

---

## 9. Key Takeaways

1. **`superUser` is a transport-level concern that must propagate through every layer that creates MCP clients.** Virtual MCPs are an aggregation layer that internally spawns sub-clients — the flag must survive this fan-out.

2. **Background workers produce "headless" contexts.** Any code path that checks `auth.user` needs either a populated user or a bypass mechanism. The `superUser` flag is that mechanism, but it's invisible — it's easy to add a new layer that doesn't forward it.

3. **The class hierarchy saved us.** Because `SmartToolSelectionClient` and `CodeExecutionClient` both extend `PassthroughClient`, fixing the base class fixed all three strategies. This is a good argument for keeping the inheritance chain rather than duplicating client creation logic.

4. **Naming matters.** `dangerouslyCreateSuperUserMCPProxy` makes the elevated privilege explicit. The internal `createClientMap` function had no such signal — it silently dropped the flag. Adding `superUser` as an explicit parameter (not a hidden default) makes the privilege boundary visible in the function signature.

5. **The user-sandbox plugin wasn't affected** because it operates entirely within HTTP request contexts. This is a useful design pattern: plugins that don't need background execution avoid the entire class of headless-context bugs.
