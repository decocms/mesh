import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { deleteTrip } from "../lib/storage.ts";

export const TRIP_DELETE = createTool({
  id: "TRIP_DELETE",
  description: "Delete a saved trip and its results.",
  annotations: {
    title: "Delete Trip",
    destructiveHint: true,
  },
  inputSchema: z.object({
    tripId: z.string().describe("The trip ID to delete"),
  }),
  execute: async ({ context }) => {
    const deleted = await deleteTrip(context.tripId);
    if (!deleted) {
      throw new Error(`Trip not found: ${context.tripId}`);
    }
    return { success: true };
  },
});
