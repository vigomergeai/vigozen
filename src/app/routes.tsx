import React, { useEffect } from "react";
import { createBrowserRouter, useNavigate } from "react-router";
import { AppProvider } from "./context/AppContext";
import { useApp } from "./context/AppContext";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import LeadsPage from "./pages/LeadsPage";
import SalesPage from "./pages/SalesPage";
import AnalysisPage from "./pages/AnalysisPage";
import SupportPage from "./pages/SupportPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import PaymentSuccess from "./pages/PaymentSuccess";  
import PaymentFailure from "./pages/PaymentFailure"; 
import BillingPage from "./pages/BillingPage";
import { Loader2, Zap } from "lucide-react";

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <div className="text-6xl mb-4">🔍</div>
      <h1 className="text-slate-800 mb-2">Page Not Found</h1>
      <p className="text-sm text-slate-500">The page you're looking for doesn't exist.</p>
    </div>
  );
}

// Auth loading screen
function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0F1E] via-[#0D1530] to-[#0A0F1E] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30 animate-pulse">
          <Zap size={32} className="text-white" />
        </div>
        <div className="text-center">
          <div className="text-white font-semibold text-lg">Vigozen CRM</div>
          <div className="text-indigo-300 text-sm mt-1">Loading your workspace...</div>
        </div>
        <Loader2 size={20} className="text-indigo-400 animate-spin mt-2" />
      </div>
    </div>
  );
}

// Guard: admin only
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { role, authLoading } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && role !== "admin") {
      navigate("/", { replace: true });
    }
  }, [authLoading, role]);

  if (authLoading) return null;
  if (role !== "admin") return null;
  return <>{children}</>;
}

// Guard: redirect to /login if not authenticated
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authLoading, isAuthenticated } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return null;
  return <>{children}</>;
}

// Guard: redirect to / if already authenticated (for login page)
function RequireGuest({ children }: { children: React.ReactNode }) {
  const { authLoading, isAuthenticated } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading) return <AuthLoadingScreen />;
  if (isAuthenticated) return null;
  return <>{children}</>;
}



// Guard: admin only
// Guard: redirect to /billing if subscription expired
function RequireSubscription({ children }: { children: React.ReactNode }) {
  const { authLoading, isAuthenticated, subscription, subscriptionLoading } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !subscriptionLoading && isAuthenticated && subscription) {
      const isExpired = !subscription.is_trial_active && !subscription.is_subscription_active;
      if (isExpired) {
        navigate("/billing", { replace: true });
      }
    }
  }, [authLoading, subscriptionLoading, isAuthenticated, subscription]);

  if (authLoading || subscriptionLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return null;
  if (subscription && !subscription.is_trial_active && !subscription.is_subscription_active) return null;
  return <>{children}</>;
}
// Root with app provider + auth guard
function Root() {
  return (
    <AppProvider>
      <RequireAuth>
        <Layout />
      </RequireAuth>
    </AppProvider>
  );
}

// Login wrapper (guest only)
function LoginWrapper() {
  return (
    <AppProvider>
      <RequireGuest>
        <LoginPage />
      </RequireGuest>
    </AppProvider>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: LoginWrapper,
  },
  {
    path: "/payment-success",
    Component: PaymentSuccess,
  },
  {
    path: "/payment-failure",
    Component: PaymentFailure,
  },
  // ── ADD THIS BILLING ROUTE ──
  {
    path: "/billing",
    Component: () => (
      <AppProvider>
        <RequireAuth>
          <BillingPage />
        </RequireAuth>
      </AppProvider>
    ),
  },
  {
    path: "/",
    Component: Root,
    children: [
      { 
        index: true, 
        Component: () => (
          <RequireSubscription>
            <DashboardPage />
          </RequireSubscription>
        )
      },
      { 
        path: "leads", 
        Component: () => (
          <RequireSubscription>
            <LeadsPage />
          </RequireSubscription>
        )
      },
      { 
        path: "sales", 
        Component: () => (
          <RequireSubscription>
            <SalesPage />
          </RequireSubscription>
        )
      },
      { 
        path: "analysis", 
        Component: () => (
          <RequireSubscription>
            <AnalysisPage />
          </RequireSubscription>
        )
      },
      // Help and Settings - No subscription required
      { path: "help", Component: SupportPage },
      { path: "settings", Component: SettingsPage },
      // Admin - Admin only
      {
        path: "admin",
        Component: () => (
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        ),
      },
      { path: "*", Component: NotFound },
    ],
  },
]);
