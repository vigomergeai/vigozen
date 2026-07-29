import React, { useState, useEffect } from "react";
import {
    X,
    Plus,
    Loader2,
    CreditCard,
    Check,
    AlertCircle,
    Trash2,
    Edit,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──
interface PaymentMethodFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        last4: string;
        brand: string;
        expiry: string;
        is_default?: boolean;
    }) => Promise<void>;
    editing?: {
        id: string;
        last4: string;
        brand: string;
        expiry: string;
        is_default: boolean;
    } | null;
    loading?: boolean;
}

// ── Constants ──
const CARD_BRANDS = [
    { value: "Visa", label: "Visa", icon: "💳" },
    { value: "Mastercard", label: "Mastercard", icon: "💳" },
    { value: "Amex", label: "American Express", icon: "💳" },
    { value: "Rupay", label: "RuPay", icon: "💳" },
    { value: "Discover", label: "Discover", icon: "💳" },
    { value: "Other", label: "Other", icon: "💳" },
];

export default function PaymentMethodForm({
    isOpen,
    onClose,
    onSave,
    editing = null,
    loading = false,
}: PaymentMethodFormProps) {
    // ── Form State ──
    const [last4, setLast4] = useState("");
    const [brand, setBrand] = useState("");
    const [expiry, setExpiry] = useState("");
    const [isDefault, setIsDefault] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // ── Reset form when modal opens or editing changes ──
    useEffect(() => {
        if (isOpen) {
            if (editing) {
                setLast4(editing.last4);
                setBrand(editing.brand);
                setExpiry(editing.expiry);
                setIsDefault(editing.is_default);
            } else {
                setLast4("");
                setBrand("");
                setExpiry("");
                setIsDefault(false);
            }
            setErrors({});
        }
    }, [isOpen, editing]);

    // ── Validation ──
    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!brand) {
            newErrors.brand = "Please select a card brand";
        }

        if (!last4 || last4.length !== 4) {
            newErrors.last4 = "Please enter the last 4 digits of your card";
        }

        if (!/^\d{4}$/.test(last4)) {
            newErrors.last4 = "Must be 4 numbers";
        }

        if (!expiry || !/^\d{2}\/\d{2}$/.test(expiry)) {
            newErrors.expiry = "Please enter expiry in MM/YY format";
        }

        if (expiry) {
            const [month, year] = expiry.split("/");
            const monthNum = parseInt(month);
            const yearNum = parseInt(year);
            const currentYear = new Date().getFullYear() % 100;
            const currentMonth = new Date().getMonth() + 1;

            if (monthNum < 1 || monthNum > 12) {
                newErrors.expiry = "Invalid month";
            } else if (yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth)) {
                newErrors.expiry = "Card has expired";
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // ── Handle Save ──
    const handleSave = async () => {
        if (!validate()) return;

        setSubmitting(true);
        try {
            await onSave({
                last4,
                brand,
                expiry,
                is_default: isDefault,
            });
            toast.success(editing ? "Payment method updated!" : "Payment method added!");
            onClose();
        } catch (error) {
            // Error handled in parent
        } finally {
            setSubmitting(false);
        }
    };

    // ── Format expiry input ──
    const handleExpiryChange = (value: string) => {
        let val = value.replace(/\D/g, "");
        if (val.length >= 2) {
            val = val.slice(0, 2) + "/" + val.slice(2, 4);
        }
        setExpiry(val.slice(0, 5));
    };

    // ── Handle Last4 input ──
    const handleLast4Change = (value: string) => {
        const val = value.replace(/\D/g, "").slice(0, 4);
        setLast4(val);
    };

    // ── Don't render if not open ──
    if (!isOpen) return null;

    const isEditing = !!editing;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
                {/* ── Header ── */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                            <CreditCard size={18} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-800">
                                {isEditing ? "Edit Payment Method" : "Add Payment Method"}
                            </h2>
                            <p className="text-xs text-slate-400">
                                {isEditing ? "Update your card details" : "Add a new card for billing"}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="p-2 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                        <X size={18} className="text-slate-500" />
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="p-6 space-y-4">
                    {/* ── Card Preview ── */}
                    <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white shadow-lg">
                        <div className="flex items-center justify-between">
                            <div className="text-xs opacity-80">CREDIT CARD</div>
                            <div className="text-xs font-mono opacity-80">
                                {brand || "••••"}
                            </div>
                        </div>
                        <div className="mt-6 text-2xl font-mono tracking-wider">
                            •••• •••• •••• {last4 || "••••"}
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs">
                            <div>
                                <div className="opacity-60">EXPIRES</div>
                                <div className="font-mono">{expiry || "MM/YY"}</div>
                            </div>
                            <div className="text-sm font-bold opacity-80">
                                {brand === "Visa" && "VISA"}
                                {brand === "Mastercard" && "MASTERCARD"}
                                {brand === "Amex" && "AMEX"}
                                {brand === "Rupay" && "RUPAY"}
                                {brand === "Discover" && "DISCOVER"}
                                {brand === "Other" && "CARD"}
                                {!brand && "CARD"}
                            </div>
                        </div>
                    </div>

                    {/* ── Card Brand ── */}
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Card Brand <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={brand}
                            onChange={(e) => setBrand(e.target.value)}
                            className={`w-full px-3 py-2 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all ${errors.brand ? "border-red-300 focus:ring-red-500/20" : "border-slate-200 focus:border-indigo-400"
                                }`}
                        >
                            <option value="">Select Card Brand</option>
                            {CARD_BRANDS.map((cb) => (
                                <option key={cb.value} value={cb.value}>
                                    {cb.icon} {cb.label}
                                </option>
                            ))}
                        </select>
                        {errors.brand && (
                            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                <AlertCircle size={12} /> {errors.brand}
                            </p>
                        )}
                    </div>

                    {/* ── Last 4 Digits ── */}
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Last 4 Digits <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={last4}
                            onChange={(e) => handleLast4Change(e.target.value)}
                            placeholder="1234"
                            maxLength={4}
                            className={`w-full px-3 py-2 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono tracking-wider ${errors.last4 ? "border-red-300 focus:ring-red-500/20" : "border-slate-200 focus:border-indigo-400"
                                }`}
                        />
                        {errors.last4 && (
                            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                <AlertCircle size={12} /> {errors.last4}
                            </p>
                        )}
                    </div>

                    {/* ── Expiry ── */}
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Expiry Date <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={expiry}
                            onChange={(e) => handleExpiryChange(e.target.value)}
                            placeholder="MM/YY"
                            maxLength={5}
                            className={`w-full px-3 py-2 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono ${errors.expiry ? "border-red-300 focus:ring-red-500/20" : "border-slate-200 focus:border-indigo-400"
                                }`}
                        />
                        {errors.expiry && (
                            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                <AlertCircle size={12} /> {errors.expiry}
                            </p>
                        )}
                    </div>

                    {/* ── Set as Default ── */}
                    <div className="flex items-center justify-between py-2">
                        <div>
                            <div className="text-sm font-medium text-slate-800">Set as default</div>
                            <div className="text-xs text-slate-400">
                                Make this your primary payment method
                            </div>
                        </div>
                        <button
                            onClick={() => setIsDefault(!isDefault)}
                            className={`w-11 h-6 rounded-full flex items-center transition-all ${isDefault ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"
                                }`}
                        >
                            <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                        </button>
                    </div>

                    {/* ── Info Message ── */}
                    <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                        <AlertCircle size={14} className="flex-shrink-0 text-slate-400 mt-0.5" />
                        <span>
                            {isEditing
                                ? "Your card details will be updated. Previous card will be removed."
                                : "Your card will be saved securely for future billing. You can make it default."}
                        </span>
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={submitting || loading}
                        className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-indigo-200"
                    >
                        {submitting || loading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                {isEditing ? "Updating..." : "Adding..."}
                            </>
                        ) : (
                            <>
                                <Plus size={16} />
                                {isEditing ? "Update Card" : "Add Card"}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}