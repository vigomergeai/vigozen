import React, { useState } from "react";
import { X, RefreshCw } from "lucide-react";
import { Lead, LeadStatus } from "../data/mockData";

interface ConvertLeadModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onConvert: (data: { title: string; value: number; stage: LeadStatus }) => void;
  loading: boolean;
}

const STAGES: LeadStatus[] = ["New", "Contacted", "Qualified", "Proposal", "Negotiation"];

export default function ConvertLeadModal({
  isOpen,
  lead,
  onClose,
  onConvert,
  loading,
}: ConvertLeadModalProps) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState<LeadStatus>("New");

  // Reset form when lead changes
  React.useEffect(() => {
    if (lead) {
      setTitle(`Deal for ${lead.name}`);
      setValue(String(lead.value || 0));
      setStage("New");
    }
  }, [lead]);

  if (!isOpen || !lead) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onConvert({
      title: title.trim(),
      value: parseFloat(value) || 0,
      stage,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-slate-800 dark:text-white font-semibold">Convert to Deal</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Convert "{lead.name}" from {lead.company}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">
              Deal Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter deal title"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">
              Deal Value (₹)
            </label>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter deal value"
              min="0"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">
              Initial Stage
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as LeadStatus)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white"
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex-1 py-2.5 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Converting...
                </>
              ) : (
                "→ Convert to Deal"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
