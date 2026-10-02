import React, { useState, useEffect, useMemo } from "react";
import {
  X, Save, RefreshCw, IndianRupee, TrendingUp, CheckCircle, Clock,
  AlertCircle, Sparkles, Building2, Calendar, Check, AlertTriangle, Info,
  Layers, ShieldCheck, ChevronRight, Calculator, PieChart as PieIcon,
  BarChart3, ArrowDownRight, ArrowUpRight
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from "recharts";
import { toast } from "sonner";
import {
  ConstructionMilestone,
  DealPaymentScheduleData,
  MASTER_24_CONSTRUCTION_STAGES,
  recalculateMilestones,
  calculateSavingsMetrics,
  calculateEmiAmortization,
  EmiCalculationResult,
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
  const [activeTab, setActiveTab] = useState<"schedule" | "comparison" | "emi">("schedule");
  
  // EMI Calculator Inputs
  const [loanInterestRate, setLoanInterestRate] = useState<number>(9.0);
  const [loanTenureYears, setLoanTenureYears] = useState<number>(20);
  const [repaymentView, setRepaymentView] = useState<"yearly" | "monthly">("yearly");

  const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

  // Fetch schedule on mount from backend source of truth
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

          const totalPct = data.milestones ? data.milestones.reduce((s: number, m: any) => s + (Number(m.percentage) || 0), 0) : 0;
          if (data.milestones && data.milestones.length > 0 && Math.abs(totalPct - 100) < 0.5) {
            setMilestones(recalculateMilestones(av, data.milestones));
          } else {
            // Auto-align to clean master 100% 24 stages
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
    setMilestones(recalculateMilestones(agreementValue, MASTER_24_CONSTRUCTION_STAGES as ConstructionMilestone[]));
    toast.info("Reset to default 24 construction milestones (100% Total)");
  };

  // Calculated savings & construction metrics
  const metrics = useMemo(() => {
    return calculateSavingsMetrics(agreementValue, milestones);
  }, [agreementValue, milestones]);

  // Calculated EMI Amortization Schedule
  const emiMetrics = useMemo(() => {
    return calculateEmiAmortization(agreementValue, loanInterestRate, loanTenureYears);
  }, [agreementValue, loanInterestRate, loanTenureYears]);

  const isPercentageValid = Math.abs(metrics.totalPercentage - 100) < 0.05;

  // Donut chart data for EMI Breakup
  const emiBreakupData = useMemo(() => [
    { name: "Principal Amount", value: emiMetrics.principal, color: "#0284c7" },
    { name: "Total Interest Payable", value: emiMetrics.totalInterest, color: "#e11d48" },
  ], [emiMetrics]);

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
      if (savedData.milestones && savedData.milestones.length > 0) {
        setMilestones(recalculateMilestones(agreementValue, savedData.milestones));
      }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-1 sm:p-3 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-[98vw] 2xl:max-w-[1560px] max-h-[96vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100">
        
        {/* ── Modal Header ── */}
        <div className="px-4 sm:px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/50 shadow-sm shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Dynamic Construction Payment & EMI Engine
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800/60 font-semibold">
                  24 Stages · 100%
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Deal: <span className="font-semibold text-slate-800 dark:text-slate-200">{dealTitle}</span> {dealCompany && `• ${dealCompany}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              className="px-2.5 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition flex items-center gap-1 font-medium"
              title="Reset to 24 standard stages (100%)"
            >
              <RefreshCw size={12} />
              Reset Stages
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Tab Switcher & Quick Controls ── */}
        <div className="px-4 sm:px-6 py-2 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg gap-1">
            <button
              onClick={() => setActiveTab("schedule")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === "schedule"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              📋 Construction Schedule (24 Stages)
            </button>
            <button
              onClick={() => setActiveTab("comparison")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                activeTab === "comparison"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Sparkles size={12} className="text-amber-500" />
              40:30:30 + RTMI vs UC
            </button>
            <button
              onClick={() => setActiveTab("emi")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                activeTab === "emi"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Calculator size={12} className="text-indigo-500" />
              EMI Calculator & Repayment Schedule
            </button>
          </div>

          {/* Real-time Agreement Value Editor */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Agreement Value:</span>
            <div className="relative flex items-center">
              <span className="absolute left-2 text-slate-400 dark:text-slate-500 text-xs font-semibold">₹</span>
              <input
                type="number"
                value={agreementValue || ""}
                onChange={(e) => handleAgreementValueChange(Number(e.target.value))}
                placeholder="1000000"
                className="w-32 pl-5 pr-2 py-0.5 text-xs font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* ── KPI Cards Section ── */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-50/50 dark:bg-slate-900/30 grid grid-cols-2 lg:grid-cols-4 gap-3 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
          
          {/* Card 1: Agreement Value */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Agreement Value</span>
              <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <IndianRupee size={12} />
              </div>
            </div>
            <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {formatCurrency(metrics.agreementValue)}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
              <span>{milestones.length} Stages</span>
              <span>•</span>
              <span className={isPercentageValid ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-red-500 font-bold"}>
                {metrics.totalPercentage.toFixed(1)}% Total
              </span>
            </div>
          </div>

          {/* Card 2: Total Paid */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Total Paid</span>
              <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle size={12} />
              </div>
            </div>
            <div className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(metrics.totalPaid)}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
              {metrics.paidProgress}% Collected
            </div>
          </div>

          {/* Card 3: Total Pending */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Total Pending</span>
              <div className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Clock size={12} />
              </div>
            </div>
            <div className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(metrics.totalPending)}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {metrics.remainingMilestonesCount} stages remaining
            </div>
          </div>

          {/* Card 4: Savings Comparison / Loan EMI */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-2.5 border border-indigo-200 dark:border-indigo-900/60 shadow-sm">
            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={11} className="text-amber-500" />
                Savings & 20Y EMI
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 font-semibold">
                EMI: {formatCurrency(emiMetrics.monthlyEmi)}/mo
              </span>
            </div>
            <div className="text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400">
              {formatCurrency(metrics.buyerSavings)}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center justify-between">
              <span>RTMI: {formatCurrency(metrics.rtmiCost)}</span>
              <span>UC: {formatCurrency(metrics.ucCost)}</span>
            </div>
          </div>

        </div>

        {/* ── Main Content Area ── */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 bg-white dark:bg-slate-900">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
              <RefreshCw className="w-7 h-7 animate-spin text-indigo-500 mb-2" />
              <p className="text-xs">Loading construction payment schedule...</p>
            </div>
          ) : activeTab === "schedule" ? (
            <div className="space-y-2">
              
              {/* Warning if percentage != 100% */}
              {!isPercentageValid && (
                <div className="p-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-red-500 shrink-0" />
                    <span>
                      Milestone percentages must sum to 100%. Current sum: <strong>{metrics.totalPercentage.toFixed(2)}%</strong>.
                    </span>
                  </div>
                  <button
                    onClick={handleResetDefaults}
                    className="px-2 py-0.5 bg-red-600 text-white rounded text-[11px] font-semibold hover:bg-red-700 transition"
                  >
                    Reset to 100%
                  </button>
                </div>
              )}

              {/* 12-Column Construction Milestones Table (Fit to Window) */}
              <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-[11px] text-slate-700 dark:text-slate-300 border-collapse table-auto">
                  <thead className="bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-tight text-[10px] sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-1 text-center w-6">#</th>
                      <th className="py-2 px-2">Construction Stage</th>
                      <th className="py-2 px-1 text-center w-14">% Slab</th>
                      <th className="py-2 px-2 text-right whitespace-nowrap">Milestone Amt</th>
                      <th className="py-2 px-2 text-right whitespace-nowrap">0.9% Inst.</th>
                      <th className="py-2 px-2 text-right whitespace-nowrap">Cumulative Inst.</th>
                      <th className="py-2 px-1 text-center w-12">Phase</th>
                      <th className="py-2 px-1.5 w-24">Stage Status</th>
                      <th className="py-2 px-1.5 w-24">Payment</th>
                      <th className="py-2 px-1 w-24">Due Date</th>
                      <th className="py-2 px-1 w-24">Completed</th>
                      <th className="py-2 px-1 text-center w-8">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {milestones.map((m) => {
                      const isPaid = m.paymentStatus === "Paid";
                      return (
                        <tr
                          key={m.order}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                            isPaid ? "bg-emerald-50/20 dark:bg-emerald-950/10" : ""
                          }`}
                        >
                          {/* 1. Order */}
                          <td className="py-1 px-1 text-center font-bold text-slate-400 dark:text-slate-500">
                            {m.order}
                          </td>

                          {/* 2. Stage Name */}
                          <td className="py-1 px-2 font-medium text-slate-900 dark:text-slate-100">
                            <input
                              type="text"
                              value={m.stageName}
                              onChange={(e) => updateMilestone(m.order, { stageName: e.target.value })}
                              className="w-full bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 px-1 py-0.5 rounded transition text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                            />
                          </td>

                          {/* 3. Percentage */}
                          <td className="py-1 px-1 text-center">
                            <div className="inline-flex items-center justify-center">
                              <input
                                type="number"
                                step="0.1"
                                value={m.percentage}
                                onChange={(e) => updateMilestone(m.order, { percentage: Number(e.target.value) })}
                                className="w-9 text-center font-bold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-0.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-[11px]"
                              />
                              <span className="text-slate-400 dark:text-slate-500 text-[9px] ml-0.5">%</span>
                            </div>
                          </td>

                          {/* 4. Milestone Amount */}
                          <td className="py-1 px-2 text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {formatCurrency(m.amount || 0)}
                          </td>

                          {/* 5. 0.9% Installment */}
                          <td className="py-1 px-2 text-right font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                            {formatCurrency(m.installment || 0)}
                          </td>

                          {/* 6. Cumulative Installment */}
                          <td className="py-1 px-2 text-right font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatCurrency(m.cumulativeInstallment ?? m.cumulativeEmi ?? 0)}
                          </td>

                          {/* 7. 40:30:30 Structure Badge */}
                          <td className="py-1 px-1 text-center">
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                m.slabRatio === "40%"
                                  ? "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800"
                                  : "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800"
                              }`}
                            >
                              {m.slabRatio || "30%"}
                            </span>
                          </td>

                          {/* 8. Milestone Status */}
                          <td className="py-1 px-1">
                            <select
                              value={m.milestoneStatus}
                              onChange={(e) =>
                                updateMilestone(m.order, {
                                    milestoneStatus: e.target.value as MilestoneStatus,
                                })
                              }
                              className={`w-full px-1 py-0.5 text-[10px] rounded border focus:outline-none font-medium ${
                                m.milestoneStatus === "Completed"
                                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                                  : m.milestoneStatus === "In-Progress"
                                  ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                                  : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              <option value="Upcoming">Upcoming</option>
                              <option value="In-Progress">In-Progress</option>
                              <option value="Completed">Completed</option>
                            </select>
                          </td>

                          {/* 9. Payment Status */}
                          <td className="py-1 px-1">
                            <select
                              value={m.paymentStatus}
                              onChange={(e) =>
                                updateMilestone(m.order, {
                                  paymentStatus: e.target.value as PaymentStatus,
                                })
                              }
                              className={`w-full px-1 py-0.5 text-[10px] rounded border focus:outline-none font-bold ${
                                m.paymentStatus === "Paid"
                                  ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                                  : m.paymentStatus === "Partially Paid"
                                  ? "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800"
                                  : m.paymentStatus === "Overdue"
                                  ? "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800"
                                  : "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                              }`}
                            >
                              <option value="Pending">Pending</option>
                              <option value="Paid">Paid</option>
                              <option value="Partially Paid">Partially Paid</option>
                              <option value="Overdue">Overdue</option>
                            </select>
                          </td>

                          {/* 10. Due Date */}
                          <td className="py-1 px-1">
                            <input
                              type="date"
                              value={m.dueDate ? String(m.dueDate).substring(0, 10) : ""}
                              onChange={(e) => updateMilestone(m.order, { dueDate: e.target.value || null })}
                              className="w-full text-[10px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-slate-800 dark:text-slate-200"
                            />
                          </td>

                          {/* 11. Completion Date */}
                          <td className="py-1 px-1">
                            <input
                              type="date"
                              value={m.completionDate ? String(m.completionDate).substring(0, 10) : ""}
                              onChange={(e) =>
                                updateMilestone(m.order, { completionDate: e.target.value || null })
                              }
                              className="w-full text-[10px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-slate-800 dark:text-slate-200"
                            />
                          </td>

                          {/* 12. Quick Action (Toggle Paid) */}
                          <td className="py-1 px-1 text-center">
                            <button
                              onClick={() =>
                                updateMilestone(m.order, {
                                  paymentStatus: isPaid ? "Pending" : "Paid",
                                  milestoneStatus: isPaid ? m.milestoneStatus : "Completed",
                                })
                              }
                              className={`p-1 rounded transition ${
                                isPaid
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                              }`}
                              title={isPaid ? "Mark as Pending" : "Mark as Paid"}
                            >
                              <Check size={11} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/90 font-bold text-slate-800 dark:text-slate-200 text-[11px] border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan={2} className="py-2 px-2">
                        Total (24 Stages)
                      </td>
                      <td className="py-2 px-1 text-center text-indigo-600 dark:text-indigo-400">
                        {metrics.totalPercentage.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-right text-slate-900 dark:text-white whitespace-nowrap">
                        {formatCurrency(metrics.agreementValue)}
                      </td>
                      <td className="py-2 px-2 text-right text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                        {formatCurrency(
                          milestones.reduce((s, m) => s + (m.installment || 0), 0)
                        )}
                      </td>
                      <td colSpan={7} className="py-2 px-2 text-right text-slate-500 dark:text-slate-400 font-normal">
                        Paid: <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">{formatCurrency(metrics.totalPaid)}</strong> | Pending: <strong className="text-amber-600 dark:text-amber-400 font-semibold">{formatCurrency(metrics.totalPending)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

            </div>
          ) : activeTab === "comparison" ? (
            /* ── Tab 2: 40:30:30 + RTMI vs UC Savings Analysis ── */
            <div className="space-y-4 max-w-4xl mx-auto py-2">
              
              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-xl p-4 sm:p-6 border border-slate-200/80 dark:border-slate-700 shadow-sm relative overflow-hidden">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-lg text-amber-600 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/60">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      40:30:30 Construction vs Ready-To-Move-In (RTMI)
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Customer Pre-EMI vs Full Disbursal Comparison</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
                  <div className="bg-white dark:bg-slate-900/80 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">RTMI Estimated Interest</span>
                    <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                      {formatCurrency(metrics.rtmiCost)}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">100% full upfront loan disbursement</p>
                  </div>

                  <div className="bg-white dark:bg-slate-900/80 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Under Construction (UC) Pre-EMI</span>
                    <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {formatCurrency(metrics.ucCost)}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Phased tranche loan disbursement</p>
                  </div>

                  <div className="bg-indigo-50 dark:bg-indigo-950/60 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800/60">
                    <span className="text-[10px] text-indigo-700 dark:text-indigo-300 uppercase font-bold">Net Buyer Savings</span>
                    <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {formatCurrency(metrics.buyerSavings)}
                    </div>
                    <p className="text-[10px] text-indigo-600/80 dark:text-indigo-300/80 mt-0.5">Total cash saved by the buyer during construction</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900/70 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-white">Why 40:30:30 Milestone Model Saves Money:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-500 dark:text-slate-400 text-[11px]">
                    <li>Initial 40% covers Booking, Agreement, Plinth, and Parking structures.</li>
                    <li>Middle 30% covers progressive floor slab milestones with 0.9% installments.</li>
                    <li>Final 30% covers finishing, fittings, elevator, and possession handover.</li>
                    <li>Buyer only pays interest on completed construction stages rather than full principal from Day 1.</li>
                  </ul>
                </div>
              </div>

            </div>
          ) : (
            /* ── Tab 3: Home Loan EMI Calculator & Repayment Schedule Engine ── */
            <div className="space-y-4 max-w-6xl mx-auto py-1">
              
              {/* Top Row: Inputs & Calculated Results Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                
                {/* Inputs Box */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                      <Calculator size={15} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Loan Inputs</h4>
                      <p className="text-[10px] text-slate-500">Customize loan terms for live recalculation</p>
                    </div>
                  </div>

                  {/* Input 1: Loan Amount */}
                  <div>
                    <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Loan Amount (₹)</span>
                      <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(agreementValue)}</span>
                    </div>
                    <input
                      type="number"
                      step="10000"
                      value={agreementValue}
                      onChange={(e) => handleAgreementValueChange(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Input 2: Interest Rate */}
                  <div>
                    <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Interest Rate (% p.a.)</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">{loanInterestRate}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="5.0"
                        max="18.0"
                        step="0.1"
                        value={loanInterestRate}
                        onChange={(e) => setLoanInterestRate(Number(e.target.value))}
                        className="flex-1 accent-indigo-600"
                      />
                      <input
                        type="number"
                        step="0.1"
                        min="1"
                        max="30"
                        value={loanInterestRate}
                        onChange={(e) => setLoanInterestRate(Number(e.target.value))}
                        className="w-16 px-2 py-1 text-xs text-center font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Input 3: Loan Tenure */}
                  <div>
                    <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Loan Tenure (Years)</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">{loanTenureYears} Years ({loanTenureYears * 12} Mos)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="1"
                        max="30"
                        step="1"
                        value={loanTenureYears}
                        onChange={(e) => setLoanTenureYears(Number(e.target.value))}
                        className="flex-1 accent-indigo-600"
                      />
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={loanTenureYears}
                        onChange={(e) => setLoanTenureYears(Number(e.target.value))}
                        className="w-16 px-2 py-1 text-xs text-center font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Results Grid Box */}
                <div className="lg:col-span-7 grid grid-cols-2 gap-3">
                  
                  {/* Result 1: Monthly EMI */}
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        Monthly Loan EMI
                      </span>
                      <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                        {formatCurrency(emiMetrics.monthlyEmi)}
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400 mt-2">
                      Equal monthly installment for {loanTenureYears} years @ {loanInterestRate}% p.a.
                    </p>
                  </div>

                  {/* Result 2: Principal Amount */}
                  <div className="bg-slate-50 dark:bg-slate-800/90 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                        Principal Loan Amount
                      </span>
                      <div className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1">
                        {formatCurrency(emiMetrics.principal)}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                      {( (emiMetrics.principal / emiMetrics.totalPayment) * 100 ).toFixed(1)}% of total payment
                    </p>
                  </div>

                  {/* Result 3: Total Interest Payable */}
                  <div className="bg-slate-50 dark:bg-slate-800/90 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                        Total Interest Payable
                      </span>
                      <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                        {formatCurrency(emiMetrics.totalInterest)}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                      {( (emiMetrics.totalInterest / emiMetrics.totalPayment) * 100 ).toFixed(1)}% of total payment
                    </p>
                  </div>

                  {/* Result 4: Total Payment (Principal + Interest) */}
                  <div className="bg-slate-50 dark:bg-slate-800/90 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Total Amount Payable
                      </span>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        {formatCurrency(emiMetrics.totalPayment)}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                      Principal + Total Interest combined
                    </p>
                  </div>

                </div>
              </div>

              {/* Middle Row: Visual Charts (Donut Breakup + Loan Repayment Amortization Chart) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                
                {/* Breakup Pie Chart */}
                <div className="lg:col-span-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                    <PieIcon size={14} className="text-indigo-600" />
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">Loan Payment Break-Up</h5>
                  </div>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={emiBreakupData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {emiBreakupData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any) => formatCurrency(Number(value))}
                          contentStyle={{
                            backgroundColor: "rgba(15, 23, 42, 0.9)",
                            borderColor: "#334155",
                            borderRadius: "0.5rem",
                            color: "#fff",
                            fontSize: "11px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-[11px] font-medium pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                      <span className="text-slate-600 dark:text-slate-300">Principal ({formatCurrency(emiMetrics.principal)})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                      <span className="text-slate-600 dark:text-slate-300">Interest ({formatCurrency(emiMetrics.totalInterest)})</span>
                    </div>
                  </div>
                </div>

                {/* Yearly Repayment Composed Chart (Stacked Bars + Balance Line) */}
                <div className="lg:col-span-8 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <BarChart3 size={14} className="text-indigo-600" />
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white">Loan Repayment Chart ({loanTenureYears} Years)</h5>
                    </div>
                    <span className="text-[10px] text-slate-400">Yearly Principal vs Interest vs Balance</span>
                  </div>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={emiMetrics.yearlySchedule} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                        <XAxis dataKey="year" tick={{ fontSize: 10 }} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={(v) => `₹${Math.round(v / 100000)}L`} />
                        <Tooltip
                          formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
                          labelFormatter={(label) => `Year ${label}`}
                          contentStyle={{
                            backgroundColor: "rgba(15, 23, 42, 0.9)",
                            borderColor: "#334155",
                            borderRadius: "0.5rem",
                            color: "#fff",
                            fontSize: "11px",
                          }}
                        />
                        <Bar yAxisId="left" dataKey="interest" name="Interest Pmt (I)" stackId="a" fill="#e11d48" radius={[0, 0, 0, 0]} />
                        <Bar yAxisId="left" dataKey="principal" name="Principal Pmt (P)" stackId="a" fill="#0284c7" radius={[2, 2, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="outstandingBalance" name="Principal Outstanding" stroke="#f97316" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-[10px] font-medium pt-1">
                    <span className="flex items-center gap-1 text-rose-600"><span className="w-2 h-2 bg-rose-600 rounded"></span> Interest</span>
                    <span className="flex items-center gap-1 text-sky-600"><span className="w-2 h-2 bg-sky-600 rounded"></span> Principal</span>
                    <span className="flex items-center gap-1 text-amber-600"><span className="w-2 h-2 bg-amber-500 rounded-full"></span> Principal Outstanding Line</span>
                  </div>
                </div>

              </div>

              {/* Bottom Row: Full Repayment Schedule Table (Yearly & Monthly Toggled) */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-indigo-600" />
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Loan Repayment Schedule ({repaymentView === "yearly" ? "Yearly Breakdown" : "Monthly Breakdown"})
                    </h5>
                  </div>

                  {/* Toggle between Yearly & Monthly */}
                  <div className="flex items-center bg-slate-200/80 dark:bg-slate-900 p-0.5 rounded-lg text-[11px] font-semibold">
                    <button
                      onClick={() => setRepaymentView("yearly")}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        repaymentView === "yearly"
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                      }`}
                    >
                      Yearly ({loanTenureYears} Years)
                    </button>
                    <button
                      onClick={() => setRepaymentView("monthly")}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        repaymentView === "monthly"
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                      }`}
                    >
                      Monthly ({loanTenureYears * 12} Months)
                    </button>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-[11px] text-slate-700 dark:text-slate-300 border-collapse table-auto">
                    <thead className="bg-slate-100/90 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-tight text-[10px] sticky top-0 z-10">
                      <tr>
                        <th className="py-2 px-2 text-center w-12">{repaymentView === "yearly" ? "Year" : "Month"}</th>
                        <th className="py-2 px-3 text-right">Principal Pmt (P)</th>
                        <th className="py-2 px-3 text-right">Interest Pmt (I)</th>
                        <th className="py-2 px-3 text-right font-bold text-slate-900 dark:text-white">Total Payment (P+I)</th>
                        <th className="py-2 px-3 text-right font-bold text-amber-600 dark:text-amber-400">Principal Outstanding</th>
                        <th className="py-2 px-3 text-right text-rose-600 dark:text-rose-400">Cumulative Interest</th>
                        <th className="py-2 px-3 text-right text-sky-600 dark:text-sky-400">Cumulative Principal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 font-mono text-[10px]">
                      {(repaymentView === "yearly" ? emiMetrics.yearlySchedule : emiMetrics.monthlySchedule).map((row: any) => (
                        <tr key={row.year ?? row.month} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                          <td className="py-1 px-2 text-center font-bold text-slate-500 font-sans">
                            {row.year ?? row.month}
                          </td>
                          <td className="py-1 px-3 text-right text-sky-600 dark:text-sky-400">
                            {formatCurrency(row.principal)}
                          </td>
                          <td className="py-1 px-3 text-right text-rose-600 dark:text-rose-400">
                            {formatCurrency(row.interest)}
                          </td>
                          <td className="py-1 px-3 text-right font-bold text-slate-900 dark:text-white">
                            {formatCurrency(row.totalPayment)}
                          </td>
                          <td className="py-1 px-3 text-right font-bold text-amber-600 dark:text-amber-400">
                            {row.outstandingBalance <= 0 ? "₹0" : formatCurrency(row.outstandingBalance)}
                          </td>
                          <td className="py-1 px-3 text-right text-slate-500">
                            {formatCurrency(row.cumulativeInterest)}
                          </td>
                          <td className="py-1 px-3 text-right text-slate-500">
                            {formatCurrency(row.cumulativePrincipal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white text-[11px] border-t-2 border-slate-200 dark:border-slate-700 sticky bottom-0">
                      <tr>
                        <td className="py-2 px-2 text-center font-sans">Total</td>
                        <td className="py-2 px-3 text-right text-sky-600 dark:text-sky-400">
                          {formatCurrency(emiMetrics.principal)}
                        </td>
                        <td className="py-2 px-3 text-right text-rose-600 dark:text-rose-400">
                          {formatCurrency(emiMetrics.totalInterest)}
                        </td>
                        <td className="py-2 px-3 text-right font-black">
                          {formatCurrency(emiMetrics.totalPayment)}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-600 font-bold">Paid Off (₹0)</td>
                        <td className="py-2 px-3 text-right text-rose-600 dark:text-rose-400">{formatCurrency(emiMetrics.totalInterest)}</td>
                        <td className="py-2 px-3 text-right text-sky-600 dark:text-sky-400">{formatCurrency(emiMetrics.principal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── Modal Footer with Save / Close ── */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldCheck size={14} className="text-indigo-600 dark:text-indigo-400" />
            <span>
              {scheduleId ? "Schedule synced with server" : "Draft schedule (ready to save)"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isPercentageValid}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={13} />
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


