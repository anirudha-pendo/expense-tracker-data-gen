import { announcementFor, WRITE_CARD_TITLES } from "../lib/tool-labels";
import { useAssistant } from "../state/assistant-context";

export function StatusAnnouncer() {
  const { messages, proposals, newChatStarted } = useAssistant();
  const last = messages.at(-1);
  const pendingIds = new Set(
    last?.role === "assistant"
      ? last.parts.flatMap((p) => ("toolCallId" in p && p.state === "input-available" ? [p.toolCallId] : []))
      : [],
  );
  const pendingTitles = [...proposals.values()]
    .filter((entry) => pendingIds.has(entry.toolCallId))
    .map((entry) => WRITE_CARD_TITLES[entry.tool]);
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {messages.length === 0 && newChatStarted
        ? "New chat started"
        : announcementFor(last?.role === "assistant" ? last : undefined, pendingTitles)}
    </div>
  );
}
