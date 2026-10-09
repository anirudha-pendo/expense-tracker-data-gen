import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ASSISTANT_LIMITS } from "../contract/limits";
import { useAssistant } from "../state/assistant-context";

const IME_PROCESS_KEY = 229;

export function Composer() {
  const { send, stop, busy, ready, composerDisabled } = useAssistant();
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const sendDisabled = composerDisabled || busy || !ready || trimmed.length === 0;

  function submit() {
    if (sendDisabled) return;
    setText("");
    send(trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === IME_PROCESS_KEY) return;
    event.preventDefault();
    submit();
  }

  return (
    <form
      className="border-t border-border/40 px-5 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        aria-label="Message"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={ASSISTANT_LIMITS.maxUserChars}
        disabled={composerDisabled}
        rows={1}
        placeholder="Ask about your money…"
        className="max-h-36 min-h-10 resize-none overflow-y-auto text-sm"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground/50">
          enter to send · shift+enter for new line
        </span>
        <div className="flex items-center gap-2">
          {text.length >= ASSISTANT_LIMITS.userCharsCounterFrom && (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {text.length}/{ASSISTANT_LIMITS.maxUserChars}
            </span>
          )}
          {busy ? (
            <Button type="button" size="sm" variant="outline" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={sendDisabled}>
              Send
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
