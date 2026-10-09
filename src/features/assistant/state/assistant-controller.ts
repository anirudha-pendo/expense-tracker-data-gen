import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import type { Category } from "@/types";
import { localIsoDate } from "@/lib/dates";
import { parseAssistantError } from "../contract/errors";
import { ASSISTANT_LIMITS } from "../contract/limits";
import type { CancelReason } from "../contract/types";
import { applyTransactionProposal, StaleWriteError } from "../executors/transactions";
import {
  buildRequestContext,
  canAutoSendAgain,
  jsonByteLength,
  retryStrategy,
  seenIdsFromTool,
  takeRecentMessages,
  trimOldestTurns,
} from "../lib/conversation";
import { currentTimeZone } from "../lib/intl";
import type { MoneyFormat } from "../lib/money";
import type { AssistantUIMessage } from "../types";
import { handleAssistantToolCall, type ProposalEntry, type ToolRunnerDeps } from "./tool-runner";

export type SessionLock = "not_configured" | "provider_quota_exhausted";

export interface ControllerSnapshot {
  chat: Chat<AssistantUIMessage>;
  sessionKey: string;
  lock: SessionLock | null;
  stepLimitHit: boolean;
  stoppedTurn: boolean;
  pendingCalls: number;
  categoriesLoaded: boolean;
  categoriesFailed: boolean;
  proposals: ReadonlyMap<string, ProposalEntry>;
  resolving: ReadonlySet<string>;
  stoppedBeforeReply: ReadonlySet<string>;
}

export interface SessionInput {
  workspaceId: string | null;
  money: MoneyFormat;
}

const SIGNED_OUT = "signed-out";

export class AssistantController {
  private snapshot: ControllerSnapshot;
  private readonly listeners = new Set<() => void>();
  private session: SessionInput;
  private categories: readonly Category[] = [];
  // Card ids already confirmed or cancelled; claimed synchronously so a double click cannot write twice.
  private readonly claimed = new Set<string>();
  private superseding = false;

