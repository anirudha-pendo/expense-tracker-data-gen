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

// UI message validation checks known tools' inputs but lets unknown tool parts through.
export function hasUnknownToolPart(messages: ReadonlyArray<{ parts: readonly unknown[] }>): boolean {
  return messages.some((m) =>
    m.parts.some((p) => {
      if (typeof p !== "object" || p === null || !("type" in p) || typeof p.type !== "string") return false;
      if (p.type === "dynamic-tool") return true;
      return p.type.startsWith("tool-") && !isToolName(p.type.slice("tool-".length));
    }),
  );
}
