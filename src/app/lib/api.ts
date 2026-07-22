import { salesWiseData } from "../data/mockData";

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl;
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol || "http:";
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${protocol}//${hostname}:5000`;
    }
  }
  return envUrl || 'http://localhost:5000';
}

const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

async function request<T = any>(
  method: string,
  path: string,
  body?: any,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const savedToken = typeof window !== 'undefined'
    ? (localStorage.getItem("vigo_token") || localStorage.getItem("auth_token") || localStorage.getItem("token") || sessionStorage.getItem("vigo_token"))
    : null;
  const activeToken = (token && token !== "local-dev-bypass-token") ? token : (savedToken || publicAnonKey);
  if (activeToken) {
    headers.Authorization = `Bearer ${activeToken}`;
  }

  const BASE = getApiBaseUrl();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${method} ${path} failed (${res.status}): ${errText}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text() as any;
}

export const api = {
  leads: {
    list: (token?: string) => request("GET", "/leads", undefined, token),
    create: (data: any, token?: string) => request("POST", "/leads", data, token),
    update: (id: string, data: any, token?: string) => request("PUT", `/leads/${id}`, data, token),
    convert: (id: string, data: any, token?: string) => request("POST", `/leads/${id}/convert`, data, token),
    delete: (id: string, token?: string) => request("DELETE", `/leads/${id}`, undefined, token),
    bulkDelete: (ids: string[], token?: string) => request("DELETE", "/leads", { ids }, token),
    bulkImport: (leads: any[], token?: string) => request("POST", "/leads/bulk", { leads }, token),
  },
  deals: {
    list: (token?: string) => request("GET", "/deals", undefined, token),
    create: (data: any, token?: string) => request("POST", "/deals", data, token),
    update: (id: string, data: any, token?: string) => request("PUT", `/deals/${id}`, data, token),
    delete: (id: string, token?: string) => request("DELETE", `/deals/${id}`, undefined, token),
  },
  employees: {
    list: (token?: string) => request("GET", "/employees", undefined, token),
    create: (data: any, token?: string) => request("POST", "/employees", data, token),
    update: (id: string, data: any, token?: string) => request("PUT", `/employees/${id}`, data, token),
    delete: (id: string, token?: string) => request("DELETE", `/employees/${id}`, undefined, token),
  },
  integrations: {
    list: (token?: string) => request("GET", "/integrations", undefined, token),
    create: (data: any, token?: string) => request("POST", "/integrations", data, token),
    update: (id: string, data: any, token?: string) => request("PUT", `/integrations/${id}`, data, token),
  },
  tickets: {
    list: (token?: string) => request("GET", "/tickets", undefined, token),
    create: (data: any, token?: string) => request("POST", "/tickets", data, token),
    update: (id: string, data: any, token?: string) => request("PUT", `/tickets/${id}`, data, token),
    delete: (id: string, token?: string) => request("DELETE", `/tickets/${id}`, undefined, token),
  },
  activities: {
    list: (token?: string) => request("GET", "/activities", undefined, token),
    create: (data: any, token?: string) => request("POST", "/activities", data, token),
  },
  settings: {
    get: (userId: string, token?: string) => request("GET", `/settings/${userId}`, undefined, token),
    update: (userId: string, data: any, token?: string) => request("PUT", `/settings/${userId}`, data, token),
  },
  auth: {
    login: (data: any) => request("POST", "/auth/login", data),
    signup: (data: any, token?: string) => request("POST", "/auth/signup", data, token),
    me: (token: string) => request("GET", "/profile", undefined, token),
    profile: (token: string) => request("GET", "/profile", undefined, token),
    setup2FA: (token: string) => request("POST", "/auth/2fa/setup", undefined, token),
    verify2FA: (otpCode: string, token: string) => request("POST", "/auth/2fa/verify", { token: otpCode }, token),
  },
  users: {
    list: (token: string) => request("GET", "/users", undefined, token),
    get: (userId: string, token: string) => request("GET", `/users/${userId}`, undefined, token),
    create: (data: any, token: string) => request("POST", "/users", data, token),
    update: (userId: string, data: any, token: string) => request("PUT", `/users/${userId}`, data, token),
    delete: (userId: string, token: string) => request("DELETE", `/users/${userId}`, undefined, token),
    resetPassword: (userId: string, password: string, token: string) =>
      request("PUT", `/users/${userId}/password`, { password }, token),
    changePassword: (userId: string, data: any, token: string) =>
      request("PUT", `/users/${userId}/change-password`, data, token),
    updateAvatar: (userId: string, avatarUrl: string | null, token: string) =>
      request("PUT", `/users/${userId}/avatar`, { avatar_url: avatarUrl }, token),
    updateSubscription: (userId: string, status: string, token: string) =>
      request("PUT", `/users/${userId}/subscription`, { subscription_status: status }, token),
    updatePaymentMethod: (userId: string, data: { payment_method_id: string; card_last4: string; card_brand: string; payment_method_type: string }, token: string) =>
      request("PUT", `/users/${userId}/payment-method`, data, token),
    removePaymentMethod: (userId: string, token: string) =>
      request("PUT", `/users/${userId}/payment-method`, { payment_method_id: null }, token),
    toggleAccess: (userId: string, isActive: boolean, token: string) =>
      request("PUT", `/users/${userId}/toggle-access`, { isActive }, token),
    // ── Bulk User Actions ── ✅ ADD THIS
    bulkAction: (data: { userIds: string[]; action: string; value?: any }, token: string) =>
      request("POST", "/users/bulk/action", data, token),
  },


  guides: {
    list: (token?: string) => request("GET", "/guides", undefined, token),
    create: (data: any, token?: string) => request("POST", "/guides", data, token),
    update: (id: string, data: any, token?: string) => request("PUT", `/guides/${id}`, data, token),
    delete: (id: string, token?: string) => request("DELETE", `/guides/${id}`, undefined, token),
  },
  leadSources: {
    list: (token: string) => request("GET", "/lead-sources", undefined, token),
    create: (data: any, token: string) => request("POST", "/lead-sources", data, token),
    update: (id: string, data: any, token: string) => request("PUT", `/lead-sources/${id}`, data, token),
  },
  leadPages: {
    list: (token: string) => request("GET", "/lead-pages", undefined, token),
    create: (data: any, token: string) => request("POST", "/lead-pages", data, token),
    update: (id: string, data: any, token: string) => request("PUT", `/lead-pages/${id}`, data, token),
    delete: (id: string, token: string) => request("DELETE", `/lead-pages/${id}`, undefined, token),
  },
  faqs: {
    list: (token?: string) => request("GET", "/faqs", undefined, token),
  },
  adConnections: {
    list: (token: string) => request("GET", "/ad-connections", undefined, token),
    create: (data: any, token: string) => request("POST", "/ad-connections", data, token),
    delete: (id: string, token: string) => request("DELETE", `/ad-connections/${id}`, undefined, token),
    sync: (id: string, token: string) => request("POST", `/ad-connections/${id}/sync`, undefined, token),
    updateCount: (platform: string, leadsCount: number, cost: number, token: string) =>
      request("PUT", "/ad-connections/update-count", { platform, leadsCount, cost }, token),
  },
  sessions: {
    list: (userId: string, token: string) => request("GET", `/user-sessions/${userId}`, undefined, token),
    create: (data: any, token: string) => request("POST", "/user-sessions", data, token),
    delete: (id: string, token: string) => request("DELETE", `/user-sessions/${id}`, undefined, token),
  },
  invoices: {
    list: (userId: string, token: string) => request("GET", `/invoices/${userId}`, undefined, token),
  },


  comments: {
    /**
     * Fetch all comments for a lead
     */
    list: (leadId: string, token?: string) =>
      request("GET", `/leads/${leadId}/comments`, undefined, token),

    /**
     * Add a new comment to a lead
     */
    create: (leadId: string, data: { comment: string; parent_comment_id?: string }, token?: string) =>
      request("POST", `/leads/${leadId}/comments`, data, token),

    /**
     * Edit an existing comment
     */
    update: (leadId: string, commentId: string, data: { comment: string }, token?: string) =>
      request("PUT", `/leads/${leadId}/comments/${commentId}`, data, token),

    /**
     * Delete a comment
     */
    delete: (leadId: string, commentId: string, token?: string) =>
      request("DELETE", `/leads/${leadId}/comments/${commentId}`, undefined, token),
  },

  notifications: {
    list: (token?: string) => request("GET", "/notifications", undefined, token),
    getUnreadCount: (token?: string) => request("GET", "/notifications/unread-count", undefined, token),
    markRead: (id: string, token?: string) => request("POST", `/notifications/${id}/read`, undefined, token),
    markAllRead: (token?: string) => request("POST", "/notifications/read-all", undefined, token),
    delete: (id: string, token?: string) => request("DELETE", `/notifications/${id}`, undefined, token),
  },

  // ── Reports API ──
  reports: {
    getSummary: (params?: string, token?: string) => request("GET", `/api/reports/summary${params ? `?${params}` : ""}`, undefined, token),
    getEmployeeWise: (params?: string, token?: string) => request("GET", `/api/reports/employee-wise${params ? `?${params}` : ""}`, undefined, token),
    getStatusWise: (params?: string, token?: string) => request("GET", `/api/reports/status-wise${params ? `?${params}` : ""}`, undefined, token),
    getSalesWise: (params?: string, token?: string) => request("GET", `/api/reports/sales-wise${params ? `?${params}` : ""}`, undefined, token),
    exportCSV: (token?: string) => request("GET", "/api/reports/export/csv", undefined, token),
    exportPDF: (token?: string) => request("GET", "/api/reports/export/pdf", undefined, token),
  },

  auditLogs: {
    list: (params: { page?: number; limit?: number; action?: string; entity_type?: string; user_id?: string }, token?: string) =>
      request("GET", `/api/audit-logs?${new URLSearchParams(params as any).toString()}`, undefined, token),
  },

  // ── Payment Methods - UPDATED FOR PAYU ──
  payments: {
    /**
     * Create a PayU order for one-time payment
     * Returns PayU form data for redirect
     */
    createOrder: (amount: number, currency: string = "INR", receipt?: string, token?: string) =>
      request("POST", "/payments/create-order", { amount, currency, receipt }, token),

    /**
     * Verify PayU payment after redirect
     */
    verify: (data: {
      txnid: string;
      amount: number;
      productinfo: string;
      firstname: string;
      email: string;
      udf1?: string;
      status: string;
      hash: string;
      mihpayid?: string;
      mode?: string;
      bank_ref_num?: string;
      plan?: string;
    }, token?: string) => request("POST", "/payments/verify", data, token),

    /**
     * Create a recurring subscription (manual handling)
     */
    createSubscription: (planId: string, totalCount: number, amount: number, token?: string) =>
      request("POST", "/payments/create-subscription", { planId, totalCount, amount }, token),

    /**
     * Cancel an existing subscription
     */
    cancelSubscription: (subscriptionId: string, token?: string) =>
      request("POST", "/payments/cancel-subscription", { subscriptionId }, token),

    /**
     * Get payment history for a user
     */
    getHistory: (userId: string, token?: string) =>
      request("GET", `/payments/history/${userId}`, undefined, token),
  },

  // ── Subscription API ──
  subscription: {
    status: (token?: string) =>
      request("GET", "/subscription/status", undefined, token),

    trial: (token?: string) =>
      request("GET", "/subscription/trial", undefined, token),

    create: (data: { plan_type: string }, token?: string) =>
      request("POST", "/subscription/create", data, token),

    paymentSuccess: (data: { plan_type: string; payment_id: string; amount: number }, token?: string) =>
      request("POST", "/subscription/payment-success", data, token),

    cancel: (subscriptionId: string, token?: string) =>
      request("POST", "/subscription/cancel", { subscriptionId }, token),
  },

  admin: {
    resetDatabase: (token?: string) => request("DELETE", "/admin/reset-database", undefined, token),
  },
  location: {
    get: () => fetch("https://ipapi.co/json/").then(res => {
      if (!res.ok) throw new Error("Location fetch failed");
      return res.json();
    }),
  },
  sales: {
    getPerformanceData: () => Promise.resolve(salesWiseData),
  },
  reset: (token?: string) => request("POST", "/reset", undefined, token),
};