  constructor(initial: SessionInput) {
    this.session = initial;
    this.snapshot = this.freshSnapshot(initial.workspaceId ?? SIGNED_OUT);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ControllerSnapshot => this.snapshot;

  private update(patch: Partial<ControllerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private freshSnapshot(sessionKey: string): ControllerSnapshot {
    return {
      chat: this.createChat(),
      sessionKey,
      lock: null,
      stepLimitHit: false,
      stoppedTurn: false,
      pendingCalls: 0,
      categoriesLoaded: false,
      categoriesFailed: false,
      proposals: new Map(),
      resolving: new Set(),
      stoppedBeforeReply: new Set(),
    };
  }

  syncSession(input: SessionInput): void {
    this.session = input;
    const key = input.workspaceId ?? SIGNED_OUT;
    if (key === this.snapshot.sessionKey) return;
    const previous = this.snapshot.chat;
    this.categories = [];
    this.claimed.clear();
    this.superseding = false;
    this.snapshot = this.freshSnapshot(key);
    for (const listener of this.listeners) listener();
    previous.stop().catch((error: unknown) => console.error("assistant: could not stop the previous chat", error));
  }

  setCategories(workspaceId: string, categories: readonly Category[]): void {
    if (workspaceId !== this.session.workspaceId) return;
    this.categories = categories;
    if (!this.snapshot.categoriesLoaded || this.snapshot.categoriesFailed) {
      this.update({ categoriesLoaded: true, categoriesFailed: false });
    }
  }

  // A failed refresh keeps the last good categories; only a first load that fails blocks the chat.
  markCategoriesFailed(workspaceId: string): void {
    if (workspaceId !== this.session.workspaceId || this.snapshot.categoriesLoaded) return;
    this.update({ categoriesFailed: true });
  }

  get money(): MoneyFormat {
    return this.session.money;
  }

  private shouldAutoSend(messages: AssistantUIMessage[]): boolean {
    if (this.superseding || this.snapshot.stoppedTurn) return false;
    if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) return false;
    const last = messages.at(-1);
    if (last !== undefined && !canAutoSendAgain(last.parts)) {
      this.update({ stepLimitHit: true });
      return false;
    }
    return true;
  }

  // Bound to one chat so a tool finishing after a workspace switch cannot touch the new chat's state.
  private toolDepsFor(chat: Chat<AssistantUIMessage>): ToolRunnerDeps {
    const adjust = (delta: number) => {
      if (this.snapshot.chat !== chat) return;
      this.update({ pendingCalls: Math.max(0, this.snapshot.pendingCalls + delta) });
    };
    const propose = (entry: ProposalEntry) => {
      if (this.snapshot.chat !== chat) return;
      this.update({ proposals: new Map(this.snapshot.proposals).set(entry.toolCallId, entry) });
    };
    return {
      session: () =>
        this.session.workspaceId === null
          ? null
          : { workspaceId: this.session.workspaceId, money: this.session.money, today: localIsoDate(new Date()) },
      beginCall: () => adjust(1),
      endCall: () => adjust(-1),
      seenTransactionIds: () => seenIdsFromTool(chat.messages, "findTransactions", "transactions"),
      propose,
    };
  }

  private reportError(error: Error): void {
    const code = parseAssistantError(error);
    if (code === "not_configured" || code === "provider_quota_exhausted") this.update({ lock: code });
  }

  private createChat(): Chat<AssistantUIMessage> {
    const chat: Chat<AssistantUIMessage> = new Chat<AssistantUIMessage>({
      transport: new DefaultChatTransport<AssistantUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages }) => {
          const context = buildRequestContext(
            { categories: this.categories, currency: this.session.money.currency, locale: this.session.money.locale },
            new Date(),
            currentTimeZone(),
          );
          const recent = trimOldestTurns(
            takeRecentMessages(messages, ASSISTANT_LIMITS.maxMessages),
            (kept) => jsonByteLength({ id, messages: kept, context }) <= ASSISTANT_LIMITS.maxBodyBytes,
          );
          return { body: { id, messages: recent, context } };
        },
      }),
      onError: (error) => this.reportError(error),
      onToolCall: ({ toolCall }) => handleAssistantToolCall(chat, toolCall, this.toolDepsFor(chat)),
      sendAutomaticallyWhen: ({ messages }) => this.shouldAutoSend(messages),
    });
    return chat;
  }

  private startTurn(): void {
    if (this.snapshot.stepLimitHit || this.snapshot.stoppedTurn) this.update({ stepLimitHit: false, stoppedTurn: false });
  }

  private isPending(toolCallId: string): boolean {
    const last = this.snapshot.chat.lastMessage;
    return (
      last !== undefined &&
      last.parts.some((p) => "toolCallId" in p && p.toolCallId === toolCallId && p.state === "input-available")
    );
  }

  private setResolving(chat: Chat<AssistantUIMessage>, toolCallId: string, on: boolean): void {
    if (this.snapshot.chat !== chat) return;
    const next = new Set(this.snapshot.resolving);
    if (on) next.add(toolCallId);
    else next.delete(toolCallId);
    this.update({ resolving: next });
  }

  async confirm(toolCallId: string): Promise<void> {
    const entry = this.snapshot.proposals.get(toolCallId);
    const workspaceId = this.session.workspaceId;
    if (entry === undefined || workspaceId === null || this.claimed.has(toolCallId) || !this.isPending(toolCallId)) return;
    this.claimed.add(toolCallId);
    const chat = this.snapshot.chat;
    this.setResolving(chat, toolCallId, true);
    try {
      const id = await applyTransactionProposal(workspaceId, entry.proposal);
      await chat.addToolOutput({ tool: entry.tool, toolCallId, output: { status: "confirmed", id } });
    } catch (error) {
      if (!(error instanceof StaleWriteError)) console.error("assistant: write failed", error);
      const errorText = error instanceof StaleWriteError ? error.message : "The change could not be saved.";
      await chat.addToolOutput({ tool: entry.tool, toolCallId, state: "output-error", errorText });
    } finally {
      this.setResolving(chat, toolCallId, false);
    }
  }

  async cancel(toolCallId: string, reason: CancelReason = "user"): Promise<void> {
    const entry = this.snapshot.proposals.get(toolCallId);
    if (entry === undefined || this.claimed.has(toolCallId) || !this.isPending(toolCallId)) return;
    this.claimed.add(toolCallId);
    await this.snapshot.chat.addToolOutput({ tool: entry.tool, toolCallId, output: { status: "cancelled", reason } });
  }

  // Resolves open cards without letting each resolution trigger its own follow-up request.
  private async supersedePending(): Promise<void> {
    const pending = [...this.snapshot.proposals.keys()].filter((id) => this.isPending(id));
    if (pending.length === 0) return;
    this.superseding = true;
    try {
      for (const id of pending) await this.cancel(id, "superseded");
    } finally {
      this.superseding = false;
    }
  }

  async send(text: string): Promise<void> {
    this.startTurn();
    await this.supersedePending();
    await this.snapshot.chat.sendMessage({ text });
  }

  async stop(): Promise<void> {
    const chat = this.snapshot.chat;
    const streaming = chat.status === "submitted" || chat.status === "streaming";
    this.update({ stoppedTurn: true });
    await chat.stop();
    const last = chat.lastMessage;
    if (streaming && last !== undefined && last.role === "user" && chat === this.snapshot.chat) {
      this.update({ stoppedBeforeReply: new Set(this.snapshot.stoppedBeforeReply).add(last.id) });
    }
    if (streaming && last !== undefined && last.role === "assistant") {
      chat.messages = chat.messages.map((m) => (m.id === last.id ? { ...m, metadata: { ...m.metadata, stopped: true } } : m));
    }
  }

  async retry(): Promise<void> {
    this.startTurn();
    const chat = this.snapshot.chat;
    const last = chat.lastMessage;
    if (last !== undefined && this.snapshot.stoppedBeforeReply.has(last.id)) {
      const next = new Set(this.snapshot.stoppedBeforeReply);
      next.delete(last.id);
      this.update({ stoppedBeforeReply: next });
    }
    if (retryStrategy(chat.messages) === "continue") await chat.sendMessage();
    else await chat.regenerate();
  }
}
