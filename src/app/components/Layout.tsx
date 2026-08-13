import React, { useState, useEffect, useCallback } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import {
  LayoutDashboard, Users, TrendingUp, BarChart3, HelpCircle, Settings,
  Bell, Search, ChevronLeft, ChevronRight, Zap, Bot, LogOut, Menu, X,
  ChevronDown, Shield, User, Sun, Moon, RefreshCw, Crown, UserCog, Database, Lock
} from "lucide-react";
import { Toaster } from "sonner";
import { useApp } from "../context/AppContext";
import NotificationDropdown from "../components/NotificationDropdown";
import TrialExpiredModal from "../components/TrialExpiredModal";
import logo from "../../assets/Media.png";
import { usePermissions } from "../hooks/usePermissions";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, end: true, module: "leads" },
  { path: "/leads", label: "Leads", icon: Users, module: "leads" },
  { path: "/sales", label: "Sales", icon: TrendingUp, module: "deals" },
  { path: "/analysis", label: "Reports", icon: BarChart3, module: "reports" },
  { path: "/help", label: "Help & Support", icon: HelpCircle, module: "leads" },
  { path: "/settings", label: "Settings", icon: Settings, module: "settings" },
];

export default function Layout() {

  const {
    role, setRole, currentUser, userProfile,
    sidebarCollapsed, setSidebarCollapsed,
    notifications, refreshData: ctxRefresh, loading: ctxLoading,
    backendOnline, logout, activities,
    unreadCount,
    subscription,
    companySubscription,
  } = useApp();

  const { canView, isAdmin, canOpenAdminPanel } = usePermissions();


  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();
  const [showTrialModal, setShowTrialModal] = useState(false);

  // ── Route protection for expired trials ──
  useEffect(() => {
    if (!isAdmin && subscription && !subscription.is_trial_active && !subscription.is_subscription_active) {
      const currentPath = window.location.pathname;
      const allowedPaths = ['/billing', '/login', '/signup', '/payment-success', '/payment-failure'];
      if (!allowedPaths.includes(currentPath)) {
        setShowTrialModal(true);
      }
    }
  }, [subscription, isAdmin]);

  const isRestrictedPath = (pathname: string) => {
    const restricted = ['/leads', '/sales', '/analysis', '/admin', '/integrations'];
    return pathname === '/' || restricted.some(p => pathname.startsWith(p));
  };

  const isTrialExpired = !isAdmin && companySubscription &&
    !(companySubscription as any)?.is_trial_active &&
    !(companySubscription as any)?.is_subscription_active &&
    !subscription?.is_subscription_active &&
    !subscription?.is_trial_active;


  const handleSearch = (query: string) => {
    const q = query.toLowerCase();

    if (q.includes("lead")) return navigate("/leads");
    if (q.includes("sale")) return navigate("/sales");
    if (q.includes("analysis") || q.includes("report")) return navigate("/analysis");
    if (q.includes("help") || q.includes("support")) return navigate("/help");
    if (q.includes("setting")) return navigate("/settings");
    if (q.includes("admin")) return navigate("/admin");

    // default
    navigate("/");
  };
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setDarkMode(true);
    }
  }, []);
  const [searchQuery, setSearchQuery] = useState("");


  // unreadCount comes directly from context (notifUnreadCount alias removed)

  const toggleDark = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    setDarkMode(isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  };

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white overflow-hidden">
      <Toaster position="top-right" richColors closeButton />

      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative flex flex-col bg-[#0A0F1E] text-white z-50 h-full transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? "w-[72px]" : "w-64"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Logo */}
        <div className={`flex items-center px-4 py-5 border-b border-white/10 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
            <img
              src={logo}
              alt="VigoZen CRM"
              className="w-full h-full object-contain"
            />
          </div>

          {!sidebarCollapsed && (
            <div className="overflow-hidden flex-1 ml-3">
              <div className="text-sm font-semibold text-white leading-tight">VIGOZEN CRM</div>
              <div className="text-[10px] text-indigo-300">AI-Powered CRM</div>
            </div>
          )}

          {/* Always show the toggle button */}
          <button
            onClick={() => { setSidebarCollapsed(!sidebarCollapsed); setMobileOpen(false); }}
            className={`p-1 rounded-lg hover:bg-white/10 transition-colors ${sidebarCollapsed ? '' : 'ml-auto'}`}
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          <button className="lg:hidden" onClick={() => setMobileOpen(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Role Badge */}
        {!sidebarCollapsed && (
          <div className="mx-3 mt-3 mb-2">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isAdmin ? "bg-gradient-to-r from-purple-600/30 to-indigo-600/30" : "bg-gradient-to-r from-emerald-600/30 to-teal-600/30"}`}>
              {isAdmin ? <Crown size={13} className="text-purple-300" /> : <User size={13} className="text-emerald-300" />}
              <span className="text-xs font-medium text-white/90">{isAdmin ? "Admin Access" : "User Access"}</span>
              {/* Demo-mode role switcher */}
              {!userProfile && (
                <button
                  onClick={() => setRole(role === "org_admin" ? "user" : "org_admin")}
                  className="ml-auto text-[10px] bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full transition-colors"
                >
                  Switch
                </button>
              )}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.filter(item => canView(item.module as any)).map(({ path, label, icon: Icon, end }) => {
            const displayLabel = (label === "Sales" && (role === "Lead Manager" || role === "lead_manager"))
              ? "Sales (View Only)"
              : label;

            return (
              <NavLink
                key={path}
                to={path}
                end={end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative
                  ${isActive
                    ? "bg-indigo-600/90 text-white shadow-lg shadow-indigo-500/20"
                    : "text-slate-400 hover:text-white hover:bg-white/8"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-indigo-300 rounded-r-full" />}
                    <Icon size={18} className={`flex-shrink-0 transition-colors ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                    {!sidebarCollapsed && (
                      <span className={`text-sm transition-colors ${isActive ? "text-white font-medium" : "text-slate-400 group-hover:text-white"}`}>
                        {displayLabel}
                      </span>
                    )}
                    {sidebarCollapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        {displayLabel}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}


          {/* Admin Panel link */}
          {canOpenAdminPanel && (
            <NavLink
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative
                ${isActive
                  ? "bg-purple-600/90 text-white shadow-lg shadow-purple-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/8"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-purple-300 rounded-r-full" />}
                  <UserCog size={18} className={`flex-shrink-0 ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                  {!sidebarCollapsed && (
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-sm">{(role === 'Team Leader' || role === 'team_leader' || role === 'Lead Manager' || role === 'lead_manager') ? 'Users' : 'Admin Panel'}</span>
                      <span className="text-[9px] bg-purple-500/40 text-purple-200 px-1.5 py-0.5 rounded-full">{(role === 'Team Leader' || role === 'team_leader' || role === 'Lead Manager' || role === 'lead_manager') ? 'TEAM' : 'ADMIN'}</span>
                    </div>
                  )}
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">
                      {(role === 'Team Leader' || role === 'team_leader' || role === 'Lead Manager' || role === 'lead_manager') ? 'Users' : 'Admin Panel'}
                    </div>
                  )}
                </>
              )}
            </NavLink>
          )}
        </nav>

        {/* AI Assistant */}
        {!sidebarCollapsed && (
          <div className="mx-3 mb-3 p-4 rounded-xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 hover:border-indigo-500/40 transition-all duration-300">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/20">
                <Bot size={14} className="text-indigo-300" />
              </div>
              <span className="text-xs text-indigo-200 font-medium">AI Assistant</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-auto" />
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              {subscription?.is_trial_active ? 'Your trial ends soon. Upgrade to unlock full AI features.' : '5 high-priority leads need attention today.'}
            </p>
            <button
              onClick={() => navigate("/analysis")}
              className="mt-2.5 w-full text-[11px] font-medium bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 py-1.5 rounded-lg transition-all duration-200 border border-indigo-500/10 hover:border-indigo-500/30"
            >
              View AI Insights →
            </button>
          </div>
        )}

        {/* User section */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden ${isAdmin ? "bg-gradient-to-br from-purple-500 to-indigo-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}`}>
              {userProfile?.avatar_url ? (
                <img
                  src={userProfile.avatar_url.startsWith('http') ? userProfile.avatar_url : `http://localhost:5000${userProfile.avatar_url}`}
                  alt={currentUser.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement!.innerHTML = currentUser.avatar;
                  }}
                />
              ) : (
                currentUser.avatar
              )}
            </div>
            {!sidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">{currentUser.name || 'User'}</div>
                  <div className="text-[10px] text-slate-400 truncate capitalize">{currentUser.department || role || 'Member'}</div>
                  {subscription && (
                    <div className="mt-1">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${subscription.is_subscription_active ? 'bg-emerald-500/20 text-emerald-300' :
                        subscription.is_trial_active ? 'bg-indigo-500/20 text-indigo-300' :
                          'bg-red-500/20 text-red-300'
                        }`}>
                        {subscription.is_subscription_active ? (subscription.plan_type || 'Pro') :
                          subscription.is_trial_active ? 'Free Trial' : 'Expired'}
                      </span>
                    </div>
                  )}
                </div>
                <button onClick={handleLogout} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" title="Sign Out">
                  <LogOut size={13} className="text-slate-400 hover:text-white transition-colors" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 lg:px-6 py-3 flex items-center gap-4 flex-shrink-0 z-30">
          <button className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100" onClick={() => setMobileOpen(true)}>
            <Menu size={20} className="text-slate-600" />
          </button>

          {/* Search */}
          <div className="flex-1 max-w-md relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  const value = (e.target as HTMLInputElement).value;
                  handleSearch(value);
                }
              }}
              placeholder="Search leads, deals, contacts..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5">⌘K</kbd>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* AI Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-full">
              <Bot size={13} className="text-indigo-500" />
              <span className="text-xs text-indigo-600 font-medium">AI Active</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            {/* DB status */}
            <div
              title={backendOnline ? "Database connected" : "Running on local data — backend connecting..."}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[10px] font-medium ${backendOnline ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${backendOnline ? "bg-emerald-500" : "bg-amber-400 animate-pulse"}`} />
              {backendOnline ? "DB Live" : "Local"}
            </div>

            {/* Refresh */}
            <button
              onClick={() => ctxRefresh()}
              disabled={ctxLoading}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
            >
              <RefreshCw size={16} className={`${ctxLoading ? "animate-spin" : ""}`} />
            </button>

            {/* Dark mode */}
            <button onClick={toggleDark} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
              {darkMode ? <Sun size={17} className="text-amber-500" /> : <Moon size={17} className="text-slate-500" />}
            </button>





            {/* Notifications */}
            <NotificationDropdown />

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-semibold overflow-hidden ${isAdmin ? "bg-gradient-to-br from-purple-500 to-indigo-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}`}>
                  {userProfile?.avatar_url ? (
                    <img
                      src={userProfile.avatar_url.startsWith('http') ? userProfile.avatar_url : `http://localhost:5000${userProfile.avatar_url}`}
                      alt={currentUser.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement!.innerHTML = currentUser.avatar;
                      }}
                    />
                  ) : (
                    currentUser.avatar
                  )}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-tight">{currentUser.name}</div>
                  <div className="text-[10px] text-slate-400 capitalize">{role.replace('_', ' ')}</div>
                </div>
                <ChevronDown size={13} className="text-slate-400 hidden sm:block" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-semibold overflow-hidden ${isAdmin ? "bg-gradient-to-br from-purple-500 to-indigo-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}`}>
                        {userProfile?.avatar_url ? (
                          <img
                            src={userProfile.avatar_url.startsWith('http') ? userProfile.avatar_url : `http://localhost:5000${userProfile.avatar_url}`}
                            alt={currentUser.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement!.innerHTML = currentUser.avatar;
                            }}
                          />
                        ) : (
                          currentUser.avatar
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{currentUser.name}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-300">{currentUser.email}</div>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {isAdmin ? (
                        <span className="text-[10px] bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full flex items-center gap-1 capitalize">
                          <Crown size={9} />{role.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 capitalize">
                          <User size={9} />{role.replace('_', ' ')}
                        </span>
                      )}
                      {subscription && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${subscription.is_subscription_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          subscription.is_trial_active ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                            'bg-red-50 text-red-700 border-red-200'
                          }`}>
                          {subscription.is_subscription_active ? (subscription.plan_type || 'Pro') :
                            subscription.is_trial_active ? 'Free Trial' : 'Expired'}
                        </span>
                      )}
                      {backendOnline && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Database size={9} />Live DB
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="py-1">

                    <button onClick={() => { navigate("/settings"); setShowUserMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Profile Settings</button>
                    {canOpenAdminPanel && (
                      <button onClick={() => { navigate("/admin"); setShowUserMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 flex items-center gap-2">
                        <UserCog size={13} />Admin Panel
                      </button>
                    )}
                    {/* Demo role switcher */}
                    {!userProfile && (
                      <button
                        onClick={() => { setRole(role === "org_admin" ? "user" : "org_admin"); setShowUserMenu(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                      >
                        Switch to {role === "org_admin" ? "User" : "Org Admin"} (demo)
                      </button>
                    )}
                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"
                      >
                        <LogOut size={13} /> Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 ">
          <div onClick={() => { setShowNotifications(false); setShowUserMenu(false); }}>
            {isTrialExpired && isRestrictedPath(window.location.pathname) ? (
              <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
                <Lock size={64} className="text-red-500 mb-4 animate-bounce" />
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">Your Trial Has Expired</h1>
                <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md">
                  Your free trial period has ended. Please purchase a subscription to continue using premium CRM features, leads tracking, and sales analytics.
                </p>
                <div className="flex gap-4">
                  <button onClick={() => navigate('/settings?tab=pricing')} className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold transition-colors">
                    View Pricing Plans
                  </button>
                  <button onClick={() => navigate('/help')} className="px-6 py-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 dark:text-slate-200 font-semibold transition-colors">
                    Contact Support
                  </button>
                </div>
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
      <TrialExpiredModal
        isOpen={showTrialModal}
        onClose={() => setShowTrialModal(false)}
        onUpgrade={() => { setShowTrialModal(false); navigate('/billing'); }}
      />
    </div>
  );
}
