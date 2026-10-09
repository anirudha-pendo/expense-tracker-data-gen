import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAssistant } from "../state/assistant-context";

export function AssistantAlertBar() {
  const { alert, retry, busy } = useAssistant();
  if (alert === null) return null;
  return (
    <div className="px-5 pt-3">
      <Alert variant={alert.variant}>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{alert.message}</span>
          {alert.retryable && (
            <Button size="xs" variant="outline" onClick={retry} disabled={busy}>
              Retry
            </Button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
