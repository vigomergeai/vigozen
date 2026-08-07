import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import { isAdminRole, hasModuleAccess } from "../utils/permissions";
import { api } from "../lib/api";
import { toast } from "sonner";
import {
    CreditCard,
    Users,
    Calendar,
    Download,
    RefreshCw,
    Plus,
    Trash2,
    Edit,
    Crown,
    Shield,
    User,
    CheckCircle,
    XCircle,
    ArrowRight,
    TrendingUp,
    Wallet,
    FileText,
    Building2,
    DollarSign,
    Clock,
    Star,
    Info,
    AlertCircle,
    Lock,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Zap,
    Briefcase,
    Phone,
    Mail,
} from "lucide-react";

// ── Types ──
interface Plan {
    id: string;
    name: string;
    price: number;
    description: string;
    features: string[];
    popular?: boolean;
    userLimit?: number;
    icon?: string;
    users?: string;
}

interface Invoice {
    id: string;
    invoice_number: string;
    amount: number;
    total_amount: number;
    status: string;
    due_date: string;
    created_at: string;
    invoice_url?: string;
}

interface PaymentMethod {
    id: string;
    last4: string;
    brand: string;
    expiry: string;
    is_default: boolean;
}

// ── Constants ──
const PLANS: Plan[] = [
    {
        id: "starter",
        name: "Starter",
        price: 600,
        description: "For growing teams and small businesses.",
        icon: "🚀",
        features: ["Per Users", "15,000 contacts", "AI sales forecasting", "Workflow automation", "All integrations", "Custom dashboards", "Priority support", "SSO & RBAC"],
        userLimit: 50,
        users: "1–50 Users",
    },
    {
        id: "custom",
        name: "Custom",
        price: 0,
        description: "Contact Sales for custom pricing based on your business requirements.",
        icon: "🤝",
        features: ["Unlimited users", "Unlimited contacts", "Dedicated infrastructure", "Custom AI models", "On-premise option", "SLA guarantee", "Dedicated CSM", "Custom integrations"],
        users: "50+ Users",
    },
];

const BILLING_PERIODS = [
    { id: "monthly", label: "Monthly", discount: 0, multiplier: 1, suffix: "mo" },
    { id: "quarterly", label: "Quarterly", discount: 5, multiplier: 3, suffix: "3 mo" },
    { id: "half_yearly", label: "Half Yearly", discount: 10, multiplier: 6, suffix: "6 mo" },
    { id: "yearly", label: "Yearly", discount: 15, multiplier: 12, suffix: "yr" },
];

