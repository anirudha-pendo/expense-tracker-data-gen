import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { contributionSchema, type ContributionFormValues } from "../schemas/goal.schema";
import type { Goal } from "@/types";

interface ContributionFormDialogProps {
  goal: Goal | null;
  onSubmit: (values: ContributionFormValues) => Promise<void>;
  onCancel: () => void;
}

export function ContributionFormDialog({ goal, onSubmit, onCancel }: ContributionFormDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContributionFormValues>({
    resolver: zodResolver(contributionSchema),
    defaultValues: {
      amount: undefined,
      date: format(new Date(), "yyyy-MM-dd"),
      note: "",
    },
  });

  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to &ldquo;{goal?.name}&rdquo;</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contribution-amount">Amount</Label>
              <Input
                id="contribution-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                aria-invalid={!!errors.amount}
                autoFocus
                {...register("amount", { valueAsNumber: true })}
              />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contribution-date">Date</Label>
              <Input
                id="contribution-date"
                type="date"
                aria-invalid={!!errors.date}
                {...register("date")}
              />
              {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contribution-note">Note (optional)</Label>
            <Input id="contribution-note" placeholder="e.g. Bonus money" {...register("note")} />
            {errors.note && <p className="text-sm text-destructive">{errors.note.message}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
              Add contribution
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
