import { useEffect, useState } from "react";
import { AppNav } from "./app-nav";
import { QuickAddPalette } from "@/features/quick-add/components/quick-add-palette";
import { QuickAddTrigger } from "@/features/quick-add/components/quick-add-trigger";

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
}

export function AppLayout({ children, title, actions }: AppLayoutProps) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      // The browser focuses its own search bar on Cmd/Ctrl+K otherwise.
      e.preventDefault();
      setQuickAddOpen((open) => {
        // Don't open on top of another dialog (form, alert) — stacked dialogs
        // fight over focus. Closing via the shortcut is always allowed.
        if (!open && document.querySelector('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]')) {
          return open;
        }
        return !open;
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
