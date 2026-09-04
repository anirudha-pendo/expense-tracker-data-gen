import { z } from "zod";

export const goalSchema = z.object({
  name: z.string().min(1, "Name is required").max(60, "Name must be at most 60 characters"),
  targetAmount: z.number().positive("Target must be greater than 0"),
  deadline: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Enter a valid hex color"),
});

export type GoalFormValues = z.infer<typeof goalSchema>;

export const contributionSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  date: z.string().min(1, "Date is required"),
  note: z.string().max(200, "Note must be at most 200 characters").optional(),
});

export type ContributionFormValues = z.infer<typeof contributionSchema>;
