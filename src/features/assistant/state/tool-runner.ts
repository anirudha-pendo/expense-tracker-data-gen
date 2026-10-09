import type { Chat } from "@ai-sdk/react";
import type { ChatOnToolCallCallback } from "ai";
import { runFindTransactions, runGetSpendingSummary, type ToolSession } from "../executors/transactions";
import type { AssistantUIMessage } from "../types";

export type AssistantToolCall = Parameters<ChatOnToolCallCallback<AssistantUIMessage>>[0]["toolCall"];

export interface ToolRunnerDeps {
  session: () => ToolSession | null;
  beginCall: () => void;
  endCall: () => void;
}

// A deferred write of the tool result: awaiting addToolOutput inside onToolCall can deadlock the chat.
type Recorder = () => void | PromiseLike<void>;

const READ_FAILED = "The app could not read your data.";

async function produce(chat: Chat<AssistantUIMessage>, call: AssistantToolCall, session: ToolSession): Promise<Recorder | null> {
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
    default:
      return null;
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
    record = await produce(chat, call, session);
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
