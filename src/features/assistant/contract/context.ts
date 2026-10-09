import { z } from "zod";
import { isValidLocale, isValidTimeZone } from "../lib/intl.js";
import { ASSISTANT_LIMITS } from "./limits.js";
import type { AssistantContext } from "./types.js";

export const assistantContextSchema: z.ZodType<AssistantContext> = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().min(1).max(64).refine(isValidTimeZone, "Unknown time zone"),
  currency: z.string().regex(/^[A-Z]{3}$/),
  locale: z.string().min(2).max(35).refine(isValidLocale, "Unknown locale"),
  categories: z
    .array(z.object({ name: z.string().trim().min(1).max(40), scope: z.enum(["income", "expense", "both"]) }))
    .max(ASSISTANT_LIMITS.maxContextCategories),
});
