import { z } from "zod";
import { assistantContextSchema } from "./context.js";
import { ASSISTANT_LIMITS } from "./limits.js";

export const chatRequestSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  messages: z
    .array(
      z.looseObject({ id: z.string().min(1).max(200), role: z.enum(["user", "assistant"]), parts: z.array(z.unknown()) }),
    )
    .min(1)
    .max(ASSISTANT_LIMITS.maxMessages),
  context: assistantContextSchema,
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
