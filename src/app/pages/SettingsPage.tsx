import React, { useState, useEffect } from "react";
import {
  User, Shield, Bell, Link, CreditCard, Save, Camera,
  Check, X, Eye, EyeOff, Plug, RefreshCw, Key, Bot, Zap,
  Plus, Minus, Trash2, Edit, ChevronRight, Star, Crown, CheckCircle,
  Mail, Phone, Building, Globe, AlertTriangle, Database, RotateCcw, UserCog, ExternalLink

} from "lucide-react";
import { priceList } from "../data/mockData";
import { useApp } from "../context/AppContext";
import { toast } from "sonner";
import QRCode from "qrcode";
import { api, getApiBaseUrl } from "../lib/api";

type SettingsTab = "profile" | "integrations" | "pricing" | "notifications" | "security" | "system";

const integrationIconColors: Record<string, { bg: string; text: string; icon: string }> = {
  FB: { bg: "bg-blue-100", text: "text-blue-700", icon: "f" },
  LI: { bg: "bg-sky-100", text: "text-sky-700", icon: "in" },
  SF: { bg: "bg-cyan-100", text: "text-cyan-700", icon: "☁" },
  HS: { bg: "bg-orange-100", text: "text-orange-700", icon: "H" },
  WF: { bg: "bg-emerald-100", text: "text-emerald-700", icon: "W" },
  GA: { bg: "bg-red-100", text: "text-red-700", icon: "G" },
  WA: { bg: "bg-green-100", text: "text-green-700", icon: "W" },
  ZP: { bg: "bg-amber-100", text: "text-amber-700", icon: "Z" },
};

