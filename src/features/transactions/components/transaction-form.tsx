import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { transactionSchema, type TransactionFormValues } from "../schemas/transaction.schema";
import { AttachmentManager } from "./attachment-manager";
import type { UseAttachmentsReturn } from "../hooks/use-attachments";
import type { Category, Transaction } from "@/types";

interface TransactionFormProps {
  categories: Category[];
  defaultValues?: Partial<Transaction>;
  attachments?: UseAttachmentsReturn;
  onSubmit: (values: TransactionFormValues) => Promise<void>;
  onCancel: () => void;
}

export function TransactionForm({ categories, defaultValues, attachments, onSubmit, onCancel }: TransactionFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: defaultValues?.type ?? "expense",
      amount: defaultValues?.amount,
      categoryId: defaultValues?.categoryId ?? "",
      description: defaultValues?.description ?? "",
      date: defaultValues?.date
        ? format(new Date(defaultValues.date), "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd"),
      isRecurring: defaultValues?.isRecurring ?? false,
      notes: defaultValues?.notes ?? "",
    },
  });

  const type = watch("type");
  const isRecurring = watch("isRecurring");
  const categoryId = watch("categoryId");

  const filteredCategories = categories.filter(
    (c) => c.scope === type || c.scope === "both"
  );

  useEffect(() => {
    const current = categoryId;
    const isValid = filteredCategories.some((c) => c.id === current);
    if (!isValid) setValue("categoryId", "");
  }, [type, filteredCategories, categoryId, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Transaction Type</Label>
        <Tabs value={type} onValueChange={(v) => setValue("type", v as "income" | "expense")}>
          <TabsList className="w-full">
            <TabsTrigger value="expense" className="flex-1">Expense</TabsTrigger>
            <TabsTrigger value="income" className="flex-1">Income</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          placeholder="Coffee, Salary, Rent..."
          aria-invalid={!!errors.description}
          {...register("description")}
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            aria-invalid={!!errors.amount}
            {...register("amount", { valueAsNumber: true })}
          />
          {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            aria-invalid={!!errors.date}
            {...register("date")}
          />
          {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="category">Category</Label>
        <Select value={categoryId} onValueChange={(v) => setValue("categoryId", v)}>
          <SelectTrigger id="category" aria-invalid={!!errors.categoryId}>
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {filteredCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  {c.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId.message}</p>}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="isRecurring" className="cursor-pointer">Recurring</Label>
          <span className="text-xs text-muted-foreground">Mark as a recurring transaction</span>
        </div>
        <Switch
          id="isRecurring"
          checked={isRecurring}
          onCheckedChange={(v) => setValue("isRecurring", v)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          placeholder="Any additional details..."
          rows={2}
          aria-invalid={!!errors.notes}
          {...register("notes")}
        />
        {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
      </div>

      {attachments && <AttachmentManager manager={attachments} />}

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
          {defaultValues ? "Save changes" : "Add transaction"}
        </Button>
      </div>
    </form>
  );
}
