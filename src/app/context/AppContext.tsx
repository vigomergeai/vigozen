/// <reference types="vite/client" />

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { toast } from "sonner";
import { api, getApiBaseUrl } from "../lib/api";

import {
  Role, Lead, LeadStatus, LeadSource, Industry, Deal, Employee, Integration, Ticket,
  leads as mockLeads, deals as mockDeals, employees as mockEmployees,
  integrations as mockIntegrations, tickets as mockTickets, recentActivities as mockActivities,
} from "../data/mockData";
import { fetchRevenueForecast, type RevenueForecast } from "../../services/revenueForecast";

// A lightweight Session-like type so we don't need @supabase/supabase-js
interface Session {
  access_token: string;
  user: {
    id: string;
    email?: string;
  };
}
export interface UserProfile {
  [x: string]: any;
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  employeeId: string | null;
  department: string;
  isActive: boolean;
  createdAt: string;
  lastLogin: string | null;
    avatar_url?: string;
    phone?: string;       
  company?: string;     
  timezone?: string;     
  language?: string;
  two_fa_enabled?: boolean;
  subscription_renewal_date?: string;
  next_invoice_date?: string;
  total_contacts?: number;
  team_members_count?: number;
  payment_last4?: string;
  payment_brand?: string;
  payment_expiry?: string;
  subscription_status?: string
}

interface Activity {
  id: string | number;
  type: string;
  user: string;
  action: string;
  target: string;
  value: number | null;
  time: string;
  createdAt?: string;
}

interface EmployeeRecord {
  id: string;
  name: string;
}

interface UserSettings {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  timezone?: string;
  language?: string;
  notifications?: Record<string, boolean>;
  aiPrefs?: Record<string, boolean>;
  selectedPlan?: string;
  passwordUpdated?: string;
  [key: string]: any;
}
export interface SubscriptionStatus {
  trial_start: string;
  trial_end: string;
  days_remaining: number;
  subscription_status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  payment_status: 'PAID' | 'UNPAID' | 'PENDING';
  plan_type: string;
  is_trial_active: boolean;
  is_subscription_active: boolean;
}
interface AppContextType {
  // Auth
  session: Session | null;
  userProfile: UserProfile | null;
  authLoading: boolean;
  isAuthenticated: boolean;
  
  login: (email: string, password: string) => Promise<{ error: string | null; user?: any }>;
  signup: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;

  // Role & user
  role: Role;
  setRole: (role: Role) => void;
  currentUser: {
    name: string;
    email: string;
    avatar: string;
    department: string;
    employeeId: string;
  };
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  notifications: number;

  // Data
  leads: Lead[];
  deals: Deal[];
  employees: EmployeeRecord[];
  integrations: Integration[];
  tickets: Ticket[];
  activities: Activity[];
  userSettings: UserSettings;
  loading: boolean;
  dataReady: boolean;
  backendOnline: boolean;

  // Users management (admin only)
  users: UserProfile[];
  usersLoading: boolean;
  createUser: (data: {
    email: string;
    password: string;
    name: string;
    role?: string;
    employeeId?: string;
    department?: string;
  }) => Promise<UserProfile | null>;
  updateUser: (userId: string, data: Partial<UserProfile>) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<boolean>;
  toggleUserAccess: (userId: string, isActive: boolean) => Promise<boolean>;
  resetUserPassword: (userId: string, password: string) => Promise<boolean>;
  loadUsers: () => Promise<void>;

  leadComments: LeadComment[];
  loadingComments: boolean;
  fetchLeadComments: (leadId: string) => Promise<void>;
  addLeadComment: (leadId: string, comment: string, parentCommentId?: string) => Promise<any>;
  updateLeadComment: (leadId: string, commentId: string, comment: string) => Promise<boolean>;
  deleteLeadComment: (leadId: string, commentId: string) => Promise<boolean>;

  // Lead CRUD
  addLead: (data: Partial<Lead>) => Promise<any | null>;
  updateLead: (id: string, data: Partial<Lead>) => Promise<boolean>;
  deleteLead: (id: string) => Promise<boolean>;
  bulkDeleteLeads: (ids: string[]) => Promise<boolean>;
 
  importLeads: (newLeads?: Partial<Lead>[]) => Promise<{ imported: number }>;

  // Deal CRUD
    // Deal CRUD
  addDeal: (data: Partial<Deal>) => Promise<Deal | null>;
  updateDeal: (id: string, data: Partial<Deal>) => Promise<boolean>;
  deleteDeal: (id: string) => Promise<boolean>;
  convertLeadToDeal: (lead: any, dealData: any) => Promise<Deal | null>;  // ← ADD THIS
  importDeals: () => Promise<void>;

  // Employee CRUD
  addEmployee: (data: Partial<Employee>) => Promise<Employee | null>;
  updateEmployee: (id: string, data: Partial<Employee>) => Promise<boolean>;
  deleteEmployee: (id: string) => Promise<boolean>;

  // Integration  
  toggleIntegration: (id: string) => Promise<boolean>;
  syncIntegration: (id: string) => Promise<boolean>;
  addIntegration: (data: Partial<Integration>) => Promise<Integration | null>;  
  updateIntegration: (id: string, data: Partial<Integration>) => Promise<boolean>;  

  // Ticket CRUD
  addTicket: (data: Partial<Ticket>) => Promise<Ticket | null>;
  updateTicket: (id: string, data: Partial<Ticket>) => Promise<boolean>;
  deleteTicket: (id: string) => Promise<boolean>;

  // Settings
  saveSettings: (data: UserSettings) => Promise<boolean>;
  loadSettings: () => Promise<void>;

  // Activity
  addActivity: (data: Partial<Activity>) => Promise<void>;

  // Notifications
  notificationItems: any[];
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  
  getNotificationsByType: (type: string) => any[];
  getNotificationsByPriority: (priority: string) => any[];
  getUnreadNotifications: () => any[];
  getHighPriorityNotifications: () => any[];
  getRecentNotifications: (limit?: number) => any[];

  // Utilities
  refreshData: () => Promise<void>;
  resetDatabase: () => Promise<void>;
   revenueForecast: RevenueForecast | null;  // ← ADD THIS
  refreshRevenueForecast: () => Promise<void>;  // ← ADD THIS
  subscription: SubscriptionStatus | null;
  subscriptionLoading: boolean;
}
  
