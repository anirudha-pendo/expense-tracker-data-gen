import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Category } from "@/types";

export const ALL_CATEGORIES_VALUE = "_all";

export interface TransactionFilters {
  search: string;
  type: "all" | "income" | "expense";
  categoryId: string;
  month: string;
}

interface TransactionFiltersBarProps {
  filters: TransactionFilters;
  categories: Category[];
  onChange: (filters: TransactionFilters) => void;
}

export function TransactionFiltersBar({ filters, categories, onChange }: TransactionFiltersBarProps) {
  const hasActiveFilters =
    filters.search !== "" ||
    filters.type !== "all" ||
    filters.categoryId !== "" ||
    filters.month !== "";

  function reset() {
    onChange({ search: "", type: "all", categoryId: "", month: "" });
  }

  const categorySelectValue = filters.categoryId === "" ? ALL_CATEGORIES_VALUE : filters.categoryId;

  function handleCategoryChange(v: string) {
    onChange({ ...filters, categoryId: v === ALL_CATEGORIES_VALUE ? "" : v });
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search transactions..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-9"
        />
      </div>

      <Select
        value={filters.type}
        onValueChange={(v) => onChange({ ...filters, type: v as TransactionFilters["type"] })}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="income">Income</SelectItem>
          <SelectItem value="expense">Expense</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={categorySelectValue}
        onValueChange={handleCategoryChange}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_CATEGORIES_VALUE}>All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                {c.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="month"
        value={filters.month}
        onChange={(e) => onChange({ ...filters, month: e.target.value })}
        className="w-[160px]"
      />

      {hasActiveFilters && (
        <Button variant="ghost" size="icon" onClick={reset} aria-label="Clear filters">
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
