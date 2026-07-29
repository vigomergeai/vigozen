import React, { useState, useEffect } from "react";
import {
    X,
    Save,
    Loader2,
    Crown,
    Check,
    AlertCircle,
    TrendingUp,
    Calendar,
    Users,
    Edit,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──
interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentPlan: string;
    currentPeriod: string;
    activeUsers: number;
    autoRenew: boolean;
    onSave: (data: {
        plan_type: string;
        billing_period: string;
        auto_renew: boolean;
    }) => Promise<void>;
    loading?: boolean;
}

// ── Constants ──
const PLAN_PRICES: Record<string, number> = {
    starter: 499,
    professional: 1299,
    enterprise: 2499,
};

const PLAN_DISPLAY: Record<string, { label: string; desc: string; icon: string; features: string[] }> = {
    starter: {
        label: "Starter",
        desc: "For small teams starting out",
        icon: "🚀",
        features: ["5 users included", "100 leads/month", "Basic reports", "Email support", "2GB storage"],
    },
    professional: {
        label: "Professional",
        desc: "For growing businesses",
        icon: "💼",
        features: ["20 users included", "Unlimited leads", "AI insights", "Priority support", "Advanced reports", "10GB storage"],
    },
    enterprise: {
        label: "Enterprise",
        desc: "For large organizations",
        icon: "🏢",
        features: ["Unlimited users", "Unlimited leads", "Custom integrations", "Dedicated support", "Custom reports", "50GB storage"],
    },
};

const BILLING_PERIODS = [
    { value: "monthly", label: "Monthly", discount: 0, term: "month", months: 1 },
    { value: "quarterly", label: "Quarterly", discount: 5, term: "3 months", months: 3 },
    { value: "half_yearly", label: "Half-Yearly", discount: 10, term: "6 months", months: 6 },
    { value: "yearly", label: "Yearly", discount: 15, term: "12 months", months: 12 },
];

