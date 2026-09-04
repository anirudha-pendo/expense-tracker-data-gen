import { Navigate } from "react-router-dom";
import { useAuthContext } from "@/features/auth/hooks/auth-context";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, hasWorkspace, isLoading } = useAuthContext();

  if (isLoading) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/sign-in" replace />;
  if (!hasWorkspace) return <Navigate to="/setup-workspace" replace />;

  return <>{children}</>;
}
