import React, { useState, useEffect, useMemo } from "react";
import {
  X, Save, RefreshCw, IndianRupee, TrendingUp, CheckCircle, Clock,
  AlertCircle, Sparkles, Building2, Calendar, Check, AlertTriangle, Info,
  Layers, ShieldCheck, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import {
  ConstructionMilestone,
  DealPaymentScheduleData,
  MASTER_24_CONSTRUCTION_STAGES,
  recalculateMilestones,
  calculateSavingsMetrics,
  MilestoneStatus,
  PaymentStatus
} from "../data/constructionMilestones";
import { formatCurrency } from "../../utils/formatters";

interface PaymentPlanModuleProps {
  dealId: string;
  dealTitle: string;
  dealCompany?: string;
  initialValue?: number;
  onClose: () => void;
  onSaved?: (agreementValue: number) => void;
}

export default function PaymentPlanModule({
  dealId,
  dealTitle,
  dealCompany,
  initialValue = 1000000,
  onClose,
  onSaved,
}: PaymentPlanModuleProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agreementValue, setAgreementValue] = useState<number>(initialValue > 0 ? initialValue : 1000000);
  const [milestones, setMilestones] = useState<ConstructionMilestone[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"schedule" | "comparison">("schedule");

  const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

  // Fetch schedule on mount
  useEffect(() => {
    let isMounted = true;
    const fetchSchedule = async () => {
      setLoading(true);
      try {
        const token = getToken();
        const res = await fetch(`${import.meta.env.VITE_API_URL}/deals/${dealId}/payment-schedule`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load payment schedule (${res.status})`);
        }

        const data: DealPaymentScheduleData = await res.json();
        if (isMounted) {
          const av = Number(data.agreement_value) > 0 ? Number(data.agreement_value) : (initialValue > 0 ? initialValue : 1000000);
          setAgreementValue(av);
          setScheduleId(data.id || null);
          setNotes(data.notes || "");

          if (data.milestones && data.milestones.length > 0) {
            setMilestones(recalculateMilestones(av, data.milestones));
          } else {
            setMilestones(recalculateMilestones(av, MASTER_24_CONSTRUCTION_STAGES as ConstructionMilestone[]));
          }
        }
      } catch (err: any) {
        console.warn("Using fallback local schedule generation:", err.message);
        if (isMounted) {
          const av = initialValue > 0 ? initialValue : 1000000;
          setAgreementValue(av);
          setMilestones(recalculateMilestones(av, MASTER_24_CONSTRUCTION_STAGES as ConstructionMilestone[]));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchSchedule();
    return () => { isMounted = false; };
  }, [dealId, initialValue]);

  // Handle agreement value change with real-time recalculation
  const handleAgreementValueChange = (val: number) => {
    const safeVal = Math.max(0, val);
    setAgreementValue(safeVal);
    setMilestones(prev => recalculateMilestones(safeVal, prev));
  };

  // Update specific milestone field
  const updateMilestone = (order: number, updates: Partial<ConstructionMilestone>) => {
    setMilestones(prev => {
      const updated = prev.map(m => (m.order === order ? { ...m, ...updates } : m));
      return recalculateMilestones(agreementValue, updated);
    });
  };

  // Reset to default 24 stages
  const handleResetDefaults = () => {
    if (window.confirm("Reset all milestones to the 24 master construction stages? Custom edits will be overwritten.")) {
      setMilestones(recalculateMilestones(agreementValue, MASTER_24_CONSTRUCTION_STAGES as ConstructionMilestone[]));
      toast.info("Reset to default 24 construction milestones");
    }
  };

  // Calculated metrics
  const metrics = useMemo(() => {
    return calculateSavingsMetrics(agreementValue, milestones);
  }, [agreementValue, milestones]);

  const isPercentageValid = Math.abs(metrics.totalPercentage - 100) < 0.01;

  // Save to backend
  const handleSave = async () => {
    if (!isPercentageValid) {
      toast.error(`Milestones must total 100%. Current total: ${metrics.totalPercentage.toFixed(2)}%`);
      return;
    }

    if (agreementValue <= 0) {
      toast.error("Agreement value must be greater than ₹0");
      return;
    }

    setSaving(true);
    try {
      const token = getToken();
      const payload = {
        agreement_value: agreementValue,
        milestones: milestones,
        notes: notes || null,
      };

      const res = await fetch(`${import.meta.env.VITE_API_URL}/deals/${dealId}/payment-schedule`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${res.status}`);
      }

      const savedData = await res.json();
      setScheduleId(savedData.id);
      toast.success("Payment schedule saved successfully!");
      if (onSaved) onSaved(agreementValue);
    } catch (err: any) {
      console.error("Save schedule error:", err);
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-7xl max-h-[95vh] flex flex-col overflow-hidden">
        
        {/* ── Modal Header ── */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white">Dynamic Construction Payment Plan</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 font-medium">
                  24 Milestones
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                Deal: <span className="font-semibold text-white">{dealTitle}</span> {dealCompany && `• ${dealCompany}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              className="px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-lg border border-slate-700 transition flex items-center gap-1.5"
              title="Reset to 24 standard stages"
            >
              <RefreshCw size={13} />
              Reset Stages
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Tab Switcher & Quick Controls ── */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("schedule")}
              className={`px-4 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition ${
                activeTab === "schedule"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              Milestone Breakdown & Schedule
            </button>
            <button
              onClick={() => setActiveTab("comparison")}
              className={`px-4 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition flex items-center gap-1.5 ${
                activeTab === "comparison"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <Sparkles size={14} className="text-amber-500" />
              40:30:30 + RTMI vs UC Analysis
            </button>
          </div>

          {/* Real-time Agreement Value Editor */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-600">Agreement Value:</span>
            <div className="relative flex items-center">
              <span className="absolute left-2.5 text-slate-400 text-sm font-semibold">₹</span>
              <input
                type="number"
                value={agreementValue || ""}
                onChange={(e) => handleAgreementValueChange(Number(e.target.value))}
                placeholder="1000000"
                className="w-36 pl-6 pr-2 py-1 text-sm font-bold text-indigo-700 bg-indigo-50/50 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* ── KPI Cards Section ── */}
        <div className="p-4 sm:p-6 bg-slate-50/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-b border-slate-200">
          
          {/* Card 1: Agreement Value */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Agreement Value</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <IndianRupee size={16} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {formatCurrency(metrics.agreementValue)}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span>{milestones.length} Milestones</span>
              <span>•</span>
              <span className={isPercentageValid ? "text-emerald-600 font-medium" : "text-red-500 font-bold"}>
                {metrics.totalPercentage.toFixed(1)}% Total
              </span>
            </p>
          </div>

          {/* Card 2: Total Paid */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Paid</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle size={16} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-600">
              {formatCurrency(metrics.totalPaid)}
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (metrics.totalPaid / (metrics.agreementValue || 1)) * 100)}%` }}
              />
            </div>
          </div>

          {/* Card 3: Total Pending */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-amber-300 transition">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Pending</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock size={16} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-600">
              {formatCurrency(metrics.totalPending)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {milestones.filter(m => m.paymentStatus !== 'Paid').length} installments remaining
            </p>
          </div>

          {/* Card 4: Savings Comparison (RTMI vs UC) */}
          <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-purple-900 p-4 rounded-xl text-white shadow-md relative overflow-hidden group">
            <div className="flex items-center justify-between text-indigo-200 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={13} className="text-amber-300" />
                Savings Comparison
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-indigo-200 border border-white/20 font-medium">
                RTMI vs UC
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-300">
              {formatCurrency(metrics.buyerSavings)}
            </div>
            <div className="flex items-center justify-between text-[11px] text-indigo-200 mt-1 font-medium">
              <span>RTMI: {formatCurrency(metrics.rtmiCost)}</span>
              <span>UC: {formatCurrency(metrics.ucCost)}</span>
            </div>
          </div>

        </div>

        {/* ── Main Content Area ── */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
              <p className="text-sm">Loading construction payment schedule...</p>
            </div>
          ) : activeTab === "schedule" ? (
            <div className="space-y-4">
              
              {/* Warning if percentage != 100% */}
              {!isPercentageValid && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-500 shrink-0" />
                    <span>
                      Milestone percentages must sum to 100%. Current sum is <strong>{metrics.totalPercentage.toFixed(2)}%</strong> (difference of {(100 - metrics.totalPercentage).toFixed(2)}%).
                    </span>
                  </div>
                  <button
                    onClick={handleResetDefaults}
                    className="px-2 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700"
                  >
                    Auto-Fix
                  </button>
                </div>
              )}

              {/* 12-Column Construction Milestones Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700 border-collapse">
                    <thead className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px] sticky top-0 z-10 backdrop-blur-sm">
                      <tr>
                        <th className="py-3 px-2 text-center w-10">#</th>
                        <th className="py-3 px-3 min-w-[180px]">Construction Stage</th>
                        <th className="py-3 px-2 text-center w-20">% Slab</th>
                        <th className="py-3 px-3 text-right min-w-[120px]">Milestone Amount</th>
                        <th className="py-3 px-3 text-right min-w-[110px]">0.9% Installment</th>
                        <th className="py-3 px-3 text-right min-w-[110px]">Cumulative EMI</th>
                        <th className="py-3 px-2 text-center w-24">40:30:30</th>
                        <th className="py-3 px-3 min-w-[120px]">Milestone Status</th>
                        <th className="py-3 px-3 min-w-[125px]">Payment Status</th>
                        <th className="py-3 px-2 min-w-[110px]">Due Date</th>
                        <th className="py-3 px-2 min-w-[110px]">Completed Date</th>
                        <th className="py-3 px-2 text-center w-16">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {milestones.map((m) => {
                        const isPaid = m.paymentStatus === "Paid";
                        return (
                          <tr
                            key={m.order}
                            className={`hover:bg-indigo-50/30 transition-colors ${
                              isPaid ? "bg-emerald-50/20" : ""
                            }`}
                          >
                            {/* 1. Order */}
                            <td className="py-2.5 px-2 text-center font-bold text-slate-400">
                              {m.order}
                            </td>

                            {/* 2. Stage Name */}
                            <td className="py-2.5 px-3 font-medium text-slate-900">
                              <input
                                type="text"
                                value={m.stageName}
                                onChange={(e) => updateMilestone(m.order, { stageName: e.target.value })}
                                className="w-full bg-transparent hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 px-1.5 py-0.5 rounded transition text-xs font-semibold text-slate-800"
                              />
                            </td>

                            {/* 3. Percentage */}
                            <td className="py-2.5 px-2 text-center">
                              <div className="inline-flex items-center justify-center">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={m.percentage}
                                  onChange={(e) => updateMilestone(m.order, { percentage: Number(e.target.value) })}
                                  className="w-14 text-center font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-xs"
                                />
                                <span className="text-slate-400 text-[10px] ml-0.5">%</span>
                              </div>
                            </td>

                            {/* 4. Milestone Amount */}
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                              {formatCurrency(m.amount || 0)}
                            </td>

                            {/* 5. 0.9% Installment */}
                            <td className="py-2.5 px-3 text-right font-semibold text-indigo-600">
                              {formatCurrency(m.installment || 0)}
                            </td>

                            {/* 6. Cumulative EMI */}
                            <td className="py-2.5 px-3 text-right font-bold text-slate-700">
                              {formatCurrency(m.cumulativeEmi || 0)}
                            </td>

                            {/* 7. 40:30:30 Structure Badge */}
                            <td className="py-2.5 px-2 text-center">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                  m.slabRatio === "40%"
                                    ? "bg-sky-100 text-sky-700 border border-sky-200"
                                    : m.slabRatio === "30%"
                                    ? "bg-purple-100 text-purple-700 border border-purple-200"
                                    : "bg-slate-100 text-slate-600 border border-slate-200"
                                }`}
                              >
                                {m.slabRatio || "Phase"}
                              </span>
                            </td>

                            {/* 8. Milestone Status */}
                            <td className="py-2.5 px-3">
                              <select
                                value={m.milestoneStatus}
                                onChange={(e) =>
                                  updateMilestone(m.order, {
                                    milestoneStatus: e.target.value as MilestoneStatus,
                                  })
                                }
                                className={`w-full px-2 py-1 text-xs rounded-lg border focus:outline-none font-medium ${
                                  m.milestoneStatus === "Completed"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : m.milestoneStatus === "In-Progress"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-slate-50 text-slate-600 border-slate-200"
                                }`}
                              >
                                <option value="Upcoming">Upcoming</option>
                                <option value="In-Progress">In-Progress</option>
                                <option value="Completed">Completed</option>
                              </select>
                            </td>

                            {/* 9. Payment Status */}
                            <td className="py-2.5 px-3">
                              <select
                                value={m.paymentStatus}
                                onChange={(e) =>
                                  updateMilestone(m.order, {
                                    paymentStatus: e.target.value as PaymentStatus,
                                  })
                                }
                                className={`w-full px-2 py-1 text-xs rounded-lg border focus:outline-none font-bold ${
                                  m.paymentStatus === "Paid"
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                    : m.paymentStatus === "Partially Paid"
                                    ? "bg-blue-100 text-blue-800 border-blue-300"
                                    : m.paymentStatus === "Overdue"
                                    ? "bg-red-100 text-red-800 border-red-300"
                                    : "bg-amber-100 text-amber-800 border-amber-300"
                                }`}
                              >
                                <option value="Pending">Pending</option>
                                <option value="Paid">Paid</option>
                                <option value="Partially Paid">Partially Paid</option>
                                <option value="Overdue">Overdue</option>
                              </select>
                            </td>

                            {/* 10. Due Date */}
                            <td className="py-2.5 px-2">
                              <input
                                type="date"
                                value={m.dueDate ? String(m.dueDate).substring(0, 10) : ""}
                                onChange={(e) => updateMilestone(m.order, { dueDate: e.target.value || null })}
                                className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                            </td>

                            {/* 11. Completion Date */}
                            <td className="py-2.5 px-2">
                              <input
                                type="date"
                                value={m.completionDate ? String(m.completionDate).substring(0, 10) : ""}
                                onChange={(e) =>
                                  updateMilestone(m.order, { completionDate: e.target.value || null })
                                }
                                className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                            </td>

                            {/* 12. Quick Action (Toggle Paid) */}
                            <td className="py-2.5 px-2 text-center">
                              <button
                                onClick={() =>
                                  updateMilestone(m.order, {
                                    paymentStatus: isPaid ? "Pending" : "Paid",
                                    milestoneStatus: isPaid ? m.milestoneStatus : "Completed",
                                  })
                                }
                                className={`p-1.5 rounded-lg transition ${
                                  isPaid
                                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                    : "bg-slate-100 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                }`}
                                title={isPaid ? "Mark as Pending" : "Mark as Paid"}
                              >
                                <Check size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold text-slate-800 text-xs border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={2} className="py-3 px-3">
                          Total (24 Stages)
                        </td>
                        <td className="py-3 px-2 text-center text-indigo-700">
                          {metrics.totalPercentage.toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-right text-slate-900">
                          {formatCurrency(metrics.agreementValue)}
                        </td>
                        <td className="py-3 px-3 text-right text-indigo-600">
                          {formatCurrency(
                            milestones.reduce((s, m) => s + (m.installment || 0), 0)
                          )}
                        </td>
                        <td colSpan={7} className="py-3 px-3 text-right text-slate-500 font-normal">
                          Paid: <strong className="text-emerald-600">{formatCurrency(metrics.totalPaid)}</strong> | Pending: <strong className="text-amber-600">{formatCurrency(metrics.totalPending)}</strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

            </div>
          ) : (
            /* ── Tab 2: 40:30:30 + RTMI vs UC Savings Analysis ── */
            <div className="space-y-6 max-w-4xl mx-auto py-2">
              
              <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-2xl shadow-xl relative overflow-hidden">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-amber-400/20 rounded-xl text-amber-300 border border-amber-400/30">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">40:30:30 Construction vs Ready-To-Move-In (RTMI)</h3>
                    <p className="text-xs text-indigo-200">Customer Pre-EMI vs Full Disbursal Comparison</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
                  <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15">
                    <span className="text-xs text-indigo-200 uppercase font-semibold">RTMI Estimated Interest</span>
                    <div className="text-2xl font-black text-rose-300 mt-1">
                      {formatCurrency(metrics.rtmiCost)}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">100% full upfront loan disbursement</p>
                  </div>

                  <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15">
                    <span className="text-xs text-indigo-200 uppercase font-semibold">Under Construction (UC) Pre-EMI</span>
                    <div className="text-2xl font-black text-emerald-300 mt-1">
                      {formatCurrency(metrics.ucCost)}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">Phased tranche loan disbursement</p>
                  </div>

                  <div className="bg-gradient-to-r from-amber-500/30 to-amber-600/30 p-4 rounded-xl border border-amber-400/40">
                    <span className="text-xs text-amber-200 uppercase font-bold">Net Buyer Savings</span>
                    <div className="text-2xl font-black text-amber-300 mt-1">
                      {formatCurrency(metrics.buyerSavings)}
                    </div>
                    <p className="text-[11px] text-amber-100 mt-1">Total cash saved by the buyer during construction</p>
                  </div>
                </div>

                <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-xs text-indigo-100 space-y-1.5">
                  <p className="font-semibold text-white">Why 40:30:30 Milestone Model Saves Money:</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    <li>Initial 40% covers Booking, Agreement, Plinth, and Parking structures.</li>
                    <li>Middle 30% covers progressive floor slab milestones with 0.9% installments.</li>
                    <li>Final 30% covers finishing, fittings, elevator, and possession handover.</li>
                    <li>Buyer only pays interest on completed construction stages rather than full principal from Day 1.</li>
                  </ul>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── Modal Footer with Save / Close ── */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={15} className="text-indigo-600" />
            <span>
              {scheduleId ? "Schedule saved in database" : "Draft schedule (ready to save)"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isPercentageValid}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-md transition flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Save Payment Schedule
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