export default function PriceListPage() {
    const {
        userProfile,
        users,
        loadUsers,
        companySubscription,
        fetchCompanySubscription,
        paymentMethods,
        fetchPaymentMethods,
        invoices,
        fetchInvoices,
        activateUser,
        deactivateUser,
        role,
        permissions,
    } = useApp();

    const navigate = useNavigate();
    const [selectedPlan, setSelectedPlan] = useState<string>("starter");
    const [billingPeriod, setBillingPeriod] = useState<string>("yearly");
    const activeUsers = Math.max(users.filter((u) => u.isActive).length, 1);
    const [loading, setLoading] = useState(false);
    const [showUserManagement, setShowUserManagement] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    // ── Load Data ──
    useEffect(() => {
        loadUsers();
        fetchCompanySubscription();
        fetchPaymentMethods();
        fetchInvoices();
    }, []);

    // ── Get Selected Plan ──
    const selectedPlanData = PLANS.find((p) => p.id === selectedPlan) || PLANS[0];
    const selectedPeriod = BILLING_PERIODS.find((p) => p.id === billingPeriod) || BILLING_PERIODS[3];

    // ── Calculate Pricing ──
    const calculatePrice = () => {
        const basePrice = 600 * activeUsers * selectedPeriod.multiplier;
        const discountAmount = (basePrice * selectedPeriod.discount) / 100;
        const discountedPrice = basePrice - discountAmount;
        const gst = discountedPrice * 0.18;
        const total = discountedPrice + gst;

        return {
            basePrice,
            discountAmount,
            discountedPrice,
            gst,
            total,
            perMonth: total / selectedPeriod.multiplier,
            perUser: total / Math.max(activeUsers, 1),
        };
    };

    const pricing = calculatePrice();

    // ── Handle Purchase ──
    const handlePurchase = async () => {
        if (selectedPlan === "custom") {
            toast.info("Please contact our sales team for custom pricing");
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            if (!token) throw new Error("Not logged in");

            const response = await api.payments.createOrder(
                Math.round(pricing.total),
                "INR",
                `${selectedPlan}_${billingPeriod}`,
                token
            );

            if (response?.success && response?.payuData && response?.payuUrl) {
                const form = document.createElement("form");
                form.method = "POST";
                form.action = response.payuUrl;
                Object.entries(response.payuData).forEach(([key, value]) => {
                    const input = document.createElement("input");
                    input.type = "hidden";
                    input.name = key;
                    input.value = String(value);
                    form.appendChild(input);
                });
                document.body.appendChild(form);
                form.submit();
            } else {
                toast.error("Failed to create payment order");
            }
        } catch (error: any) {
            toast.error(error.message || "Payment failed");
        } finally {
            setLoading(false);
        }
    };

    // ── PayU Direct Payment ──
    const handlePayUPayment = () => {
        window.open("https://u.payu.in/PrZ2PnY224hC", "_blank");
    };

    // ── Status Badge ──
    const getStatusBadge = (status: string) => {
        switch (status?.toLowerCase()) {
            case "paid":
                return "bg-emerald-100 text-emerald-700 border-emerald-200";
            case "pending":
                return "bg-amber-100 text-amber-700 border-amber-200";
            case "failed":
                return "bg-red-100 text-red-700 border-red-200";
            default:
                return "bg-gray-100 text-gray-700 border-gray-200";
        }
    };

    // ── Role Check ──
    const canAccessBilling = hasModuleAccess(permissions, 'billing', ['full', 'dept', 'team', 'view']);
    if (!canAccessBilling) {
        return (
            <div className="p-4 lg:p-6 flex items-center justify-center min-h-[60vh]">
                <div className="text-center max-w-md">
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock size={40} className="text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Restricted</h2>
                    <p className="text-slate-500 mb-6">
                        You need admin access to view pricing and billing information.
                    </p>
                    <button
                        onClick={() => navigate("/")}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 lg:p-6 max-w-[1600px]">
            {/* ── Header ── */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <CreditCard size={24} className="text-indigo-600" />
                        Price List & Billing
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Manage your subscription, plans, and billing preferences
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
                    >
                        <RefreshCw size={14} className="text-slate-500" />
                    </button>
                </div>
            </div>

            {/* ── Two-Column Layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* ── LEFT COLUMN (40%) ── */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Current Subscription */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Current Subscription
                        </h3>

                        <div className="mt-3">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-slate-900">
                                            {companySubscription?.company?.plan_type || "Professional"}
                                        </h2>
                                        <span
                                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${companySubscription?.company?.subscription_status === "active"
                                                ? "bg-emerald-100 text-emerald-700"
                                                : "bg-amber-100 text-amber-700"
                                                }`}
                                        >
                                            {companySubscription?.company?.subscription_status === "active"
                                                ? "Active"
                                                : "Trial"}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-0.5">
                                        Renews:{" "}
                                        {companySubscription?.company?.subscription_end
                                            ? new Date(
                                                companySubscription.company.subscription_end
                                            ).toLocaleDateString("en-IN", {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                            })
                                            : "28 Aug 2026"}
                                    </p>
                                    <button
                                        onClick={() => toast.info("Cancel subscription feature coming soon")}
                                        className="text-xs text-red-500 hover:text-red-600 mt-1"
                                    >
                                        Cancel Subscription
                                    </button>
                                </div>
                                <div className="text-right">
                                    <span className="text-3xl font-bold text-slate-900">
                                        ₹{Math.round(pricing.perMonth)}
                                    </span>
                                    <span className="text-sm text-slate-400">/mo</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Usage Cards */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-slate-700">Contacts</span>
                                    <span className="text-xs text-slate-500">
                                        {userProfile?.total_contacts || 0} / 50,000
                                    </span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2">
                                    <div
                                        className="bg-indigo-500 rounded-full h-2"
                                        style={{
                                            width: `${Math.min(((userProfile?.total_contacts || 0) / 50000) * 100, 100)}%`,
                                        }}
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-slate-700">Team Members</span>
                                    <span className="text-xs text-slate-500">
                                        {users.filter((u) => u.isActive).length} / Unlimited
                                    </span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2">
                                    <div
                                        className="bg-indigo-500 rounded-full h-2"
                                        style={{
                                            width: `${Math.min((users.filter((u) => u.isActive).length / 50) * 100, 100)}%`,
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={() => setShowUserManagement(!showUserManagement)}
                                    className="text-xs text-indigo-600 hover:text-indigo-700 mt-2 flex items-center gap-1"
                                >
                                    Manage Team <ArrowRight size={12} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Billing History */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-800 text-sm">Billing History</h3>
                            <button
                                onClick={() => fetchInvoices()}
                                className="p-1.5 hover:bg-slate-50 rounded-lg transition-colors"
                                title="Refresh"
                            >
                                <RefreshCw size={12} className="text-slate-400" />
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left border-collapse">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="py-2 px-3 text-[10px] text-slate-500 font-medium">Date</th>
                                        <th className="py-2 px-3 text-[10px] text-slate-500 font-medium">Invoice #</th>
                                        <th className="py-2 px-3 text-[10px] text-slate-500 font-medium">Amount</th>
                                        <th className="py-2 px-3 text-[10px] text-slate-500 font-medium">Status</th>
                                        <th className="py-2 px-3 text-[10px] text-slate-500 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {invoices.length > 0 ? (
                                        invoices.map((invoice: Invoice) => (
                                            <tr key={invoice.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="py-2.5 px-3 text-[10px] text-slate-600">
                                                    {new Date(invoice.created_at).toLocaleDateString("en-IN", {
                                                        day: "numeric",
                                                        month: "short",
                                                    })}
                                                </td>
                                                <td className="py-2.5 px-3 text-[10px] text-slate-600">
                                                    {invoice.invoice_number}
                                                </td>
                                                <td className="py-2.5 px-3 text-[10px] font-semibold text-slate-800">
                                                    ₹{invoice.total_amount}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <span
                                                        className={`text-[8px] px-1.5 py-0.5 rounded-full border font-medium ${getStatusBadge(
                                                            invoice.status
                                                        )}`}
                                                    >
                                                        {invoice.status}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <button
                                                        onClick={() => toast.info("Invoice download coming soon")}
                                                        className="text-indigo-600 text-[10px] hover:text-indigo-700"
                                                    >
                                                        Download
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-slate-400">
                                                <div className="flex flex-col items-center gap-1.5">
                                                    <FileText size={20} className="text-slate-300" />
                                                    <p className="text-[11px] text-slate-400">No invoices available.</p>
                                                    <p className="text-[9px] text-slate-300">Invoices will appear after purchase.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT COLUMN (60%) ── */}
                <div className="lg:col-span-3 space-y-4">
                    {/* Plans */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <h3 className="text-sm font-semibold text-slate-800 mb-4">CRM Plans</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Starter Plan */}
                            <div
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                    selectedPlan === 'starter' 
                                        ? 'border-indigo-500 bg-indigo-50 shadow-sm' 
                                        : 'border-slate-200 hover:border-indigo-200'
                                }`}
                                onClick={() => setSelectedPlan('starter')}
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <span className={`text-sm font-semibold ${selectedPlan === 'starter' ? 'text-indigo-700' : 'text-slate-800'}`}>
                                            Starter Plan
                                        </span>
                                        <p className={`text-xl font-bold ${selectedPlan === 'starter' ? 'text-indigo-700' : 'text-slate-900'}`}>
                                            ₹600
                                            <span className="text-xs font-normal text-slate-400">/user/month</span>
                                        </p>
                                        <p className="text-xs text-slate-500 mt-0.5">For growing teams and small businesses.</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">1-50 Users</p>
                                    </div>
                                    {selectedPlan === 'starter' && (
                                        <CheckCircle size={18} className="text-indigo-600 flex-shrink-0 mt-1" />
                                    )}
                                </div>
                            </div>

                            {/* Custom Plan */}
                            <div
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                    selectedPlan === 'custom' 
                                        ? 'border-indigo-500 bg-indigo-50 shadow-sm' 
                                        : 'border-slate-200 hover:border-indigo-200'
                                }`}
                                onClick={() => setSelectedPlan('custom')}
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <span className={`text-sm font-semibold ${selectedPlan === 'custom' ? 'text-indigo-700' : 'text-slate-800'}`}>
                                            Custom Plan
                                        </span>
                                        <p className={`text-xl font-bold ${selectedPlan === 'custom' ? 'text-indigo-700' : 'text-slate-900'}`}>
                                            Custom Price
                                        </p>
                                        <p className="text-xs text-slate-500 mt-0.5">Contact Sales for custom pricing based on your business requirements.</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">50+ Users</p>
                                    </div>
                                    {selectedPlan === 'custom' && (
                                        <CheckCircle size={18} className="text-indigo-600 flex-shrink-0 mt-1" />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Billing Calculator */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <h3 className="text-sm font-semibold text-slate-800 mb-4">Billing Calculator</h3>

                        {/* Pay Period */}
                        <div>
                            <p className="text-xs text-slate-400 mb-2">Pay Period</p>
                            <div className="flex flex-wrap gap-2">
                                {BILLING_PERIODS.map((period) => {
                                    const isSelected = billingPeriod === period.id;
                                    return (
                                        <button
                                            key={period.id}
                                            onClick={() => setBillingPeriod(period.id)}
                                            className={`px-4 py-2 text-xs rounded-lg border transition-all ${isSelected
                                                ? "bg-indigo-600 text-white border-indigo-600"
                                                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                                                }`}
                                        >
                                            {period.label}
                                            {period.discount > 0 && (
                                                <span
                                                    className={`ml-1 text-[8px] font-medium ${isSelected ? "text-indigo-200" : "text-emerald-500"
                                                        }`}
                                                >
                                                    Save {period.discount}%
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Users (Automatic) */}
                        <div className="mt-4">
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-slate-500">Active Users (Auto)</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                        {users.filter(u => u.isActive).length} Active of {users.length} Total Users
                                    </p>
                                    <p className="text-[9px] text-indigo-500 font-medium mt-1">
                                        Managed automatically from User Management.
                                    </p>
                                </div>
                                <span className="text-lg font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                                    {users.filter(u => u.isActive).length}
                                </span>
                            </div>
                        </div>

                        {/* Price Breakdown */}
                        <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Active Users</span>
                                    <span className="text-slate-700">
                                        {activeUsers} × ₹600{selectedPeriod.multiplier > 1 ? ` × ${selectedPeriod.multiplier} mo` : ""}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm border-t border-slate-200 pt-1.5">
                                    <span className="text-slate-500">Base Price</span>
                                    <span className="text-slate-700">
                                        ₹{pricing.basePrice.toFixed(0)}
                                    </span>
                                </div>
                                {pricing.discountAmount > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-emerald-500">Discount ({selectedPeriod.discount}%)</span>
                                        <span className="text-emerald-500">
                                            -₹{pricing.discountAmount.toFixed(0)}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">GST (18%)</span>
                                    <span className="text-slate-700">₹{pricing.gst.toFixed(0)}</span>
                                </div>
                                <div className="border-t border-slate-200 pt-2 mt-2">
                                    <div className="flex justify-between">
                                        <span className="font-semibold text-slate-800">Total</span>
                                        <span className="text-xl font-bold text-indigo-600">
                                            ₹{pricing.total.toFixed(0)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 text-right">
                                        {selectedPeriod.label} plan · ₹{pricing.perMonth.toFixed(0)}/month
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Purchase Button */}
                        <button
                            onClick={handlePurchase}
                            disabled={loading || selectedPlan === "custom"}
                            className="w-full mt-4 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>Processing...</>
                            ) : selectedPlan === "custom" ? (
                                <>Contact Sales for Custom Pricing</>
                            ) : (
                                <>Purchase Bundle ₹{pricing.total.toFixed(0)}</>
                            )}
                        </button>

                        {selectedPeriod.discount > 0 && (
                            <p className="text-xs text-emerald-600 text-center mt-2">
                                💰 Save {selectedPeriod.discount}% with {selectedPeriod.label} plan
                            </p>
                        )}
                    </div>

                    {/* Pay with PayU */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-semibold text-slate-800">Pay with PayU</h4>
                                <p className="text-xs text-slate-400">
                                    Secure payment through PayU Payment Gateway
                                </p>
                            </div>
                            <button
                                onClick={handlePayUPayment}
                                className="px-6 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
                            >
                                Pay Now
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-3">
                            🔒 Secure payment via PayU Payment Gateway
                        </p>
                    </div>
                </div>
            </div>



            {/* ── USER MANAGEMENT ── */}
            {showUserManagement && (
                <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <h3 className="font-semibold text-slate-800">User Management</h3>
                            <div className="flex items-center gap-3 text-xs">
                                <span className="text-slate-500">Total: {users.length}</span>
                                <span className="text-emerald-600">
                                    ● Active: {users.filter((u) => u.isActive).length}
                                </span>
                                <span className="text-slate-400">
                                    ○ Inactive: {users.filter((u) => !u.isActive).length}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowUserManagement(false)}
                            className="text-sm text-slate-400 hover:text-slate-600"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="overflow-x-auto p-4">
                        <div className="space-y-2">
                            {users.slice(0, 10).map((user) => (
                                <div
                                    key={user.id}
                                    className="flex items-center justify-between py-2 px-3 hover:bg-slate-50 rounded-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                                            {user.name
                                                ?.split(" ")
                                                .map((n) => n[0])
                                                .join("")
                                                .slice(0, 2)
                                                .toUpperCase() || "U"}
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-slate-800">{user.name}</p>
                                            <p className="text-[10px] text-slate-400">{user.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.isActive
                                                ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                                : "bg-slate-100 text-slate-500 border border-slate-200"
                                                }`}
                                        >
                                            {user.isActive ? "● Active" : "○ Inactive"}
                                        </span>
                                        <button
                                            onClick={() =>
                                                user.isActive ? deactivateUser(user.id) : activateUser(user.id)
                                            }
                                            className={`text-xs px-2 py-1 rounded-lg ${user.isActive
                                                ? "text-red-500 hover:bg-red-50"
                                                : "text-emerald-500 hover:bg-emerald-50"
                                                }`}
                                        >
                                            {user.isActive ? "Deactivate" : "Activate"}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {users.length > 10 && (
                            <button
                                onClick={() => navigate("/admin")}
                                className="text-xs text-indigo-600 hover:text-indigo-700 mt-3 block"
                            >
                                View all {users.length} users →
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}