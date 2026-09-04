import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthContext } from "@/features/auth/hooks/auth-context";
import { useAuth } from "@/features/auth/hooks/use-auth";

interface ProvidersProps {
  children: React.ReactNode;
}

function AuthProvider({ children }: ProvidersProps) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <TooltipProvider>
      <AuthProvider>
        {children}
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </TooltipProvider>
  );
}