export interface LeadComment {
  id: string;
  lead_id: string;
  user_id: string;
  comment: string;
  parent_comment_id?: string | null;
  created_at: string;
  updated_at: string;
  user_name: string;
  user_role: string;
  user_avatar?: string | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function uid(prefix = "x") {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

const validUUID = (id: any): boolean => {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

export function AppProvider({ children }: { children: ReactNode }) {
  // ── Auth State ─────────────────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [leadComments, setLeadComments] = useState<LeadComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [notificationItems, setNotificationItems] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  // ── App State ──────────────────────────────────────────────────────────────
  const [role, setRole] = useState<Role>("admin");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  // const [employees, setEmployees] = useState<Employee[]>(mockEmployees as Employee[]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>({});
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);
  const [revenueForecast, setRevenueForecast] = useState<RevenueForecast | null>(null);



  const toDbStatus: Record<LeadStatus, string> = {
    New: "new",
    Contacted: "contacted",
    Qualified: "qualified",
    Proposal: "proposal",
    Negotiation: "negotiation",
    Won: "won",
    Lost: "lost",
  };

  const toDbSource: Record<LeadSource, string> = {
    Facebook: "facebook",
    Website: "website",
    "CRM Import": "crm_import",
    LinkedIn: "linkedin",
    Referral: "referral",
    "Cold Call": "cold_call",
    "Email Campaign": "email_campaign",
  };

  const toDbIndustry: Record<Industry, string> = {
    Technology: "technology",
    Healthcare: "healthcare",
    Finance: "finance",
    Retail: "retail",
    Manufacturing: "manufacturing",
    "Real Estate": "real_estate",
    Education: "education",
    Others: "others",
  };

    // ── Subscription ──
  const fetchSubscriptionStatus = async () => {
    const token = getToken();
    if (!token) return;
    setSubscriptionLoading(true);
    try {
      const data = await api.subscription.status(token);
      setSubscription(data);
    } catch (error) {
      console.error("Failed to fetch subscription:", error);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const fromDbStatus = Object.fromEntries(Object.entries(toDbStatus).map(([k, v]) => [v, k]))

  const fromDbSource = Object.fromEntries(Object.entries(toDbSource).map(([k, v]) => [v, k]))

  const fromDbIndustry = Object.fromEntries(Object.entries(toDbIndustry).map(([k, v]) => [v, k]))

  // ── Auth init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem("token");
        const savedUser = localStorage.getItem("user");

        if (token && savedUser) {
          const user = JSON.parse(savedUser);
          // Restore session from storage
          setSession({
            access_token: token,
            user: { id: user.id, email: user.email },
          });
          setUserProfile({
            id: user.id,
            email: user.email,
            name: user.name || user.email,
            role: user.role || "user",
            employeeId: user.employee_id || null,
            department: user.department || "",
            isActive: user.is_active !== false,
            createdAt: user.created_at || new Date().toISOString(),
            lastLogin: null,
          });
          setRole((user.role as Role) || "user");
          // Load saved settings from localStorage
          const saved = localStorage.getItem("userSettings");
          if (saved) {
            try { setUserSettings(JSON.parse(saved)); } catch { /* ignore */ }
          }
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();
  }, []);


const loadUserProfile = async (id: string) => {
  try {
    const token = localStorage.getItem("token") || "";
    const res = await fetch(
      `${getApiBaseUrl()}/users/${id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) { console.log("loadUserProfile: not found"); return; }
    const data = await res.json();
    if (data) {
      setUserProfile(data);
      setRole(data.role as Role);
      const settings = {
        name: data.name,
        email: data.email,
        phone: data.phone || "",
        company: data.company || "",
        role: data.department || "",
        timezone: data.timezone || "Asia/Kolkata",
        language: data.language || "English",
      };
      setUserSettings(settings);
      localStorage.setItem("userSettings", JSON.stringify(settings));
    }
  } catch (e) {
    console.log("loadUserProfile error:", e);
  }
};

const login = async (
  email: string,
  password: string
): Promise<{ error: string | null; user?: any }> => {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { error: data.error || `Login failed (${response.status})` };
    }

    // Save JWT token and user to localStorage
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    // Update session and profile state
    setSession({
      access_token: data.token,
      user: { id: data.user.id, email: data.user.email },
    });
    setUserProfile({
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      role: data.user.role || "user",
      employeeId: data.user.employee_id || null,
      department: data.user.department || "",
      isActive: data.user.is_active !== false,
      createdAt: data.user.created_at || new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    });
    setRole((data.user.role as Role) || "user");

    // Also save to userName so hooks can display it
    localStorage.setItem("userName", data.user.name || data.user.email);

    console.log("LOGIN SUCCESS:", data.user);
    return { error: null, user: data.user };
  } catch (e: any) {
    console.error("Login error:", e);
    return { error: e.message || "Server unreachable. Please check backend connection." };
  }
};

const signup = async (
  email: string,
  password: string,
  name: string
): Promise<{ error: string | null }> => {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/auth/signup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { error: data.error || `Signup failed (${response.status})` };
    }

    // Save JWT token and user to localStorage
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("userName", data.user.name || data.user.email);

    // Update session and profile state
    setSession({
      access_token: data.token,
      user: { id: data.user.id, email: data.user.email },
    });
    setUserProfile({
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      role: data.user.role || "user",
      employeeId: data.user.employee_id || null,
      department: data.user.department || "",
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    });
    setRole((data.user.role as Role) || "user");

    console.log("SIGNUP SUCCESS:", data.user);

    return { error: null };
  } catch (error) {
    return { error: String(error) };
  }
};

const logout = async () => {
  // Clear auth data from localStorage
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("userSettings");
  localStorage.removeItem("userProfile");
  localStorage.removeItem("userName");

  setSession(null);
  setUserProfile(null);
  setRole("user");

  toast.success("Logged out successfully!");
};
  // ── Current user ───────────────────────────────────────────────────────────
 const currentUser = {
  name: userProfile?.name || "User",
  email: userProfile?.email || "",
  avatar: (userProfile?.name || "User")
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase(),
  department: userProfile?.department || "Not Assigned",
  employeeId: userProfile?.employeeId || "",
};
  const isAuthenticated = !!session && !!session.access_token;
  const getToken = () => localStorage.getItem("token") || session?.access_token;

  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const isInitialNotificationFetchRef = useRef<boolean>(true);

  const fetchNotifications = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const data = await api.notifications.list(token);
      const items = Array.isArray(data) ? data : [];
      setNotificationItems(items);

      if (isInitialNotificationFetchRef.current) {
        items.forEach((n: any) => seenNotificationIdsRef.current.add(n.id));
        isInitialNotificationFetchRef.current = false;
      } else {
        items.forEach((n: any) => {
          if (!n.is_read && !seenNotificationIdsRef.current.has(n.id)) {
            seenNotificationIdsRef.current.add(n.id);
            toast.info(n.title || "New Notification", {
              description: n.message || "",
            });
          } else {
            seenNotificationIdsRef.current.add(n.id);
          }
        });
      }

      const countRes = await api.notifications.getUnreadCount(token);
      setUnreadCount(countRes?.count || 0);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    }
  }, [session]);

  const markNotificationRead = async (id: string) => {
    const token = getToken();
    if (!token) return;
    try {
      await api.notifications.markRead(id, token);
      setNotificationItems(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const markAllNotificationsRead = async () => {
    const token = getToken();
    if (!token) return;
    try {
      await api.notifications.markAllRead(token);
      setNotificationItems(prev =>
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const deleteNotification = async (id: string) => {
    const token = getToken();
    if (!token) return;
    try {
      await api.notifications.delete(id, token);
      setNotificationItems(prev => prev.filter(n => n.id !== id));
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  };

  // ── Backend sync ───────────────────────────────────────────────────────────
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const token = session?.access_token;

      if (!token) {
        console.warn("No token yet — skipping refreshData");
        return;
      }
      console.log("TOKEN:", token);

      await Promise.all([
        importLeads(),
        importDeals(),
        importTickets(),
        importIntegrations(),
        importActivities(),
        fetchNotifications(),
      ]);

      // Fetch employees/users from backend
      try {
        const empRes = await fetch(
          `${getApiBaseUrl()}/users`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (empRes.ok) {
          const empData = await empRes.json();
          setEmployees(empData.map((u: any) => ({ id: u.id, name: u.name || u.email })) || []);
        }
      } catch { /* ignore */ }

      setBackendOnline(true);
      setDataReady(true);
    } catch (e) {
      setBackendOnline(false);
      console.error("refreshData error:", e);
    } finally {
      setLoading(false);
    }
  }, [session]);

  const loadSettings = useCallback(async () => {
  try {
    //  Load from localStorage
    const saved = localStorage.getItem("userSettings");
    if (saved) {
      setUserSettings(JSON.parse(saved));
    }
  } catch {
    // ignore
  }
}, []);

useEffect(() => {
  if (session && userProfile?.id) {
    refreshData();
    loadSettings();
  }
}, [session, userProfile?.id]);

// Poll for real-time notifications every 5 seconds
useEffect(() => {
  if (session) {
    const interval = setInterval(() => {
      fetchNotifications();
    }, 5000);
    return () => clearInterval(interval);
  }
}, [session, fetchNotifications]);

// Auto-refresh revenue forecast when deals change
useEffect(() => {
  refreshRevenueForecast();
}, []);
  // ── Sync helpers ───────────────────────────────────────────────────────────
  async function trySyncCreate<T>(apiFn: () => Promise<T>): Promise<T | null> {
    if (!backendOnline) return null;
    try { return await apiFn(); } catch { return null; }
  }
  async function trySyncUpdate(apiFn: () => Promise<any>): Promise<void> {
    if (!backendOnline) return;
    try { await apiFn(); } catch { /* ignore */ }
  }

  // ── User Management (Admin) ────────────────────────────────────────────────
  const loadUsers = async () => {
    const token = getToken();
    if (!token || role !== "admin") return;
    setUsersLoading(true);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/users`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      const mapped = (data || []).map((row: any) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        employeeId: row.employee_id || row.emp_link || null,
        department: row.department,
        isActive: row.is_active !== false && row.status !== 'inactive',
        createdAt: row.created_at ?? "",
        lastLogin: row.last_login ?? null,
      }));
      setUsers(mapped);
    } catch (e) {
      console.log("loadUsers error:", e);
    } finally {
      setUsersLoading(false);
    }
  };

  const createUser = async (data: {
    email: string; password: string; name: string;
    role?: string; employeeId?: string; department?: string;
  }): Promise<UserProfile | null> => {
    const token = getToken();
    if (!token) {
      toast.error("Unauthorized");
      return null;
    }
    try {
      const newProfile = await api.users.create(data, token);
      setUsers(prev => [...prev, newProfile]);
      toast.success(`User "${data.name}" created successfully!`);
      return newProfile;
    } catch (e: any) {
      toast.error(`Failed to create user: ${e.message}`);
      return null;
    }
  };

  const updateUser = async (userId: string, data: Partial<UserProfile>): Promise<boolean> => {
    const token = getToken();
    if (!token) return false;
    try {
      const payload: any = {};
      if (data.role !== undefined) payload.role = data.role;
      if (data.department !== undefined) payload.department = data.department;
      if (data.employeeId !== undefined) payload.employee_id = data.employeeId;
      if (data.name !== undefined) payload.name = data.name;

      const res = await fetch(
        `${getApiBaseUrl()}/users/${userId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        toast.error('Failed to update user details');
        return false;
      }

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...data } : u));
      toast.success("User updated successfully!");
      return true;
    } catch (e: any) {
      toast.error(`Failed to update user: ${e.message}`);
      return false;
    }
  };

  const deleteUser = async (userId: string): Promise<boolean> => {
    const token = getToken();
    if (!token) return false;
    try {
      await api.users.delete(userId, token);
      setUsers(prev => prev.filter(u => u.id !== userId));
      toast.success("User removed");
      return true;
    } catch (e: any) {
      toast.error(`Failed to delete user: ${e.message}`);
      return false;
    }
  };

  const toggleUserAccess = async (userId: string, isActive: boolean): Promise<boolean> => {
    const token = getToken();
    if (!token) return false;
    try {
      await api.users.toggleAccess(userId, isActive, token);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive } : u));
      toast.success(`User ${isActive ? "activated" : "deactivated"} successfully`);
      return true;
    } catch (e: any) {
      toast.error(`Failed to update access: ${e.message}`);
      return false;
    }
  };

  const resetUserPassword = async (userId: string, password: string): Promise<boolean> => {
    const token = getToken();
    if (!token) {
      toast.error("Unauthorized");
      return false;
    }
    try {
      await api.users.resetPassword(userId, password, token);
      toast.success('Password reset successfully');
      return true;
    }
    catch (error: any) {
      toast.error(`Failed: ${error.message}`);
      return false;
    }
  };

  // ── Lead CRUD ──────────────────────────────────────────────────────────────
  const addLead = async (data: Partial<Lead>): Promise<any | null> => {
    try {
      const newLead: Lead = {
        id: uid("l"),
        createdAt: new Date().toISOString().split("T")[0],
        lastContact: new Date().toISOString().split("T")[0],
        aiScore: Math.floor(Math.random() * 40) + 50,
        probability: 40,
        tags: [],
        name: "",
        company: "",
        email: "",
        phone: "",
        status: "New",
        source: "Website",
        industry: "Technology",
        value: 0,
        owner: currentUser.name,
        ownerId: (data.ownerId && validUUID(data.ownerId)) ? data.ownerId : "",
        notes: "",
        ...data,
      };

      const dbPayload = {
        name: newLead.name || "No Name",
        email: newLead.email || null,
        phone: newLead.phone || null,
        company: newLead.company || "Unknown", // FIX
        source: toDbSource[newLead.source] || "website",
        status: toDbStatus[newLead.status] || "new",
        industry: toDbIndustry[newLead.industry] || "technology",
        value: newLead.value || 0,
        probability: newLead.probability || 0,
        owner: newLead.owner || "Unknown",
        ownerId: newLead.ownerId || null,
        notes: newLead.notes || null,
        aiScore: newLead.aiScore || 50,
        //tags: newLead.tags || [],
      };
   console.log("FINAL INSERT PAYLOAD:", JSON.stringify({
  name: dbPayload.name,
  email: dbPayload.email,
  phone: dbPayload.phone,
  company: dbPayload.company,
  source: dbPayload.source,
  status: dbPayload.status,
  industry: dbPayload.industry,
  value: dbPayload.value,
  probability: dbPayload.probability,
  owner: dbPayload.owner,
  //owner: dbPayload.owner || userProfile?.name,
  notes: dbPayload.notes,
  aiscore: dbPayload.aiScore
}, null, 2));


      //  FIRST DB INSERT
      const response = await fetch(`${getApiBaseUrl()}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
        body: JSON.stringify({ name: dbPayload.name, email: dbPayload.email, phone: dbPayload.phone, company: dbPayload.company, source: dbPayload.source, status: dbPayload.status, industry: dbPayload.industry, value: dbPayload.value, notes: dbPayload.notes })
      });
      const inserted = await response.json();
    
      console.log("Saved:", inserted);


      toast.success("Lead saved successfully ");

      await importLeads(); //  FIX

      return inserted;


    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
      return null;
    }
  };

  const updateLead = async (id: string, data: Partial<Lead>): Promise<boolean> => {
    const dbPayload = {
      ...data,
      status: data.status ? (toDbStatus[data.status as keyof typeof toDbStatus] ?? "new") : "new",
source: data.source ? (toDbSource[data.source as keyof typeof toDbSource] ?? "website") : "website",
industry: data.industry ? (toDbIndustry[data.industry as keyof typeof toDbIndustry] ?? "technology") : "technology",
    };
    // console.log("Dataa got is ", data);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...data } : l));
  const response = await fetch(`${getApiBaseUrl()}/leads/${id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${getToken()}` },
  body: JSON.stringify(dbPayload)
});

if (!response.ok) {
  toast.error("Cannot Update Lead");
  return false;
}
    toast.success("Lead updated successfully!");
    return true;
  };

  const deleteLead = async (id: string): Promise<boolean> => {
    const token = getToken();
    if (!token) {
      toast.error("Not logged in");
      return false;
    }
    try {
      await api.leads.delete(id, token);
      setLeads(prev => prev.filter(l => l.id !== id));
      toast.success("Lead deleted successfully");
      return true;
    } catch (error: any) {
      console.error("Delete lead failed:", error);
      toast.error(error.message || "Failed to delete lead");
      return false;
    }
  };

    // ── Lead Comments (Internal Conversation) ──
  const fetchLeadComments = async (leadId: string) => {
    const token = getToken();
    if (!token) {
      console.warn("No token, skipping fetchLeadComments");
      return;
    }
    setLoadingComments(true);
    try {
      const data = await api.comments.list(leadId, token);
      setLeadComments(data || []);
    } catch (error) {
      console.error("Failed to fetch lead comments:", error);
      toast.error("Failed to load comments");
    } finally {
      setLoadingComments(false);
    }
  };

  const addLeadComment = async (leadId: string, comment: string, parentCommentId?: string) => {
    const token = getToken();
    if (!token) {
      toast.error("Not logged in");
      return null;
    }
    if (!comment || comment.trim() === "") {
      toast.error("Comment cannot be empty");
      return null;
    }
    try {
      const newComment = await api.comments.create(leadId, { comment: comment.trim(), parent_comment_id: parentCommentId }, token);
      setLeadComments(prev => [...prev, newComment]);
      toast.success("Comment added");
      return newComment;
    } catch (error: any) {
      console.error("Failed to add comment:", error);
      toast.error(error.message || "Failed to add comment");
      return null;
    }
  };

  const updateLeadComment = async (leadId: string, commentId: string, comment: string) => {
    const token = getToken();
    if (!token) {
      toast.error("Not logged in");
      return false;
    }
    if (!comment || comment.trim() === "") {
      toast.error("Comment cannot be empty");
      return false;
    }
    try {
      const updated = await api.comments.update(leadId, commentId, { comment: comment.trim() }, token);
      setLeadComments(prev => prev.map(c => c.id === commentId ? { ...c, ...updated } : c));
      toast.success("Comment updated");
      return true;
    } catch (error: any) {
      console.error("Failed to update comment:", error);
      toast.error(error.message || "Failed to update comment");
      return false;
    }
  };

  const deleteLeadComment = async (leadId: string, commentId: string) => {
    const token = getToken();
    if (!token) {
      toast.error("Not logged in");
      return false;
    }
    try {
      await api.comments.delete(leadId, commentId, token);
      setLeadComments(prev => prev.filter(c => c.id !== commentId));
      toast.success("Comment deleted");
      return true;
    } catch (error: any) {
      console.error("Failed to delete comment:", error);
      toast.error(error.message || "Failed to delete comment");
      return false;
    }
  };

