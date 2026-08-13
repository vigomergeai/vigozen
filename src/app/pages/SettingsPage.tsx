import React, { useState, useEffect } from "react";

import {
  User, Shield, Bell, Link, CreditCard, Save, Camera,
  Check, X, Eye, EyeOff, Plug, RefreshCw, Key, Bot, Zap,
  Plus, Minus, Trash2, Edit, ChevronRight, Star, Crown, CheckCircle,
  Mail, Phone, Building, Globe, AlertTriangle, Database, RotateCcw, UserCog, ExternalLink, Lock,
  UserCheck, UserX, Calendar, TrendingUp, CreditCard as CreditCardIcon, Users, Download, FileText,
  Facebook, Chrome, Linkedin, Instagram
} from "lucide-react";
import { useNavigate } from "react-router";
import { hasModuleAccess } from "../utils/permissions";
import { priceList as mockPriceList, PriceItem } from "../data/mockData";
import { useApp } from "../context/AppContext";
import { toast } from "sonner";
import QRCode from "qrcode";
import { api, getApiBaseUrl } from "../lib/api";
import { useAdConnections, AdConnection } from "../../hooks/useAdConnections";
import SubscriptionModal from "../components/SubscriptionModal";
import InvoiceHistory from "../components/InvoiceHistory";
// Note: CreditCard is already imported, but you may want to alias it
type SettingsTab = "profile" | "integrations" | "pricing" | "notifications" | "security" | "subscription" | "system";
// ── Ad Platform Configuration ──
const AD_PLATFORMS = [
  {
    platform: "facebook",
    name: "Facebook Ads",
    icon: "facebook",
    desc: "Import leads from Facebook Lead Ad campaigns",
    color: "bg-blue-100 text-blue-700",
    border: "border-blue-200",
    bg: "bg-blue-50"
  },
  {
    platform: "google",
    name: "Google Ads",
    icon: "chrome",
    desc: "Track leads from Google Ads campaigns",
    color: "bg-red-100 text-red-700",
    border: "border-red-200",
    bg: "bg-red-50"
  },
  {
    platform: "linkedin",
    name: "LinkedIn Ads",
    icon: "linkedin",
    desc: "Import B2B leads from LinkedIn",
    color: "bg-sky-100 text-sky-700",
    border: "border-sky-200",
    bg: "bg-sky-50"
  },
  {
    platform: "instagram",
    name: "Instagram Ads",
    icon: "instagram",
    desc: "Import Instagram lead form submissions",
    color: "bg-pink-100 text-pink-700",
    border: "border-pink-200",
    bg: "bg-pink-50"
  },
];

