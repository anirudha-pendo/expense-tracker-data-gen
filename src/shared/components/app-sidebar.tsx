import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ArrowLeftRight, Lightbulb, Target, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthContext } from "@/features/auth/hooks/auth-context";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Transactions", icon: ArrowLeftRight, href: "/transactions" },
  { label: "Insights", icon: Lightbulb, href: "/insights" },
  { label: "Goals", icon: Target, href: "/goals" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

export function AppSidebar() {
  const { user, workspace, signOut } = useAuthContext();
  const { pathname } = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary shrink-0 shadow-sm shadow-primary/20">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-primary-foreground">
              <path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1H2V4Z" fill="currentColor" opacity="0.7"/>
              <path d="M2 5h12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Z" fill="currentColor"/>
              <circle cx="5.5" cy="9.5" r="1" fill="currentColor" opacity="0.4" className="text-primary-foreground"/>
              <path d="M8 8h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
              <path d="M8 10.5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
            </svg>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold leading-tight truncate text-sidebar-foreground">
              {workspace?.name ?? "Expense Tracker"}
            </span>
            <span className="text-xs leading-tight text-sidebar-foreground/40">
              {workspace?.currency}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} className="h-9 px-3 rounded-lg">
                      <Link
                        to={item.href}
                        className={cn(
                          "flex items-center gap-2.5 text-sm transition-all",
                          isActive
                            ? "text-sidebar-foreground font-medium"
                            : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "size-4 shrink-0 transition-colors",
                            isActive ? "text-primary" : "text-current"
                          )}
                        />
                        <span>{item.label}</span>
                        {isActive && (
                          <span className="ml-auto size-1.5 rounded-full bg-primary" />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 py-4">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors group">
          <Avatar className="size-7 shrink-0">
            <AvatarFallback className="text-xs bg-primary/20 text-primary font-semibold">
              {user?.avatarInitials ?? "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-xs font-medium leading-tight truncate text-sidebar-foreground">
              {user?.displayName}
            </span>
            <span className="text-xs leading-tight truncate text-sidebar-foreground/40">
              @{user?.username}
            </span>
          </div>
          <button
            onClick={signOut}
            className="text-sidebar-foreground/30 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
            aria-label="Sign out"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