export default function SettingsPage() {
  const {
    role, currentUser, integrations, toggleIntegration, syncIntegration,
    saveSettings, resetDatabase, userSettings, loading, session, userProfile,
    addIntegration,      // ADD THIS
    updateIntegration    // ADD THIS
  } = useApp();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(userSettings.selectedPlan || "p2");
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showConfirmBar, setShowConfirmBar] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<typeof priceList[0] | null>(null);
  const [selectedPlanBeforeChange, setSelectedPlanBeforeChange] = useState<string | null>(null);
  const [billingHistory, setBillingHistory] = useState<any[]>([]);
  const [userCount, setUserCount] = useState(10);
  const [bundlePrice, setBundlePrice] = useState(1000);
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
  const [loadingSessions, setLoadingSessions] = useState(false);
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
  const [qrCode, setQrCode] = useState("");
  const [secretKey, setSecretKey] = useState("");

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
    const planMap: Record<string, number> = {
      'starter': 499,
      'professional': 999,
      'enterprise': 2499,
      'pro': 999,
      'business': 1499,
    };
    return planMap[plan] || 999;
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

  // ── ADD THIS HANDLER ──
  const handleUserCountChange = (count: number) => {
    setUserCount(count);
    setBundlePrice(calculatePrice(count));
  };

  const calculatePrice = (count: number): number => {
    return count * 100; // ₹100 per user
  };


  // ── ADD THIS HANDLER ──
  const handlePurchaseBundle = async () => {
    try {
      const token = localStorage.getItem('token') || session?.access_token;
      if (!token) throw new Error("Not logged in");

      // Create PayU order
      const response = await api.payments.createOrder(bundlePrice, "INR", `bundle_${userCount}`, token);
      
      if (response && (response.success || response.order_id)) {
        toast.success(`Order ${response.order_id || response.txnid} created!`);
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = response.payuUrl || response.action || "https://test.payu.in/_payment";
        
        const payuData: Record<string, any> = response.payuData || {
          key: response.key || "PAYU_TEST_KEY",
          txnid: response.txnid || response.order_id,
          amount: response.amount || bundlePrice,
          productinfo: "Vigozen CRM Bundle",
          firstname: currentUser.name || "Customer",
          email: currentUser.email || "customer@example.com",
          hash: response.hash || "test_hash",
          surl: `${window.location.origin}/settings?payment=success`,
          furl: `${window.location.origin}/settings?payment=failed`,
        };
        
        Object.keys(payuData).forEach(key => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(payuData[key]);
          form.appendChild(input);
        });
        
        document.body.appendChild(form);
        form.submit();
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create payment');
      console.error(error);
    }
  };

  // ── ADD THIS HANDLER ──
  
  const handleAddPaymentMethod = async () => {
    try {
      const token = localStorage.getItem('token') || session?.access_token;
      if (!token) throw new Error("Not logged in");

      // Create order for saving card (minimal amount ₹1)
      const response = await api.payments.createOrder(1, "INR", "save_card", token);
      
      if (response.success) {
        // Create form and submit to PayU
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = response.payuUrl;
        
        const payuData = response.payuData;
        Object.keys(payuData).forEach(key => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = payuData[key];
          form.appendChild(input);
        });
        
        // Add flag for saving card
        const saveCardInput = document.createElement('input');
        saveCardInput.type = 'hidden';
        saveCardInput.name = 'udf2';
        saveCardInput.value = 'save_card';
        form.appendChild(saveCardInput);
        
        document.body.appendChild(form);
        form.submit();
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
    setTwoFACode("");
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
    // Reset password form
    setPasswords({ current: "", newPass: "", confirm: "" });
    // Reset 2FA code
    setTwoFACode("");
    // Reset saving state
    setSaving(false);
  }, [currentUser]);
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

  // Fetch billing history from backend
  useEffect(() => {
    const fetchBillingHistory = async () => {
      if (!session?.user?.id) return;
      try {
        const data = await api.invoices.list(session.user.id, session.access_token);
        setBillingHistory(data || []);
      } catch (error) {
        console.error("Error fetching billing history:", error);
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

  //const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Please select an image smaller than 2MB");
      return;
    }

    setUploadingAvatar(true);
    toast.info("Compressing and uploading...");

    try {
      const compressedFile = await compressImage(file);
      
      // ── ACTUAL UPLOAD ──
      const token = localStorage.getItem('token') || session?.access_token;
      const userId = userProfile?.id || session?.user?.id;
      
      if (!userId || !token) throw new Error("Not logged in");
      
      const formData = new FormData();
      formData.append('avatar', compressedFile);
      
      const response = await fetch(`${getApiBaseUrl()}/users/${userId}/avatar`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();
      toast.success('Avatar updated successfully');
      
      // Update local state
      if (userProfile) {
        userProfile.avatar_url = data.avatar_url;
      }
      
      // Update localStorage
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({
        ...storedUser,
        avatar_url: data.avatar_url
      }));
      
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload image");
    } finally {
      setUploadingAvatar(false);
    }
  };
  const handleDeleteAvatar = async () => {
    const confirmed = window.confirm("Are you sure you want to delete your profile picture?");
    if (!confirmed) return;

    setUploadingAvatar(true);

    try {
      const userId = userProfile?.id || session?.user?.id;
      if (!userId) throw new Error("Not logged in");

      const token = localStorage.getItem("token") || session?.access_token;
      if (!token) throw new Error("Token missing");
      await api.users.updateAvatar(userId, null, token);

      toast.success("Profile picture deleted!");
      setTimeout(() => window.location.reload(), 500);

    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete profile picture");
    } finally {
      setUploadingAvatar(false);
    }
  };
  const handleOpen2FAModal = async () => {
    if (qrCode && secretKey) {
      setShow2FAModal(true);
      return;
    }
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

    console.log("Verifying code:", twoFACode); // ADD THIS LINE

    // Get fresh token from Supabase
    const accessToken = session?.access_token;

    if (!accessToken) {
      toast.error("Session expired. Please log in again.");
      return;
    }

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
      toast.error("Invalid OTP. Try again.");
    }
  };
  // Revoke a session
  const revokeSession = async (sessionId: string, deviceName: string) => {
    try {
      await api.sessions.delete(sessionId, session?.access_token);
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

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { id: "profile", label: "Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "integrations", label: "Lead Integrations", icon: Plug },
    { id: "pricing", label: "Price List", icon: CreditCard },
    { id: "security", label: "Security", icon: Shield },
    { id: "system", label: "System", icon: Database, adminOnly: true },
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
              {tabs.filter(t => !t.adminOnly || role === "admin").map(tab => {
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
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-semibold">
                      {userProfile?.avatar_url ? (
                        <img
                          src={userProfile.avatar_url}
                          alt="Profile"
                          className="w-20 h-20 rounded-2xl object-cover"
                        />
                      ) : (
                        currentUser.avatar
                      )}
                    </div>

                    {/* Upload Button */}
                    <label className="absolute bottom-0 right-0 w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors cursor-pointer">
                      <Camera size={13} className="text-slate-500" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarUpload}
                        disabled={uploadingAvatar}
                      />
                    </label>

                    {/* Delete Button - Only show if avatar exists */}
                    {userProfile?.avatar_url && (
                      <button
                        onClick={handleDeleteAvatar}
                        disabled={uploadingAvatar}
                        className="absolute -bottom-2 left-0 w-6 h-6 bg-red-500 border border-white rounded-full flex items-center justify-center shadow-sm hover:bg-red-600 transition-colors cursor-pointer"
                        title="Delete picture"
                      >
                        <Trash2 size={10} className="text-white" />
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{profile.name}</div>
                    <div className="text-xs text-slate-500">{profile.email}</div>
                    {/* THIS IS THE CHANGE PHOTO TEXT BUTTON - ADD onClick HERE */}
                    <label className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer">
                      <Camera size={11} />
                      {uploadingAvatar ? "Uploading..." : "Change photo"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarUpload}
                        disabled={uploadingAvatar}
                      />
                    </label>
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
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-slate-800 dark:text-white">Lead Integrations</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Connect your lead sources and sync data automatically</p>
                </div>
                <button
                  onClick={openAddIntegrationModal}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 transition-colors"
                >
                  <Plus size={14} />Add Integration
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Active Connections", value: integrations.filter(i => i.status === "Connected").length, color: "text-emerald-600" },
                  { label: "Total Leads Imported", value: integrations.reduce((s, i) => s + i.leads, 0), color: "text-indigo-600" },
                  { label: "Last Sync", value: loading ? "..." : "1 min ago", color: "text-amber-600" },
                ].map(stat => (
                  <div key={stat.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
                    <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {integrations.map(integ => {
                  const ic = integrationIconColors[integ.icon] || { bg: "bg-slate-100", text: "text-slate-600", icon: integ.icon };
                  return (
                    <div key={integ.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm ${ic.bg} ${ic.text}`}>{ic.icon}</div>
                          <div>
                            <div className="text-sm font-semibold text-slate-800">{integ.name}</div>
                            <div className="text-xs text-slate-400">{integ.type}</div>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${integ.status === "Connected" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : integ.status === "Pending" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${integ.status === "Connected" ? "bg-emerald-500 animate-pulse" : integ.status === "Pending" ? "bg-amber-500" : "bg-slate-400"}`} />
                          {integ.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mb-3">{integ.description}</p>
                      {integ.status === "Connected" && (
                        <div className="flex items-center gap-3 mb-3 text-xs text-slate-500">
                          <span className="bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">{integ.leads} leads imported</span>
                          <span className="bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1"><RefreshCw size={9} />Synced {integ.lastSync}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleIntegration(integ.id)} className={`flex-1 py-2 text-xs rounded-xl font-medium transition-colors ${integ.status === "Connected" ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                          {integ.status === "Connected" ? "Disconnect" : integ.status === "Pending" ? "Configure" : "Connect"}
                        </button>
                        {integ.status === "Connected" && (
                          <>
                            <button onClick={() => syncIntegration(integ.id)} className="px-3 py-2 text-xs border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1"><RefreshCw size={11} />Sync</button>
                            <button
                              onClick={() => openEditIntegrationModal(integ)}
                              className="px-3 py-2 text-xs border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                              <Edit size={11} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* API Info */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center"><Key size={16} className="text-indigo-600" /></div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-indigo-800 mb-1">API Access</div>
                    <div className="text-xs text-indigo-600 mb-3">Use our REST API to build custom integrations with any platform.</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-white border border-indigo-200 rounded-lg px-3 py-2 text-slate-600 font-mono">
                        {showApiKey ? "sk-leadops-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" : "sk-leadops-••••••••••••••••••••••••••••••"}
                      </code>
                      <button onClick={() => setShowApiKey(!showApiKey)} className="px-3 py-2 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">{showApiKey ? "Hide" : "Reveal"}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== PRICING ===== */}
          {activeTab === "pricing" && (
            <div className="space-y-6">
              {/* Add-ons Section */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-800 mb-3">Add-ons</h3>
                <div className="flex flex-wrap gap-2">
                  {["Workflows & assignment rules", "Cadences", "Reports & Dashboards",
                    "Sales forecasting", "Self service kiosks", "WhatsApp Business"].map(addon => (
                      <span key={addon} className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full">
                        {addon}
                      </span>
                    ))}
                </div>
              </div>

              {/* Current Plan Banner */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Current Plan: <span className="font-bold">{priceList.find(p => p.id === selectedPlan)?.name || "Professional"}</span>
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Renews on {userProfile?.subscription_renewal_date ? new Date(userProfile.subscription_renewal_date).toLocaleDateString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()} •
                      <button
                        onClick={async () => {
                          if (confirm("Are you sure you want to cancel your subscription? This action cannot be undone.")) {
                            try {
                              const token = localStorage.getItem('token') || session?.access_token;
                              if (!token) throw new Error("Not logged in");

                              // Cancel in Razorpay first
                              if (userProfile?.razorpay_subscription_id) {
                                await api.payments.cancelSubscription(userProfile.razorpay_subscription_id, token);
                              }
                              
                              // Then update database
                              await api.users.updateSubscription(session.user.id, "cancelled", token);
                              
                              toast.success("Subscription cancelled successfully");
                              
                              // Update local state
                              if (userProfile) {
                                userProfile.subscription_status = 'cancelled';
                              }
                              
                              setTimeout(() => window.location.reload(), 500);
                            } catch (err: any) {
                              toast.error(err.message || "Failed to cancel subscription");
                            }
                          }
                        }}
                        className="ml-1 underline hover:no-underline text-red-600"
                      >
                        Cancel subscription
                      </button>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                    ₹{priceList.find(p => p.id === selectedPlan)?.price?.toLocaleString() || "999"}
                  </span>
                  <span className="text-sm text-blue-700 dark:text-blue-300">/mo</span>
                </div>
              </div>

              {/* CRM Plans Section */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 dark:text-white mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-indigo-600 rounded-full inline-block" />CRM Plans
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {priceList.filter(p => p.category === "CRM Plans").map(plan => {
                    const isCurrentPlan = selectedPlan === plan.id;
                    return (
                      <div
                        key={plan.id}
                        onClick={() => {
                          if (!isCurrentPlan) {
                            setSelectedPlanBeforeChange(selectedPlan);
                            setPendingPlan(plan);
                            setShowConfirmBar(true);
                          }
                        }}
                        className={`relative bg-white dark:bg-slate-800 rounded-2xl border-2 p-5 cursor-pointer transition-all hover:shadow-md ${isCurrentPlan
                            ? "border-indigo-500 shadow-md shadow-indigo-100"
                            : plan.isPopular
                              ? "border-purple-300"
                              : "border-slate-200"
                          }`}
                      >
                        {plan.isPopular && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-semibold px-3 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                            <Star size={9} className="fill-white" />Most Popular
                          </div>
                        )}
                        {isCurrentPlan && (
                          <div className="absolute top-3 right-3 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                            <Check size={11} className="text-white" />
                          </div>
                        )}

                        <div className="text-lg font-bold text-slate-800 dark:text-white">{plan.name}</div>
                        <div className="mt-2 flex items-baseline gap-0">
                          <span className="text-xs text-slate-400">₹</span>
                          <span className="text-3xl font-bold text-slate-900 dark:text-white">
                            {plan.price ? plan.price.toLocaleString() : "Custom"}
                          </span>
                          <span className="text-xs text-slate-400 ml-1">/{plan.billing === "Monthly" ? "mo" : plan.billing === "Annual" ? "yr" : "once"}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 capitalize mb-4">{plan.billing} billing</div>

                        <div className="space-y-2 mb-4">
                          {plan.features.map(f => (
                            <div key={f} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" />
                              {f}
                            </div>
                          ))}
                        </div>

                        <button className={`w-full py-2.5 text-xs rounded-xl font-medium transition-colors ${isCurrentPlan
                            ? "bg-indigo-600 text-white cursor-default"
                            : "border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                          }`}>
                          {isCurrentPlan ? "✓ Current Plan" : `Switch to ${plan.name}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Usage Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-slate-500">Contacts</h4>
                    <span className="text-xs text-slate-400">{userProfile?.total_contacts || 0} / 50,000</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div className="bg-indigo-600 rounded-full h-2" style={{ width: '0%' }}></div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-slate-500">Team Members</h4>
                    <span className="text-xs text-slate-400">{userProfile?.team_members_count || 1} / Unlimited</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div className="bg-emerald-600 rounded-full h-2" style={{ width: '0%' }}></div>
                  </div>
                  <button onClick={() => toast.info("Team management feature coming soon!")} className="text-xs text-indigo-600 hover:text-indigo-700 mt-2 block">
                    Manage team →
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <h4 className="text-sm font-medium text-slate-500 mb-1">Next Invoice</h4>
                  <p className="text-2xl font-bold text-slate-900">₹{priceList.find(p => p.id === selectedPlan)?.price?.toLocaleString() || "999"}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Due on {userProfile?.next_invoice_date ? new Date(userProfile.next_invoice_date).toLocaleDateString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-slate-800">Payment Method</h4>
                  <div className="flex space-x-3">
                    <button onClick={handleAddPaymentMethod} className="text-xs text-indigo-600 hover:text-indigo-700">
                      Update
                    </button>
                     <button onClick={async () => {
                      if (confirm("Remove payment method?")) {
                        try {
                          const token = localStorage.getItem('token') || session?.access_token;
                          if (!session?.user?.id || !token) throw new Error("Not logged in");
                          
                          await api.users.removePaymentMethod(session.user.id, token);
                          toast.success("Payment method removed successfully");
                          
                          // Update local state
                          if (userProfile) {
                            userProfile.payment_last4 = undefined;
                            userProfile.payment_brand = undefined;
                          }
                          
                          setTimeout(() => window.location.reload(), 500);
                        } catch (err: any) {
                          toast.error(err.message || "Failed to remove payment method");
                        }
                      }
                    }} className="text-xs text-red-600 hover:text-red-700">
                      Remove
                    </button>
                  </div>
                </div>

                {userProfile?.payment_last4 ? (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-7 bg-gradient-to-r from-indigo-600 to-purple-600 rounded"></div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">•••• {userProfile.payment_last4}</p>
                      <p className="text-xs text-slate-500">{userProfile.payment_brand || "Card"} · Expires {userProfile.payment_expiry || "12/26"}</p>
                    </div>
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-auto">Default</span>
                  </div>
                ) : (
                  <button 
                    onClick={handleAddPaymentMethod}
                    className="w-full py-3 text-center border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                  >
                    + Add Payment Method
                  </button>
                )}
              </div>

              {/* Billing History */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b flex justify-between items-center">
                  <h4 className="font-semibold text-slate-800">Billing History</h4>
                  <button onClick={async () => {
                  }} className="text-xs text-indigo-600 hover:text-indigo-700">Refresh</button>
                </div>
            
                {/* Bundle Plan Card - Updated with Dynamic Slider */}
                <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-md overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-5 py-3 border-b border-indigo-100">
                    <h4 className="font-bold text-indigo-800">Bundle Plan</h4>
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      {/* Left side - Plan info */}
                      <div>
                        <div className="text-sm font-semibold text-slate-800">CRM</div>
                        <div className="text-xs text-slate-500 mt-0.5">Standard Plan ₹1,300 /user /month</div>
                      </div>
                      
                      {/* Middle - Pay Period */}
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Pay Period</div>
                        <div className="flex gap-2">
                          <button className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded-lg shadow-sm">Monthly</button>
                          <button className="px-4 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">Yearly</button>
                        </div>
                      </div>
                      
                      {/* Middle - Users counter - DYNAMIC */}
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Users</div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleUserCountChange(Math.max(1, userCount - 1))}
                            className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-sm font-medium text-slate-800">{userCount}</span>
                          <button 
                            onClick={() => handleUserCountChange(Math.min(50, userCount + 1))}
                            className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        {/* Slider for visual feedback */}
                        <input
                          type="range"
                          min="1"
                          max="50"
                          value={userCount}
                          onChange={(e) => handleUserCountChange(parseInt(e.target.value))}
                          className="w-full mt-1"
                        />
                      </div>
                      
                      {/* Right side - Price and Next button */}
                      <div className="text-right">
                        <div className="text-2xl font-bold text-slate-900">₹{bundlePrice.toLocaleString()}</div>
                        <button 
                          onClick={handlePurchaseBundle}
                          className="mt-2 px-6 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                          Purchase Bundle
                        </button>
                      </div>
                    </div>
                    
                    {/* Savings text */}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <p className="text-xs text-emerald-600 flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                        Save 33.5% on yearly subscription and earn up to 12% as wallet credit. (T&C)
                      </p>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="border-b">
                        <th className="text-left px-5 py-2 font-medium text-slate-500">Date</th>
                        <th className="text-left px-5 py-2 font-medium text-slate-500">Amount</th>
                        <th className="text-left px-5 py-2 font-medium text-slate-500">Status</th>
                        <th className="text-right px-5 py-2 font-medium text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingHistory.length > 0 ? (
                        billingHistory.map((invoice, idx) => (
                          <tr key={idx} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="px-5 py-3 text-slate-700">{new Date(invoice.created_at).toLocaleDateString()}</td>
                            <td className="px-5 py-3 text-slate-700">₹{invoice.amount?.toLocaleString() || priceList.find(p => p.id === selectedPlan)?.price?.toLocaleString()}</td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : invoice.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                }`}>{invoice.status || 'Paid'}</span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button onClick={() => invoice.invoice_url ? window.open(invoice.invoice_url, '_blank') : toast.info("Invoice PDF not available")} className="text-indigo-600 text-sm hover:text-indigo-700">Download PDF</button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">No billing history found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Confirmation Bar */}
              {showConfirmBar && pendingPlan && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-4 flex items-center space-x-6">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Switch from <span className="font-bold">{priceList.find(p => p.id === selectedPlanBeforeChange)?.name}</span> to <span className="font-bold">{pendingPlan.name}</span>?
                    </p>
                    <p className="text-xs text-slate-500">Your next invoice will be adjusted.</p>
                  </div>
                  <div className="flex space-x-3">
                    <button onClick={() => { setShowConfirmBar(false); setPendingPlan(null); setSelectedPlanBeforeChange(null); }} className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancel</button>
                    <button onClick={async () => {
                      try {
                        const token = localStorage.getItem('token') || session?.access_token;
                        if (!token) throw new Error("Not logged in");

                        const planName = pendingPlan.id;
                        const planAmount = getPlanAmount(planName);
                        
                        // Create PayU order
                        const response = await api.payments.createOrder(planAmount, "INR", pendingPlan.name, token);
                        
                        if (response.success) {
                          const form = document.createElement('form');
                          form.method = 'POST';
                          form.action = response.payuUrl;
                          
                          const payuData = response.payuData;
                          Object.keys(payuData).forEach(key => {
                            const input = document.createElement('input');
                            input.type = 'hidden';
                            input.name = key;
                            input.value = payuData[key];
                            form.appendChild(input);
                          });
                          
                          // Add plan info
                          const planInput = document.createElement('input');
                          planInput.type = 'hidden';
                          planInput.name = 'plan';
                          planInput.value = planName;
                          form.appendChild(planInput);
                          
                          document.body.appendChild(form);
                          form.submit();
                        }
                      } catch (error) {
                        toast.error('Failed to process plan change');
                        console.error(error);
                      }
                    }} className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
                      Confirm & Pay
                    </button>
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
          {activeTab === "system" && role === "admin" && (
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
                }}
                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleEnable2FA();
                }}
                disabled={twoFACode.length !== 6}
                className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Verify & Enable
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
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowResetConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 text-center mb-2">⚠️ DANGER: Database Reset</h3>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-700 font-medium mb-2">This action will permanently delete:</p>
              <ul className="text-xs text-red-600 space-y-1">
                <li>• ALL leads and deals</li>
                <li>• ALL tickets and activities</li>
                <li>• ALL users (except you, the Admin)</li>
                <li>• ALL integrations data</li>
              </ul>
            </div>

            <p className="text-sm text-slate-600 mb-3">
              Type <span className="font-bold text-red-600">"DELETE ALL"</span> to confirm:
            </p>

            <input
              type="text"
              id="confirmResetInput"
              placeholder='Type "DELETE ALL" here'
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const inputValue = (document.getElementById('confirmResetInput') as HTMLInputElement)?.value;
                  if (inputValue === "DELETE ALL") {
                    handleReset();
                  } else {
                    toast.error('Please type "DELETE ALL" to confirm');
                  }
                }}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} />
                Reset Database
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
