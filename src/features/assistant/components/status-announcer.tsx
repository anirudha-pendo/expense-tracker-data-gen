import { announcementFor } from "../lib/tool-labels";
import { useAssistant } from "../state/assistant-context";

export function StatusAnnouncer() {
  const { messages } = useAssistant();
  const last = messages.at(-1);
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {announcementFor(last?.role === "assistant" ? last : undefined, [])}
    </div>
  );
}
