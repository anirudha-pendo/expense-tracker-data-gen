import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { createCategory, deleteCategory, updateCategory } from "@/lib/db/repositories/categories.repo";
import { useAuthContext } from "@/features/auth/hooks/auth-context";
import { useCategories } from "../hooks/use-settings";
import type { Category, CategoryScope } from "@/types";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Enter a valid hex color"),
  scope: z.enum(["income", "expense", "both"]),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#84cc16",
];

interface CategoryFormDialogProps {
  open: boolean;
  defaultValues?: Partial<Category>;
  onSubmit: (values: CategoryFormValues) => Promise<void>;
  onCancel: () => void;
}

function CategoryFormDialog({ open, defaultValues, onSubmit, onCancel }: CategoryFormDialogProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      color: defaultValues?.color ?? PRESET_COLORS[0],
      scope: (defaultValues?.scope as CategoryScope | undefined) ?? "expense",
    },
  });

  const selectedColor = watch("color");
  const scope = watch("scope");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{defaultValues?.name ? "Edit Category" : "New Category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" placeholder="e.g. Groceries" aria-invalid={!!errors.name} {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Applies to</Label>
            <Select value={scope} onValueChange={(v) => setValue("scope", v as CategoryScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-color">Color</Label>
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
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="cat-color"
                value={selectedColor}
                onChange={(e) => setValue("color", e.target.value)}
                className="size-8 cursor-pointer rounded border"
              />
              <Input
                value={selectedColor}
                onChange={(e) => setValue("color", e.target.value)}
                placeholder="#000000"
                className="font-mono text-sm"
                aria-invalid={!!errors.color}
              />
            </div>
            {errors.color && <p className="text-sm text-destructive">{errors.color.message}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
              {defaultValues?.name ? "Save" : "Add category"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryManager() {
  const { workspace } = useAuthContext();
  const { categories, isLoading, reload } = useCategories(workspace!.id);
  const [showForm, setShowForm] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [deletingCat, setDeletingCat] = useState<Category | null>(null);

  async function handleAdd(values: CategoryFormValues) {
    try {
      const cat: Category = {
        id: crypto.randomUUID(),
        workspaceId: workspace!.id,
        ...values,
        isDefault: false,
      };
      await createCategory(cat);
      await reload();
      setShowForm(false);
      toast.success("Category added");
    } catch {
      toast.error("Failed to add category");
    }
  }

  async function handleEdit(values: CategoryFormValues) {
    if (!editingCat) return;
    try {
      await updateCategory({ ...editingCat, ...values });
      await reload();
      setEditingCat(null);
      toast.success("Category updated");
    } catch {
      toast.error("Failed to update category");
    }
  }

  async function handleDelete() {
    if (!deletingCat) return;
    try {
      await deleteCategory(deletingCat.id);
      await reload();
      setDeletingCat(null);
      toast.success("Category deleted");
    } catch {
      toast.error("Failed to delete category");
    }
  }

  const expense = categories.filter((c) => c.scope === "expense" || c.scope === "both");
  const income = categories.filter((c) => c.scope === "income" || c.scope === "both");

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  function CategoryList({ items }: { items: Category[] }) {
    return (
      <div className="flex flex-col">
        {items.map((cat, idx) => (
          <div key={cat.id}>
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="text-sm">{cat.name}</span>
                {cat.isDefault && (
                  <Badge variant="secondary" className="text-xs">Default</Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditingCat(cat)}>
                  <Pencil className="size-3.5" />
                  <span className="sr-only">Edit</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => setDeletingCat(cat)}
                  disabled={cat.isDefault}
                >
                  <Trash2 className="size-3.5" />
                  <span className="sr-only">Delete</span>
                </Button>
              </div>
            </div>
            {idx < items.length - 1 && <Separator />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus data-icon="inline-start" />
          Add Category
        </Button>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Expense Categories</h4>
          <div className="rounded-lg border px-4">
            <CategoryList items={expense} />
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Income Categories</h4>
          <div className="rounded-lg border px-4">
            <CategoryList items={income} />
          </div>
        </div>
      </div>

      <CategoryFormDialog
        open={showForm}
        onSubmit={handleAdd}
        onCancel={() => setShowForm(false)}
      />
      <CategoryFormDialog
        open={!!editingCat}
        defaultValues={editingCat ?? undefined}
        onSubmit={handleEdit}
        onCancel={() => setEditingCat(null)}
      />

      <AlertDialog open={!!deletingCat} onOpenChange={(o) => !o && setDeletingCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>&ldquo;{deletingCat?.name}&rdquo;</strong> will be deleted. Transactions using this category will
              remain but show as uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
