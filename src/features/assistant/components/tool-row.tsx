import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toolNameFromPartType, toolRowLabel, toolRowState, type ToolRowState } from "../lib/tool-labels";

const DOT: Record<Exclude<ToolRowState, "running">, string> = {
  done: "bg-foreground/40",
  cancelled: "bg-muted-foreground/40",
  error: "bg-destructive",
};

export function ToolRow({ part }: { part: { type: string; state?: string; output?: unknown } }) {
  const tool = toolNameFromPartType(part.type);
  if (tool === null) return null;
  const state = toolRowState(part);
  const label = toolRowLabel(tool, state, part.output);
  return (
    <p
      data-tool={tool}
      data-state={state}
      className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground"
    >
      {state === "running" ? (
        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
      ) : (
        <span aria-hidden className={cn("size-1.5 shrink-0", DOT[state])} />
      )}
      {label}
    </p>
  );
}
