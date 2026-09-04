import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuthContext } from "@/features/auth/hooks/auth-context";
import { SignInPage } from "@/features/auth/pages/sign-in-page";
import { SignUpPage } from "@/features/auth/pages/sign-up-page";
import { WorkspaceSetupPage } from "@/features/workspace/pages/workspace-setup-page";
import { DashboardPage } from "@/features/dashboard/pages/dashboard-page";
import { TransactionsPage } from "@/features/transactions/pages/transactions-page";
import { GoalsPage } from "@/features/goals/pages/goals-page";
import { InsightsPage } from "@/features/insights/pages/insights-page";
import { SettingsPage } from "@/features/settings/pages/settings-page";
import { ProtectedRoute } from "@/shared/components/protected-route";
import { BotPage } from "@/features/bot/pages/bot-page";

function GuestGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasWorkspace, isLoading } = useAuthContext();

  if (isLoading) return null;
  if (isAuthenticated && hasWorkspace) return <Navigate to="/" replace />;
  if (isAuthenticated && !hasWorkspace) return <Navigate to="/setup-workspace" replace />;

  return <>{children}</>;
}

function WorkspaceGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />;

  return <>{children}</>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/sign-in"
          element={
            <GuestGuard>
              <SignInPage />
            </GuestGuard>
          }
        />
        <Route
          path="/sign-up"
          element={
            <GuestGuard>
              <SignUpPage />
            </GuestGuard>
          }
        />
        <Route
          path="/setup-workspace"
          element={
            <WorkspaceGuard>
              <WorkspaceSetupPage />
            </WorkspaceGuard>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions"
          element={
            <ProtectedRoute>
              <TransactionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/insights"
          element={
            <ProtectedRoute>
              <InsightsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/goals"
          element={
            <ProtectedRoute>
              <GoalsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/bot" element={<BotPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
