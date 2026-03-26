import { describe, test, expect } from "bun:test";
import { generateClientCode } from "./codegen.js";

describe("generateClientCode", () => {
  test("generates Tools interface with input and output types", async () => {
    const output = await generateClientCode({
      mcpId: "vmc_abc123",
      tools: [
        {
          name: "SEARCH",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              limit: { type: "number" },
            },
            required: ["query"],
          },
          outputSchema: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["results"],
          },
        },
      ],
    });

    // Must export Tools interface
    expect(output).toContain("export interface Tools");
    // Must have the tool key
    expect(output).toContain("SEARCH:");
    // Must have input/output subkeys
    expect(output).toContain("input:");
    expect(output).toContain("output:");
    // Must import createMeshClient
    expect(output).toContain('from "@decocms/typegen"');
    // Must call createMeshClient with the mcpId
    expect(output).toContain("vmc_abc123");
    expect(output).toContain("createMeshClient<Tools>");
  });

  test("uses unknown for missing outputSchema", async () => {
    const output = await generateClientCode({
      mcpId: "vmc_test",
      tools: [
        {
          name: "NO_OUTPUT",
          inputSchema: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        },
      ],
    });

    expect(output).toContain("output: unknown");
  });

  test("handles multiple tools", async () => {
    const output = await generateClientCode({
      mcpId: "vmc_multi",
      tools: [
        {
          name: "TOOL_A",
          inputSchema: { type: "object", properties: {}, required: [] },
        },
        {
          name: "TOOL_B",
          inputSchema: { type: "object", properties: {}, required: [] },
        },
      ],
    });

    expect(output).toContain("TOOL_A:");
    expect(output).toContain("TOOL_B:");
  });

  test("inlines extra type aliases from nullable/described properties", async () => {
    // json-schema-to-typescript can emit helper `export type X = string | null`
    // declarations when properties have descriptions and nullable types.
    // These must not appear inside the Tools interface body.
    const output = await generateClientCode({
      mcpId: "vmc_test",
      tools: [
        {
          name: "GREP",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: ["string", "null"],
                description: "Query to search for",
              },
              include: {
                type: ["string", "null"],
                description: "Include pattern",
              },
            },
          },
        },
      ],
    });

    expect(output).not.toContain("export type Query");
    expect(output).not.toContain("export type Include");
    expect(output).toContain("GREP:");
  });

  test("inlines $ref type aliases that appear before the primary interface", async () => {
    const output = await generateClientCode({
      mcpId: "vmc_test",
      tools: [
        {
          name: "GetWorkflows",
          inputSchema: {
            type: "object",
            properties: {
              limit: { $ref: "#/definitions/Limit" },
              offset: { $ref: "#/definitions/Offset" },
            },
            definitions: {
              Limit: {
                type: ["number", "null"],
                description: "Max results",
              },
              Offset: {
                type: ["number", "null"],
                description: "Offset for pagination",
              },
            },
          },
        },
      ],
    });

    expect(output).not.toContain("export type Limit");
    expect(output).not.toContain("export type Offset");
    expect(output).not.toContain("export interface GetWorkflowsInput");
    expect(output).toContain("GetWorkflows:");
    expect(output).toContain("number | null");
  });

  test("inlines $ref helper interfaces that appear after the primary interface", async () => {
    const output = await generateClientCode({
      mcpId: "vmc_test",
      tools: [
        {
          name: "COLLECTION_CONNECTIONS_LIST",
          inputSchema: {
            type: "object",
            properties: {
              filter: { $ref: "#/definitions/Filter" },
            },
            definitions: {
              Filter: {
                type: "object",
                description: "Filter expression",
                properties: {
                  field: { type: "string" },
                  value: { type: "string" },
                },
              },
            },
          },
        },
      ],
    });

    expect(output).not.toContain("export interface Filter");
    expect(output).not.toContain(
      "export interface COLLECTION_CONNECTIONS_LISTInput",
    );
    expect(output).toContain("COLLECTION_CONNECTIONS_LIST:");
    expect(output).toContain("field?:");
    expect(output).toContain("value?:");
  });

  test("inlines cross-referencing helpers (type used inside interface)", async () => {
    const output = await generateClientCode({
      mcpId: "vmc_test",
      tools: [
        {
          name: "Search",
          inputSchema: {
            type: "object",
            properties: {
              filter: { $ref: "#/definitions/Filter" },
            },
            definitions: {
              Operator: { type: "string", enum: ["eq", "ne", "gt"] },
              Filter: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  op: { $ref: "#/definitions/Operator" },
                },
              },
            },
          },
        },
      ],
    });

    expect(output).not.toContain("export type Operator");
    expect(output).not.toContain("export interface Filter");
    expect(output).toContain('"eq"');
    expect(output).toContain('"ne"');
    expect(output).toContain('"gt"');
  });

  test("inlines multi-line union type aliases (anyOf with object variants)", async () => {
    const output = await generateClientCode({
      mcpId: "vmc_test",
      tools: [
        {
          name: "LIST",
          inputSchema: {
            type: "object",
            properties: {
              where: { $ref: "#/definitions/Where" },
            },
            definitions: {
              Where: {
                description: "Filter expression",
                anyOf: [
                  {
                    type: "object",
                    properties: {
                      field: { type: "array", items: { type: "string" } },
                    },
                    required: ["field"],
                  },
                  {
                    type: "object",
                    properties: { op: { type: "string" } },
                    required: ["op"],
                  },
                ],
              },
            },
          },
        },
      ],
    });

    expect(output).not.toContain("export type Where");
    expect(output).toContain("LIST:");
    expect(output).toContain("field: string[]");
    expect(output).toContain("op: string");
  });

  test("handles schemas where title overrides the primary declaration name", async () => {
    const output = await generateClientCode({
      mcpId: "vmc_test",
      tools: [
        {
          name: "GetWorkflows",
          inputSchema: {
            type: "object",
            title: "HttpsCdnSomeLongGeneratedName",
            properties: {
              limit: { $ref: "#/definitions/Limit" },
              offset: { $ref: "#/definitions/Offset" },
            },
            definitions: {
              Limit: {
                type: ["number", "null"],
                description: "Max results",
              },
              Offset: {
                type: ["number", "null"],
                description: "Offset for pagination",
              },
            },
          },
        },
      ],
    });

    expect(output).not.toContain("export type Limit");
    expect(output).not.toContain("export type Offset");
    expect(output).not.toContain("HttpsCdnSomeLongGeneratedName");
    expect(output).toContain("GetWorkflows:");
    expect(output).toContain("number | null");
  });

  test("exports a client const", async () => {
    const output = await generateClientCode({
      mcpId: "vmc_test",
      tools: [],
    });

    expect(output).toContain("export const client =");
  });
});