const bulkDeleteLeads = async (ids: string[]): Promise<boolean> => {
  const token = getToken();
  if (!token) {
    toast.error("Not logged in");
    return false;
  }
  try {
    // ✅ Filter only UUIDs before sending
    const validIds = ids.filter(id =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    );

    if (validIds.length === 0) {
      toast.error("No valid UUIDs to delete");
      return false;
    }

    await api.leads.bulkDelete(validIds, token);

    setLeads(prev => prev.filter(l => !validIds.includes(l.id)));
    toast.success(`${validIds.length} leads deleted`);
    return true;
  } catch (error: any) {
    console.error("Bulk delete error:", error);
    toast.error(error.message || "Cannot bulk delete leads");
    return false;
  }
};
const importLeads = async (newLeads?: Partial<Lead>[]): Promise<{ imported: number }> => {
  try {

    // INSERT NEW LEADS
    if (newLeads && newLeads.length > 0) {

      const leadsToInsert = newLeads.map(lead => ({
        name: lead.name || "No Name",
        email: lead.email || null,
        phone: lead.phone || null,
        company: lead.company || "Unknown",
        source: toDbSource[lead.source as LeadSource] || "website",
        status: toDbStatus[lead.status as LeadStatus] || "new",
        industry: toDbIndustry[lead.industry as Industry] || "technology",
        value: lead.value || 0,
        probability: lead.probability || 50,
        owner: lead.owner || currentUser.name,
owner_id: validUUID(lead.ownerId) ? lead.ownerId : null,
        notes: lead.notes || null,
        aiscore: lead.aiScore || 50,
      }));

      const bulkResponse = await fetch(
        `${getApiBaseUrl()}/leads/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getToken()}`
          },
          body: JSON.stringify({
            leads: leadsToInsert
          }),
        }
      );

      if (!bulkResponse.ok) {
        throw new Error("Bulk insert failed");
      }
    }

    // ALWAYS REFRESH LEADS
    const response = await fetch(`${getApiBaseUrl()}/leads`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    });

    const data = await response.json();

    if (!Array.isArray(data)) {
      setLeads([]);
      return { imported: 0 };
    }

    const formatted = data.map((l) => ({
      lastContact: l.last_contact ?? new Date().toISOString(),
      id: l.id,
      name: l.name || "",
      email: l.email || "",
      phone: l.phone || "",
      company: l.company || "",
      status: (fromDbStatus[l.status] ?? "New") as LeadStatus,
      source: (fromDbSource[l.source] ?? "Website") as LeadSource,
      industry: (fromDbIndustry[l.industry] ?? "Technology") as Industry,
      value: Number(l.value) || 0,
      probability: Number(l.probability) || 0,
      aiScore: Number(l.aiscore) || 50,
      owner: l.owner || "",
      ownerId: l.owner_id || null,
      notes: l.notes || "",
      createdAt: l.created_at
        ? l.created_at.split("T")[0]
        : new Date().toISOString().split("T")[0],
      tags: l.tags || [],
      converted_to_deal: !!l.converted_to_deal,
      deal_id: l.deal_id || null,
    }));

    console.log("RAW API DATA:", data);
    console.log("FORMATTED LEADS:", formatted);

    setLeads(formatted);

    return {
      imported: formatted.length,
    };

  } catch (err) {
    console.error("Import Leads Error:", err);
    throw err;
  }
};
  // const importLeads = async (newLeads: Partial<Lead>[]): Promise<{ imported: number }> => {
  //   console.log("Function is called");
  //   const {data, error} = await supabase.from('leads').select('*');
  //   console.log("Data Coming from frontend is");
  //   const enriched: Lead[] = newLeads.map(l => ({
  //     id: uid("l"),
  //     createdAt: new Date().toISOString().split("T")[0],
  //     lastContact: new Date().toISOString().split("T")[0],
  //     aiScore: Math.floor(Math.random() * 40) + 50,
  //     probability: 40,
  //     tags: [],
  //     name: "", company: "", email: "", phone: "",
  //     status: "New", source: "CRM Import", industry: "Technology",
  //     value: 0, owner: currentUser.name, ownerId: currentUser.employeeId, notes: "",
  //     ...l,
  //   } as Lead));

  //   setLeads(prev => [...enriched, ...prev]);
  //   toast.success(`${enriched.length} leads imported successfully!`);

  //   // Sync to backend
  //   await trySyncUpdate(() => api.leads.bulkImport(newLeads, getToken()));

  //   return { imported: enriched.length };
  // };

  // ── Deal CRUD ──────────────────────────────────────────────────────────────
    // ── Deal Helper Maps ────────────────────────────────────────────────────────
  const toDbDealStage: Record<string, string> = {
  New: "New",
  Contacted: "Contacted",
  Qualified: "Qualified",
  Proposal: "Proposal",
  Negotiation: "Negotiation",
  Won: "Won",
  Lost: "Lost",
};

  const fromDbDealStage = Object.fromEntries(
    Object.entries(toDbDealStage).map(([k, v]) => [v, k])
  );

  // ── Deal CRUD ──────────────────────────────────────────────────────────────
  const addDeal = async (data: Partial<Deal>): Promise<Deal | null> => {
  try {
    console.log("=== addDeal called with data:", data);
    
    const newDeal: Deal = {
      id: uid("d"),
      daysInStage: 0,
      probability: 50,
      expectedClose: "",
      title: "",
      company: "",
      value: 0,
      stage: "New" as LeadStatus,
      owner: currentUser.name,
      ownerId: currentUser.employeeId,
      ...data,
    };

    const dbStage = toDbDealStage[newDeal.stage] || "New";
    
    // Create payload - REMOVE owner_id or set to null
    const insertPayload = {
      title: newDeal.title || "Untitled Deal",
      company: newDeal.company || "",
      value: Number(newDeal.value) || 0,
      stage: dbStage,
      owner: newDeal.owner || currentUser.name,
      probability: Number(newDeal.probability) || 50,
      expectedclose: newDeal.expectedClose || null,
      daysinstage: Number(newDeal.daysInStage) || 0,
    };

    console.log("Insert payload being sent:", insertPayload);
    
    const dealResponse = await fetch(`${getApiBaseUrl()}/deals`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }, body: JSON.stringify(insertPayload) });
    //const insertedDeal = [await dealResponse.json()];
    const insertedDeal = await dealResponse.json();
    console.log(" Deal inserted successfully:", insertedDeal);
    
    //const finalDeal = { ...newDeal, id: insertedDeal[0]?.id };
    const finalDeal = { ...newDeal, id: insertedDeal?.id };
    setDeals(prev => [finalDeal, ...prev]);
    toast.success(`Deal "${newDeal.title}" created!`);
    
    await importDeals();
    
    return finalDeal;
    
  } catch (error: any) {
    console.error("🔥 Error in addDeal:", error);
    toast.error(`Something went wrong: ${error?.message || "Unknown error"}`);
    return null;
  }
};  
const updateDeal = async (id: string, data: Partial<Deal>): Promise<boolean> => {
  try {
    const payload: any = {};

    if (data.title !== undefined) payload.title = data.title;
    if (data.company !== undefined) payload.company = data.company;
    if (data.value !== undefined) payload.value = data.value;
    if (data.stage !== undefined) payload.stage = toDbDealStage[data.stage];
    if (data.owner !== undefined) payload.owner = data.owner;
if (validUUID(data.ownerId)) {
  payload.owner_id = data.ownerId;
} else {
  payload.owner_id = null;
}
    if (data.probability !== undefined) payload.probability = data.probability;
    if (data.expectedClose !== undefined) payload.expectedclose = data.expectedClose;
    if (data.daysInStage !== undefined) payload.daysinstage = data.daysInStage;

    const response = await fetch(`${getApiBaseUrl()}/deals/${id}`, {
      
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      toast.error(`Update failed: ${errorText}`);
      return false;
    }

    // ✅ Fresh data from backend
    await importDeals();
    toast.success("Deal updated successfully!");
    return true;
  } catch (error) {
    console.error("Update error:", error);
    toast.error("Cannot Update Deal");
    return false;
  }
};
   
      

const deleteDeal = async (id: string): Promise<boolean> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}/deals/${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${getToken()}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      toast.error(`Delete failed: ${errorText}`);
      return false;
    }

    // ✅ Fresh data from backend
    await importDeals();
    toast.success("Deal deleted successfully!");
    return true;
  } catch (error) {
    console.error("Delete error:", error);
    toast.error("Cannot Delete Deal");
    return false;
  }
};

  // ── Convert Lead to Deal ──
  const convertLeadToDeal = async (lead: any, dealData: any): Promise<Deal | null> => {
    try {
      const token = localStorage.getItem('token') || session?.access_token;
      if (!token) throw new Error("Not logged in");

      // Create deal with lead_id reference
      const newDeal = await api.deals.create({
        title: dealData.title || `Deal for ${lead.name}`,
        company: lead.company || '',
        value: dealData.value || lead.value || 0,
        stage: dealData.stage || 'New',
        owner: dealData.owner || lead.owner || '',
        probability: dealData.probability || 50,
        expectedclose: dealData.expectedclose || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        daysinstage: 0,
        lead_id: lead.id,  // ← Link to lead
      }, token);

      // Update lead status and preserve required fields
      await api.leads.update(lead.id, {
        name: lead.name,
        company: lead.company || 'Unknown',
        converted_to_deal: true,
        deal_id: newDeal.id,
        status: 'won'
      }, token);

      // Update local state immediately
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, converted_to_deal: true, deal_id: newDeal.id, status: 'Won' } : l));

      // Refresh data
      await refreshData();
      
      toast.success('Lead converted to Deal successfully!');
      return newDeal;
      
    } catch (error) {
      console.error('Convert lead to deal error:', error);
      toast.error('Failed to convert lead to deal');
      throw error;
    }
  };

 const importDeals = async () => {
  try {
    console.log("=== Fetching deals from RDS...");
    
const response = await fetch(`${getApiBaseUrl()}/deals`, {
  headers: { "Authorization": `Bearer ${getToken()}` }
});
const allDeal = await response.json();      

    console.log("✅ Raw deals from DB:", allDeal);


    const dealData: Deal[] = allDeal.map((l: any) => ({
      id: l.id,
      title: l.title || "",
      company: l.company || "",
      value: l.value || 0,
      stage: (fromDbDealStage[l.stage] || "New") as LeadStatus,
      owner: l.owner || "",
      ownerId: l.owner_id || null,
      probability: l.probability || 50,
      expectedClose: l.expectedclose || "",  // Note: 'expectedclose' from DB
      daysInStage: l.daysinstage || 0,       // Note: 'daysinstage' from DB
      createdAt: l.created_at ? l.created_at.split("T")[0] : ""
    }));

    console.log("✅ Formatted deals:", dealData.length);
    setDeals(dealData);
    
  } catch (error) {
    console.error("🔥 Error in importDeals:", error);
    toast.error("Server Issue Loading Deals");
  }
}

