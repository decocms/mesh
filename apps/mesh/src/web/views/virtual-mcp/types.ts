/**
 * Shared types for Virtual MCP form components
 */

import { VirtualMCPEntitySchema } from "@/tools/virtual/schema";
import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";

/**
 * Form validation schema for Virtual MCP
 */
export const VirtualMcpFormSchema = VirtualMCPEntitySchema.pick({
  status: true,
  title: true,
  description: true,
  icon: true,
  metadata: true,
  connections: true,
});

/**
 * Form data type for Virtual MCP
 */
export type VirtualMcpFormData = z.infer<typeof VirtualMcpFormSchema>;

/**
 * Form return type for Virtual MCP
 */
export type VirtualMcpFormReturn = UseFormReturn<VirtualMcpFormData>;
