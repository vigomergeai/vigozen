import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
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
        price: 499,
        description: "For small teams and basic CRM needs",
        icon: "🚀",
        features: ["5 Users", "100 Leads/month", "Basic Reports", "Email Support", "2GB Storage"],
        userLimit: 5,
    },
    {
        id: "professional",
        name: "Professional",
        price: 1299,
        description: "Advanced features for growing businesses",
        icon: "💼",
        features: [
            "50 Users",
            "Unlimited Leads",
            "AI Insights",
            "Priority Support",
            "10GB Storage",
            "Advanced Reports",
        ],
        popular: true,
        userLimit: 50,
    },
    {
        id: "enterprise",
        name: "Enterprise",
        price: 2499,
        description: "Full-scale solutions for large organizations",
        icon: "🏢",
        features: [
            "Unlimited Users",
            "Custom Integrations",
            "Dedicated Support",
            "50GB Storage",
            "Custom Reports",
            "SLA Agreement",
        ],
        userLimit: 999,
    },
    {
        id: "custom",
        name: "Custom",
        price: 0,
        description: "Contact our sales team for custom pricing",
        icon: "🤝",
        features: ["Custom Features", "Personalized Support", "SLA Agreement"],
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
    } = useApp();

    const navigate = useNavigate();
    const [selectedPlan, setSelectedPlan] = useState<string>("professional");
    const [billingPeriod, setBillingPeriod] = useState<string>("yearly");
    const [activeUsers, setActiveUsers] = useState<number>(8);
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
    const selectedPlanData = PLANS.find((p) => p.id === selectedPlan) || PLANS[1];
    const selectedPeriod = BILLING_PERIODS.find((p) => p.id === billingPeriod) || BILLING_PERIODS[3];

    // ── Calculate Pricing ──
    const calculatePrice = () => {
        const basePrice = selectedPlanData.price * Math.max(activeUsers, 1);
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
    if (role !== "admin" && role !== "super_admin") {
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

                    {/* Next Invoice & Payment Method */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <p className="text-xs text-slate-400">Next Invoice</p>
                            <p className="text-xl font-bold text-slate-900 mt-1">
                                ₹{Math.round(pricing.total)}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Due:{" "}
                                {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(
                                    "en-IN",
                                    { day: "numeric", month: "short", year: "numeric" }
                                )}
                            </p>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <p className="text-xs text-slate-400">Payment Method</p>
                            {paymentMethods.length > 0 ? (
                                <>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="w-8 h-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded flex items-center justify-center text-white text-[10px] font-bold">
                                            {paymentMethods[0].brand?.slice(0, 4) || "VISA"}
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-slate-800">
                                                **** **** **** {paymentMethods[0].last4}
                                            </p>
                                            <p className="text-[10px] text-slate-400">
                                                Expires: {paymentMethods[0].expiry}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-2">
                                        <button className="text-xs text-indigo-600 hover:text-indigo-700">
                                            Update
                                        </button>
                                        <button className="text-xs text-red-500 hover:text-red-600">
                                            Remove
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <button
                                    onClick={() => setShowPaymentModal(true)}
                                    className="text-xs text-indigo-600 hover:text-indigo-700 mt-1 flex items-center gap-1"
                                >
                                    <Plus size={12} /> Add Payment Method
                                </button>
                            )}
                        </div>
                    </div>

                    {paymentMethods.length === 0 && (
                        <button
                            onClick={() => setShowPaymentModal(true)}
                            className="w-full py-2 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                        >
                            + Add Payment Method
                        </button>
                    )}
                </div>

                {/* ── RIGHT COLUMN (60%) ── */}
                <div className="lg:col-span-3 space-y-4">
                    {/* Plans */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <h3 className="text-sm font-semibold text-slate-800 mb-4">CRM Plans</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {PLANS.map((plan) => {
                                const isSelected = selectedPlan === plan.id;
                                return (
                                    <div
                                        key={plan.id}
                                        onClick={() => plan.id !== "custom" && setSelectedPlan(plan.id)}
                                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected
                                            ? "border-indigo-500 bg-indigo-50 shadow-sm"
                                            : "border-slate-200 hover:border-indigo-200"
                                            } ${plan.id === "custom" ? "cursor-default" : ""}`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">{plan.icon}</span>
                                                    <span
                                                        className={`text-sm font-semibold ${isSelected ? "text-indigo-700" : "text-slate-800"
                                                            }`}
                                                    >
                                                        {plan.name}
                                                    </span>
                                                    {plan.popular && (
                                                        <span className="text-[8px] bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-1.5 py-0.5 rounded-full font-medium">
                                                            POPULAR
                                                        </span>
                                                    )}
                                                </div>
                                                {plan.price > 0 ? (
                                                    <p
                                                        className={`text-xl font-bold ${isSelected ? "text-indigo-700" : "text-slate-900"
                                                            }`}
                                                    >
                                                        ₹{plan.price}
                                                        <span className="text-xs font-normal text-slate-400">
                                                            /user/month
                                                        </span>
                                                    </p>
                                                ) : (
                                                    <p className="text-sm font-medium text-slate-600">Custom Price</p>
                                                )}
                                                <p className="text-xs text-slate-500 mt-0.5">{plan.description}</p>
                                            </div>
                                            {isSelected && (
                                                <CheckCircle size={18} className="text-indigo-600 flex-shrink-0 mt-1" />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
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

                        {/* Users */}
                        <div className="mt-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-slate-400">Active Users</p>
                                <span className="text-sm font-semibold text-slate-800">{activeUsers}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setActiveUsers(Math.max(1, activeUsers - 1))}
                                    className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                                >
                                    <span className="text-lg">−</span>
                                </button>
                                <input
                                    type="range"
                                    min="1"
                                    max="50"
                                    value={activeUsers}
                                    onChange={(e) => setActiveUsers(parseInt(e.target.value))}
                                    className="flex-1 h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
                                />
                                <button
                                    onClick={() => setActiveUsers(Math.min(50, activeUsers + 1))}
                                    className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                                >
                                    <span className="text-lg">+</span>
                                </button>
                            </div>
                        </div>

                        {/* Price Breakdown */}
                        <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Base Price</span>
                                    <span className="text-slate-700">
                                        ₹{selectedPlanData.price} × {activeUsers} = ₹
                                        {pricing.basePrice.toFixed(0)}
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

            {/* ── BILLING HISTORY ── */}
            <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">Billing History</h3>
                    <button
                        onClick={() => fetchInvoices()}
                        className="p-2 hover:bg-slate-50 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={14} className="text-slate-400" />
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="text-left py-3 px-5 text-xs text-slate-500 font-medium">Date</th>
                                <th className="text-left py-3 px-5 text-xs text-slate-500 font-medium">
                                    Invoice #
                                </th>
                                <th className="text-left py-3 px-5 text-xs text-slate-500 font-medium">Amount</th>
                                <th className="text-left py-3 px-5 text-xs text-slate-500 font-medium">Status</th>
                                <th className="text-left py-3 px-5 text-xs text-slate-500 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {invoices.length > 0 ? (
                                invoices.map((invoice: Invoice) => (
                                    <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-3 px-5 text-xs text-slate-600">
                                            {new Date(invoice.created_at).toLocaleDateString("en-IN", {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                            })}
                                        </td>
                                        <td className="py-3 px-5 text-xs text-slate-600">
                                            {invoice.invoice_number}
                                        </td>
                                        <td className="py-3 px-5 text-xs font-semibold text-slate-800">
                                            ₹{invoice.total_amount}
                                        </td>
                                        <td className="py-3 px-5">
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getStatusBadge(
                                                    invoice.status
                                                )}`}
                                            >
                                                {invoice.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-5">
                                            <button
                                                onClick={() => toast.info("Invoice download coming soon")}
                                                className="text-indigo-600 text-xs hover:text-indigo-700 flex items-center gap-1"
                                            >
                                                <Download size={12} /> Download
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-slate-400 text-sm">
                                        No billing history found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
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