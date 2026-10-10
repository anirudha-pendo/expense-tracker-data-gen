import type { Chat } from "@ai-sdk/react";
import type { ChatOnToolCallCallback } from "ai";
import {
  prepareAdd,
  prepareDelete,
  prepareUpdate,
  runFindTransactions,
  runGetSpendingSummary,
  type ToolSession,
} from "../executors/transactions";
import type { WriteToolName } from "../lib/tool-labels";
import type { TransactionProposal } from "../lib/transaction-proposals";
import type { AssistantUIMessage } from "../types";

export type AssistantToolCall = Parameters<ChatOnToolCallCallback<AssistantUIMessage>>[0]["toolCall"];

export interface ProposalEntry {
  toolCallId: string;
  tool: WriteToolName;
  proposal: TransactionProposal;
}

export interface ToolRunnerDeps {
  session: () => ToolSession | null;
  beginCall: () => void;
  endCall: () => void;
  seenTransactionIds: () => ReadonlySet<string>;
  propose: (entry: ProposalEntry) => void;
}

// A deferred write of the tool result: awaiting addToolOutput inside onToolCall can deadlock the chat.
type Recorder = () => void | PromiseLike<void>;

const READ_FAILED = "The app could not read your data.";

async function produce(
  chat: Chat<AssistantUIMessage>,
  call: AssistantToolCall,
  session: ToolSession,
  deps: ToolRunnerDeps,
): Promise<Recorder | null> {
  if (call.dynamic === true) return null;
  const toolCallId = call.toolCallId;
  switch (call.toolName) {
    case "getSpendingSummary": {
      const result = await runGetSpendingSummary(session, call.input);
      return result.ok
        ? () => chat.addToolOutput({ tool: "getSpendingSummary", toolCallId, output: result.value })
        : () => chat.addToolOutput({ tool: "getSpendingSummary", toolCallId, state: "output-error", errorText: result.error });
    }
    case "findTransactions": {
      const result = await runFindTransactions(session, call.input);
      return result.ok
        ? () => chat.addToolOutput({ tool: "findTransactions", toolCallId, output: result.value })
        : () => chat.addToolOutput({ tool: "findTransactions", toolCallId, state: "output-error", errorText: result.error });
    }
    case "addTransaction": {
      const result = await prepareAdd(session, call.input);
      if (!result.ok) {
        return () => chat.addToolOutput({ tool: "addTransaction", toolCallId, state: "output-error", errorText: result.error });
      }
      deps.propose({ toolCallId, tool: "addTransaction", proposal: result.value });
      return null;
    }
    case "updateTransaction": {
      const result = await prepareUpdate(session, call.input, deps.seenTransactionIds());
      if (!result.ok) {
        return () =>
          chat.addToolOutput({ tool: "updateTransaction", toolCallId, state: "output-error", errorText: result.error });
      }
      deps.propose({ toolCallId, tool: "updateTransaction", proposal: result.value });
      return null;
    }
    case "deleteTransaction": {
      const result = await prepareDelete(session, call.input, deps.seenTransactionIds());
      if (!result.ok) {
        return () =>
          chat.addToolOutput({ tool: "deleteTransaction", toolCallId, state: "output-error", errorText: result.error });
      }
      deps.propose({ toolCallId, tool: "deleteTransaction", proposal: result.value });
      return null;
    }
    default: {
      const exhaustive: never = call;
      return exhaustive;
    }
  }
}

export async function handleAssistantToolCall(
  chat: Chat<AssistantUIMessage>,
  call: AssistantToolCall,
  deps: ToolRunnerDeps,
): Promise<void> {
  if (call.dynamic === true) return;
  const session = deps.session();
  if (session === null) return;
  deps.beginCall();
  let record: Recorder | null;
  try {
    record = await produce(chat, call, session, deps);
  } catch (error) {
    console.error("assistant: tool failed", call.toolName, error);
    record = () =>
      chat.addToolOutput({ tool: call.toolName, toolCallId: call.toolCallId, state: "output-error", errorText: READ_FAILED });
  }
  if (record === null) {
    deps.endCall();
    return;
  }
  Promise.resolve()
    .then(record)
    .catch((error: unknown) => console.error("assistant: could not record a tool result", error))
    .finally(() => deps.endCall());
}
