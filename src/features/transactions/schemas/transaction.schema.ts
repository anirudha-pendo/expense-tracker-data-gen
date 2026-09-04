import { z } from "zod";

export const transactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.number().positive("Amount must be greater than 0"),
  categoryId: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required").max(100, "Description must be at most 100 characters"),
  date: z.string().min(1, "Date is required"),
  isRecurring: z.boolean(),
  notes: z.string().max(500, "Notes must be at most 500 characters"),
});

export type TransactionFormValues = z.infer<typeof transactionSchema>;
