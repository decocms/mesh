import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// AI-powered schema extraction endpoint
app.post("/api/extract-schema", async (c) => {
  try {
    const { code, typeName } = await c.req.json();

    if (!code || !typeName) {
      return c.json({ error: "Missing code or typeName" }, 400);
    }

    // In production, this would call an LLM API
    // For now, we return a placeholder response
    // The actual extraction happens client-side with the heuristic parser

    return c.json({
      success: true,
      message: "Use client-side extraction for now",
    });
  } catch (error) {
    console.error("Schema extraction error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Saved schemas storage (in-memory for now)
const schemas = new Map<string, { id: string; name: string; schema: unknown; createdAt: string }>();

app.get("/api/schemas", (c) => {
  return c.json(Array.from(schemas.values()));
});

app.post("/api/schemas", async (c) => {
  try {
    const { name, schema } = await c.req.json();
    const id = crypto.randomUUID();
    const entry = { id, name, schema, createdAt: new Date().toISOString() };
    schemas.set(id, entry);
    return c.json(entry, 201);
  } catch (error) {
    return c.json({ error: "Invalid request" }, 400);
  }
});

app.delete("/api/schemas/:id", (c) => {
  const { id } = c.req.param();
  if (schemas.delete(id)) {
    return c.json({ success: true });
  }
  return c.json({ error: "Schema not found" }, 404);
});

const PORT = process.env.PORT ?? 4101;

console.log(`🚀 Studio API server running on http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};

