import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
    CreditCard,
    Users,
    Calendar,
    Download,
    Plus,
    Trash2,
    Crown,
    Shield,
    UserCheck,
    UserX,
    RefreshCw,
    CheckCircle,
    XCircle,
    AlertCircle,
    Building,
    TrendingUp,
    Clock,
    ChevronRight,
    Edit,
    Save,
    X,
    Loader2,
    DollarSign,
    FileText,
    Settings,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import { formatCurrency } from "../../utils/formatters";

// ── Constants ──
const PLAN_PRICES: Record<string, number> = {
    starter: 499,
    professional: 1299,
    enterprise: 2499,
};

const PLAN_DISPLAY: Record<string, { label: string; desc: string; icon: string }> = {
    starter: { label: "Starter", desc: "For small teams starting out", icon: "🚀" },
    professional: { label: "Professional", desc: "For growing businesses", icon: "💼" },
    enterprise: { label: "Enterprise", desc: "For large organizations", icon: "🏢" },
};

const BILLING_PERIODS = [
    { value: "monthly", label: "Monthly", discount: 0, term: "month", months: 1 },
    { value: "quarterly", label: "Quarterly", discount: 5, term: "3 months", months: 3 },
    { value: "half_yearly", label: "Half-Yearly", discount: 10, term: "6 months", months: 6 },
    { value: "yearly", label: "Yearly", discount: 15, term: "12 months", months: 12 },
];

