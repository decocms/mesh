/**
 * Tests for Smart Tool Selection Gateway
 *
 * Tests the keyword search algorithm and tool index functionality
 */

import { describe, expect, test } from "bun:test";
import { parseStrategyFromMode } from "./strategy";

// ============================================================================
// Test the keyword search algorithm (copied for testing)
// ============================================================================

interface ToolEntry {
  name: string;
  description: string;
  connectionId: string;
  connectionTitle: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s_\-./]+/)
    .filter((term) => term.length >= 2);
}

function calculateScore(terms: string[], tool: ToolEntry): number {
  let score = 0;
  const nameLower = tool.name.toLowerCase();
  const descLower = tool.description.toLowerCase();
  const connLower = tool.connectionTitle.toLowerCase();

  for (const term of terms) {
    // Name match: highest weight (exact match bonus)
    if (nameLower === term) {
      score += 10;
    } else if (nameLower.includes(term)) {
      score += 3;
    }

    // Description match: medium weight
    if (descLower.includes(term)) {
      score += 2;
    }

    // Connection title match: lower weight
    if (connLower.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function searchTools(
  query: string,
  tools: ToolEntry[],
  limit: number,
): ToolEntry[] {
  const terms = tokenize(query);

  if (terms.length === 0) {
    return tools.slice(0, limit);
  }

  return tools
    .map((tool) => ({
      tool,
      score: calculateScore(terms, tool),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.tool);
}

// ============================================================================
// Test Data
// ============================================================================

const mockTools: ToolEntry[] = [
  {
    name: "send_email",
    description: "Send an email to a recipient",
    connectionId: "conn1",
    connectionTitle: "Gmail Integration",
    inputSchema: { type: "object", properties: { to: { type: "string" } } },
  },
  {
    name: "create_order",
    description: "Create a new order in the system",
    connectionId: "conn2",
    connectionTitle: "Shopify",
    inputSchema: { type: "object", properties: { items: { type: "array" } } },
  },
  {
    name: "get_order",
    description: "Get order details by ID",
    connectionId: "conn2",
    connectionTitle: "Shopify",
    inputSchema: {
      type: "object",
      properties: { orderId: { type: "string" } },
    },
  },
  {
    name: "upload_file",
    description: "Upload a file to cloud storage",
    connectionId: "conn3",
    connectionTitle: "AWS S3",
    inputSchema: { type: "object", properties: { file: { type: "string" } } },
  },
  {
    name: "list_files",
    description: "List files in a directory",
    connectionId: "conn3",
    connectionTitle: "AWS S3",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
  },
  {
    name: "search_customers",
    description: "Search for customers by name or email",
    connectionId: "conn4",
    connectionTitle: "HubSpot CRM",
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
  },
  {
    name: "create_customer",
    description: "Create a new customer record",
    connectionId: "conn4",
    connectionTitle: "HubSpot CRM",
    inputSchema: { type: "object", properties: { name: { type: "string" } } },
  },
];

// ============================================================================
// Tests
// ============================================================================

describe("Smart Gateway - Keyword Search", () => {
  describe("tokenize", () => {
    test("should split on spaces", () => {
      expect(tokenize("send email")).toEqual(["send", "email"]);
    });

    test("should split on underscores", () => {
      expect(tokenize("send_email")).toEqual(["send", "email"]);
    });

    test("should split on dashes", () => {
      expect(tokenize("send-email")).toEqual(["send", "email"]);
    });

    test("should filter short tokens", () => {
      expect(tokenize("a send b email c")).toEqual(["send", "email"]);
    });

    test("should lowercase tokens", () => {
      expect(tokenize("SEND EMAIL")).toEqual(["send", "email"]);
    });
  });

  describe("searchTools", () => {
    test("should find tools by exact name match", () => {
      const results = searchTools("send_email", mockTools, 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.name).toBe("send_email");
    });

    test("should find tools by partial name match", () => {
      const results = searchTools("email", mockTools, 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.name).toBe("send_email");
    });

    test("should find tools by description", () => {
      const results = searchTools("recipient", mockTools, 10);
      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe("send_email");
    });

    test("should find tools by connection title", () => {
      const results = searchTools("shopify", mockTools, 10);
      expect(results.length).toBe(2);
      expect(results.map((t) => t.connectionTitle)).toEqual([
        "Shopify",
        "Shopify",
      ]);
    });

    test("should rank name matches higher than description matches", () => {
      const results = searchTools("order", mockTools, 10);
      // create_order and get_order have "order" in name
      expect(results[0]!.name).toBe("create_order");
      expect(results[1]!.name).toBe("get_order");
    });

    test("should find multiple related tools", () => {
      const results = searchTools("customer", mockTools, 10);
      expect(results.length).toBe(2);
      expect(results.map((t) => t.name).sort()).toEqual([
        "create_customer",
        "search_customers",
      ]);
    });

    test("should respect limit", () => {
      const results = searchTools("file", mockTools, 1);
      expect(results.length).toBe(1);
    });

    test("should return empty for no matches", () => {
      const results = searchTools("xyz123nonexistent", mockTools, 10);
      expect(results.length).toBe(0);
    });

    test("should return first N tools for empty query", () => {
      const results = searchTools("", mockTools, 3);
      expect(results.length).toBe(3);
    });

    test("should handle multi-word queries", () => {
      const results = searchTools("create new order", mockTools, 10);
      expect(results[0]!.name).toBe("create_order");
    });

    test("should find tools across different connections", () => {
      const results = searchTools("create", mockTools, 10);
      expect(results.length).toBe(2);
      expect(results.map((t) => t.name).sort()).toEqual([
        "create_customer",
        "create_order",
      ]);
    });
  });

  describe("calculateScore", () => {
    test("should give highest score for exact name match", () => {
      const exactScore = calculateScore(["send_email"], mockTools[0]!);
      const partialScore = calculateScore(["send"], mockTools[0]!);
      expect(exactScore).toBeGreaterThan(partialScore);
    });

    test("should accumulate scores for multiple matching terms", () => {
      const singleScore = calculateScore(["send"], mockTools[0]!);
      const doubleScore = calculateScore(["send", "email"], mockTools[0]!);
      expect(doubleScore).toBeGreaterThan(singleScore);
    });
  });
});

describe("parseStrategyFromMode", () => {
  test("returns passthrough when mode is undefined", () => {
    expect(parseStrategyFromMode(undefined)).toBe("passthrough");
  });

  test("returns passthrough when mode is empty string", () => {
    expect(parseStrategyFromMode("")).toBe("passthrough");
  });

  test("returns passthrough for invalid mode", () => {
    expect(parseStrategyFromMode("invalid")).toBe("passthrough");
    expect(parseStrategyFromMode("unknown")).toBe("passthrough");
  });

  test("returns passthrough for valid passthrough mode", () => {
    expect(parseStrategyFromMode("passthrough")).toBe("passthrough");
  });

  test("returns smart_tool_selection for valid mode", () => {
    expect(parseStrategyFromMode("smart_tool_selection")).toBe(
      "smart_tool_selection",
    );
  });

  test("returns code_execution for valid mode", () => {
    expect(parseStrategyFromMode("code_execution")).toBe("code_execution");
  });
});
