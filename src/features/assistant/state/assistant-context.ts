import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { ChatStatus } from "ai";
import type { AlertVariant, AssistantErrorCode } from "../contract/errors";
import type { MoneyFormat } from "../lib/money";
import type { AssistantUIMessage } from "../types";

export interface AssistantAlert {
  code: AssistantErrorCode;
  message: string;
  variant: AlertVariant;
  retryable: boolean;
}

export interface AssistantContextValue {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  messages: AssistantUIMessage[];
  status: ChatStatus;
  busy: boolean;
  ready: boolean;
  alert: AssistantAlert | null;
  composerDisabled: boolean;
  send: (text: string) => void;
  stop: () => void;
  retry: () => void;
  money: MoneyFormat;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (value === null) throw new Error("useAssistant must be used within AssistantProvider");
  return value;
}
