/**
 * Public Diagnostic Routes
 *
 * No authentication required — these routes are mounted before the MeshContext
 * middleware and are excluded from MeshContext injection via shouldSkipMeshContext.
 *
 * Routes:
 *   POST /api/diagnostic/scan     — Trigger a diagnostic scan, returns session token
 *   GET  /api/diagnostic/session/:token — Poll session status and results
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Kysely } from "kysely";
import type { Database } from "../../storage/types";
import { DiagnosticSessionStorage } from "../../storage/diagnostic-sessions";
import { checkRateLimit, runDiagnostic } from "../../diagnostic/orchestrator";

// ============================================================================
// Request Schemas
// ============================================================================

const ScanRequestSchema = z.object({
  url: z.string().min(1).max(2000),
  force: z.boolean().optional(),
});

// ============================================================================
// Route Factory
// ============================================================================

/**
 * Create public diagnostic routes with an injected database.
 * Called from app.ts before the MeshContext middleware is mounted.
 */
export function createDiagnosticRoutes(db: Kysely<Database>) {
  const app = new Hono();
  const storage = new DiagnosticSessionStorage(db);

  // --------------------------------------------------------------------------
  // POST /scan — Trigger a diagnostic scan
  // --------------------------------------------------------------------------
  app.post("/scan", async (c) => {
    // Parse and validate request body
    let body: z.infer<typeof ScanRequestSchema>;
    try {
      const raw = await c.req.json();
      const parsed = ScanRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return c.json(
          {
            error: "Invalid request body",
            details: parsed.error.flatten().fieldErrors,
          },
          400,
        );
      }
      body = parsed.data;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // Rate limiting — 10 seconds per IP
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    if (!checkRateLimit(ip)) {
      return c.json(
        { error: "Too many requests. Please wait before scanning again." },
        429,
      );
    }

    // Run diagnostic — returns immediately with token
    try {
      const result = await runDiagnostic({
        url: body.url,
        storage,
        force: body.force,
      });

      return c.json({ token: result.token, cached: result.cached }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      // Distinguish user-facing validation errors from unexpected failures
      // SSRF / URL validation errors are descriptive and safe to surface
      const isValidationError =
        message.includes("Unsupported protocol") ||
        message.includes("private/internal IP") ||
        message.includes("Invalid URL") ||
        message.includes("Could not resolve hostname") ||
        message.includes("URL must not be empty");

      if (isValidationError) {
        return c.json({ error: message }, 400);
      }

      console.error("[diagnostic] Unexpected scan error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // --------------------------------------------------------------------------
  // GET /session/:token — Poll session status and results
  // --------------------------------------------------------------------------
  app.get("/session/:token", async (c) => {
    const token = c.req.param("token");

    const session = await storage.findByToken(token);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json(
      {
        token: session.token,
        url: session.url,
        status: session.status,
        agents: session.agents,
        results: session.results,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      200,
    );
  });

  return app;
}
