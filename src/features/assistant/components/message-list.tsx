import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Loader2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAssistant } from "../state/assistant-context";
import type { AssistantUIMessage } from "../types";
import { MessageItem } from "./message-item";

const STICK_THRESHOLD_PX = 48;
const EXAMPLES = ["Where did my money go this month?", "Spent 12.50 on lunch today", "Show my last 10 transactions"];

function hasVisibleContent(message: AssistantUIMessage): boolean {
  return message.parts.some((p) => (p.type === "text" && p.text.length > 0) || p.type.startsWith("tool-"));
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-10 text-center">
      <MessageSquareText className="size-6 text-muted-foreground/40" />
      <p className="font-mono text-[11px] tracking-wider uppercase text-muted-foreground/60">Ask about your money</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Answers use your workspace data. Messages are sent to Anthropic to generate replies.
      </p>
      <ul className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground/60">
        {EXAMPLES.map((example) => (
          <li key={example}>&ldquo;{example}&rdquo;</li>
        ))}
      </ul>
    </div>
  );
}

export function MessageList() {
  const { messages, busy, status, stoppedBeforeReply, conversationId } = useAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [pinnedConversationId, setPinnedConversationId] = useState(conversationId);
  if (pinnedConversationId !== conversationId) {
    setPinnedConversationId(conversationId);
    setPinned(true);
  }
  const last = messages.at(-1);
  const thinking =
    status === "submitted" ||
    (status === "streaming" && (last === undefined || last.role !== "assistant" || !hasVisibleContent(last)));

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el !== null && pinned) el.scrollTop = el.scrollHeight;
  }, [messages, pinned, thinking]);

  function handleScroll() {
    const el = scrollRef.current;
    if (el === null) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (el === null) return;
    el.scrollTop = el.scrollHeight;
    setPinned(true);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Conversation"
        aria-busy={busy}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((message) => (
            <MessageItem key={message.id} message={message} stoppedBeforeReply={stoppedBeforeReply.has(message.id)} />
          ))
        )}
        {thinking && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
            <span className="font-mono text-[10px] tracking-widest uppercase">Thinking</span>
          </div>
        )}
      </div>
      {!pinned && (
        <Button
          size="xs"
          variant="outline"
          className="absolute bottom-3 left-1/2 -translate-x-1/2"
          onClick={jumpToLatest}
        >
          <ArrowDown data-icon="inline-start" />
          Jump to latest
        </Button>
      )}
    </div>
  );
}
