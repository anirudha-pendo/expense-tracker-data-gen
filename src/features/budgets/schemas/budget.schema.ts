import { z } from "zod";

export const budgetSchema = z.object({
  monthlyLimit: z.number().positive("Limit must be greater than 0"),
});

export type BudgetFormValues = z.infer<typeof budgetSchema>;
