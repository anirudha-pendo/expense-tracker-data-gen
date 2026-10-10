import { isTextUIPart } from "ai";
import { toolRowState } from "../lib/tool-labels";
import { useAssistant } from "../state/assistant-context";
import type { AssistantUIMessage } from "../types";
import { ToolRow } from "./tool-row";
import { TransactionCard } from "./transaction-card";

type AssistantPart = AssistantUIMessage["parts"][number];

function WriteCardSlot({ toolCallId, part }: { toolCallId: string; part: { type: string; state?: string } }) {
  const { proposals, resolving, confirm, cancel, money, composerRef } = useAssistant();
  const entry = proposals.get(toolCallId);
  if (entry === undefined) return null;
  return (
    <TransactionCard
      entry={entry}
      state={toolRowState(part)}
      resolving={resolving.has(toolCallId)}
      money={money}
      onConfirm={() => {
        confirm(toolCallId);
        composerRef.current?.focus();
      }}
      onCancel={() => {
        cancel(toolCallId);
        composerRef.current?.focus();
      }}
    />
  );
}

function AssistantPartView({ part }: { part: AssistantPart }) {
  if (part.type === "text") {
    return part.text.length > 0 ? <p className="whitespace-pre-wrap text-sm text-foreground">{part.text}</p> : null;
  }
  if (part.type.startsWith("tool-")) {
    return (
      <div className="flex flex-col gap-2">
        <ToolRow part={part} />
        {"toolCallId" in part && <WriteCardSlot toolCallId={part.toolCallId} part={part} />}
      </div>
    );
  }
  return null;
}

function StoppedHint() {
  return <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60">stopped</span>;
}

export function MessageItem({ message, stoppedBeforeReply }: { message: AssistantUIMessage; stoppedBeforeReply: boolean }) {
  if (message.role === "user") {
    const text = message.parts
      .filter(isTextUIPart)
      .map((p) => p.text)
      .join("\n");
    return (
      <>
        <div
          data-message-role="user"
          className="stagger-item ml-auto max-w-[85%] whitespace-pre-wrap border border-border/60 bg-muted/40 px-3 py-2 text-sm"
        >
          {text}
        </div>
        {stoppedBeforeReply && <StoppedHint />}
      </>
    );
  }
  return (
    <div data-message-role="assistant" className="stagger-item flex flex-col gap-2">
      {message.parts.map((part, index) => (
        <AssistantPartView key={`${message.id}-${index}`} part={part} />
      ))}
      {message.metadata?.stopped === true && <StoppedHint />}
    </div>
  );
}