export default function SubscriptionModal({
    isOpen,
    onClose,
    currentPlan,
    currentPeriod,
    activeUsers,
    autoRenew: initialAutoRenew,
    onSave,
    loading = false,
}: SubscriptionModalProps) {
    const [planType, setPlanType] = useState(currentPlan || "professional");
    const [billingPeriod, setBillingPeriod] = useState(currentPeriod || "monthly");
    const [autoRenew, setAutoRenew] = useState(initialAutoRenew ?? true);
    const [submitting, setSubmitting] = useState(false);

    // ── Reset form when modal opens ──
    useEffect(() => {
        if (isOpen) {
            setPlanType(currentPlan || "professional");
            setBillingPeriod(currentPeriod || "monthly");
            setAutoRenew(initialAutoRenew ?? true);
        }
    }, [isOpen, currentPlan, currentPeriod, initialAutoRenew]);

    // ── Calculate pricing ──
    const calculatePricing = (plan: string, period: string) => {
        const basePrice = PLAN_PRICES[plan] || 1299;
        const subtotal = basePrice * Math.max(activeUsers, 1);

        const periodInfo = BILLING_PERIODS.find((p) => p.value === period);
        const discount = periodInfo?.discount || 0;
        const discountedSubtotal = subtotal * (1 - discount / 100);
        const gst = discountedSubtotal * 0.18;
        const total = discountedSubtotal + gst;

        return {
            basePrice,
            subtotal,
            discount,
            discountedSubtotal,
            gst,
            total,
            periodLabel: periodInfo?.label || "Monthly",
            months: periodInfo?.months || 1,
        };
    };

    const pricing = calculatePricing(planType, billingPeriod);

    // ── Handle Save ──
    const handleSave = async () => {
        setSubmitting(true);
        try {
            await onSave({
                plan_type: planType,
                billing_period: billingPeriod,
                auto_renew: autoRenew,
            });
            toast.success("Subscription updated successfully!");
            onClose();
        } catch (error) {
            // Error is already handled in parent
        } finally {
            setSubmitting(false);
        }
    };

    // ── Handle Cancel ──
    const handleCancel = () => {
        if (submitting) return;
        onClose();
    };

    // ── Don't render if not open ──
    if (!isOpen) return null;

    const isChanged =
        planType !== currentPlan ||
        billingPeriod !== currentPeriod ||
        autoRenew !== initialAutoRenew;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                {/* ── Header ── */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-3xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                            <Crown size={18} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-800">Update Subscription</h2>
                            <p className="text-xs text-slate-400">Change your plan or billing preferences</p>
                        </div>
                    </div>
                    <button
                        onClick={handleCancel}
                        disabled={submitting}
                        className="p-2 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                        <X size={18} className="text-slate-500" />
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="p-6 space-y-6">
                    {/* Current Plan Info */}
                    <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                <TrendingUp size={14} className="text-indigo-600" />
                            </div>
                            <div>
                                <div className="text-xs text-slate-400">Current Plan</div>
                                <div className="text-sm font-semibold text-slate-800">
                                    {PLAN_DISPLAY[currentPlan]?.label || "Professional"} ·{" "}
                                    {BILLING_PERIODS.find((p) => p.value === currentPeriod)?.label || "Monthly"}
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-400">Active Users</div>
                            <div className="text-sm font-semibold text-slate-800">{activeUsers}</div>
                        </div>
                    </div>

                    {/* ── Plan Selection ── */}
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-3">
                            Select Plan
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {Object.entries(PLAN_DISPLAY).map(([key, plan]) => {
                                const isSelected = planType === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setPlanType(key)}
                                        className={`p-4 border-2 rounded-xl text-left transition-all relative ${isSelected
                                            ? "border-indigo-500 bg-indigo-50 shadow-md ring-2 ring-indigo-500/20"
                                            : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                                            }`}
                                    >
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                                                <Check size={10} className="text-white" />
                                            </div>
                                        )}
                                        <div className="text-2xl mb-1">{plan.icon}</div>
                                        <div className="font-semibold text-slate-800 text-sm">{plan.label}</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">{plan.desc}</div>
                                        <div className="text-sm font-bold text-indigo-600 mt-2">
                                            ₹{PLAN_PRICES[key]}/user/month
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Billing Period ── */}
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-3">
                            Billing Period
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {BILLING_PERIODS.map((period) => {
                                const isSelected = billingPeriod === period.value;
                                return (
                                    <button
                                        key={period.value}
                                        onClick={() => setBillingPeriod(period.value)}
                                        className={`p-3 border-2 rounded-xl text-center transition-all relative ${isSelected
                                            ? "border-indigo-500 bg-indigo-50 shadow-sm"
                                            : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                                            }`}
                                    >
                                        {isSelected && (
                                            <div className="absolute top-1 right-1 w-4 h-4 bg-indigo-600 rounded-full flex items-center justify-center">
                                                <Check size={8} className="text-white" />
                                            </div>
                                        )}
                                        <div className="font-medium text-slate-800 text-sm">{period.label}</div>
                                        <div className="text-[10px] text-slate-400">{period.term}</div>
                                        {period.discount > 0 && (
                                            <div className="text-[9px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full mt-1 inline-block">
                                                Save {period.discount}%
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Auto-Renew ── */}
                    <div className="flex items-center justify-between py-3 border-t border-slate-100">
                        <div>
                            <div className="text-sm font-medium text-slate-800">Auto-Renew</div>
                            <div className="text-xs text-slate-400">
                                Automatically renew subscription at end of period
                            </div>
                        </div>
                        <button
                            onClick={() => setAutoRenew(!autoRenew)}
                            className={`w-11 h-6 rounded-full flex items-center transition-all ${autoRenew ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"
                                }`}
                        >
                            <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                        </button>
                    </div>

                    {/* ── Pricing Preview ── */}
                    <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-xl p-4 border border-slate-200/50">
                        <div className="flex items-center gap-2 mb-3">
                            <Users size={14} className="text-indigo-500" />
                            <span className="text-xs font-medium text-slate-600">
                                {activeUsers} active users will be billed
                            </span>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">
                                    Base Price ({planType} × {activeUsers} users)
                                </span>
                                <span className="font-medium text-slate-700">
                                    ₹{pricing.subtotal.toLocaleString()}
                                </span>
                            </div>

                            {pricing.discount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">
                                        Discount ({pricing.discount}% - {pricing.periodLabel})
                                    </span>
                                    <span className="font-medium text-emerald-600">
                                        -₹{(pricing.subtotal - pricing.discountedSubtotal).toLocaleString()}
                                    </span>
                                </div>
                            )}

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
                                    <span className="text-xs font-normal text-slate-400 ml-1">
                                        /{pricing.periodLabel.toLowerCase()}
                                    </span>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── Plan Features Comparison ── */}
                    <div>
                        <div className="text-xs font-medium text-slate-700 mb-2">Plan Features</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {Object.entries(PLAN_DISPLAY).map(([key, plan]) => (
                                <div
                                    key={key}
                                    className={`p-3 rounded-xl border transition-all ${planType === key
                                        ? "border-indigo-300 bg-indigo-50/50"
                                        : "border-slate-200 bg-white"
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-lg">{plan.icon}</span>
                                        <span
                                            className={`text-sm font-medium ${planType === key ? "text-indigo-700" : "text-slate-600"
                                                }`}
                                        >
                                            {plan.label}
                                        </span>
                                    </div>
                                    <ul className="space-y-1">
                                        {plan.features.map((feature, idx) => (
                                            <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-600">
                                                <Check
                                                    size={10}
                                                    className={`mt-0.5 flex-shrink-0 ${planType === key ? "text-indigo-500" : "text-emerald-500"
                                                        }`}
                                                />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Info Message ── */}
                    {isChanged && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                            <span>
                                Your subscription will be updated immediately. Your next invoice will reflect the new pricing.
                                {pricing.total > calculatePricing(currentPlan, currentPeriod).total && (
                                    <> Your monthly cost will increase by ₹{(pricing.total - calculatePricing(currentPlan, currentPeriod).total).toLocaleString()}.</>
                                )}
                                {pricing.total < calculatePricing(currentPlan, currentPeriod).total && (
                                    <> Your monthly cost will decrease by ₹{(calculatePricing(currentPlan, currentPeriod).total - pricing.total).toLocaleString()}.</>
                                )}
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3 sticky bottom-0 bg-white rounded-b-3xl">
                    <button
                        onClick={handleCancel}
                        disabled={submitting}
                        className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={submitting || !isChanged}
                        className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-indigo-200"
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
    );
}