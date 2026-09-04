import { Link, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import Avatar from "boring-avatars";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/features/auth/hooks/auth-context";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Transactions", href: "/transactions" },
  { label: "Insights", href: "/insights" },
  { label: "Goals", href: "/goals" },
  { label: "Settings", href: "/settings" },
];

export function AppNav() {
  const { user, workspace, signOut } = useAuthContext();
  const { pathname } = useLocation();

  return (
    <nav className="border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-8 h-12 flex items-center gap-0">

        {/* Brand */}
        <div className="flex items-center gap-3 pr-8 border-r border-border/40 h-full shrink-0">
          <span className="font-mono text-xs font-bold tracking-widest uppercase select-none text-foreground">
            Ledger
          </span>
          {workspace?.name && (
            <>
              <span className="text-muted-foreground/40 font-mono text-xs">/</span>
              <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px] tracking-widest uppercase">
                {workspace.name}
              </span>
            </>
          )}
        </div>

        {/* Nav links */}
        <div className="flex items-stretch h-full flex-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "relative font-mono text-[10px] tracking-widest uppercase px-6 flex items-center transition-colors duration-150 ease-out",
                  "border-r border-border/40",
                  isActive
                    ? "text-foreground bg-muted/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-[-1px] left-0 right-0 h-[1px] bg-foreground" />
                )}
              </Link>
            );
          })}
        </div>

        {/* User */}
        <div className="flex items-center gap-5 pl-6 border-l border-border/40 h-full shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 shrink-0 flex items-center justify-center rounded-none overflow-hidden grayscale">
              <Avatar
                size={24}
                name={user?.displayName || "User"}
                variant="beam"
                colors={["#000000", "#333333", "#666666", "#999999", "#CCCCCC"]}
                square
              />
            </div>
            <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground hidden sm:block">
              {user?.displayName}
            </span>
          </div>
          <button
            onClick={signOut}
            className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors duration-150 ease-out flex items-center gap-1.5 btn-press"
            aria-label="Sign out"
          >
            <LogOut className="size-3" />
            <span className="hidden sm:inline uppercase tracking-widest">Exit</span>
          </button>
        </div>

      </div>
    </nav>
  );
}