const importTickets = async () => {
  try {
    const token = getToken();
    if (!token) return;
    const data = await api.tickets.list(token);
    if (Array.isArray(data)) {
      const formatted = data.map((t: any) => ({
        id: t.id,
        title: t.title || "",
        status: t.status || "Open",
        priority: t.priority || "Medium",
        createdAt: t.created_at ? t.created_at.split("T")[0] : new Date().toISOString().split("T")[0],
        category: t.category || "General",
        description: t.description || "",
        ownerId: t.owner_id || null,
        ownerName: t.owner_name || "",
        assignedTo: t.assigned_to || null,
        assignedToName: t.assigned_to_name || "",
      }));
      setTickets(formatted);
    }
  } catch (error) {
    console.error("Failed to load tickets from backend:", error);
  }
};

const importIntegrations = async () => {
  try {
    const token = getToken();
    if (!token) return;
    const data = await api.integrations.list(token);
    if (Array.isArray(data)) {
      setIntegrations(data);
    }
  } catch (error) {
    console.error("Failed to load integrations from backend:", error);
  }
};

const importActivities = async () => {
  try {
    const token = getToken();
    if (!token) return;
    const data = await api.activities.list(token);
    if (Array.isArray(data)) {
      setActivities(data);
    }
  } catch (error) {
    console.error("Failed to load activities from backend:", error);
  }
};