export default function SubscriptionPage() {
    const navigate = useNavigate();
    const {
        role,
        users,
        loadUsers,
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
        userProfile,
    } = useApp();

    const [activeTab, setActiveTab] = useState<"overview" | "users" | "billing" | "members_subscriptions">("overview");
    const [loading, setLoading] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAddPayment, setShowAddPayment] = useState(false);

    // ── Member Subscriptions State & Filters ──
    const [adminSubscriptions, setAdminSubscriptions] = useState<any[]>([]);
    const [expiringSoonSubscriptions, setExpiringSoonSubscriptions] = useState<any[]>([]);
    const [subFilter, setSubFilter] = useState<"all" | "active" | "expiring_7d" | "expiring_24h" | "expired">("all");
    const [loadingAdminSubs, setLoadingAdminSubs] = useState(false);
    const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);

    const fetchAdminSubscriptions = async (filter = subFilter) => {
        setLoadingAdminSubs(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin/subscriptions?filter=${filter}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAdminSubscriptions(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error("Failed to fetch admin subscriptions:", e);
        } finally {
            setLoadingAdminSubs(false);
        }
    };

    const fetchExpiringSoon = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin/subscriptions/expiring-soon`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setExpiringSoonSubscriptions(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error("Failed to fetch expiring soon:", e);
        }
    };

    const handleSendReminder = async (subId: string, customerName: string) => {
        setSendingReminderId(subId);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin/subscriptions/${subId}/send-reminder`, {
                method: "POST",
                headers: { 
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(`Reminder sent to ${customerName}`);
                fetchAdminSubscriptions();
                fetchExpiringSoon();
            } else {
                toast.error(data.error || "Failed to send reminder");
            }
        } catch (e: any) {
            toast.error("Failed to send reminder");
        } finally {
            setSendingReminderId(null);
        }
    };

    // ── Edit Subscription Form ──
    const [editForm, setEditForm] = useState({
        plan_type: companySubscription?.company?.plan_type || "professional",
        billing_period: companySubscription?.company?.billing_period || "monthly",
        auto_renew: companySubscription?.company?.auto_renew ?? true,
    });

    // ── Add Payment Form ──
    const [paymentForm, setPaymentForm] = useState({
        last4: "",
        brand: "",
        expiry: "",
        is_default: false,
    });
    const [submitting, setSubmitting] = useState(false);

    // ── Load Data ──
    useEffect(() => {
        if ((role as any) !== "org_admin" && (role as any) !== "super_admin") {
            navigate("/");
            return;
        }

        const loadData = async () => {
            await Promise.all([
                fetchCompanySubscription(),
                fetchPaymentMethods(),
                fetchInvoices(),
                loadUsers(),
                fetchExpiringSoon(),
                fetchAdminSubscriptions("all"),
            ]);
        };
        loadData();
    }, []);

    useEffect(() => {
        fetchAdminSubscriptions(subFilter);
    }, [subFilter]);

    // ── Update edit form when subscription loads ──
    useEffect(() => {
        if (companySubscription) {
            setEditForm({
                plan_type: companySubscription.company?.plan_type || "professional",
                billing_period: companySubscription.company?.billing_period || "monthly",
                auto_renew: companySubscription.company?.auto_renew ?? true,
            });
        }
    }, [companySubscription]);

    // ── Handle Subscription Update ──
    const handleUpdateSubscription = async () => {
        setSubmitting(true);
        try {
            await updateCompanySubscription({
                plan_type: editForm.plan_type,
                billing_period: editForm.billing_period,
                auto_renew: editForm.auto_renew,
            });
            setShowEditModal(false);
        } catch (error) {
            // Error handled in context
        } finally {
            setSubmitting(false);
        }
    };

    // ── Handle Add Payment Method ──
    const handleAddPayment = async () => {
        if (!paymentForm.last4 || !paymentForm.brand || !paymentForm.expiry) {
            toast.error("Please fill in all payment fields");
            return;
        }
        if (paymentForm.last4.length !== 4 || !/^\d{4}$/.test(paymentForm.last4)) {
            toast.error("Last 4 digits must be 4 numbers");
            return;
        }
        if (!/^\d{2}\/\d{2}$/.test(paymentForm.expiry)) {
            toast.error("Expiry must be MM/YY format");
            return;
        }

        setSubmitting(true);
        try {
            await addPaymentMethod({
                last4: paymentForm.last4,
                brand: paymentForm.brand,
                expiry: paymentForm.expiry,
                is_default: paymentForm.is_default,
            });
            setShowAddPayment(false);
            setPaymentForm({ last4: "", brand: "", expiry: "", is_default: false });
        } catch (error) {
            // Error handled in context
        } finally {
            setSubmitting(false);
        }
    };

    // ── Handle Delete Payment Method ──
    const handleDeletePayment = async (id: string) => {
        if (!confirm("Are you sure you want to remove this payment method?")) return;
        await deletePaymentMethod(id);
    };

    // ── Calculate Pricing ──
    const getPlanPrice = (plan: string) => {
        return PLAN_PRICES[plan] || 1299;
    };

    const getActiveUsers = () => {
        return users.filter((u) => u.isActive).length || 0;
    };

    const calculatePricing = (plan: string, period: string) => {
        const basePrice = getPlanPrice(plan);
        const activeUsers = getActiveUsers();
        const subtotal = basePrice * activeUsers;

        const periodInfo = BILLING_PERIODS.find((p) => p.value === period);
        const discount = periodInfo?.discount || 0;
        const discountedSubtotal = subtotal * (1 - discount / 100);
        const gst = discountedSubtotal * 0.18;
        const total = discountedSubtotal + gst;

        return {
            basePrice,
            activeUsers,
            subtotal,
            discount,
            discountedSubtotal,
            gst,
            total,
            periodLabel: periodInfo?.label || "Monthly",
        };
    };

    const pricing = calculatePricing(editForm.plan_type, editForm.billing_period);

    // ── Render Loading ──
    if (companySubscriptionLoading) {
        return (
            <div className="p-4 lg:p-6 max-w-[1600px]">
                <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Loader2 size={32} className="animate-spin text-indigo-400" />
                        <p className="text-sm">Loading subscription details...</p>
                    </div>
                </div>
            </div>
        );
    }

    // ── Render Main ──
    return (
        <div className="p-4 lg:p-6 max-w-[1600px] space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-slate-900 dark:text-white flex items-center gap-2">
                        <CreditCard size={22} className="text-indigo-600" />
                        Subscription & Billing
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Manage your plan, users, and billing preferences
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            fetchCompanySubscription();
                            fetchInvoices();
                            loadUsers();
                        }}
                        className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={14} className="text-slate-500" />
                    </button>
                    <button
                        onClick={() => setShowEditModal(true)}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 transition-colors"
                    >
                        <Edit size={15} /> Manage Plan
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    {
                        label: "Total Users",
                        value: users.length,
                        icon: Users,
                        color: "from-blue-500 to-indigo-500",
                    },
                    {
                        label: "Active Users",
                        value: getActiveUsers(),
                        icon: UserCheck,
                        color: "from-emerald-500 to-teal-500",
                    },
                    {
                        label: "Current Plan",
                        value: PLAN_DISPLAY[companySubscription?.company?.plan_type || "professional"]?.label || "Professional",
                        icon: Crown,
                        color: "from-purple-500 to-violet-500",
                    },
                    {
                        label: "Next Billing",
                        value: companySubscription?.company?.subscription_end
                            ? new Date(companySubscription.company.subscription_end).toLocaleDateString("en-IN", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                            })
                            : "—",
                        icon: Calendar,
                        color: "from-amber-500 to-orange-500",
                    },
                ].map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <div
                            key={stat.label}
                            className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div
                                    className={`w-9 h-9 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-sm`}
                                >
                                    <Icon size={16} className="text-white" />
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{stat.label}</div>
                        </div>
                    );
                })}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
                {[
                    { id: "overview", label: "Overview", icon: TrendingUp },
                    { id: "members_subscriptions", label: "Member Subscriptions", icon: Crown },
                    { id: "users", label: "User Management", icon: Users },
                    { id: "billing", label: "Billing", icon: CreditCard },
                ].map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${activeTab === tab.id
                                ? "border-indigo-600 text-indigo-600"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            <Icon size={14} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── TAB: OVERVIEW ── */}
            {activeTab === "overview" && (
                <div className="space-y-6">
                    {/* EXPIRING SOON SUBSCRIPTIONS WIDGET */}
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50/60 to-orange-50/60">
                            <div className="flex items-center gap-2.5">
                                <span className="text-lg">⏳</span>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-sm tracking-wide">EXPIRING SOON SUBSCRIPTIONS</h3>
                                    <p className="text-[11px] text-slate-500">Members requiring renewal attention within the next 7 days</p>
                                </div>
                                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold ml-2">
                                    {expiringSoonSubscriptions.length}
                                </span>
                            </div>
                            <button
                                onClick={() => setActiveTab("members_subscriptions")}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                            >
                                View All Members →
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                                        <th className="text-left py-3 px-6">Customer</th>
                                        <th className="text-left py-3 px-4">Plan</th>
                                        <th className="text-left py-3 px-4">Expiry</th>
                                        <th className="text-left py-3 px-4">Days Left</th>
                                        <th className="text-right py-3 px-6">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {expiringSoonSubscriptions.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                                                🎉 All member subscriptions are active and healthy!
                                            </td>
                                        </tr>
                                    ) : (
                                        expiringSoonSubscriptions.map((sub) => (
                                            <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="py-3.5 px-6">
                                                    <div className="font-semibold text-slate-900 text-xs">{sub.customer_name}</div>
                                                    <div className="text-[10px] text-slate-400">{sub.customer_email || sub.customer_phone || 'No contact email'}</div>
                                                </td>
                                                <td className="py-3.5 px-4 text-xs font-medium text-slate-700">{sub.plan_name}</td>
                                                <td className="py-3.5 px-4 text-xs text-slate-600 font-medium">{sub.formatted_expiry}</td>
                                                <td className="py-3.5 px-4">
                                                    <span className={`text-xs font-bold ${
                                                        sub.days_left === 0 ? 'text-red-600' :
                                                        sub.days_left === 1 ? 'text-orange-600' :
                                                        'text-amber-600'
                                                    }`}>
                                                        {sub.days_left === 0 ? 'Expired' : `${sub.days_left} ${sub.days_left === 1 ? 'day' : 'days'}`}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-6 text-right">
                                                    <button
                                                        onClick={() => handleSendReminder(sub.id, sub.customer_name)}
                                                        disabled={sendingReminderId === sub.id}
                                                        className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-semibold rounded-xl border border-indigo-200 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                                                    >
                                                        <span>{sendingReminderId === sub.id ? 'Sending...' : 'Send Reminder'}</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Plan Details */}
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-lg">
                                        {PLAN_DISPLAY[companySubscription?.company?.plan_type || "professional"]?.icon || "💼"}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-800">
                                            {PLAN_DISPLAY[companySubscription?.company?.plan_type || "professional"]?.label || "Professional"} Plan
                                        </h3>
                                        <p className="text-xs text-slate-500">
                                            {PLAN_DISPLAY[companySubscription?.company?.plan_type || "professional"]?.desc || "For growing businesses"}
                                        </p>
                                    </div>
                                </div>
                                <span
                                    className={`text-xs px-3 py-1 rounded-full font-medium ${companySubscription?.company?.subscription_status === "active"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : companySubscription?.company?.subscription_status === "trial"
                                            ? "bg-indigo-100 text-indigo-700"
                                            : "bg-red-100 text-red-700"
                                        }`}
                                >
                                    {companySubscription?.company?.subscription_status === "active"
                                        ? "Active"
                                        : companySubscription?.company?.subscription_status === "trial"
                                            ? "Trial"
                                            : "Expired"}
                                </span>
                            </div>
                        </div>

                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Pricing Breakdown */}
                                <div className="md:col-span-2 space-y-3">
                                    <h4 className="text-sm font-medium text-slate-700">Pricing Breakdown</h4>
                                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">
                                                Base Price ({companySubscription?.company?.plan_type || "professional"} × {getActiveUsers()} active users)
                                            </span>
                                            <span className="font-medium text-slate-700">
                                                ₹{pricing.subtotal.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">
                                                Discount ({pricing.discount}% - {pricing.periodLabel})
                                            </span>
                                            <span className="font-medium text-emerald-600">
                                                -₹{(pricing.subtotal - pricing.discountedSubtotal).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">GST (18%)</span>
                                            <span className="font-medium text-slate-700">
                                                ₹{pricing.gst.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-bold">
                                            <span>Total</span>
                                            <span className="text-indigo-600">
                                                ₹{pricing.total.toLocaleString()}
                                                <span className="text-xs font-normal text-slate-400 ml-1">/{pricing.periodLabel.toLowerCase()}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Quick Stats */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-medium text-slate-700">Quick Stats</h4>
                                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Plan</span>
                                            <span className="font-medium text-slate-700">
                                                {PLAN_DISPLAY[companySubscription?.company?.plan_type || "professional"]?.label}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Billing Period</span>
                                            <span className="font-medium text-slate-700">
                                                {BILLING_PERIODS.find((p) => p.value === companySubscription?.company?.billing_period)?.label || "Monthly"}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Auto-Renew</span>
                                            <span className={`font-medium ${companySubscription?.company?.auto_renew ? "text-emerald-600" : "text-red-500"}`}>
                                                {companySubscription?.company?.auto_renew ? "✅ Enabled" : "❌ Disabled"}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Active Users</span>
                                            <span className="font-medium text-slate-700">{getActiveUsers()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button
                            onClick={() => setShowEditModal(true)}
                            className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all text-left"
                        >
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-3">
                                <Edit size={18} className="text-indigo-600" />
                            </div>
                            <h4 className="font-medium text-slate-800">Change Plan</h4>
                            <p className="text-xs text-slate-400 mt-1">Update your subscription plan or billing period</p>
                        </button>

                        <button
                            onClick={() => setActiveTab("users")}
                            className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all text-left"
                        >
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mb-3">
                                <Users size={18} className="text-emerald-600" />
                            </div>
                            <h4 className="font-medium text-slate-800">Manage Users</h4>
                            <p className="text-xs text-slate-400 mt-1">Activate or deactivate users to control costs</p>
                        </button>

                        <button
                            onClick={() => setActiveTab("billing")}
                            className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all text-left"
                        >
                            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mb-3">
                                <CreditCard size={18} className="text-purple-600" />
                            </div>
                            <h4 className="font-medium text-slate-800">Billing History</h4>
                            <p className="text-xs text-slate-400 mt-1">View invoices and manage payment methods</p>
                        </button>
                    </div>
                </div>
            )}

            {/* ── TAB: MEMBER SUBSCRIPTIONS MONITORING ── */}
            {activeTab === "members_subscriptions" && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm space-y-4">
                    {/* Tab Header & Filter Pills */}
                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <Crown size={18} className="text-amber-500" />
                                <h3 className="font-bold text-slate-900 text-base">Members Subscription Management</h3>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Monitor customer renewals, track upcoming expirations, and dispatch manual reminder alerts.
                            </p>
                        </div>

                        {/* Filters */}
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl flex-wrap">
                            {[
                                { id: "all", label: "All" },
                                { id: "active", label: "Active" },
                                { id: "expiring_7d", label: "Expiring in 7 Days" },
                                { id: "expiring_24h", label: "Expiring in 24h" },
                                { id: "expired", label: "Expired" },
                            ].map((f) => (
                                <button
                                    key={f.id}
                                    onClick={() => setSubFilter(f.id as any)}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                        subFilter === f.id
                                            ? "bg-white text-indigo-600 shadow-sm"
                                            : "text-slate-600 hover:text-slate-900"
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Member Subscriptions Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                                    <th className="text-left py-3.5 px-6">Customer</th>
                                    <th className="text-left py-3.5 px-4">Plan Duration</th>
                                    <th className="text-left py-3.5 px-4">Expiry Date</th>
                                    <th className="text-left py-3.5 px-4">Status</th>
                                    <th className="text-left py-3.5 px-4">Reminder Tracking</th>
                                    <th className="text-right py-3.5 px-6">Quick Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loadingAdminSubs ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                                            <Loader2 size={24} className="animate-spin text-indigo-500 mx-auto mb-2" />
                                            Loading member subscriptions...
                                        </td>
                                    </tr>
                                ) : adminSubscriptions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                                            No member subscriptions found matching filter "{subFilter}".
                                        </td>
                                    </tr>
                                ) : (
                                    adminSubscriptions.map((sub) => {
                                        // Status badge colors
                                        const badge = sub.status_badge || "ACTIVE";
                                        let badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                                        if (badge === "EXPIRED") {
                                            badgeColor = "bg-red-50 text-red-700 border-red-200";
                                        } else if (badge === "EXPIRING TOMORROW") {
                                            badgeColor = "bg-orange-50 text-orange-700 border-orange-200";
                                        } else if (badge.startsWith("EXPIRING IN")) {
                                            badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                                        }

                                        return (
                                            <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="py-4 px-6">
                                                    <div className="font-semibold text-slate-900 text-xs">{sub.customer_name}</div>
                                                    <div className="text-[11px] text-slate-400">{sub.customer_email || sub.customer_phone || 'N/A'}</div>
                                                </td>
                                                <td className="py-4 px-4 text-xs font-medium text-slate-700">
                                                    {sub.plan_name} ({sub.duration_months} {sub.duration_months === 1 ? 'Month' : 'Months'})
                                                </td>
                                                <td className="py-4 px-4 text-xs text-slate-600 font-medium">
                                                    {sub.formatted_expiry}
                                                </td>
                                                <td className="py-4 px-4">
                                                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeColor}`}>
                                                        {badge}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-[11px] text-slate-500">
                                                    <div className="flex items-center gap-1.5">
                                                        <span title="7-Day Reminder" className={`w-2 h-2 rounded-full ${sub.reminder_7d_sent ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                                                        <span className="text-[10px] text-slate-400">7d</span>
                                                        <span title="1-Day Reminder" className={`w-2 h-2 rounded-full ${sub.reminder_1d_sent ? 'bg-amber-500' : 'bg-slate-200'}`} />
                                                        <span className="text-[10px] text-slate-400">1d</span>
                                                        <span title="Expiry Notice" className={`w-2 h-2 rounded-full ${sub.reminder_0d_sent ? 'bg-red-500' : 'bg-slate-200'}`} />
                                                        <span className="text-[10px] text-slate-400">Exp</span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6 text-right">
                                                    <button
                                                        onClick={() => handleSendReminder(sub.id, sub.customer_name)}
                                                        disabled={sendingReminderId === sub.id}
                                                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                                                    >
                                                        <span>{sendingReminderId === sub.id ? 'Sending...' : 'Send Reminder'}</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── TAB: USER MANAGEMENT ── */}
            {activeTab === "users" && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Users size={18} className="text-indigo-600" />
                            <h3 className="font-semibold text-slate-800">User Management</h3>
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                {users.length} total · {getActiveUsers()} active
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">
                                💡 Only active users are billed
                            </span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50">
                                    <th className="text-left py-3 px-4 text-xs text-slate-500 font-medium">User</th>
                                    <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Role</th>
                                    <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Department</th>
                                    <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Status</th>
                                    <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Billing Status</th>
                                    <th className="text-left py-3 px-4 text-xs text-slate-500 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-slate-400">
                                            No users found
                                        </td>
                                    </tr>
                                ) : (
                                    users.map((user) => (
                                        <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                         className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${user.role === "org_admin"
                                                            ? "bg-gradient-to-br from-purple-500 to-indigo-600"
                                                            : "bg-gradient-to-br from-emerald-500 to-teal-600"
                                                            }`}
                                                    >
                                                        {user.name
                                                            .split(" ")
                                                            .map((n) => n[0])
                                                            .join("")
                                                            .slice(0, 2)
                                                            .toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-medium text-slate-800">{user.name}</div>
                                                        <div className="text-[10px] text-slate-400">{user.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-3 text-xs text-slate-600 capitalize">{user.role}</td>
                                            <td className="py-3 px-3 text-xs text-slate-600 capitalize">{user.department || "—"}</td>
                                            <td className="py-3 px-3">
                                                <span
                                                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.isActive
                                                        ? "bg-emerald-100 text-emerald-700"
                                                        : "bg-red-100 text-red-700"
                                                        }`}
                                                >
                                                    {user.isActive ? "Active" : "Inactive"}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3">
                                                <span
                                                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.isActive
                                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                        : "bg-slate-50 text-slate-500 border border-slate-200"
                                                        }`}
                                                >
                                                    {user.isActive ? "💰 Billed" : "Not Billed"}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                {user.id !== userProfile?.id && (
                                                    <button
                                                        onClick={() =>
                                                            user.isActive ? deactivateUser(user.id) : activateUser(user.id)
                                                        }
                                                        className={`text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${user.isActive
                                                            ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                                                            : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200"
                                                            }`}
                                                    >
                                                        {user.isActive ? (
                                                            <>
                                                                <UserX size={12} /> Deactivate
                                                            </>
                                                        ) : (
                                                            <>
                                                                <UserCheck size={12} /> Activate
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                                {user.id === userProfile?.id && (
                                                    <span className="text-xs text-slate-400">You</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                            <AlertCircle size={12} />
                            <span>
                                Only <strong className="text-slate-600">active users</strong> are counted in your billing.
                                Deactivate users to reduce costs.
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB: BILLING ── */}
            {activeTab === "billing" && (
                <div className="space-y-6">
                    {/* Payment Methods */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <CreditCard size={18} className="text-indigo-600" />
                                <h3 className="font-semibold text-slate-800">Payment Methods</h3>
                            </div>
                            <button
                                onClick={() => setShowAddPayment(true)}
                                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1.5"
                            >
                                <Plus size={12} /> Add Payment
                            </button>
                        </div>

                        <div className="p-6">
                            {paymentMethods.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <CreditCard size={20} className="text-slate-300" />
                                    </div>
                                    <p className="text-sm text-slate-500">No payment methods added yet</p>
                                    <p className="text-xs text-slate-400 mt-1">Add a payment method to manage your billing</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {paymentMethods.map((method) => (
                                        <div
                                            key={method.id}
                                            className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-indigo-200 transition-colors"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded flex items-center justify-center text-white text-xs font-bold">
                                                    {method.brand || "Card"}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-slate-800">
                                                        •••• {method.last4}
                                                    </div>
                                                    <div className="text-xs text-slate-400">
                                                        Expires {method.expiry}
                                                        {method.is_default && (
                                                            <span className="ml-2 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px]">
                                                                Default
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {!method.is_default && (
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await api.company.setDefaultPaymentMethod(method.id, localStorage.getItem("token") || "");
                                                                await fetchPaymentMethods();
                                                                toast.success("Default payment method updated");
                                                            } catch (error) {
                                                                toast.error("Failed to update default");
                                                            }
                                                        }}
                                                        className="text-xs text-indigo-600 hover:text-indigo-700"
                                                    >
                                                        Set Default
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDeletePayment(method.id)}
                                                    className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Invoice History */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileText size={18} className="text-indigo-600" />
                                <h3 className="font-semibold text-slate-800">Invoice History</h3>
                                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                    {invoices.length} invoices
                                </span>
                            </div>
                            <button
                                onClick={fetchInvoices}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50">
                                        <th className="text-left py-3 px-4 text-xs text-slate-500 font-medium">Invoice #</th>
                                        <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Date</th>
                                        <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Amount</th>
                                        <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">GST</th>
                                        <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Total</th>
                                        <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Status</th>
                                        <th className="text-left py-3 px-4 text-xs text-slate-500 font-medium">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {invoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-8 text-center text-slate-400">
                                                No invoices found
                                            </td>
                                        </tr>
                                    ) : (
                                        invoices.map((invoice) => (
                                            <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="py-3 px-4 text-xs font-medium text-slate-800">
                                                    {invoice.invoice_number}
                                                </td>
                                                <td className="py-3 px-3 text-xs text-slate-500">
                                                    {new Date(invoice.created_at).toLocaleDateString("en-IN", {
                                                        day: "numeric",
                                                        month: "short",
                                                        year: "numeric",
                                                    })}
                                                </td>
                                                <td className="py-3 px-3 text-xs text-slate-600">
                                                    ₹{invoice.amount?.toLocaleString() || 0}
                                                </td>
                                                <td className="py-3 px-3 text-xs text-slate-600">
                                                    ₹{invoice.gst_amount?.toLocaleString() || 0}
                                                </td>
                                                <td className="py-3 px-3 text-xs font-semibold text-slate-800">
                                                    ₹{invoice.total_amount?.toLocaleString() || 0}
                                                </td>
                                                <td className="py-3 px-3">
                                                    <span
                                                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${invoice.status === "paid"
                                                            ? "bg-emerald-100 text-emerald-700"
                                                            : invoice.status === "pending"
                                                                ? "bg-amber-100 text-amber-700"
                                                                : "bg-red-100 text-red-700"
                                                            }`}
                                                    >
                                                        {invoice.status === "paid"
                                                            ? "✅ Paid"
                                                            : invoice.status === "pending"
                                                                ? "⏳ Pending"
                                                                : "❌ Failed"}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    {invoice.invoice_url ? (
                                                        <a
                                                            href={invoice.invoice_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-indigo-600 hover:text-indigo-700 text-xs flex items-center gap-1"
                                                        >
                                                            <Download size={12} /> PDF
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── EDIT SUBSCRIPTION MODAL ── */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                            <h2 className="text-slate-800 flex items-center gap-2">
                                <Edit size={18} className="text-indigo-600" />
                                Manage Subscription
                            </h2>
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="p-2 rounded-xl hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Plan Selection */}
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-2">
                                    Select Plan
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {Object.entries(PLAN_DISPLAY).map(([key, plan]) => (
                                        <button
                                            key={key}
                                            onClick={() => setEditForm((f) => ({ ...f, plan_type: key }))}
                                            className={`p-4 border-2 rounded-xl text-left transition-all ${editForm.plan_type === key
                                                ? "border-indigo-500 bg-indigo-50 shadow-md"
                                                : "border-slate-200 hover:border-indigo-300"
                                                }`}
                                        >
                                            <div className="text-2xl mb-2">{plan.icon}</div>
                                            <div className="font-semibold text-slate-800">{plan.label}</div>
                                            <div className="text-xs text-slate-400">{plan.desc}</div>
                                            <div className="text-sm font-bold text-slate-800 mt-2">
                                                ₹{PLAN_PRICES[key]}/user/month
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Billing Period */}
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-2">
                                    Billing Period
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {BILLING_PERIODS.map((period) => (
                                        <button
                                            key={period.value}
                                            onClick={() => setEditForm((f) => ({ ...f, billing_period: period.value }))}
                                            className={`p-3 border-2 rounded-xl text-center transition-all ${editForm.billing_period === period.value
                                                ? "border-indigo-500 bg-indigo-50 shadow-md"
                                                : "border-slate-200 hover:border-indigo-300"
                                                }`}
                                        >
                                            <div className="font-medium text-slate-800 text-sm">{period.label}</div>
                                            <div className="text-xs text-slate-400">{period.term}</div>
                                            {period.discount > 0 && (
                                                <div className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full mt-1">
                                                    Save {period.discount}%
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Auto-Renew */}
                            <div className="flex items-center justify-between py-3 border-t border-slate-100">
                                <div>
                                    <div className="text-sm font-medium text-slate-800">Auto-Renew</div>
                                    <div className="text-xs text-slate-400">
                                        Automatically renew subscription at end of period
                                    </div>
                                </div>
                                <button
                                    onClick={() =>
                                        setEditForm((f) => ({ ...f, auto_renew: !f.auto_renew }))
                                    }
                                    className={`w-11 h-6 rounded-full flex items-center transition-all ${editForm.auto_renew ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"
                                        }`}
                                >
                                    <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                                </button>
                            </div>

                            {/* Pricing Preview */}
                            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Pricing Preview
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">
                                        {getActiveUsers()} active users × ₹{PLAN_PRICES[editForm.plan_type]}
                                    </span>
                                    <span className="font-medium text-slate-700">
                                        ₹{pricing.subtotal.toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">
                                        Discount ({pricing.discount}% - {BILLING_PERIODS.find((p) => p.value === editForm.billing_period)?.label})
                                    </span>
                                    <span className="font-medium text-emerald-600">
                                        -₹{(pricing.subtotal - pricing.discountedSubtotal).toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">GST (18%)</span>
                                    <span className="font-medium text-slate-700">₹{pricing.gst.toLocaleString()}</span>
                                </div>
                                <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-bold">
                                    <span>Total</span>
                                    <span className="text-indigo-600">
                                        ₹{pricing.total.toLocaleString()}
                                        <span className="text-xs font-normal text-slate-400 ml-1">
                                            /{BILLING_PERIODS.find((p) => p.value === editForm.billing_period)?.label.toLowerCase()}
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 sticky bottom-0 bg-white">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateSubscription}
                                disabled={submitting}
                                className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        Save Changes
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── ADD PAYMENT METHOD MODAL ── */}
            {showAddPayment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-slate-800 flex items-center gap-2">
                                <CreditCard size={18} className="text-indigo-600" />
                                Add Payment Method
                            </h2>
                            <button
                                onClick={() => setShowAddPayment(false)}
                                className="p-2 rounded-xl hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1.5">Card Brand</label>
                                <select
                                    value={paymentForm.brand}
                                    onChange={(e) => setPaymentForm((f) => ({ ...f, brand: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                >
                                    <option value="">Select Card</option>
                                    <option value="Visa">Visa</option>
                                    <option value="Mastercard">Mastercard</option>
                                    <option value="Amex">American Express</option>
                                    <option value="Rupay">RuPay</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs text-slate-500 mb-1.5">Last 4 Digits</label>
                                <input
                                    type="text"
                                    maxLength={4}
                                    value={paymentForm.last4}
                                    onChange={(e) => setPaymentForm((f) => ({ ...f, last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                                    placeholder="1234"
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-slate-500 mb-1.5">Expiry (MM/YY)</label>
                                <input
                                    type="text"
                                    maxLength={5}
                                    value={paymentForm.expiry}
                                    onChange={(e) => {
                                        let val = e.target.value.replace(/\D/g, "");
                                        if (val.length >= 2) {
                                            val = val.slice(0, 2) + "/" + val.slice(2);
                                        }
                                        setPaymentForm((f) => ({ ...f, expiry: val.slice(0, 5) }));
                                    }}
                                    placeholder="12/26"
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>

                            <div className="flex items-center gap-3 py-2">
                                <button
                                    onClick={() =>
                                        setPaymentForm((f) => ({ ...f, is_default: !f.is_default }))
                                    }
                                    className={`w-11 h-6 rounded-full flex items-center transition-all ${paymentForm.is_default ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"
                                        }`}
                                >
                                    <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                                </button>
                                <span className="text-sm text-slate-600">Set as default payment method</span>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                            <button
                                onClick={() => setShowAddPayment(false)}
                                className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddPayment}
                                disabled={submitting}
                                className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Adding...
                                    </>
                                ) : (
                                    <>
                                        <Plus size={16} />
                                        Add Card
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}