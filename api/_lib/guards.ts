import { ASSISTANT_LIMITS } from "../../src/features/assistant/contract/limits.js";
import { isToolName } from "../../src/features/assistant/contract/tool-names.js";

export function resolveApiKey(raw: string | undefined): string | null {
  return raw === undefined || raw.trim() === "" ? null : raw;
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function userTextTooLong(messages: ReadonlyArray<{ role: string; parts: readonly unknown[] }>): boolean {
  return messages.some(
    (m) =>
      m.role === "user" &&
      m.parts.some(
        (p) =>
          typeof p === "object" &&
          p !== null &&
          "type" in p &&
          p.type === "text" &&
          "text" in p &&
          typeof p.text === "string" &&
          p.text.length > ASSISTANT_LIMITS.maxUserChars,
      ),
  );
}

const FINISHED_TOOL_STATES: readonly unknown[] = ["output-available", "output-error", "output-denied"];

function isUnfinishedUnknownToolPart(part: unknown): boolean {
  if (typeof part !== "object" || part === null || !("type" in part) || typeof part.type !== "string") return false;
  if (!part.type.startsWith("tool-") || isToolName(part.type.slice("tool-".length))) return false;
  return !("state" in part) || !FINISHED_TOOL_STATES.includes(part.state);
}

// A stopped call to an undeclared tool fails UI validation; drop it as ignoreIncompleteToolCalls would.
export function dropUnfinishedUnknownToolParts<M extends { parts: unknown[] }>(messages: readonly M[]): M[] {
  return messages.map((m) => ({ ...m, parts: m.parts.filter((p) => !isUnfinishedUnknownToolPart(p)) }));
}