// ── Notification Filter Functions ──
const getNotificationsByType = (type: string) => {
  return notificationItems.filter(n => n.type === type);
};

const getNotificationsByPriority = (priority: string) => {
  return notificationItems.filter(n => n.priority === priority);
};

const getUnreadNotifications = () => {
  return notificationItems.filter(n => !n.is_read);
};

const getHighPriorityNotifications = () => {
  return notificationItems.filter(n => n.priority === 'high' && !n.is_read);
};

const getRecentNotifications = (limit: number = 10) => {
  return notificationItems.slice(0, limit);
};

  // Revenue Forecast Functions
const refreshRevenueForecast = useCallback(async () => {
  try {
    console.log("Fetching revenue forecast...");
    const forecast = await fetchRevenueForecast();
    setRevenueForecast(forecast);
    console.log("Revenue forecast updated:", forecast);
  } catch (error) {
    console.error("Failed to fetch revenue forecast:", error);
  }
}, []);
  // ── Employee CRUD ──────────────────────────────────────────────────────────
  const addEmployee = async (data: Partial<Employee>): Promise<Employee | null> => {
    const newEmp: Employee = {
      id: uid("e"), leads: 0, won: 0, revenue: 0, conversionRate: 0,
      avatar: data.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2) || "??",
      name: "", email: "", role: "", department: "",
      ...data,
    } as Employee;
    setEmployees(prev => [...prev, newEmp]);
    toast.success(`Employee "${newEmp.name}" added!`);
    const be = await trySyncCreate(() => api.employees.create(data, getToken()));
    if (be) setEmployees(prev => prev.map(e => e.id === newEmp.id ? { ...e, ...be } : e));
    return newEmp;
  };

  const updateEmployee = async (id: string, data: Partial<Employee>): Promise<boolean> => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
    toast.success("Employee updated!");
    await trySyncUpdate(() => api.employees.update(id, data, getToken()));
    return true;
  };

  const deleteEmployee = async (id: string): Promise<boolean> => {
    setEmployees(prev => prev.filter(e => e.id !== id));
    toast.success("Employee removed");
    await trySyncUpdate(() => api.employees.delete(id, getToken()));
    return true;
  };

  // ── Integration ────────────────────────────────────────────────────────────
  const toggleIntegration = async (id: string): Promise<boolean> => {
    const integ = integrations.find(i => i.id === id);
    if (!integ) return false;
    const newStatus = integ.status === "Connected" ? "Disconnected" : "Connected";
    const lastSync = newStatus === "Connected" ? "Just now" : integ.lastSync;
    try {
      const token = getToken();
      const updated = await api.integrations.update(id, { status: newStatus, lastSync }, token);
      if (updated) {
        setIntegrations(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i));
        toast.success(`${integ.name} ${newStatus === "Connected" ? "connected" : "disconnected"}`);
        return true;
      }
      return false;
    } catch (e: any) {
      toast.error(`Failed to toggle integration: ${e.message}`);
      return false;
    }
  };

  const syncIntegration = async (id: string): Promise<boolean> => {
    const integ = integrations.find(i => i.id === id);
    if (!integ) return false;
    try {
      const token = getToken();
      const updated = await api.integrations.update(id, { lastSync: "Just now" }, token);
      if (updated) {
        setIntegrations(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i));
        toast.success(`${integ.name} synced!`);
        return true;
      }
      return false;
    } catch (e: any) {
      toast.error(`Failed to sync integration: ${e.message}`);
      return false;
    }
  };

  // ── Add/Update Integration ─────────────────────────────────────────────────
  const addIntegration = async (integrationData: Partial<Integration>): Promise<Integration | null> => {
    const newIntegration: Integration = {
      id: `int_${Date.now()}`,
      name: integrationData.name || "New Integration",
      type: integrationData.type || "Custom",
      description: integrationData.description || "",
      icon: integrationData.name?.substring(0, 2).toUpperCase() || "IN",
      status: "Pending" as const,
      leads: 0,
      lastSync: "Never",
      ...integrationData,
    };
    try {
      const token = getToken();
      const inserted = await api.integrations.create(newIntegration, token);
      if (inserted) {
        setIntegrations(prev => [inserted, ...prev]);
        toast.success(`${inserted.name} added successfully!`);
        return inserted;
      }
      return null;
    } catch (e: any) {
      toast.error(`Failed to add integration: ${e.message}`);
      return null;
    }
  };

  const updateIntegration = async (id: string, integrationData: Partial<Integration>): Promise<boolean> => {
    try {
      const token = getToken();
      const updated = await api.integrations.update(id, integrationData, token);
      if (updated) {
        setIntegrations(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i));
        toast.success("Integration updated successfully!");
        return true;
      }
      return false;
    } catch (e: any) {
      toast.error(`Failed to update integration: ${e.message}`);
      return false;
    }
  };

  // ── Ticket CRUD ────────────────────────────────────────────────────────────
  const addTicket = async (data: Partial<Ticket>): Promise<Ticket | null> => {
    const newTicket: Ticket = {
      id: uid("t"), status: "Open",
      createdAt: new Date().toISOString().split("T")[0],
      title: "", priority: "Medium", category: "Integration",
      ...data,
    } as Ticket;
    const payload = {
      title: newTicket.title || "",
      category: newTicket.category || "General",
      priority: newTicket.priority || "Medium",
      status: newTicket.status || "Open",
      description: newTicket.description || "",
      owner_id: newTicket.ownerId || null,
      owner_name: newTicket.ownerName || "",
      created_by: newTicket.ownerId || null,
      assigned_to: newTicket.assignedTo || null,
      assigned_to_name: newTicket.assignedToName || "",
    };
    try {
      const token = getToken();
      const bt = await api.tickets.create(payload, token);
      if (bt) {
        const formatted = {
          ...newTicket,
          id: bt.id,
          createdAt: bt.created_at ? bt.created_at.split("T")[0] : newTicket.createdAt,
        };
        setTickets(prev => [formatted, ...prev]);
        toast.success("Support ticket created!");
        return formatted;
      }
      return null;
    } catch (error: any) {
      toast.error(`Failed to create ticket: ${error.message}`);
      return null;
    }
  };

  const updateTicket = async (id: string, data: Partial<Ticket>): Promise<boolean> => {
    const payload: any = {};
    if (data.title !== undefined) payload.title = data.title;
    if (data.category !== undefined) payload.category = data.category;
    if (data.priority !== undefined) payload.priority = data.priority;
    if (data.status !== undefined) payload.status = data.status;
    if (data.description !== undefined) payload.description = data.description;
    if (data.assignedTo !== undefined) payload.assigned_to = data.assignedTo;
    if (data.assignedToName !== undefined) payload.assigned_to_name = data.assignedToName;

    try {
      const token = getToken();
      await api.tickets.update(id, payload, token);
      setTickets(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
      toast.success("Ticket updated!");
      return true;
    } catch (error: any) {
      toast.error(`Failed to update ticket: ${error.message}`);
      return false;
    }
  };

  const deleteTicket = async (id: string): Promise<boolean> => {
    try {
      const token = getToken();
      await api.tickets.delete(id, token);
      setTickets(prev => prev.filter(t => t.id !== id));
      toast.success("Ticket deleted");
      return true;
    } catch (error: any) {
      toast.error(`Failed to delete ticket: ${error.message}`);
      return false;
    }
  };

  // ── Settings ───────────────────────────────────────────────────────────────
const saveSettings = async (data: UserSettings): Promise<boolean> => {
  console.log("Saving settings to backend:", data);

  const updated = { ...userSettings, ...data };
  setUserSettings(updated);

  if (userProfile?.id) {
    const profileUpdate: any = {};

    // Map settings fields to profile columns
    if (data.name !== undefined) profileUpdate.name = data.name;
    if (data.email !== undefined) profileUpdate.email = data.email;
    if (data.phone !== undefined) profileUpdate.phone = data.phone;
    if (data.company !== undefined) profileUpdate.company = data.company;
    if (data.role !== undefined) profileUpdate.department = data.role;
    if (data.timezone !== undefined) profileUpdate.timezone = data.timezone;
    if (data.language !== undefined) profileUpdate.language = data.language;

    if (Object.keys(profileUpdate).length > 0) {
      try {
        const token = localStorage.getItem("token") || session?.access_token;
        const response = await fetch(
          `${getApiBaseUrl()}/users/${userProfile.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(profileUpdate),
          }
        );

        if (!response.ok) {
          const err = await response.json();
          console.error("Error saving profile:", err);
          toast.error("Failed to save settings: " + (err.error || response.status));
          return false;
        }

        const updatedData = await response.json();
        setUserProfile(prev => prev ? { ...prev, ...profileUpdate } : prev);
        toast.success("Settings saved successfully!");
      } catch (error: any) {
        console.error("Save settings error:", error);
        toast.error("Failed to save settings");
        return false;
      }
    } else {
      toast.success("Settings saved successfully!");
    }
  } else {
    toast.success("Settings saved locally!");
  }

  // Save to localStorage as backup
  localStorage.setItem("userSettings", JSON.stringify(updated));

  return true;
};
  // ── Activity ───────────────────────────────────────────────────────────────
const addActivity = async (data: Partial<Activity>): Promise<void> => {
    const newAct: Activity = {
      id: uid("a"), type: "note", user: currentUser.name,
      action: "", target: "", value: null, time: "Just now",
      ...data,
    };
    setActivities(prev => [newAct, ...prev].slice(0, 50));
  };

const resetDatabase = async (): Promise<void> => {
  try {
    toast.info("Resetting database...");
    
    // Yeh fetch backend se DELETE request bhejega
    const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/reset-database`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Reset failed from server");
    }

    // Data refresh karo
    await importLeads();
    await importDeals();
    await loadUsers();

    toast.success("Database reset complete!");
    setTimeout(() => window.location.reload(), 1500);
  } catch (error: any) {
    console.error("Reset error:", error);
    toast.error("Failed to reset database: " + error.message);
  }
};

  
  return (
    <AppContext.Provider value={{
      // Auth
      session, userProfile, authLoading, isAuthenticated, login, signup, logout,
      // Role
      role, setRole,
      currentUser,
      sidebarCollapsed, setSidebarCollapsed,
      notifications: unreadCount,
      notificationItems,
      unreadCount,
      fetchNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      deleteNotification,
      getNotificationsByType,
      getNotificationsByPriority,
      getUnreadNotifications,
      getHighPriorityNotifications,
      getRecentNotifications,
      // Data
      leads, deals, employees, integrations, tickets, activities, userSettings,
      loading, dataReady, backendOnline,
      // Users
      users, usersLoading, createUser, updateUser, deleteUser,
      toggleUserAccess, resetUserPassword, loadUsers,
      // Lead
      addLead, updateLead, deleteLead, bulkDeleteLeads, importLeads,
      // Deal
      addDeal, updateDeal, deleteDeal, convertLeadToDeal, importDeals,
      // Employee
      addEmployee, updateEmployee, deleteEmployee,
      // Integration
      toggleIntegration, syncIntegration,
      addIntegration,      
    updateIntegration,   
      // Ticket
      addTicket, updateTicket, deleteTicket,
      // Settings
      saveSettings, loadSettings,
      // Activity
      addActivity,
      // Utilities
      refreshData, resetDatabase,

      leadComments,
      loadingComments,
      fetchLeadComments,
      addLeadComment,
      updateLeadComment,
      deleteLeadComment,
      revenueForecast,
      refreshRevenueForecast,
      subscription,
      subscriptionLoading,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
