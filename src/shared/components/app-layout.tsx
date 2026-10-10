import { useEffect, useState } from "react";
import { AppNav } from "./app-nav";
import { QuickAddPalette } from "@/features/quick-add/components/quick-add-palette";
import { QuickAddTrigger } from "@/features/quick-add/components/quick-add-trigger";
import { AssistantPanel } from "@/features/assistant/components/assistant-panel";
import { useAssistant } from "@/features/assistant/state/assistant-context";

const DIALOG_SELECTOR = '[data-slot="dialog-content"], [data-slot="alert-dialog-content"]';
const OVERLAY_SELECTOR = `${DIALOG_SELECTOR}, [data-slot="sheet-content"]`;

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
}

export function AppLayout({ children, title, actions }: AppLayoutProps) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const { setOpen: setAssistantOpen } = useAssistant();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        // The browser focuses its own search bar on Cmd/Ctrl+K otherwise.
        e.preventDefault();
        // Stacked overlays fight over focus; closing via the shortcut is always allowed.
        setQuickAddOpen((open) => (!open && document.querySelector(OVERLAY_SELECTOR) ? open : !open));
      } else if (key === "j") {
        e.preventDefault();
        setAssistantOpen((open) => (!open && document.querySelector(DIALOG_SELECTOR) ? open : !open));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setAssistantOpen]);

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <AppNav />

      <div className="max-w-[1200px] w-full mx-auto px-8 flex-1 flex flex-col">
        {/* Page header */}
        <div className="flex items-center justify-between py-5 border-b border-border/40">
          <h1 className="font-mono text-xs tracking-tight uppercase text-muted-foreground">
            {title}
          </h1>
          <div className="flex items-center gap-2">
            <AssistantPanel />
            <QuickAddTrigger onClick={() => setQuickAddOpen(true)} />
            {actions}
          </div>
        </div>

        {/* Content */}
        <main className="py-8 flex-1">
          {children}
        </main>
      </div>

      <QuickAddPalette open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
}
