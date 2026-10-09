import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useAuthContext } from "@/features/auth/hooks/auth-context";
import { getCategoriesByWorkspaceId } from "@/lib/db/repositories/categories.repo";
import { useDataChanged } from "@/shared/lib/data-events";
import { ASSISTANT_ERRORS, errorCopy, parseAssistantError, type AssistantErrorCode } from "../contract/errors";
import { canAutoSendAgain } from "../lib/conversation";
import type { MoneyFormat } from "../lib/money";
import { AssistantContext, type AssistantAlert, type AssistantContextValue } from "./assistant-context";
import { AssistantController } from "./assistant-controller";

const FALLBACK_MONEY: MoneyFormat = { currency: "USD", locale: "en-US" };

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function report(task: Promise<void>, what: string): void {
  task.catch((error: unknown) => console.error(`assistant: ${what} failed`, error));
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { workspace } = useAuthContext();
  const workspaceId = workspace?.id ?? null;
  const money = useMemo<MoneyFormat>(
    () => (workspace ? { currency: workspace.currency, locale: workspace.locale } : FALLBACK_MONEY),
    [workspace],
  );
  const [controller] = useState(() => new AssistantController({ workspaceId, money }));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    controller.syncSession({ workspaceId, money });
  }, [controller, workspaceId, money]);

  const loadCategories = useCallback(() => {
    if (workspaceId === null) return;
    getCategoriesByWorkspaceId(workspaceId).then(
      (categories) => controller.setCategories(workspaceId, categories),
      (error: unknown) => {
        console.error("assistant: could not load categories", error);
        controller.markCategoriesFailed(workspaceId);
      },
    );
  }, [controller, workspaceId]);
  useEffect(loadCategories, [loadCategories]);
  useDataChanged(loadCategories);

  const { messages, status, error } = useChat({ chat: snapshot.chat });

  const value = useMemo<AssistantContextValue>(() => {
    const last = messages.at(-1);
    const autoSendDue =
      status === "ready" &&
      !snapshot.stepLimitHit &&
      !snapshot.stoppedTurn &&
      last !== undefined &&
      lastAssistantMessageIsCompleteWithToolCalls({ messages }) &&
      canAutoSendAgain(last.parts);
    const busy = status === "submitted" || status === "streaming" || snapshot.pendingCalls > 0 || autoSendDue;

    let code: AssistantErrorCode | null;
    if (!online) code = "offline";
    else if (snapshot.lock !== null) code = snapshot.lock;
    else if (snapshot.categoriesFailed) code = "internal";
    else if (snapshot.stepLimitHit) code = "step_limit";
    else code = error === undefined ? null : parseAssistantError(error);
    const spec = code === null ? null : ASSISTANT_ERRORS[code];
    const alert: AssistantAlert | null =
      code === null || spec === null || spec.alert === null
        ? null
        : { code, message: errorCopy(code), variant: spec.alert, retryable: spec.retryable && online };

    return {
      open,
      setOpen,
      messages,
      status,
      busy,
      ready: snapshot.categoriesLoaded,
      alert,
      composerDisabled: !online || snapshot.lock !== null,
      send: (text: string) => report(controller.send(text), "send"),
      stop: () => report(controller.stop(), "stop"),
      // A failed category load is retried by loading again, not by re-sending the chat.
      retry: () => (snapshot.categoriesFailed ? loadCategories() : report(controller.retry(), "retry")),
      money: controller.money,
      proposals: snapshot.proposals,
      resolving: snapshot.resolving,
      confirm: (toolCallId: string) => report(controller.confirm(toolCallId), "confirm"),
      cancel: (toolCallId: string) => report(controller.cancel(toolCallId), "cancel"),
      stoppedBeforeReply: snapshot.stoppedBeforeReply,
    };
  }, [controller, error, loadCategories, messages, online, open, snapshot, status]);

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