export default function SettingsPage() {
  const {
    role, currentUser, integrations, toggleIntegration, syncIntegration,
    saveSettings, resetDatabase, userSettings, loading, session, userProfile,
    addIntegration, updateIntegration, subscription,
    employees,
    companySubscription,
    companySubscriptionLoading,
    fetchCompanySubscription,
    updateCompanySubscription,
    paymentMethods,
    fetchPaymentMethods,
    addPaymentMethod,
    deletePaymentMethod,
    invoices,
    fetchInvoices,
    activateUser,
    deactivateUser,
    users,
    loadUsers,
    // ── NEW ──
    pricingConfig,
    fetchPricingConfig,
    permissions,
  } = useApp();
  const navigate = useNavigate();  // ← ADD THIS
  const [plans, setPlans] = useState<PriceItem[]>(mockPriceList);
  const priceList = plans;
  const apiKey = (userProfile as any)?.api_key || "sk-leadops-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(userSettings.selectedPlan || "starter");
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showConfirmBar, setShowConfirmBar] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<typeof priceList[0] | null>(null);
  const [selectedPlanBeforeChange, setSelectedPlanBeforeChange] = useState<string | null>(null);
  const [billingHistory, setBillingHistory] = useState<any[]>([]);
  const [notifications, setNotifications] = useState({
    emailLeads: true, emailDeals: true, emailReports: false,
    pushLeads: true, pushDeals: false, pushTeam: true,
    slackIntegration: false, weeklyDigest: true,
    ...(userSettings.notifications || {}),
  });

  const [aiPrefs, setAiPrefs] = useState({
    leadScoring: true, reportSummaries: true, dealForecasting: true, followupReminders: false,
    ...(userSettings.aiPrefs || {}),
  });

  const [passwords, setPasswords] = useState({ current: "", newPass: "", confirm: "" });
  const [showIntegrationModal, setShowIntegrationModal] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<any>(null);
  const [integrationForm, setIntegrationForm] = useState({

    name: "",
    type: "",
    description: "",
    apiKey: "",
    webhookUrl: "",
  });
  const [show2FAModal, setShow2FAModal] = useState(false);  // ADD THIS
  const [twoFACode, setTwoFACode] = useState("");
  //  ADD THIS
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  // ── Ad Connections State ──
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [adIntegrationForm, setAdIntegrationForm] = useState({
    name: "",
    apiKey: "",
    webhookUrl: "",
    description: "",
  });
  const [syncLogs, setSyncLogs] = useState<any[]>([
    { id: 1, time: new Date(Date.now() - 30 * 60 * 1000).toLocaleTimeString(), platform: "Facebook Ads", status: "success", leads: 12, error: "" },
    { id: 2, time: new Date(Date.now() - 15 * 60 * 1000).toLocaleTimeString(), platform: "Google Ads", status: "success", leads: 5, error: "" },
  ]);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoCreateLeads, setAutoCreateLeads] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [adConnections, setAdConnections] = useState<AdConnection[]>([]);
  const [adLoading, setAdLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  // ── Ad Stats State ──
  const [adStats, setAdStats] = useState({
    total_platforms: 0,
    total_leads_imported: 0,
    connected_platforms: 0,
    last_sync_time: null as string | null
  });

  // ── Billing Calculator State ──
  const [purchasedUsers, setPurchasedUsers] = useState(10);
  const activeUsers = companySubscription?.users?.active ?? users?.filter(u => u.isActive).length ?? 0;
  const allowedUsers = (companySubscription as any)?.allowed_users || (companySubscription?.company as any)?.allowed_users || 10;
  const pricePerUser = pricingConfig?.starter_price_per_user || 600;
  const [billingPeriod, setBillingPeriod] = useState('yearly');
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [additionalUsers, setAdditionalUsers] = useState(5); // default +5

  useEffect(() => {
    if ((companySubscription?.company as any)?.purchased_users) {
      setPurchasedUsers((companySubscription.company as any).purchased_users);
    }
  }, [companySubscription]);

  const handlePurchasedUsersChange = (delta: number) => {
    const newCount = purchasedUsers + delta;
    if (newCount >= 1 && newCount <= 100) {
      setPurchasedUsers(newCount);
    }
  };

  // Replace the hardcoded selectedPlanData (around line 190-200) with:
  const selectedPlanData = (() => {
    if (selectedPlan === 'starter') {
      return {
        id: 'starter',
        name: 'Starter Plan',
        price: pricingConfig?.starter_price_per_user || 600,
        description: 'For growing teams and small businesses.',
        users: '1-50 Users'
      };
    }
    return {
      id: 'custom',
      name: 'Custom Plan',
      price: null,
      description: 'Contact Sales for custom pricing based on your business requirements.',
      users: '50+ Users'
    };
  })();
  // Selected period
  const selectedPeriod = ({
    monthly: {
      id: 'monthly',
      label: 'Monthly',
      discount: pricingConfig?.monthly_discount || 0,
      multiplier: 1
    },
    quarterly: {
      id: 'quarterly',
      label: 'Quarterly',
      discount: pricingConfig?.quarterly_discount || 5,
      multiplier: 3
    },
    half_yearly: {
      id: 'half_yearly',
      label: 'Half Yearly',
      discount: pricingConfig?.half_yearly_discount || 10,
      multiplier: 6
    },
    yearly: {
      id: 'yearly',
      label: 'Yearly',
      discount: pricingConfig?.yearly_discount || 15,
      multiplier: 12
    },
  } as any)[billingPeriod] || {
    id: 'monthly',
    label: 'Monthly',
    discount: 0,
    multiplier: 1
  };
  // Pricing calculation
  const pricing = (() => {
    const pricePerUser = pricingConfig?.starter_price_per_user || 600;
    const gstRate = pricingConfig?.gst_rate || 18;

    const basePrice = purchasedUsers * pricePerUser * selectedPeriod.multiplier;
    const discountAmount = basePrice * (selectedPeriod.discount / 100);
    const priceAfterDiscount = basePrice - discountAmount;
    const gstAmount = priceAfterDiscount * (gstRate / 100);
    const total = priceAfterDiscount + gstAmount;
    const perMonth = total / selectedPeriod.multiplier;

    return {
      basePrice,
      discountAmount,
      priceAfterDiscount,
      gst: gstAmount,
      total,
      perMonth,
      gstRate,
      monthsBilled: selectedPeriod.multiplier,
      discountPercent: selectedPeriod.discount
    };
  })();

  // Calculate ADD-ON price
  const addOnPricing = (() => {
    const addOnBase = additionalUsers * pricePerUser * selectedPeriod.multiplier;
    const addOnDiscount = addOnBase * (selectedPeriod.discount / 100);
    const addOnAfterDiscount = addOnBase - addOnDiscount;
    const addOnGst = addOnAfterDiscount * ((pricingConfig?.gst_rate || 18) / 100);
    return {
      total: addOnAfterDiscount + addOnGst,
      perUserPerMonth: pricePerUser
    };
  })();

  const handlePurchase = async (isUpgrade = false) => {
    if (selectedPlan === 'custom') {
      toast.info("Please contact our sales team for custom pricing");
      return;
    }

    setPurchaseLoading(true);
    try {
      const token = localStorage.getItem('token') || session?.access_token;
      if (!token) throw new Error("Not logged in");

      // 1. GENERATE THE INVOICE (Always happens)
      const invoiceData = {
        subscription_id: (companySubscription?.company as any)?.id || 'temp',
        amount: isUpgrade ? addOnPricing.total : pricing.total,
        active_users: isUpgrade ? additionalUsers : purchasedUsers,
        plan: selectedPlan,
        billing_period: billingPeriod,
        is_upgrade: isUpgrade // Flag to tell backend to add seats, not replace plan
      };
      const invoiceResponse = await api.invoices.generate(invoiceData, token);
      console.log('Invoice generated:', invoiceResponse);

      // =====================================================
      // 2. PAYMENT GATEWAY (PayU live)
      // =====================================================
      const payuResponse = await api.payments.createOrder(invoiceResponse.total_amount, "INR", `invoice_${invoiceResponse.id}`, token);
      if (payuResponse.success) {
        submitToPayU(payuResponse.payuUrl, payuResponse.payuData);
      } else {
        throw new Error("Failed to create payment order");
      }
      return; // STOP execution here - redirect to PayU handles the rest

    } catch (error: any) {
      toast.error(error.message || 'Transaction failed (Test Mode)');
      console.error(error);
    } finally {
      setPurchaseLoading(false);
    }
  };

  // ── Handle Invoice Download ──
  const handleDownloadInvoice = async (invoiceId: string) => {
    try {
      const token = localStorage.getItem('token') || session?.access_token;
      if (!token) throw new Error("Not logged in");

      const response = await fetch(`${getApiBaseUrl()}/api/invoices/download/${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to download invoice');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Invoice downloaded successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to download invoice');
      console.error('Download error:', error);
    }
  };

  // ── Handle Remove Payment Method ──
  const handleRemovePayment = async (id: string) => {
    if (!confirm('Remove this payment method?')) return;
    try {
      await deletePaymentMethod(id);
      toast.success('Payment method removed');
      await fetchPaymentMethods();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove payment method');
    }
  };

  const fetchActiveSessions = async () => {
    if (!session?.user?.id) return;

    setLoadingSessions(true);
    try {
      const data = await api.sessions.list(session.user.id, session.access_token);
      setSessions(data || []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      toast.error('Failed to load sessions');
    } finally {
      setLoadingSessions(false);
    }
  };
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [secretKey, setSecretKey] = useState("");

  useEffect(() => {
    const fetchPlans = async () => {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const data = await api.plans.list(token);
          setPlans(data || []);
        } catch { setPlans([]); }
      }
    };
    fetchPlans();
  }, [userProfile?.id]);

  // ── Fetch pricing config ──
  useEffect(() => {
    if (userProfile?.id) {
      fetchPricingConfig();
    }
  }, [userProfile?.id]);

  const [profile, setProfile] = useState({
    name: userProfile?.name || currentUser.name,
    email: userProfile?.email || currentUser.email,
    phone: userProfile?.phone || "",
    company: userProfile?.company || "",
    role: userProfile?.department || currentUser.department,
    timezone: userProfile?.timezone || "Asia/Kolkata",
    language: userProfile?.language || "English",
  });
  const getPlanAmount = (plan: string): number => {
    return pricingConfig?.starter_price_per_user || 600;
  };
  // ── Fetch Ad Connections ──
  const fetchAdConnections = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setAdLoading(true);
    try {
      const data = await api.adConnections.list(token);
      setAdConnections(data || []);
      // Load settings from userSettings
      if (userSettings?.ad_auto_sync !== undefined) {
        setAutoSyncEnabled(userSettings.ad_auto_sync);
      }
      if (userSettings?.ad_auto_create !== undefined) {
        setAutoCreateLeads(userSettings.ad_auto_create);
      }
    } catch (error) {
      console.error("Failed to fetch ad connections:", error);
      toast.error("Failed to load ad connections");
    } finally {
      setAdLoading(false);
    }
  };

  // ── Connect Ad Platform ──
  const handleSaveAdIntegration = async () => {
    if (!selectedPlatform || !adIntegrationForm.name) {
      toast.error("Please enter Integration Name and select a platform");
      return;
    }

    const platform = AD_PLATFORMS.find(p => p.platform === selectedPlatform);
    if (!platform) return;

    const token = localStorage.getItem('token');
    if (!token) {
      toast.error("Please log in again");
      return;
    }

    try {
      await api.adConnections.create({
        platform: selectedPlatform,
        platform_name: platform.name,
        name: adIntegrationForm.name,
        api_key: adIntegrationForm.apiKey,
        webhook_url: adIntegrationForm.webhookUrl,
        description: adIntegrationForm.description,
      }, token);

      toast.success(`${adIntegrationForm.name} integration added successfully!`);
      await fetchAdConnections();
      setShowConnectModal(false);
      setAdIntegrationForm({ name: "", apiKey: "", webhookUrl: "", description: "" });
      setSelectedPlatform(null);
    } catch (error: any) {
      console.error("Connection failed:", error);
      toast.error(error.message || "Failed to add integration");
    }
  };

  // ── Connect Ad Platform OAuth ──
  const handleConnectOAuth = async (platform: string) => {
    try {
      const token = localStorage.getItem('token') || session?.access_token;
      if (!token) throw new Error("Not logged in");

      const response = await api.oauth.authorize(platform, token);
      if (response && response.authUrl) {
        window.location.href = response.authUrl;
      } else {
        toast.error("Failed to initiate authorization");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to initiate authorization");
      console.error("OAuth init error:", error);
    }
  };

  // ── Disconnect Ad Platform ──
  const handleDisconnect = async (id: string, platformName: string) => {
    if (!confirm(`Are you sure you want to disconnect ${platformName}?`)) return;

    const token = localStorage.getItem('token');
    if (!token) {
      toast.error("Please log in again");
      return;
    }

    try {
      await api.adConnections.delete(id, token);
      toast.success(`${platformName} disconnected`);
      await fetchAdConnections();
    } catch (error: any) {
      console.error("Disconnect failed:", error);
      toast.error(error.message || "Failed to disconnect");
    }
  };

  // ── Sync Ad Platform ──
  const handleSyncPlatform = async (id: string, platformName: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error("Please log in again");
      return;
    }

    setSyncing(id);
    try {
      const result = await api.adConnections.sync(id, token);
      toast.success(`${platformName} synced! ${result.leads_imported || 0} new leads imported`);
      setSyncLogs(prev => [
        {
          id: Date.now(),
          time: new Date().toLocaleTimeString(),
          platform: platformName,
          status: "success",
          leads: result.leads_imported || 0,
          error: ""
        },
        ...prev
      ]);
      await fetchAdConnections();
    } catch (error: any) {
      console.error("Sync failed:", error);
      toast.error(error.message || "Failed to sync");
      setSyncLogs(prev => [
        {
          id: Date.now(),
          time: new Date().toLocaleTimeString(),
          platform: platformName,
          status: "failed",
          leads: 0,
          error: error.message || "Failed to sync"
        },
        ...prev
      ]);
    } finally {
      setSyncing(null);
    }
  };

  // ── Save Auto-Import Settings ──
  const handleSaveAutoSettings = async () => {
    setSavingSettings(true);
    try {
      await saveSettings({
        ad_auto_sync: autoSyncEnabled,
        ad_auto_create: autoCreateLeads,
      });
      toast.success("Auto-import settings saved");
    } catch (error) {
      console.error("Save settings failed:", error);
      toast.error("Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const getPlanId = (plan: string): string => {
    // Map plan names to Razorpay plan IDs
    const planMap: Record<string, string> = {
      'starter': 'plan_xxxxxxxxxx',
      'professional': 'plan_xxxxxxxxxx',
      'enterprise': 'plan_xxxxxxxxxx',
      'pro': 'plan_xxxxxxxxxx',
      'business': 'plan_xxxxxxxxxx',
    };
    return planMap[plan] || 'plan_xxxxxxxxxx';
  };

  // Capitalize plan type for display
  const formatPlanType = (planType: string | undefined): string => {
    if (!planType) return 'Professional';
    return planType.charAt(0).toUpperCase() + planType.slice(1);
  };


  const submitToPayU = (payuUrl: string, payuData: Record<string, any>) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = payuUrl;
    Object.entries(payuData).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  };

  // ── Check if trial expired ──
  const isLocked = subscription &&
    !subscription.is_trial_active &&
    !subscription.is_subscription_active;

  if (isLocked) {
    return (
      <div className="p-4 lg:p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={40} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Your Trial Has Expired</h2>
          <p className="text-slate-500 mb-6">
            Upgrade to continue managing your account settings and preferences.
          </p>
          <button
            onClick={() => navigate("/billing")}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Upgrade Now →
          </button>
        </div>
      </div>
    );
  }

  const handleAddPaymentMethod = async () => {
    try {
      const token = localStorage.getItem('token') || session?.access_token;
      if (!token) throw new Error("Not logged in");

      // Create order for saving card (minimal amount ₹1)
      const response = await api.payments.createOrder(1, "INR", "save_card", token);

      if (response?.success && response?.payuData && response?.payuUrl) {
        submitToPayU(response.payuUrl, { ...response.payuData, udf2: 'save_card' });
      } else {
        toast.error("Could not create payment order. Please try again.");
      }
    } catch (error) {
      toast.error('Failed to add payment method');
      console.error(error);
    }
  };


  // Reset profile when user changes
  useEffect(() => {
    if (userProfile) {
      setProfile({
        name: userProfile.name || currentUser.name,
        email: userProfile.email || currentUser.email,
        phone: userProfile.phone || "",
        company: userProfile.company || "",
        role: userProfile.department || currentUser.department,
        timezone: userProfile.timezone || "Asia/Kolkata",
        language: userProfile.language || "English",
      });
    }
  }, [currentUser]);
  useEffect(() => {
    setPasswords({ current: "", newPass: "", confirm: "" });
    //setTwoFACode("");
    setSaving(false);
  }, [currentUser]);

  // Load settings from userSettings
  useEffect(() => {
    if (userSettings) {
      setProfile(prev => ({
        ...prev,
        name: userSettings.name || prev.name,
        email: userSettings.email || prev.email,
        phone: userSettings.phone || prev.phone,
        company: userSettings.company || prev.company,
        role: userSettings.role || prev.role,
        timezone: userSettings.timezone || prev.timezone,
        language: userSettings.language || prev.language,
      }));
      if (userSettings.selectedPlan) setSelectedPlan(userSettings.selectedPlan);
      if (userSettings.notifications) setNotifications(n => ({ ...n, ...userSettings.notifications }));
      if (userSettings.aiPrefs) setAiPrefs(a => ({ ...a, ...userSettings.aiPrefs }));
    }
  }, [userSettings]);

  const handleSaveProfile = async () => {
    setSaving(true);
    await saveSettings({ ...profile, selectedPlan, notifications, aiPrefs });
    setSaving(false);
  };
  // Load 2FA status from localStorage on page load
  useEffect(() => {
    if (userProfile?.two_fa_enabled) {
      setTwoFAEnabled(true);
    }
  }, [userProfile]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchActiveSessions();
    }
  }, [session?.user?.id]);

  // ── Handle PayU Callback ──
  useEffect(() => {
    // Check if we're returning from PayU
    const urlParams = new URLSearchParams(window.location.search);
    const txnid = urlParams.get('txnid');
    const status = urlParams.get('status');
    const hash = urlParams.get('hash');
    const mihpayid = urlParams.get('mihpayid');

    if (txnid && status) {
      // Verify payment
      const verifyPayment = async () => {
        try {
          const token = localStorage.getItem('token');
          if (!token) return;

          const result = await api.payments.verify({
            txnid,
            amount: parseFloat(urlParams.get('amount') || '0'),
            productinfo: urlParams.get('productinfo') || '',
            firstname: urlParams.get('firstname') || '',
            email: urlParams.get('email') || '',
            status: status,
            hash: hash || '',
            mihpayid: mihpayid || '',
            plan: urlParams.get('plan') || undefined,
          }, token);

          if (result.success) {
            toast.success('Payment successful!');
            // Remove query params and reload
            window.history.replaceState({}, document.title, window.location.pathname);
            window.location.reload();
          } else {
            toast.error('Payment failed. Please try again.');
          }
        } catch (error) {
          console.error('Payment verification failed:', error);
          toast.error('Payment verification failed');
        }
      };

      verifyPayment();
    }
  }, []);




  // ── Handle OAuth Callback Params ──
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get('connected');
    const error = urlParams.get('error');

    if (connected) {
      toast.success(`${connected.charAt(0).toUpperCase() + connected.slice(1)} Ads connected successfully!`);
      setActiveTab("integrations");
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchAdConnections();
    } else if (error) {
      toast.error(`Connection failed: ${error}`);
      setActiveTab("integrations");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);


  // ── Fetch Ad Connection Stats ──
  useEffect(() => {
    const fetchAdStats = async () => {
      try {
        const token = localStorage.getItem('token') || session?.access_token;
        if (!token) return;

        const stats = await api.adConnections.getStats(token);
        setAdStats(stats);
      } catch (error) {
        console.error('Failed to fetch ad stats:', error);
      }
    };

    if (activeTab === "integrations") {
      fetchAdStats();
    }
  }, [activeTab]);


  // ── Load subscription data ──
  useEffect(() => {
    if (userProfile?.id && role === "org_admin") {
      fetchCompanySubscription();
      fetchPaymentMethods();
      fetchInvoices();
      loadUsers();
      fetchAdConnections();
    }
  }, [userProfile?.id, role]);




  // Fetch billing history from backend
  useEffect(() => {
    const fetchBillingHistory = async () => {
      if (!session?.user?.id) return;
      try {
        const data = await api.invoices.list(session.user.id, session.access_token);
        setBillingHistory(data || []);
      } catch (error) {
        console.error("Error fetching billing history:", error);
        toast.error("Failed to refresh billing history");
      }
    };
    fetchBillingHistory();
  }, [session?.user?.id, session?.access_token]);


  const handleSaveNotifications = async () => {
    setSaving(true);
    await saveSettings({ notifications });
    setSaving(false);
  };

  const handleSavePlan = async () => {
    setSaving(true);
    await saveSettings({ selectedPlan });
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (!passwords.current || !passwords.newPass) {
      toast.error("Please fill in all password fields");
      return;
    }

    if (passwords.newPass !== passwords.confirm) {
      toast.error("Passwords don't match!");
      return;
    }

    setSaving(true);

    try {
      const userId = userProfile?.id || session?.user?.id;
      const token = localStorage.getItem("token") || session?.access_token;

      if (!userId || !token) throw new Error("Not logged in");

      await api.users.changePassword(userId, {
        currentPassword: passwords.current,
        newPassword: passwords.newPass,
      }, token);

      toast.success("Password changed successfully!");
      setPasswords({ current: "", newPass: "", confirm: "" });
      await saveSettings({ passwordUpdated: new Date().toISOString() });

    } catch (error: any) {
      console.error("Password change error:", error);
      toast.error(error.message || "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          let width = img.width;
          let height = img.height;
          const maxSize = 200;

          if (width > height) {
            if (width > maxSize) {
              height = (height * maxSize) / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              reject(new Error('Compression failed'));
            }
          }, 'image/jpeg', 0.7);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadStatus({ type: 'error', message: 'Image must be less than 5MB.' });
      event.target.value = '';
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setUploadStatus({ type: 'error', message: 'Please select an image file.' });
      event.target.value = '';
      return;
    }

    setUploadingAvatar(true);
    setUploadStatus(null);

    try {
      // Compress image
      const compressedFile = await compressImage(file);

      // Get token and userId
      const token = localStorage.getItem('token') || session?.access_token;
      const userId = userProfile?.id || session?.user?.id;

      if (!userId || !token) {
        throw new Error("Not logged in");
      }

      // Create FormData
      const formData = new FormData();
      formData.append('avatar', compressedFile);

      // Upload
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/users/${userId}/avatar/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      // Parse response
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('Invalid server response');
      }

      // Check success
      if (response.ok && data.success) {
        // Update local state with new avatar URL
        const avatarUrl = data.avatar_url || data.avatarUrl;

        // Update userProfile
        if (userProfile) {
          userProfile.avatar_url = avatarUrl;
        }

        // Update localStorage
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({
          ...storedUser,
          avatar_url: avatarUrl
        }));

        // Force re-render by updating profile state
        setProfile(prev => ({
          ...prev,
          // This will trigger re-render of avatar
        }));

        toast.success('Photo updated successfully!');
        setUploadStatus({ type: 'success', message: 'Photo updated successfully.' });

        // Auto-hide success message after 3 seconds
        setTimeout(() => setUploadStatus(null), 3000);
      } else {
        throw new Error(data.error || data.message || 'Upload failed');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadStatus({
        type: 'error',
        message: error.message || 'Unable to upload image.'
      });
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    if (!window.confirm("Are you sure you want to delete your profile picture?")) return;

    setUploadingAvatar(true);
    setUploadStatus(null);

    try {
      const userId = userProfile?.id || session?.user?.id;
      if (!userId) throw new Error("Not logged in");

      const token = localStorage.getItem("token") || session?.access_token;
      if (!token) throw new Error("Token missing");

      const response = await fetch(`${getApiBaseUrl()}/users/${userId}/avatar`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      // Check if response is OK
      if (!response.ok) {
        let errorMsg = 'Failed to delete avatar';
        try {
          const errData = await response.json();
          errorMsg = errData.error || errorMsg;
        } catch { }
        throw new Error(errorMsg);
      }

      let result;
      try {
        result = await response.json();
      } catch {
        // If response is empty or invalid, still consider it success
        result = { success: true };
      }

      // Update local state
      if (userProfile) {
        userProfile.avatar_url = null;
      }

      // Update localStorage
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({
        ...storedUser,
        avatar_url: null
      }));

      // Force re-render
      setProfile(prev => ({ ...prev }));

      toast.success("Profile picture removed!");
      setUploadStatus({ type: 'success', message: 'Photo removed successfully.' });
      setTimeout(() => setUploadStatus(null), 3000);

    } catch (error: any) {
      console.error("Delete error:", error);
      setUploadStatus({ type: 'error', message: error.message || 'Unable to remove photo.' });
    } finally {
      setUploadingAvatar(false);
    }
  };
  const handleOpen2FAModal = async () => {

    // Get fresh token from Supabase
    const accessToken = session?.access_token;

    if (!accessToken) {
      toast.error("Please log in again");
      return;
    }

    try {
      const data = await api.auth.setup2FA(accessToken);
      const qr = await QRCode.toDataURL(data.otpauth_url);
      setQrCode(qr);
      setSecretKey(data.secret);
      setShow2FAModal(true);
    } catch (error: any) {
      console.error("2FA Setup Error:", error);
      toast.error("Failed to setup 2FA");
    }
  };


  const handleEnable2FA = async () => {
    if (twoFACode.length !== 6) {
      toast.error("Enter 6-digit code");
      return;
    }

    if (verifying2FA) return;

    const accessToken = session?.access_token;

    if (!accessToken) {
      toast.error("Session expired. Please log in again.");
      return;
    }

    setVerifying2FA(true);
    try {
      await api.auth.verify2FA(twoFACode, accessToken);
      setTwoFAEnabled(true);
      toast.success("2FA enabled!");
      setShow2FAModal(false);
      setTwoFACode("");
      setQrCode("");
      setSecretKey("");
    } catch (error: any) {
      console.error("2FA Error:", error);
      toast.error(error?.message || "Invalid OTP. Try again.");
    } finally {
      setVerifying2FA(false);
    }
  };
  // Revoke a session
  const revokeSession = async (sessionId: string, deviceName: string) => {
    try {
      await api.sessions.delete(sessionId, session?.access_token || "");
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      toast.success(`${deviceName} session revoked!`);
    } catch (error) {
      console.error('Revoke failed:', error);
      toast.error('Failed to revoke session');
    }
  };
  const handleReset = async () => {
    setShowResetConfirm(false);
    setResetting(true);
    toast.info("Resetting database...", { duration: 3000 });
    await resetDatabase();
    setResetting(false);
  };
  const handleSaveIntegration = async () => {
    if (!integrationForm.name || !integrationForm.type) {
      toast.error("Please fill in required fields");
      return;
    }

    setSaving(true);

    try {
      if (editingIntegration) {
        // Update existing integration using context function
        await updateIntegration(editingIntegration.id, {
          name: integrationForm.name,
          type: integrationForm.type,
          description: integrationForm.description,
        });
        toast.success(`${integrationForm.name} updated successfully!`);
      } else {
        // Create new integration using context function
        const newIntegration = await addIntegration({
          name: integrationForm.name,
          type: integrationForm.type,
          description: integrationForm.description,
        });
        console.log("New integration created:", newIntegration);
        toast.success(`${integrationForm.name} added successfully!`);
      }

      setShowIntegrationModal(false);
      resetIntegrationForm();

    } catch (error) {
      console.error("Save failed:", error);
      toast.error("Failed to save integration");
    } finally {
      setSaving(false);
    }
  };
  const resetIntegrationForm = () => {
    setEditingIntegration(null);
    setIntegrationForm({
      name: "",
      type: "",
      description: "",
      apiKey: "",
      webhookUrl: "",
    });
  };

  const openAddIntegrationModal = () => {
    resetIntegrationForm();
    setShowIntegrationModal(true);
  };

  const openEditIntegrationModal = (integration: any) => {
    setEditingIntegration(integration);
    setIntegrationForm({
      name: integration.name,
      type: integration.type,
      description: integration.description,
      apiKey: "",
      webhookUrl: "",
    });
    setShowIntegrationModal(true);
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType; permissionRequired?: boolean }[] = [
    { id: "profile", label: "Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "integrations", label: "Lead Integrations", icon: Plug, permissionRequired: true },
    { id: "pricing", label: "Price List", icon: CreditCard, permissionRequired: true },
    { id: "security", label: "Security", icon: Shield },
    { id: "system", label: "System", icon: Database, permissionRequired: true },
  ];
  const billingGroups = ["CRM Plans",];

  return (
    <div className="p-4 lg:p-6 max-w-[1600px]">
      <div className="mb-6">
        <h1 className="text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your account, integrations, and preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-56 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-br from-indigo-50 to-purple-50">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold">{currentUser.avatar}</div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{profile.name || currentUser.name}</div>
                  <div className="text-[10px] text-slate-500 capitalize">{role} · {profile.role || currentUser.department}</div>
                </div>
              </div>
            </div>
            <nav className="p-2">
              {tabs.filter(t => !t.permissionRequired || hasModuleAccess(permissions, 'settings', ['full'])).map(tab => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm ${activeTab === tab.id ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"}`}>
                    <Icon size={15} />{tab.label}
                    {activeTab === tab.id && <ChevronRight size={13} className="ml-auto" />}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* ===== PROFILE ===== */}
          {activeTab === "profile" && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-slate-800 mb-6">Personal Information</h3>
                {/* ===== PROFILE PICTURE SECTION ===== */}
                <div className="flex items-start gap-6 mb-6 pb-6 border-b border-slate-100">
                  {/* Avatar - LARGER (96px) */}
                  <div className="relative">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold overflow-hidden">
                      {userProfile?.avatar_url ? (
                        <img
                          src={userProfile?.avatar_url ? (
                            userProfile.avatar_url.startsWith('http') ?
                              userProfile.avatar_url :
                              `${getApiBaseUrl()}${userProfile.avatar_url}`
                          ) : ''}
                          alt={profile?.name || 'User'}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              parent.innerHTML = profile?.name?.[0] || 'V';
                            }
                          }}
                        />
                      ) : (
                        profile?.name?.[0] || 'V'
                      )}
                    </div>
                  </div>

                  {/* User Info + Actions */}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{profile?.name || 'User'}</h3>
                    <p className="text-sm text-gray-500 mb-3">{profile?.email || 'user@example.com'}</p>

                    <div className="flex items-center gap-3">
                      {/* Upload Button - Outlined style */}
                      <label className="px-4 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 hover:border-indigo-300 cursor-pointer transition-colors">
                        {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarUpload}
                          disabled={uploadingAvatar}
                        />
                      </label>

                      {/* Remove Button - Only if avatar exists */}
                      {userProfile?.avatar_url && (
                        <button
                          onClick={handleDeleteAvatar}
                          disabled={uploadingAvatar}
                          className="text-sm text-gray-400 hover:text-red-500 transition-colors bg-transparent border-0 cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Status Messages */}
                    {uploadStatus && (
                      <p className={`mt-2 text-sm ${uploadStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {uploadStatus.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { k: "name", label: "Full Name", icon: User, ph: "Your name" },
                    { k: "email", label: "Email Address", icon: Mail, ph: "your@email.com" },
                    { k: "phone", label: "Phone Number", icon: Phone, ph: "+91 98765 43210" },
                    { k: "company", label: "Company", icon: Building, ph: "Your company" },
                    { k: "role", label: "Department / Role", icon: Shield, ph: "Sales Manager" },
                    { k: "timezone", label: "Timezone", icon: Globe, ph: "Asia/Kolkata" },
                  ].map(({ k, label, icon: Icon, ph }) => (
                    <div key={k}>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
                      <div className="relative">
                        <Icon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 " />
                        <input value={(profile as any)[k]} onChange={e => setProfile(p => ({ ...p, [k]: e.target.value }))} placeholder={ph} className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
                  <button onClick={handleSaveProfile} disabled={saving} className="px-6 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50">
                    {saving ? <><RefreshCw size={13} className="animate-spin" />Saving...</> : <><Save size={14} />Save Changes</>}
                  </button>
                  <button onClick={() => setProfile({ name: currentUser.name, email: currentUser.email, phone: "+91 98765 43210", company: "LeadOps360 Technologies", role: currentUser.department, timezone: "Asia/Kolkata", language: "English" })} className="px-4 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors">Reset</button>
                </div>
              </div>

              {/* ===== SUBSCRIPTION INFO ===== */}
              {subscription && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-5">
                  <div className="flex items-center gap-2 mb-4">
                    <CreditCard size={16} className="text-indigo-600" />
                    <h3 className="text-slate-800">Subscription</h3>
                    <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium ${subscription.is_subscription_active ? 'bg-emerald-100 text-emerald-700' :
                      subscription.is_trial_active ? 'bg-indigo-100 text-indigo-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                      {subscription.is_subscription_active ? 'Active' :
                        subscription.is_trial_active ? 'Trial' : 'Expired'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-slate-400">Current Plan</p>
                      <p className="text-sm font-semibold text-slate-800 capitalize mt-1">
                        {subscription.plan_type || 'Free Trial'}
                      </p>
                    </div>
                    {subscription.trial_start && (
                      <div>
                        <p className="text-xs text-slate-400">Started</p>
                        <p className="text-sm text-slate-700 mt-1">
                          {new Date(subscription.trial_start).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {subscription.trial_end && (
                      <div>
                        <p className="text-xs text-slate-400">Expires</p>
                        <p className="text-sm text-slate-700 mt-1">
                          {new Date(subscription.trial_end).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {subscription.days_remaining > 0 && (
                      <div>
                        <p className="text-xs text-slate-400">Days Left</p>
                        <p className="text-sm font-bold text-amber-600 mt-1">{subscription.days_remaining}d</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => navigate('/billing')}
                    className="mt-4 px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    {subscription.is_subscription_active ? 'Manage Plan' : 'Upgrade Plan'}
                  </button>
                </div>
              )}

              {/* AI Preferences */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4"><Bot size={16} className="text-indigo-600" /><h3 className="text-slate-800">AI Preferences</h3></div>
                <div className="space-y-4">
                  {[
                    { k: "leadScoring", label: "AI Lead Scoring", desc: "Automatically score incoming leads using AI" },
                    { k: "reportSummaries", label: "AI Report Summaries", desc: "Generate AI-written summaries for all reports" },
                    { k: "dealForecasting", label: "Predictive Deal Forecasting", desc: "Use AI to forecast deal outcomes" },
                    { k: "followupReminders", label: "Smart Follow-up Reminders", desc: "AI-triggered reminders based on lead behavior" },
                  ].map(pref => (
                    <div key={pref.k} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                      <div>
                        <div className="text-sm font-medium text-slate-800">{pref.label}</div>
                        <div className="text-xs text-slate-400">{pref.desc}</div>
                      </div>
                      <button onClick={() => setAiPrefs(p => ({ ...p, [pref.k]: !(p as any)[pref.k] }))} className={`w-11 h-6 rounded-full flex items-center transition-all ${(aiPrefs as any)[pref.k] ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"}`}>
                        <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => saveSettings({ aiPrefs })} className="mt-4 px-4 py-2 text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-100 flex items-center gap-2">
                  <Save size={12} />Save AI Preferences
                </button>
              </div>
            </div>
          )}

          {/* ===== NOTIFICATIONS ===== */}
          {activeTab === "notifications" && (
            <div className="space-y-5">
              {[
                {
                  title: "Email Notifications", icon: Mail,
                  items: [
                    { k: "emailLeads", label: "New Lead Assigned", desc: "Get notified when a lead is assigned to you" },
                    { k: "emailDeals", label: "Deal Status Change", desc: "Notification when a deal moves to a new stage" },
                    { k: "emailReports", label: "Weekly Report Email", desc: "Receive automated weekly performance reports" },
                  ]
                },
                {
                  title: "Push Notifications", icon: Bell,
                  items: [
                    { k: "pushLeads", label: "Hot Lead Alert", desc: "Instant alert when a lead score exceeds 80" },
                    { k: "pushDeals", label: "Deal Won/Lost", desc: "Notification when a deal is closed" },
                    { k: "pushTeam", label: "Team Activity", desc: "Updates from your team members" },
                  ]
                },
                {
                  title: "Automation", icon: Zap,
                  items: [
                    { k: "slackIntegration", label: "Slack Integration", desc: "Send notifications to your Slack workspace" },
                    { k: "weeklyDigest", label: "Weekly AI Digest", desc: "AI-generated summary every Monday morning" },
                  ]
                }
              ].map(section => {
                const SectionIcon = section.icon;
                return (
                  <div key={section.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-4"><SectionIcon size={15} className="text-indigo-600" /><h3 className="text-slate-800">{section.title}</h3></div>
                    <div className="space-y-3">
                      {section.items.map(item => (
                        <div key={item.k} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                          <div>
                            <div className="text-sm font-medium text-slate-800">{item.label}</div>
                            <div className="text-xs text-slate-400">{item.desc}</div>
                          </div>
                          <button onClick={() => setNotifications(n => ({ ...n, [item.k]: !(n as any)[item.k] }))} className={`w-11 h-6 rounded-full flex items-center transition-all ${(notifications as any)[item.k] ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"}`}>
                            <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <button onClick={handleSaveNotifications} disabled={saving} className="px-6 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50">
                {saving ? <><RefreshCw size={13} className="animate-spin" />Saving...</> : <><Save size={14} />Save Notification Settings</>}
              </button>
            </div>
          )}

          {/* ===== INTEGRATIONS ===== */}
          {activeTab === "integrations" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-slate-800 dark:text-white">Ad Platform Connections</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Connect your advertising accounts to auto-import leads</p>
                </div>
              </div>

              {/* Stats Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                  {
                    label: "Connected Platforms",
                    value: adStats.connected_platforms || adConnections.filter(c => c.connected !== false).length,
                    color: "text-emerald-600"
                  },
                  {
                    label: "Total Leads Imported",
                    value: adStats.total_leads_imported || adConnections.reduce((s, c) => s + (c.leads_imported || 0), 0),
                    color: "text-indigo-600"
                  },
                  {
                    label: "Total Ad Spend",
                    value: `₹${Math.floor(adConnections.reduce((s, c) => s + (c.cost_spent || 0), 0)).toLocaleString()}`,
                    color: "text-amber-600"
                  },
                  {
                    label: "Auto-Sync",
                    value: autoSyncEnabled ? "ON" : "OFF",
                    color: autoSyncEnabled ? "text-emerald-600" : "text-slate-400"
                  },
                ].map(stat => (
                  <div key={stat.label} className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm">
                    <div className={`text-base sm:text-lg font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-[10px] sm:text-xs text-slate-400">{stat.label}</div>
                    {stat.label === "Connected Platforms" && adStats.last_sync_time && (
                      <div className="text-[8px] text-slate-300 mt-0.5">
                        Last sync: {new Date(adStats.last_sync_time).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Platform Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {AD_PLATFORMS.map(platform => {
                  const connection = adConnections.find(c => c.platform === platform.platform);
                  const isConnected = connection && connection.connected !== false;

                  return (
                    <div key={platform.platform} className={`bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all ${isConnected ? 'border-emerald-200' : 'border-slate-200'}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${platform.bg} ${platform.color}`}>
                            {platform.icon === 'facebook' && <Facebook size={22} />}
                            {platform.icon === 'chrome' && <Chrome size={22} />}
                            {platform.icon === 'linkedin' && <Linkedin size={22} />}
                            {platform.icon === 'instagram' && <Instagram size={22} />}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-800">{platform.name}</div>
                            <div className="text-xs text-slate-400">{platform.desc}</div>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${isConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                          {isConnected ? 'Connected' : 'Not Connected'}
                        </span>
                      </div>

                      {isConnected && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Account: {connection.account_name || connection.account_id || '—'}</span>
                            <span>{connection.leads_imported || 0} leads imported</span>
                            <span>Last sync: {connection.last_sync ? new Date(connection.last_sync).toLocaleDateString() : 'Never'}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => handleSyncPlatform(connection.id, platform.name)}
                              disabled={syncing === connection.id}
                              className="flex-1 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1"
                            >
                              {syncing === connection.id ? (
                                <><RefreshCw size={11} className="animate-spin" /> Syncing...</>
                              ) : (
                                <><RefreshCw size={11} /> Sync Now</>
                              )}
                            </button>
                            <button
                              onClick={() => handleDisconnect(connection.id, platform.name)}
                              className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                            >
                              Disconnect
                            </button>
                          </div>
                        </div>
                      )}

                      {!isConnected && (
                        <button
                          onClick={() => handleConnectOAuth(platform.platform)}
                          className="mt-3 w-full py-2 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          Connect {platform.name} →
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Auto-Import Settings */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h4 className="text-slate-800 font-semibold mb-4">Auto-Import Settings</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-slate-50">
                    <div>
                      <div className="text-sm font-medium text-slate-800">Auto-sync leads from ads</div>
                      <div className="text-xs text-slate-400">Automatically fetch new leads from connected ad platforms every 15 minutes</div>
                    </div>
                    <button
                      onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                      className={`w-11 h-6 rounded-full flex items-center transition-all ${autoSyncEnabled ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"}`}
                    >
                      <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-3 border-b border-slate-50">
                    <div>
                      <div className="text-sm font-medium text-slate-800">Create leads automatically</div>
                      <div className="text-xs text-slate-400">Automatically add imported leads to your Leads table</div>
                    </div>
                    <button
                      onClick={() => setAutoCreateLeads(!autoCreateLeads)}
                      className={`w-11 h-6 rounded-full flex items-center transition-all ${autoCreateLeads ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"}`}
                    >
                      <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                    </button>
                  </div>

                  <button
                    onClick={handleSaveAutoSettings}
                    disabled={savingSettings}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {savingSettings ? (<><RefreshCw size={13} className="animate-spin" /> Saving...</>) : (<><Save size={13} /> Save Settings</>)}
                  </button>
                </div>
              </div>

              {/* Integration Sync Log */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h4 className="text-slate-800 font-semibold mb-4 flex items-center gap-2">
                  <Database size={16} className="text-indigo-600" />
                  Integration Sync Log
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="py-2.5 px-3 text-xs font-semibold text-slate-400">Time</th>
                        <th className="py-2.5 px-3 text-xs font-semibold text-slate-400">Platform</th>
                        <th className="py-2.5 px-3 text-xs font-semibold text-slate-400">Status</th>
                        <th className="py-2.5 px-3 text-xs font-semibold text-slate-400">Leads</th>
                        <th className="py-2.5 px-3 text-xs font-semibold text-slate-400">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {syncLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-3 text-xs text-slate-500 font-mono">{log.time}</td>
                          <td className="py-3 px-3 text-xs font-medium text-slate-800">{log.platform}</td>
                          <td className="py-3 px-3 text-xs">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${log.status === "success"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${log.status === "success" ? "bg-emerald-500" : "bg-rose-500"}`} />
                              {log.status === "success" ? "Synced" : "Failed"}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-xs font-semibold text-slate-700">{log.leads} leads</td>
                          <td className="py-3 px-3 text-xs text-slate-500">
                            {log.error ? <span className="text-rose-500 flex items-center gap-1"><AlertTriangle size={11} /> {log.error}</span> : "Success"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===== PRICING & SUBSCRIPTION ===== */}
          {activeTab === "pricing" && (
            <div className="space-y-6">

              {/* ── TWO-COLUMN LAYOUT ── */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                {/* ===== LEFT COLUMN (40% = 2/5) ===== */}
                <div className="lg:col-span-2 space-y-4">

                  {/* Current Plan Summary */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Current Plan</p>

                    {(companySubscription as any)?.is_trial_active ? (
                      // --- TRIAL ACTIVE UI ---
                      <div className="mt-2">
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900">Starter Trial</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full mr-1.5" />
                            Free Trial Active
                          </span>
                          <span className="text-xs text-slate-500">Day {3 - ((companySubscription as any).days_remaining || 0)} of 3</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-100 rounded-full h-2 mt-3">
                          <div className="bg-emerald-500 rounded-full h-2" style={{ width: `${((3 - ((companySubscription as any).days_remaining || 0)) / 3) * 100}%` }} />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {((companySubscription as any).days_remaining || 0) > 0 ? `${(companySubscription as any).days_remaining} Days Remaining` : 'Ends today!'}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                          Trial Ends: {(companySubscription as any).trial_end ? new Date((companySubscription as any).trial_end).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    ) : (
                      // --- PAID SUBSCRIPTION UI ---
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between mt-2 gap-3 sm:gap-0">
                        <div className="w-full sm:w-auto">
                          <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                            {formatPlanType(companySubscription?.company?.plan_type)}
                          </h3>
                          <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                            <p>Purchased Users: <span className="font-semibold">{purchasedUsers}</span></p>
                            <p>Billing: <span className="font-semibold capitalize">{selectedPeriod.label}</span></p>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                            Next Renewal: {companySubscription?.company?.subscription_end ? new Date(companySubscription.company.subscription_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                          </p>
                          <button onClick={() => setShowCancelModal(true)} className="text-xs text-red-500 hover:text-red-600 mt-2">Cancel subscription</button>
                        </div>
                        <div className="text-left sm:text-right mt-2 sm:mt-0">
                          <span className="text-2xl sm:text-3xl font-bold text-slate-900">
                            ₹{(purchasedUsers * pricePerUser).toLocaleString()}
                          </span>
                          <span className="text-sm text-slate-400">/month</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Contacts */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Contacts</span>
                      <span className="text-xs text-slate-500">{userProfile?.total_contacts || 0} / 50,000</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                      <div className="bg-indigo-500 rounded-full h-1.5" style={{ width: `${Math.min(((userProfile?.total_contacts || 0) / 50000) * 100, 100)}%` }} />
                    </div>
                  </div>

                  {/* Team Members */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-medium text-slate-700">Team Members</span>
                      <span className="text-[10px] sm:text-xs text-slate-500">
                        {activeUsers} / {allowedUsers} Purchased
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 relative">
                      <div className="bg-indigo-500 rounded-full h-1.5 transition-all" style={{ width: `${Math.min((activeUsers / allowedUsers) * 100, 100)}%` }} />
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">
                      {allowedUsers > 0 ? ((activeUsers / allowedUsers) * 100).toFixed(0) : 0}% of seats used
                    </p>

                    {/* Limit Reached Warning */}
                    {activeUsers >= allowedUsers && (
                      <div className="mt-2 p-1.5 bg-amber-50 border border-amber-200 rounded flex justify-between items-center">
                        <span className="text-[10px] text-amber-700 font-medium">⚠ User Limit Reached</span>
                        <button
                          onClick={() => setShowUpgradeModal(true)}
                          className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded hover:bg-amber-700"
                        >
                          Upgrade
                        </button>
                      </div>
                    )}

                    <button onClick={() => navigate('/admin')} className="text-[10px] sm:text-xs text-indigo-600 hover:text-indigo-700 mt-2 flex items-center gap-1">
                      Manage team <ChevronRight size={13} className="inline-block" />
                    </button>
                  </div>

                  {/* ── NEXT INVOICE ── */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Next Invoice</p>
                    <p className="text-xl font-bold text-slate-900 mt-1">
                      ₹{pricing.total.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Due on {new Date(Date.now() + (selectedPeriod.multiplier * 30) * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>

                  {/* Billing History Panel (Replaced Payment Method Card) */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 overflow-hidden">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                      <span className="text-xs font-semibold text-slate-800 tracking-wider uppercase">Billing History</span>
                      <button
                        onClick={fetchInvoices}
                        className="p-1 hover:bg-slate-50 rounded-lg transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw size={12} className="text-slate-400" />
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                      {invoices.length > 0 ? (
                        invoices.map((invoice) => (
                          <div key={invoice.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-indigo-100 transition-all">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-800">₹{invoice.total_amount}</span>
                                <span className={`text-[8px] px-1.5 py-0.5 rounded-full border font-medium ${invoice.status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                  : invoice.status === 'pending'
                                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                                    : 'bg-red-50 text-red-700 border-red-100'
                                  }`}>
                                  {invoice.status || 'Pending'}
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-500">
                                {invoice.invoice_number} · {new Date(invoice.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </p>
                              <p className="text-[9px] text-indigo-500">
                                {(invoice as any).plan || 'starter'} / {(invoice as any).purchased_users || 'N/A'} Users
                              </p>
                            </div>
                            <button
                              onClick={() => handleDownloadInvoice(invoice.id)}
                              className="p-1.5 hover:bg-white text-indigo-600 rounded-lg border border-transparent hover:border-slate-200 transition-colors"
                              title="Download Invoice"
                            >
                              <FileText size={14} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-slate-400">
                          <FileText size={20} className="text-slate-300 mx-auto mb-1.5" />
                          <p className="text-[10px] font-medium text-slate-400">No invoices available.</p>
                          <p className="text-[9px] text-slate-300 mt-0.5">Invoices appear after purchase.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ===== RIGHT COLUMN (60% = 3/5) ===== */}
                <div className="lg:col-span-3 space-y-6">

                  {/* ── TRIAL BANNER ── */}
                  {(companySubscription as any)?.is_trial_active && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                      <span className="text-lg">🎉</span>
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">Free Trial Active</p>
                        <p className="text-[10px] text-emerald-700">All CRM features are unlocked. {(companySubscription as any).days_remaining} Days Remaining.</p>
                      </div>
                    </div>
                  )}

                  {/* ── CRM PLANS ── */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4">CRM Plans</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Starter Plan */}
                      <div
                        className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${selectedPlan === 'starter'
                          ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                          : 'border-slate-200 hover:border-indigo-200'
                          }`}
                        onClick={() => setSelectedPlan('starter')}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className={`text-sm font-semibold ${selectedPlan === 'starter' ? 'text-indigo-700' : 'text-slate-800'}`}>
                              Standard Plan
                            </span>
                            <p className={`text-xl font-bold mt-1.5 ${selectedPlan === 'starter' ? 'text-indigo-700' : 'text-slate-900'}`}>
                              ₹{pricePerUser}
                              <span className="text-xs font-normal text-slate-400">/user/month</span>
                            </p>
                            <p className="text-xs text-slate-500 mt-1">For growing teams and advanced CRM features.</p>
                            <p className="text-[10px] text-slate-400 mt-1">1-50 Users</p>
                          </div>
                          {selectedPlan === 'starter' && (
                            <CheckCircle size={18} className="text-indigo-600 flex-shrink-0 mt-1" />
                          )}
                        </div>
                      </div>

                      {/* Custom Plan */}
                      <div
                        className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${selectedPlan === 'custom'
                          ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                          : 'border-slate-200 hover:border-indigo-200'
                          }`}
                        onClick={() => setSelectedPlan('custom')}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className={`text-sm font-semibold ${selectedPlan === 'custom' ? 'text-indigo-700' : 'text-slate-800'}`}>
                              Customize Plan
                            </span>
                            <p className={`text-xl font-bold mt-1.5 ${selectedPlan === 'custom' ? 'text-indigo-700' : 'text-slate-900'}`}>
                              Custom Price
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Tailored solutions for your unique business needs.</p>
                            <p className="text-[10px] text-slate-400 mt-1">50+ Users</p>
                          </div>
                          {selectedPlan === 'custom' && (
                            <CheckCircle size={18} className="text-indigo-600 flex-shrink-0 mt-1" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── PAY PERIOD SELECTOR ── */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
                    <p className="text-xs text-slate-400 mb-2">Pay Period</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'monthly', label: 'Monthly', discount: pricingConfig?.monthly_discount || 0 },
                        { id: 'quarterly', label: 'Quarterly', discount: pricingConfig?.quarterly_discount || 5 },
                        { id: 'half_yearly', label: 'Half Yearly', discount: pricingConfig?.half_yearly_discount || 10 },
                        { id: 'yearly', label: 'Yearly', discount: pricingConfig?.yearly_discount || 15 },
                      ].map((period) => {
                        const isSelected = billingPeriod === period.id;
                        return (
                          <button
                            key={period.id}
                            onClick={() => setBillingPeriod(period.id)}
                            className={`px-4 py-2 text-xs rounded-lg border transition-all ${isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                              }`}
                          >
                            {period.label}
                            {period.discount > 0 && (
                              <span className={`ml-1 text-[8px] font-medium ${isSelected ? 'text-indigo-200' : 'text-emerald-600'
                                }`}>
                                Save {period.discount}%
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── MERGED SUBSCRIPTION SUMMARY & CALCULATOR ── */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                    {/* 1. HEADER */}
                    <div className="px-5 py-4 border-b border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-800">Subscription Summary</h3>
                    </div>

                    <div className="p-5 space-y-5">

                      {/* ── SECTION 1: SEATS & USAGE ── */}
                      <div className="flex flex-col gap-3">

                        {/* Purchased Users Selector */}
                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-sm font-medium text-slate-700">Purchased Users</span>
                            <p className="text-[10px] text-slate-400">Select the number of seats you need.</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handlePurchasedUsersChange(-5)}
                              className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors font-bold"
                            >−</button>
                            <span className="text-xl font-bold text-indigo-600 w-12 text-center">{purchasedUsers}</span>
                            <button
                              onClick={() => handlePurchasedUsersChange(5)}
                              className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors font-bold"
                            >+</button>
                          </div>
                        </div>

                        {/* Current Active Users (Read-Only) */}
                        <div className="flex items-center justify-between px-1">
                          <span className="text-xs text-slate-500">Current Active Users (Auto)</span>
                          <span className="text-sm font-semibold text-slate-700">{activeUsers} Active</span>
                        </div>

                        {/* User Limit Warning */}
                        {activeUsers >= purchasedUsers && (companySubscription as any)?.is_subscription_active && (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                            <p className="text-[10px] text-amber-700 font-medium">⚠ User Limit Reached ({activeUsers}/{purchasedUsers})</p>
                            <button onClick={() => navigate('/admin')} className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded hover:bg-amber-700">Upgrade</button>
                          </div>
                        )}

                      </div>

                      <div className="border-t border-slate-200 my-1"></div>

                      {/* ── SECTION 2: SUBSCRIPTION DETAILS ── */}
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <span className="text-slate-500">Plan</span>
                        <span className="text-slate-800 font-medium text-right">{formatPlanType(companySubscription?.company?.plan_type)}</span>

                        <span className="text-slate-500">Billing Cycle</span>
                        <span className="text-slate-800 font-medium text-right capitalize">{selectedPeriod.label}</span>

                        <span className="text-slate-500">Price / User</span>
                        <span className="text-slate-800 font-medium text-right">₹{pricePerUser}</span>

                        <span className="text-slate-500">Months Billed</span>
                        <span className="text-slate-800 font-medium text-right">{pricing.monthsBilled}</span>
                      </div>

                      <div className="border-t border-slate-200 my-1"></div>

                      {/* ── SECTION 3: MATH BREAKDOWN ── */}
                      <div className="space-y-1.5 text-sm">
                        {/* 1. Base Price */}
                        <div className="flex justify-between">
                          <span className="text-slate-500">Base Price ({purchasedUsers} × ₹{pricePerUser} × {pricing.monthsBilled})</span>
                          <span className="text-slate-800">₹{pricing.basePrice.toLocaleString()}</span>
                        </div>

                        {/* 2. Discount */}
                        {pricing.discountAmount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-emerald-600">Discount ({pricing.discountPercent}%)</span>
                            <span className="text-emerald-600">-₹{pricing.discountAmount.toLocaleString()}</span>
                          </div>
                        )}

                        {/* 3. Price After Discount */}
                        <div className="flex justify-between">
                          <span className="text-slate-500">Price After Discount</span>
                          <span className="text-slate-800 font-medium">₹{pricing.priceAfterDiscount.toLocaleString()}</span>
                        </div>

                        {/* 4. GST */}
                        <div className="flex justify-between">
                          <span className="text-slate-500">GST ({pricing.gstRate}%)</span>
                          <span className="text-slate-800">₹{pricing.gst.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="border-t-2 border-slate-300 my-1"></div>

                      {/* ── SECTION 4: FINAL TOTALS ── */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-base font-bold text-slate-900">Total Payable</span>
                          <span className="text-2xl font-bold text-indigo-600">₹{pricing.total.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-slate-400 border-t border-dashed border-slate-200 pt-1.5">
                          <span>Effective Monthly Cost</span>
                          <span className="font-medium text-slate-600">₹{Math.round(pricing.perMonth).toLocaleString()}/month</span>
                        </div>
                      </div>

                      {/* ── SECTION 5: SAVINGS BANNER & BUTTON ── */}
                      {pricing.discountPercent > 0 && (
                        <div className="pt-2">
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 mb-4">
                            <span className="text-xs text-emerald-700 font-medium">
                              Save {pricing.discountPercent}% with {selectedPeriod.label} Subscription
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Action Button */}
                      <button
                        onClick={() => setShowPaymentModal(true)}
                        disabled={purchaseLoading || selectedPlan === 'custom'}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                      >
                        {purchaseLoading ? (
                          <>Processing...</>
                        ) : selectedPlan === 'custom' ? (
                          <>Contact Sales for Custom Pricing</>
                        ) : (
                          <>Activate Subscription ₹{pricing.total.toFixed(0)}</>
                        )}
                      </button>

                    </div>
                  </div>
                </div>
              </div>

              {/* ── CANCEL SUBSCRIPTION MODAL ── */}
              {showCancelModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                  <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-[90%] max-w-sm mx-4 overflow-hidden">
                    <div className="p-4 sm:p-6 text-center">
                      <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                        <AlertTriangle size={18} className="sm:text-2xl text-red-500" />
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-1 sm:mb-2">Cancel Subscription?</h3>
                      <p className="text-xs sm:text-sm text-slate-500 mb-4 sm:mb-6">
                        You will lose access to all premium features after the current billing period ends.
                      </p>
                      <div className="flex gap-2 sm:gap-3">
                        <button
                          onClick={() => setShowCancelModal(false)}
                          className="flex-1 py-2 sm:py-2.5 text-xs sm:text-sm border border-slate-200 text-slate-600 rounded-lg sm:rounded-xl hover:bg-slate-50 transition-colors"
                        >
                          Keep Plan
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem('token') || session?.access_token;
                              if (!token) throw new Error("Not logged in");

                              await api.subscription.cancel(token);
                              toast.success('Subscription cancelled successfully');
                              await fetchCompanySubscription();
                              setShowCancelModal(false);
                            } catch (error: any) {
                              toast.error(error.message || 'Failed to cancel subscription');
                            }
                          }}
                          className="flex-1 py-2 sm:py-2.5 text-xs sm:text-sm bg-red-600 text-white rounded-lg sm:rounded-xl hover:bg-red-700 transition-colors"
                        >
                          Confirm Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── PURCHASE CONFIRMATION MODAL ── */}
              {showPaymentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                  <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-md overflow-hidden">
                    <div className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                        <CreditCard size={24} className="text-indigo-600" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 mb-2">Confirm Purchase</h3>

                      <div className="bg-slate-50 rounded-lg p-4 text-left text-xs space-y-2 mb-6">
                        <div className="flex justify-between"><span className="text-slate-500">Plan</span><span className="font-medium text-slate-800">Starter Plan</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Billing</span><span className="font-medium text-slate-800 capitalize">{selectedPeriod.label}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Purchased Users</span><span className="font-medium text-slate-800">{purchasedUsers}</span></div>
                        <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between">
                          <span className="font-bold text-slate-800">Total</span>
                          <span className="font-bold text-indigo-600">₹{pricing.total.toFixed(0)}</span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50">Cancel</button>
                        <button onClick={() => { setShowPaymentModal(false); handlePurchase(); }} disabled={purchaseLoading} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                          {purchaseLoading ? 'Processing...' : 'Confirm Purchase'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── UPGRADE MODAL JSX ── */}
              {showUpgradeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Need More Users?</h3>

                    <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1 mb-4">
                      <div className="flex justify-between"><span>Current Plan</span><span className="font-medium">{formatPlanType(companySubscription?.company?.plan_type)}</span></div>
                      <div className="flex justify-between"><span>Current Users</span><span className="font-medium">{activeUsers} / {allowedUsers}</span></div>
                    </div>

                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm font-medium text-slate-600">Add Users:</span>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setAdditionalUsers(Math.max(1, additionalUsers - 5))} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold">-</button>
                        <span className="text-lg font-bold w-10 text-center">{additionalUsers}</span>
                        <button onClick={() => setAdditionalUsers(additionalUsers + 5)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold">+</button>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3 mb-4">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>{additionalUsers} × ₹{addOnPricing.perUserPerMonth} × {selectedPeriod.multiplier} mo</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold mt-1">
                        <span>Additional Cost:</span>
                        <span className="text-indigo-600">₹{addOnPricing.total.toFixed(0)}</span>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => setShowUpgradeModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                      <button
                        onClick={() => handlePurchase(true)} // Points to upgrade purchase flow
                        className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700 transition-colors"
                      >
                        Upgrade Users
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}




          {/* ===== SECURITY ===== */}
          {activeTab === "security" && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4"><Key size={15} className="text-indigo-600" /><h3 className="text-slate-800">Change Password</h3></div>
                <div className="space-y-4 max-w-md">
                  {[{ k: "current", label: "Current Password" }, { k: "newPass", label: "New Password" }, { k: "confirm", label: "Confirm New Password" }].map(f => (
                    <div key={f.k}>
                      <label className="block text-xs text-slate-500 mb-1.5">{f.label}</label>
                      <div className="relative">
                        <input type={showPassword ? "text" : "password"} value={(passwords as any)[f.k]} onChange={e => setPasswords(p => ({ ...p, [f.k]: e.target.value }))} placeholder="••••••••••" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 pr-10" />
                        <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                  {passwords.newPass && passwords.confirm && passwords.newPass !== passwords.confirm && (
                    <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={11} />Passwords don't match</p>
                  )}
                  <button onClick={handleChangePassword} disabled={saving || !passwords.current || !passwords.newPass || passwords.newPass !== passwords.confirm} className="px-6 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50">
                    {saving ? <><RefreshCw size={13} className="animate-spin" />Updating...</> : <><Shield size={14} />Update Password</>}
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4"><Shield size={15} className="text-indigo-600" /><h3 className="text-slate-800">Two-Factor Authentication</h3></div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <div className="text-sm font-medium text-slate-800">Authenticator App</div>
                    <div className="text-xs text-slate-400">Use Google Authenticator or Authy</div>
                  </div>

                  <button
                    onClick={handleOpen2FAModal}
                    className="px-4 py-2 text-xs bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    {twoFAEnabled ? "✅ 2FA Enabled" : "Enable 2FA"}
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Globe size={15} className="text-indigo-600" />
                  <h3 className="text-slate-800">Active Sessions</h3>
                </div>

                {loadingSessions ? (
                  <div className="text-center py-8">
                    <RefreshCw size={24} className="animate-spin text-indigo-500 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Loading sessions...</p>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-slate-400">No active sessions found</p>
                  </div>
                ) : (
                  sessions.map((sessionItem: any) => (
                    <div key={sessionItem.id} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                      <div>
                        <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                          {sessionItem.device}
                          {sessionItem.is_current && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          {sessionItem.location} · {new Date(sessionItem.last_active).toLocaleString()}
                        </div>
                      </div>
                      {!sessionItem.is_current && (
                        <button
                          onClick={() => revokeSession(sessionItem.id, sessionItem.device)}
                          className="text-xs text-red-500 hover:text-red-600 px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {/* ===== SYSTEM (Admin only) ===== */}
          {activeTab === "system" && role === "org_admin" && (
            <div className="space-y-5">
              {/* Admin Panel Quick Link */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
                  <UserCog size={22} className="text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-purple-900">User Access Management</div>
                  <div className="text-xs text-purple-600 mt-0.5">Create users, assign roles, and manage access permissions</div>
                </div>
                <button
                  onClick={() => { window.location.href = "/admin"; }}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded-xl hover:bg-purple-700 flex items-center gap-2 transition-colors"
                >
                  Open Admin Panel <ExternalLink size={13} />
                </button>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-2"><Database size={15} className="text-indigo-600" /><h3 className="text-slate-800">Database Management</h3></div>
                <p className="text-sm text-slate-500 mb-6">Manage your LeadOps360 database. Reset to sample data for testing.</p>
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                    <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-amber-800">Reset to Sample Data</div>
                      <div className="text-xs text-amber-700 mt-0.5">This will delete all current leads, deals, tickets and activities, then restore default sample data. This cannot be undone.</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    disabled={resetting}
                    className="px-5 py-2.5 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 flex items-center gap-2 disabled:opacity-50"
                  >
                    {resetting ? <><RefreshCw size={14} className="animate-spin" />Resetting...</> : <><RotateCcw size={14} />Reset Database</>}
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-slate-800 mb-4">System Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Version", value: "v3.4.1" },
                    { label: "Environment", value: "Production" },
                    { label: "Database", value: "PostgreSQL (AWS RDS)" },
                    { label: "AI Engine", value: "GPT-4 Turbo" },
                    { label: "Uptime", value: "99.9%" },
                    { label: "Region", value: "ap-south-1" },
                  ].map(info => (
                    <div key={info.label} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <div className="text-xs text-slate-400 mb-1">{info.label}</div>
                      <div className="text-sm font-medium text-slate-800">{info.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* ===== SUBSCRIPTION ===== */}
          {activeTab === "subscription" && role === "org_admin" && (
            <div className="space-y-5">
              {/* Subscription Overview */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-indigo-600" />
                    <h3 className="text-slate-800">Subscription Management</h3>
                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-medium ${companySubscription?.company?.subscription_status === 'active'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                      }`}>
                      {companySubscription?.company?.subscription_status === 'active' ? 'Active' : 'Trial'}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowSubscriptionModal(true)}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2"
                  >
                    <Edit size={14} /> Change Plan
                  </button>
                </div>

                {companySubscriptionLoading ? (
                  <div className="py-8 flex justify-center">
                    <RefreshCw size={24} className="animate-spin text-indigo-400" />
                  </div>
                ) : companySubscription ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-xs text-slate-400">Current Plan</div>
                      <div className="text-lg font-bold text-slate-800 mt-1 capitalize">
                        {formatPlanType(companySubscription.company?.plan_type)}
                      </div>
                      <div className="text-sm text-slate-500">
                        {companySubscription.company?.billing_period || "Monthly"} ·
                        {companySubscription.company?.auto_renew ? ' Auto-renew ON' : ' Auto-renew OFF'}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-xs text-slate-400">Active Users</div>
                      <div className="text-lg font-bold text-slate-800 mt-1">
                        {companySubscription.active_users || 0}
                      </div>
                      <div className="text-sm text-slate-500">
                        {users?.filter(u => u.isActive).length || 0} active of {users?.length || 0} total
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-xs text-slate-400">Monthly Cost</div>
                      <div className="text-lg font-bold text-indigo-600 mt-1">
                        ₹{companySubscription.pricing?.total?.toLocaleString() || 0}
                      </div>
                      <div className="text-sm text-slate-500">
                        ₹{companySubscription.pricing?.basePrice || 0} × {companySubscription.active_users || 0} users
                        {companySubscription.pricing?.discountPercent && companySubscription.pricing.discountPercent > 0 ? ` (${companySubscription.pricing.discountPercent}% off)` : ""}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <p>No subscription details available</p>
                    <button
                      onClick={() => fetchCompanySubscription()}
                      className="mt-2 text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </div>

              {/* Invoice History */}
              <InvoiceHistory
                invoices={invoices || []}
                loading={false}
                onRefresh={fetchInvoices}
                currency="₹"
              />

              {/* User Management Summary */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users size={16} className="text-indigo-600" />
                  <h3 className="text-slate-800">User Management</h3>
                  <span className="text-xs text-slate-400 ml-auto">
                    {users?.filter(u => u.isActive).length || 0} active · {users?.filter(u => !u.isActive).length || 0} inactive
                  </span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {users?.slice(0, 10).map(user => (
                    <div key={user.id} className="flex items-center justify-between py-2 border-b border-slate-50">
                      <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${user.role === "org_admin"
                          ? "bg-gradient-to-br from-purple-500 to-indigo-600"
                          : "bg-gradient-to-br from-emerald-500 to-teal-600"
                          }`}>
                          {user.name?.charAt(0) || "U"}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{user.name}</div>
                          <div className="text-xs text-slate-400">{user.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${user.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                          }`}>
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                        {user.id !== userProfile?.id && (
                          <button
                            onClick={() => user.isActive ? deactivateUser(user.id) : activateUser(user.id)}
                            className={`p-1 rounded-lg transition-colors ${user.isActive
                              ? "text-red-400 hover:text-red-600 hover:bg-red-50"
                              : "text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50"
                              }`}
                            title={user.isActive ? "Deactivate" : "Activate"}
                          >
                            {user.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {(users?.length || 0) > 10 && (
                    <div className="text-center text-xs text-slate-400 pt-2">
                      +{(users?.length || 0) - 10} more users
                    </div>
                  )}
                </div>
              </div>

              {/* Subscription Modal */}
              <SubscriptionModal
                isOpen={showSubscriptionModal}
                onClose={() => setShowSubscriptionModal(false)}
                currentPlan={formatPlanType(companySubscription?.company?.plan_type)}
                currentPeriod={companySubscription?.company?.billing_period || "monthly"}
                activeUsers={companySubscription?.active_users || 0}
                autoRenew={companySubscription?.company?.auto_renew ?? true}
                onSave={updateCompanySubscription}
              />
            </div>
          )}
        </div>
      </div>
      {/* 2FA Modal */}
      {show2FAModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShow2FAModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-slate-800 text-lg font-semibold">Set Up Two-Factor Authentication</h3>
              <p className="text-xs text-slate-400 mt-0.5">Add an extra layer of security to your account</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Simple Setup Instructions - No QR Code */}
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                {qrCode ? (
                  <img src={qrCode} alt="Scan QR Code" className="w-40 h-40 mx-auto rounded-xl border mb-3" />
                ) : (
                  <div className="w-40 h-40 mx-auto bg-slate-200 rounded-xl animate-pulse mb-3" />
                )}
                <p className="text-xs text-slate-500 mb-2">Scan with Google Authenticator</p>
                <code className="text-sm font-mono font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded block break-all">
                  {secretKey}
                </code>
                <button
                  onClick={() => { navigator.clipboard.writeText(secretKey); toast.success("Copied!"); }}
                  className="mt-2 text-xs text-indigo-600 px-3 py-1 rounded border border-indigo-200 hover:bg-indigo-50"
                >
                  Copy Secret Key
                </button>
                <p className="text-[10px] text-slate-400 mt-2">
                  After scanning, enter the 6-digit verification code below
                </p>
              </div>

              {/* Verification Code Input */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Enter 6-digit verification code</label>
                <input
                  type="text"
                  maxLength={6}
                  value={twoFACode}
                  onChange={(e) => setTwoFACode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="000000"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-center text-lg font-mono"
                  autoFocus
                />
              </div>



              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  Save your backup codes in a safe place. You'll need them if you lose access to your authenticator app.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => {
                  setShow2FAModal(false);
                  setTwoFACode("");
                  setQrCode("");
                  setSecretKey("");
                }}
                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEnable2FA}
                disabled={twoFACode.length !== 6 || verifying2FA}
                className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {verifying2FA ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Enable"
                )}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Reset Confirm */}
      {/* Integration Modal */}
      {showIntegrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowIntegrationModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-slate-800 text-lg font-semibold">
                {editingIntegration ? "Edit Integration" : "Add New Integration"}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Connect your lead sources and automate data import
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Integration Name *</label>
                <input
                  type="text"
                  value={integrationForm.name}
                  onChange={(e) => setIntegrationForm({ ...integrationForm, name: e.target.value })}
                  placeholder="e.g., Facebook Ads, LinkedIn Sales Navigator"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Integration Type *</label>
                <select
                  value={integrationForm.type}
                  onChange={(e) => setIntegrationForm({ ...integrationForm, type: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                >
                  <option value="">Select type</option>
                  <option value="Social Media">Social Media</option>
                  <option value="CRM">CRM</option>
                  <option value="Analytics">Analytics</option>
                  <option value="Email Marketing">Email Marketing</option>
                  <option value="Chat Platform">Chat Platform</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Description</label>
                <textarea
                  value={integrationForm.description}
                  onChange={(e) => setIntegrationForm({ ...integrationForm, description: e.target.value })}
                  placeholder="What does this integration do?"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">API Key / Access Token</label>
                <input
                  type="password"
                  value={integrationForm.apiKey}
                  onChange={(e) => setIntegrationForm({ ...integrationForm, apiKey: e.target.value })}
                  placeholder="Enter your API key"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Webhook URL (Optional)</label>
                <input
                  type="text"
                  value={integrationForm.webhookUrl}
                  onChange={(e) => setIntegrationForm({ ...integrationForm, webhookUrl: e.target.value })}
                  placeholder="https://api.example.com/webhook"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowIntegrationModal(false)}
                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveIntegration}
                disabled={saving || !integrationForm.name || !integrationForm.type}
                className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <><RefreshCw size={13} className="animate-spin" />Saving...</> : <><Save size={14} />Save Integration</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Connect Integration Modal ── */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowConnectModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-slate-800">
                Add {AD_PLATFORMS.find(p => p.platform === selectedPlatform)?.name || 'Integration'}
              </h2>
              <button onClick={() => setShowConnectModal(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-2 gap-4 max-h-[72vh] overflow-y-auto">
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1.5">Platform</label>
                <div className="flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50">
                  <span className="text-lg">{AD_PLATFORMS.find(p => p.platform === selectedPlatform)?.icon}</span>
                  <span className="text-sm font-medium text-slate-700">{AD_PLATFORMS.find(p => p.platform === selectedPlatform)?.name}</span>
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1.5">Integration Name *</label>
                <input
                  type="text"
                  value={adIntegrationForm.name}
                  onChange={(e) => setAdIntegrationForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Facebook Lead Ads"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1.5">API Key / Access Token</label>
                <input
                  type="password"
                  value={adIntegrationForm.apiKey}
                  onChange={(e) => setAdIntegrationForm(f => ({ ...f, apiKey: e.target.value }))}
                  placeholder="Enter your API key or access token"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1.5">Webhook URL (Optional)</label>
                <input
                  type="text"
                  value={adIntegrationForm.webhookUrl}
                  onChange={(e) => setAdIntegrationForm(f => ({ ...f, webhookUrl: e.target.value }))}
                  placeholder="https://api.example.com/webhook"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1.5">Description</label>
                <textarea
                  value={adIntegrationForm.description}
                  onChange={(e) => setAdIntegrationForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What does this integration do?"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50 resize-none"
                />
              </div>

              <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700 flex items-start gap-2">
                  <span className="mt-0.5">🔗</span>
                  After adding, you'll be able to sync leads from this platform. The CRM will store your API key securely.
                </p>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => setShowConnectModal(false)}
                className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAdIntegration}
                className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Add Integration →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
