import { Zap } from "lucide-react";

export function QuickAddTrigger({ onClick }: { onClick: () => void }) {
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-150 ease-out flex items-center gap-1.5 border border-border/60 px-2 py-1 hover:bg-muted/40 btn-press"
      aria-label="Open quick add"
    >
      <Zap className="size-3" />
      <span className="hidden sm:inline">Quick Add</span>
      <kbd className="text-muted-foreground/50">{isMac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}
