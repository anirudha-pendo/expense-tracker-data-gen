import type { ComponentProps } from "react";
import { MessageSquareText } from "lucide-react";

export function AssistantTrigger(props: ComponentProps<"button">) {
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

  return (
    <button
      type="button"
      {...props}
      className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-150 ease-out flex items-center gap-1.5 border border-border/60 px-2 py-1 hover:bg-muted/40 btn-press"
      aria-label="Open assistant"
    >
      <MessageSquareText className="size-3" />
      <span className="hidden sm:inline">Assistant</span>
      <kbd className="text-muted-foreground/50">{isMac ? "⌘J" : "Ctrl J"}</kbd>
    </button>
  );
}
