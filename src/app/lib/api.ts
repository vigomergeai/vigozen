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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();

      // Auto logout if token is invalid or unauthorized
      if (res.status === 401 || (res.status === 403 && (errText.includes("Invalid token") || errText.includes("invalid signature") || errText.includes("jwt expired") || errText.includes("token")))) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem("userProfile");
          localStorage.removeItem("userName");
          localStorage.removeItem("userSettings");
          sessionStorage.removeItem("vigo_token");

          if (!window.location.pathname.includes("/login")) {
            window.location.href = "/login";
          }
        }
      }

      let parsedError = "";
      try {
        const parsed = JSON.parse(errText);
        if (parsed && typeof parsed === "object") {
          parsedError = parsed.error || parsed.message || "";
        }
      } catch (e) {
        // Not a JSON string
      }

      throw new Error(parsedError || `API ${method} ${path} failed (${res.status}): ${errText}`);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res.text() as any;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
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
  support: {
    aiChat: (message: string, token?: string) => request("POST", "/support/ai-chat", { message }, token),
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
    validateInvite: (token: string) => request("GET", `/auth/invite/validate?token=${token}`),
    acceptInvite: (data: { token: string; password: string }) => request("POST", "/auth/invite/accept", data),
    forgotPassword: (email: string) => request("POST", "/auth/forgot-password", { email }),
    resetPassword: (data: { token: string; newPassword: string }) => request("POST", "/auth/reset-password", data),
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
    uploadAvatar: async (userId: string, formData: FormData, token: string) => {
      const BASE = getApiBaseUrl();
      const response = await fetch(`${BASE}/users/${userId}/avatar/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Avatar upload failed: ${response.status} - ${errorText}`);
      }

      return response.json();

    },
    deleteAvatar: async (userId: string, token: string) => {
      const BASE = getApiBaseUrl();
      const response = await fetch(`${BASE}/users/${userId}/avatar`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Avatar deletion failed: ${response.status} - ${errorText}`);
      }

      return response.json();
    },
    updateSubscription: (userId: string, status: string, token: string) =>
      request("PUT", `/users/${userId}/subscription`, { subscription_status: status }, token),
    updatePaymentMethod: (userId: string, data: { payment_method_id: string; card_last4: string; card_brand: string; payment_method_type: string }, token: string) =>
      request("PUT", `/users/${userId}/payment-method`, data, token),
    removePaymentMethod: (userId: string, token: string) =>
      request("PUT", `/users/${userId}/payment-method`, { payment_method_id: null }, token),
    toggleAccess: (userId: string, isActive: boolean, token: string) =>
      request("PUT", `/users/${userId}/toggle-access`, { isActive }, token),
    // ✅ ADD THESE NEW METHODS
    /**
     * Activate a user (makes them active and counted in billing)
     */
    activate: (userId: string, token: string) =>
      request("PUT", `/users/${userId}/activate`, undefined, token),

    /**
     * Deactivate a user (removes them from active billing)
     */
    deactivate: (userId: string, token: string) =>
      request("PUT", `/users/${userId}/deactivate`, undefined, token),

    // ── Bulk User Actions ──
    bulkAction: (data: { userIds: string[]; action: string; value?: any }, token: string) =>
      request("POST", "/users/bulk/action", data, token),
    visibleUsers: (token: string) => request("GET", "/users/visible", undefined, token),

    /**
     * Get available managers for a specific role
     * @param role - The role to find managers for (e.g., "Sales Executive")
     * @param token - Auth token
     */
    availableManagers: (role: string, token: string) =>
      request("GET", `/users/available-managers?role=${encodeURIComponent(role)}`, undefined, token),
  },


  guides: {
    list: (token?: string) => request("GET", "/guides", undefined, token),
    create: (data: any, token?: string) => request("POST", "/guides", data, token),
    update: (id: string, data: any, token?: string) => request("PUT", `/guides/${id}`, data, token),
    delete: (id: string, token?: string) => request("DELETE", `/guides/${id}`, undefined, token),
  },
  plans: {
    list: (token?: string) => request("GET", "/api/plans", undefined, token),
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
    // ── NEW METHODS ──
    getSyncLogs: (id: string, token: string) =>
      request("GET", `/ad-connections/${id}/sync-logs`, undefined, token),
    getStats: (token: string) =>
      request("GET", `/ad-connections/stats`, undefined, token),
  },
  sessions: {
    list: (userId: string, token: string) => request("GET", `/user-sessions/${userId}`, undefined, token),
    create: (data: any, token: string) => request("POST", "/user-sessions", data, token),
    delete: (id: string, token: string) => request("DELETE", `/user-sessions/${id}`, undefined, token),
  },
  invoices: {
    list: (userId: string, token: string) =>
      request("GET", `/invoices/${userId}`, undefined, token),

    download: (invoiceId: string, token: string) =>
      request("GET", `/api/invoices/download/${invoiceId}`, undefined, token),

    generate: (data: any, token: string) =>
      request("POST", "/api/invoices/generate", data, token),
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
    getSummary: (token?: string, start?: string, end?: string) =>
      request("GET", `/api/reports/summary${start && end ? `?startDate=${start}&endDate=${end}` : ''}`, undefined, token),
    getEmployeeWise: (token?: string, start?: string, end?: string) =>
      request("GET", `/api/reports/employee-wise${start && end ? `?startDate=${start}&endDate=${end}` : ''}`, undefined, token),
    getStatusWise: (token?: string, start?: string, end?: string) =>
      request("GET", `/api/reports/status-wise${start && end ? `?startDate=${start}&endDate=${end}` : ''}`, undefined, token),
    getSalesWise: (token?: string, start?: string, end?: string) =>
      request("GET", `/api/reports/sales-wise${start && end ? `?startDate=${start}&endDate=${end}` : ''}`, undefined, token),
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

  // ── Pricing Configuration ──
  pricingConfig: {
    get: (token: string) =>
      request("GET", "/api/pricing-config", undefined, token),

    update: (data: any, token: string) =>
      request("PUT", "/api/pricing-config", data, token),
  },

  subscription: {
    status: (token?: string) => request("GET", "/subscription/status", undefined, token),
    trial: {
      start: (token?: string) => request("POST", "/subscription/trial/start", undefined, token),
      check: (token?: string) => request("GET", "/subscription/trial/check", undefined, token),
    },
    create: (data: { plan_type: string }, token?: string) => request("POST", "/subscription/create", data, token),
    paymentSuccess: (data: { plan_type: string; payment_id: string; amount: number }, token?: string) =>
      request("POST", "/subscription/payment-success", data, token),
    cancel: (token?: string) => request("POST", "/subscription/cancel", undefined, token),
    activateTestMode: (data: any, token: string) => request("POST", "/api/subscription/activate-test-mode", data, token), // ← ADD THIS LINE
  },

  // ── Company Subscription Management ──
  company: {
    /**
     * Get company subscription details with pricing
     */
    getSubscription: (token: string) =>
      request("GET", "/api/company/subscription", undefined, token),

    /**
     * Update company subscription (plan, billing period, auto-renew)
     */
    updateSubscription: (data: { plan_type?: string; billing_period?: string; auto_renew?: boolean }, token: string) =>
      request("PUT", "/api/company/subscription", data, token),

    /**
     * Get pricing calculation
     */
    getPricing: (token: string) =>
      request("GET", "/api/company/subscription/pricing", undefined, token),

    /**
     * Request custom quote
     */
    requestQuote: (data: any, token: string) =>
      request("POST", "/api/company/subscription/quote", data, token),

    /**
     * Get quote status
     */
    getQuoteStatus: (token: string) =>
      request("GET", "/api/company/subscription/quote-status", undefined, token),

    /**
     * Get all invoices for company
     */
    getInvoices: (token: string) =>
      request("GET", "/api/invoices", undefined, token),

    /**
     * Generate a new invoice
     */
    generateInvoice: (data: { subscription_id: string; billing_period_start: string; billing_period_end: string }, token: string) =>
      request("POST", "/api/invoices/generate", data, token),

    /**
     * Get all payment methods
     */
    getPaymentMethods: (token: string) =>
      request("GET", "/api/payment-methods", undefined, token),

    /**
     * Add a new payment method
     */
    addPaymentMethod: (data: { last4: string; brand: string; expiry: string; is_default?: boolean }, token: string) =>
      request("POST", "/api/payment-methods", data, token),

    /**
     * Delete a payment method
     */
    deletePaymentMethod: (id: string, token: string) =>
      request("DELETE", `/api/payment-methods/${id}`, undefined, token),

    /**
     * Set default payment method
     */
    setDefaultPaymentMethod: (id: string, token: string) =>
      request("PUT", `/api/payment-methods/${id}/default`, undefined, token),
  },

  // ── Ad Connections OAuth ──
  oauth: {
    authorize: (platform: string, token: string) =>
      request("GET", `/api/ad-connections/oauth/${platform}/authorize`, undefined, token),

    callback: (platform: string, code: string) =>
      request("GET", `/api/ad-connections/oauth/${platform}/callback?code=${code}`, undefined, undefined),

    refresh: (connectionId: string, token: string) =>
      request("POST", `/oauth/refresh`, { connectionId }, token),
  },


  // ── Invoice Methods ──
  invoice: {
    generate: (data: { subscription_id: string; billing_period_start: string; billing_period_end: string }, token: string) =>
      request("POST", "/api/invoices/generate", data, token),
    download: (id: string, token: string) =>
      request("GET", `/api/invoices/download/${id}`, undefined, token),
    markPaid: (id: string, token: string) =>
      request("POST", `/api/invoices/${id}/mark-paid`, undefined, token),
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
    /**
     * Get sales performance data from backend
     * @param token - Optional auth token
     * @param startDate - Optional start date filter
     * @param endDate - Optional end date filter
     */
    getPerformanceData: (token?: string, startDate?: string, endDate?: string) => {
      let url = "/api/reports/sales-wise";
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      return request("GET", url, undefined, token);
    },
  },
  reset: (token?: string) => request("POST", "/reset", undefined, token),
};
