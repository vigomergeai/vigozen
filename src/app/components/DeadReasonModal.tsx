import React, { useState, useEffect } from "react";
import { AlertCircle, X, Check, ShieldAlert } from "lucide-react";
import { DEAD_REASONS, DeadReason } from "../data/mockData";

interface DeadReasonModalProps {
  isOpen: boolean;
  status: "Lost" | "Unqualified" | string;
  leadName?: string;
  initialReason?: string;
  onConfirm: (reason: DeadReason | string) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function DeadReasonModal({
  isOpen,
  status,
  leadName,
  initialReason = "",
  onConfirm,
  onClose,
  loading = false,
}: DeadReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>(initialReason);

  useEffect(() => {
    if (isOpen) {
      setSelectedReason(initialReason || "");
    }
  }, [isOpen, initialReason]);

  if (!isOpen) return null;

  const isUnqualified = status === "Unqualified";
  const title = isUnqualified ? "Mark Lead as Unqualified" : "Mark Lead as Lost";

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason) return;
    onConfirm(selectedReason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 bg-gradient-to-r from-rose-50/60 to-transparent dark:from-rose-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">
                {title}
              </h3>
              {leadName && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
                  Lead: <span className="font-medium text-slate-700 dark:text-slate-300">{leadName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleConfirm} className="p-6 space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <span>
              Please specify the primary reason for marking this lead as <strong>{status}</strong>. This provides crucial insights for pipeline analytics.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Reason / Cause <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-medium"
            >
              <option value="" disabled>-- Select Reason --</option>
              {DEAD_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedReason}
              className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Check size={14} />
              {loading ? "Updating..." : "Confirm & Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
