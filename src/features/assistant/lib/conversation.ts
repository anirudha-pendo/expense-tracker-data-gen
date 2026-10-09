import type { CategoryScope } from "../../../types/index.js";
import { localIsoDate } from "../../../lib/dates.js";
import { ASSISTANT_LIMITS } from "../contract/limits.js";
import type { AssistantContext } from "../contract/types.js";

export interface PartLike {
  type: string;
  state?: string;
  output?: unknown;
  toolCallId?: string;
}

export interface MessageLike {
  role: string;
  parts: readonly PartLike[];
}

export function takeRecentMessages<M extends { role: string }>(messages: readonly M[], max: number): M[] {
  if (max <= 0) return [];
  const recent = messages.slice(-max);
  const firstUser = recent.findIndex((message) => message.role === "user");
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

// Drops the oldest whole turns until `fits` holds; a turn's tool calls and results stay together, the latest turn always stays.
export function trimOldestTurns<M extends { role: string }>(messages: readonly M[], fits: (kept: M[]) => boolean): M[] {
  let kept = [...messages];
  while (!fits(kept)) {
    const nextTurn = kept.findIndex((message, index) => index > 0 && message.role === "user");
    if (nextTurn === -1) break;
    kept = kept.slice(nextTurn);
  }
  return kept;
}

export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function countStepStarts(parts: readonly PartLike[]): number {
  return parts.filter((part) => part.type === "step-start").length;
}

// The first step answers the user; every later step is one automatic round.
export function canAutoSendAgain(parts: readonly PartLike[]): boolean {
  return countStepStarts(parts) - 1 < ASSISTANT_LIMITS.maxAutoRounds;
}

export function seenIdsFromTool(messages: readonly MessageLike[], toolName: string, listKey: string): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== `tool-${toolName}` || part.state !== "output-available") continue;
      const output = part.output;
      if (typeof output !== "object" || output === null || !(listKey in output)) continue;
      const list: unknown = Reflect.get(output, listKey);
      if (!Array.isArray(list)) continue;
      for (const row of list) {
        if (typeof row === "object" && row !== null && "id" in row && typeof row.id === "string") ids.add(row.id);
      }
    }
  }
  return ids;
}

export function retryStrategy(messages: readonly MessageLike[]): "regenerate" | "continue" {
  const last = messages.at(-1);
  if (last === undefined || last.role !== "assistant") return "regenerate";
  const hasToolResult = last.parts.some(
    (part) => part.type.startsWith("tool-") && (part.state === "output-available" || part.state === "output-error"),
  );
  return hasToolResult ? "continue" : "regenerate";
}

export function buildRequestContext(
  args: { categories: ReadonlyArray<{ name: string; scope: CategoryScope }>; currency: string; locale: string },
  now: Date,
  timeZone: string,
): AssistantContext {
  return {
    today: localIsoDate(now),
    timeZone,
    currency: args.currency,
    locale: args.locale,
    categories: args.categories
      .slice(0, ASSISTANT_LIMITS.maxContextCategories)
      .map((c) => ({ name: c.name, scope: c.scope })),
  };
}
