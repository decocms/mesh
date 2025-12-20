/* oxlint-disable no-explicit-any */
import { z } from "zod";
import type { MCPConnection } from "../connection.ts";
import {
  createMCPFetchStub,
  type MCPClientFetchStub,
  type ToolBinder,
} from "../mcp.ts";
import { createPrivateTool, createStreamableTool } from "../tools.ts";
import { CHANNEL_BINDING } from "./channels.ts";

// ToolLike is a simplified version of the Tool interface that matches what we need for bindings
export interface ToolLike<
  TName extends string = string,
  TInput = any,
  TReturn extends object | null | boolean = object,
> {
  name: TName;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TReturn>;
  handler: (props: TInput) => Promise<TReturn> | TReturn;
}

export type Binder<
  TDefinition extends readonly ToolBinder[] = readonly ToolBinder[],
> = TDefinition;

export type BinderImplementation<
  TBinder extends Binder<any>,
  TContext = any,
> = TBinder extends Binder<infer TDefinition>
  ? {
      [K in keyof TDefinition]: Omit<
        ToolLike<
          TDefinition[K]["name"],
          z.infer<TDefinition[K]["inputSchema"]>,
          TDefinition[K] extends { outputSchema: infer Schema }
            ? Schema extends z.ZodType
              ? z.infer<Schema>
              : never
            : never
        >,
        "name" | "inputSchema" | "outputSchema" | "handler"
      > & {
        handler: (
          props: z.infer<TDefinition[K]["inputSchema"]>,
          c?: TContext,
        ) => ReturnType<
          ToolLike<
            TDefinition[K]["name"],
            z.infer<TDefinition[K]["inputSchema"]>,
            TDefinition[K] extends { outputSchema: infer Schema }
              ? Schema extends z.ZodType
                ? z.infer<Schema>
                : never
              : never
          >["handler"]
        >;
      };
    }
  : never;

export const bindingClient = <TDefinition extends readonly ToolBinder[]>(
  binder: TDefinition,
) => {
  return {
    implements: (tools: ToolBinder[]) => {
      return binder.every(
        (tool) =>
          tool.opt === true || (tools ?? []).some((t) => t.name === tool.name),
      );
    },
    forConnection: (
      mcpConnection: MCPConnection,
    ): MCPClientFetchStub<TDefinition> => {
      return createMCPFetchStub<TDefinition>({
        connection: mcpConnection,
        streamable: binder.reduce(
          (acc, tool) => {
            acc[tool.name] = tool.streamable === true;
            return acc;
          },
          {} as Record<string, boolean>,
        ),
      });
    },
  };
};

export type MCPBindingClient<T extends ReturnType<typeof bindingClient<any>>> =
  ReturnType<T["forConnection"]>;

export const ChannelBinding = bindingClient(CHANNEL_BINDING);
export type { Callbacks } from "./channels.ts";

export const impl = <TBinder extends Binder>(
  schema: TBinder,
  implementation: BinderImplementation<TBinder>,
  createToolFn = createPrivateTool,
  createStreamableToolFn = createStreamableTool,
) => {
  const impl: (
    | ReturnType<typeof createToolFn>
    | ReturnType<typeof createStreamableToolFn>
  )[] = [];
  for (const key in schema) {
    const toolSchema = schema[key];
    const toolImplementation = implementation[key];

    if (toolSchema.opt && !toolImplementation) {
      continue;
    }

    if (!toolImplementation) {
      throw new Error(`Implementation for ${key} is required`);
    }

    const { name, handler, streamable, ...toolLike } = {
      ...toolSchema,
      ...toolImplementation,
    };
    if (streamable) {
      impl.push(
        createStreamableToolFn({
          ...toolLike,
          streamable,
          id: name,
          execute: ({ context }) => Promise.resolve(handler(context)),
        }),
      );
    } else {
      impl.push(
        createToolFn({
          ...toolLike,
          id: name,
          execute: ({ context }) => Promise.resolve(handler(context)),
        }),
      );
    }
  }
  return impl;
};
