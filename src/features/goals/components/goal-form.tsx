import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { goalSchema, type GoalFormValues } from "../schemas/goal.schema";
import type { Goal } from "@/types";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#84cc16",
];

interface GoalFormDialogProps {
  open: boolean;
  defaultValues?: Goal;
  onSubmit: (values: GoalFormValues) => Promise<void>;
  onCancel: () => void;
}

export function GoalFormDialog({ open, defaultValues, onSubmit, onCancel }: GoalFormDialogProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      targetAmount: defaultValues?.targetAmount,
      deadline: defaultValues?.deadline
        ? format(new Date(defaultValues.deadline), "yyyy-MM-dd")
        : "",
      color: defaultValues?.color ?? PRESET_COLORS[5],
    },
  });

  const selectedColor = watch("color");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{defaultValues ? "Edit Goal" : "New Goal"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-name">Name</Label>
            <Input
              id="goal-name"
              placeholder="e.g. Vacation fund"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal-target">Target amount</Label>
              <Input
                id="goal-target"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="2000.00"
                aria-invalid={!!errors.targetAmount}
                {...register("targetAmount", { valueAsNumber: true })}
              />
              {errors.targetAmount && (
                <p className="text-sm text-destructive">{errors.targetAmount.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal-deadline">Deadline (optional)</Label>
              <Input id="goal-deadline" type="date" {...register("deadline")} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue("color", c)}
                  className="size-7 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: selectedColor === c ? "currentColor" : "transparent",
                  }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            {errors.color && <p className="text-sm text-destructive">{errors.color.message}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
              {defaultValues ? "Save changes" : "Create goal"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
