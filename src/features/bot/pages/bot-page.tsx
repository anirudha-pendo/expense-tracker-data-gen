import { useState, useRef, useCallback } from "react";
import { runBot, type BotProgress, type BotConfig } from "../lib/bot-runner";
import { AbortError } from "../lib/dom-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, Play, Square } from "lucide-react";

type RunState = "idle" | "running" | "done" | "stopped";

export function BotPage() {
  const [totalActions, setTotalActions] = useState(40);
  const [logs, setLogs] = useState<BotProgress[]>([]);
  const [runState, setRunState] = useState<RunState>("idle");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  const appendLog = useCallback((p: BotProgress) => {
    setLogs((prev) => [...prev, p]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  async function handleRun() {
    if (!iframeRef.current) return;
    abortRef.current = false;
    setLogs([]);
    setRunState("running");

    const config: BotConfig = { totalActions };

    try {
      await runBot(iframeRef.current, config, appendLog, abortRef);
      setRunState("done");
    } catch (err) {
      if (err instanceof AbortError) {
        appendLog({ type: "info", message: "Bot stopped by user." });
        setRunState("stopped");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        appendLog({ type: "error", message: `Fatal error: ${msg}` });
        setRunState("done");
      }
    }
  }

  function handleStop() {
    abortRef.current = true;
  }

  const isRunning = runState === "running";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── left panel ── */}
      <div className="w-[380px] shrink-0 flex flex-col border-r border-border">
        {/* header */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Usage Bot</h1>
            <p className="text-xs text-muted-foreground">Simulates real user interactions</p>
          </div>
        </div>

        {/* config */}
        <div className="px-4 py-4 border-b border-border space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="totalActions" className="text-xs">Total actions</Label>
            <Input
              id="totalActions"
              type="number"
              min={5}
              max={200}
              value={totalActions}
              onChange={(e) =>
                setTotalActions(Math.max(5, Math.min(200, Number(e.target.value))))
              }
              disabled={isRunning}
              className="h-8 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Random ops drawn from the action pool — sign-up, navigate, add/edit/delete
              transactions, update settings, sign-out, and more.
            </p>
          </div>

          <div className="flex gap-2">
            {!isRunning ? (
              <Button onClick={handleRun} size="sm" className="gap-1.5">
                <Play className="h-3.5 w-3.5" />
                Run Bot
              </Button>
            ) : (
              <Button onClick={handleStop} size="sm" variant="destructive" className="gap-1.5">
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            )}
          </div>
        </div>

        {/* log */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Logs will appear here once the bot starts…
            </p>
          ) : (
            <div className="space-y-0.5 font-mono text-[11px]">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.type === "action"  ? "text-primary font-medium" :
                    log.type === "success" ? "text-green-600 dark:text-green-400" :
                    log.type === "error"   ? "text-red-600 dark:text-red-400" :
                    log.type === "done"    ? "text-primary font-semibold" :
                    "text-muted-foreground"
                  }
                >
                  {log.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* ── right panel: live iframe ── */}
      <div className="flex-1 relative">
        <iframe
          ref={iframeRef}
          src="/"
          className="w-full h-full border-0"
          title="App preview"
        />
        {!isRunning && runState === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/30 pointer-events-none">
            <div className="text-center space-y-1">
              <Bot className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">Hit Run Bot to start</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
