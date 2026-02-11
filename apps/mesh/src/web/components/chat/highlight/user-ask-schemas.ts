import type { UserAskInput } from "@/api/routes/decopilot/built-in-tools/index.ts";
import { z } from "zod";

const textResponseSchema = z.object({
  response: z.string().min(1, "Response is required"),
});

const choiceResponseSchema = z.object({
  response: z.string().min(1, "Please select or enter an option"),
});

const confirmResponseSchema = z.object({
  response: z.enum(["yes", "no"]),
});

export type TextResponse = z.infer<typeof textResponseSchema>;
export type ChoiceResponse = z.infer<typeof choiceResponseSchema>;
export type ConfirmResponse = z.infer<typeof confirmResponseSchema>;

export type UserAskResponse = TextResponse | ChoiceResponse | ConfirmResponse;

export function getUserAskSchema(input: UserAskInput) {
  switch (input.type) {
    case "text":
      return textResponseSchema;
    case "choice":
      return choiceResponseSchema;
    case "confirm":
      return confirmResponseSchema;
    default:
      return textResponseSchema;
  }
}
