import { CalendarDays, CornerDownLeft, Loader2, Sparkles, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/features/auth/hooks/auth-context";
import { useQuickAdd } from "../hooks/use-quick-add";

interface QuickAddPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickAddPalette({ open, onOpenChange }: QuickAddPaletteProps) {
  const { workspace } = useAuthContext();
  const quickAdd = useQuickAdd(workspace!.id, open);

  const currency = workspace?.currency ?? "USD";
  const locale = workspace?.locale ?? "en-US";

  const { parsed, effectiveCategory } = quickAdd;
  const hasInput = quickAdd.input.trim().length > 0;

  // Categories compatible with the parsed type, for the override chips.
  const chipCategories = quickAdd.categories.filter(
    (c) => c.scope === parsed.type || c.scope === "both"
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && quickAdd.canSave) {
      e.preventDefault();
      quickAdd.save();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg top-1/3 translate-y-0 p-0 gap-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Quick Add</DialogTitle>
          <DialogDescription>
            Type a transaction in plain language, e.g. coffee 4.50 yesterday
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-border/40 px-4 py-3 flex items-center gap-2">
          <Zap className="size-3.5 text-muted-foreground shrink-0" />
          <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
            Quick Add
          </span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/40">
            esc to close
          </span>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <Input
            autoFocus
            value={quickAdd.input}
            onChange={(e) => quickAdd.setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Try "coffee 4.50 yesterday" or "salary 3000 income june 1"'
            className="font-mono text-sm"
            aria-label="Quick add transaction"
          />

          {hasInput && (
            <>
              {/* Live parse preview */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "font-mono text-[11px] px-1.5 py-0.5 border tabular-nums",
                    parsed.amount !== null
                      ? "border-foreground/20 text-foreground"
                      : "border-destructive/40 text-destructive"
                  )}
                >
                  {parsed.amount !== null
                    ? formatCurrency(parsed.amount, currency, locale)
                    : "amount?"}
                </span>

                <span
                  className={cn(
                    "font-mono text-[10px] tracking-wider uppercase px-1.5 py-0.5 border",
                    parsed.type === "income"
                      ? "border-emerald-700/30 text-emerald-700 bg-emerald-50"
                      : "border-red-600/30 text-red-600 bg-red-50"
                  )}
                >
                  {parsed.type}
                </span>

                <span className="font-mono text-[11px] px-1.5 py-0.5 border border-border text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="size-3" />
                  {formatDate(parsed.date, locale)}
                </span>

                {effectiveCategory && (
                  <span className="font-mono text-[11px] px-1.5 py-0.5 border border-border text-muted-foreground flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: effectiveCategory.color }}
                    />
                    {effectiveCategory.name}
                    {!quickAdd.overrideCategory && parsed.categoryGuessed && (
                      <span className="flex items-center gap-0.5 text-muted-foreground/50">
                        <Sparkles className="size-2.5" /> guess
                      </span>
                    )}
                  </span>
                )}

                {parsed.description && (
                  <span className="text-sm text-foreground/80 truncate max-w-[180px]">
                    &ldquo;{parsed.description}&rdquo;
                  </span>
                )}
              </div>

              {/* Category override chips */}
              {chipCategories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {chipCategories.map((c) => {
                    const isSelected = effectiveCategory?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          quickAdd.setOverrideCategory(
                            quickAdd.overrideCategory?.id === c.id ? null : c
                          )
                        }
                        className={cn(
                          "font-mono text-[10px] tracking-wider px-1.5 py-0.5 border transition-colors flex items-center gap-1 btn-press",
                          isSelected
                            ? "border-foreground/40 bg-muted/60 text-foreground"
                            : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        )}
                      >
                        <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border/40 pt-3">
                <span className="font-mono text-[10px] text-muted-foreground/50 tracking-wider">
                  {quickAdd.canSave ? (
                    <span className="flex items-center gap-1">
                      <CornerDownLeft className="size-3" /> enter to save · stays open for rapid entry
                    </span>
                  ) : (
                    "include an amount to save"
                  )}
                </span>
                {quickAdd.isSaving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
              </div>
            </>
          )}

          {!hasInput && (
            <p className="font-mono text-[10px] text-muted-foreground/50 tracking-wider leading-relaxed">
              Amount, date (&ldquo;yesterday&rdquo;, &ldquo;friday&rdquo;, &ldquo;june 1&rdquo;) and
              type are parsed automatically. The category is inferred from your history.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
