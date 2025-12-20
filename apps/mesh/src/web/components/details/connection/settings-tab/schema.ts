import { ConnectionEntitySchema } from "@/tools/connection/schema";
import { z } from "zod";

export const connectionFormSchema = ConnectionEntitySchema.pick({
  title: true,
  description: true,
  connection_type: true,
  connection_url: true,
  connection_token: true,
  configuration_scopes: true,
  configuration_state: true,
}).partial({
  description: true,
  connection_token: true,
});

export type ConnectionFormData = z.infer<typeof connectionFormSchema>;
