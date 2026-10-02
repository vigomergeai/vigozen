import React, { useState, useEffect, useMemo } from "react";
import {
  X, Save, RefreshCw, IndianRupee, TrendingUp, CheckCircle, Clock,
  AlertCircle, Sparkles, Building2, Calendar, Check, AlertTriangle, Info,
  Layers, ShieldCheck, ChevronRight, Calculator, PieChart as PieIcon,
  BarChart3, ArrowDownRight, ArrowUpRight, MoreVertical, Edit2, Wallet, Percent
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

interface PaymentPlanModuleProps {
  dealId: string;
  dealTitle: string;
  dealCompany?: string;
  initialValue?: number;
  onClose: () => void;
  onSaved?: (agreementValue: number) => void;
}

// Indian Currency Formatter (e.g. ₹1,00,000)
function formatIndianCurrency(val: number): string {
  if (val === undefined || val === null || isNaN(val)) return "₹0";
  return "₹" + Math.round(val).toLocaleString("en-IN");
}

// Date Formatter (e.g. 01 Oct 2026)
function formatDateDisplay(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mon = months[d.getMonth()];
    const yr = d.getFullYear();
    return `${day} ${mon} ${yr}`;
  } catch {
    return dateStr;
  }
}

function getToken(): string | null {
  return localStorage.getItem("vigo_token") || localStorage.getItem("auth_token") || localStorage.getItem("token") || null;
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
  const [isEditingAgreementValue, setIsEditingAgreementValue] = useState(false);
  
  // EMI Calculator Inputs
  const [loanInterestRate, setLoanInterestRate] = useState<number>(9.0);
  const [loanTenureYears, setLoanTenureYears] = useState<number>(20);
  const [repaymentView, setRepaymentView] = useState<"yearly" | "monthly">("yearly");

  const [openActionMenu, setOpenActionMenu] = useState<number | null>(null);

  // Close action dropdown on outside click
  useEffect(() => {
    const handleClickOutside = () => setOpenActionMenu(null);
    if (openActionMenu !== null) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [openActionMenu]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/10 border border-slate-200/90 dark:border-slate-800 w-full max-w-[98vw] 2xl:max-w-[1540px] max-h-[96vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100">
        
        {/* ── 1. Clean Modal Header ── */}
        <div className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/50 shadow-xs shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Dynamic Construction Payment & EMI Engine
                </h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/60">
                  24 Stages • 100%
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Deal: <span className="font-semibold text-slate-700 dark:text-slate-300">{dealTitle}</span> {dealCompany && `• ${dealCompany}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleResetDefaults}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs transition flex items-center gap-1.5 font-medium"
              title="Reset to 24 standard stages (100%)"
            >
              <RefreshCw size={13} />
              Reset Stages
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── 2. Top Segmented Navigation & Compact Agreement Value ── */}
        <div className="px-6 py-2.5 bg-slate-50/60 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center bg-slate-100/80 dark:bg-slate-800 p-1 rounded-xl gap-1 border border-slate-200/60 dark:border-slate-700">
            <button
              onClick={() => setActiveTab("schedule")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === "schedule"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Layers size={13} className={activeTab === "schedule" ? "text-indigo-600" : "text-slate-400"} />
              Construction Schedule (24 Stages)
            </button>
            <button
              onClick={() => setActiveTab("comparison")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === "comparison"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Sparkles size={13} className={activeTab === "comparison" ? "text-indigo-600" : "text-amber-500"} />
              40:30:30 + RTMI vs UC
            </button>
            <button
              onClick={() => setActiveTab("emi")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === "emi"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Calculator size={13} className={activeTab === "emi" ? "text-indigo-600" : "text-slate-400"} />
              EMI Calculator & Repayment Schedule
            </button>
          </div>

          {/* Compact Agreement Value Pill Input */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 shadow-2xs">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Agreement Value:</span>
            <div className="relative flex items-center">
              <span className="text-slate-400 dark:text-slate-500 text-xs font-bold mr-1">₹</span>
              {isEditingAgreementValue ? (
                <input
                  type="number"
                  autoFocus
                  value={agreementValue || ""}
                  onChange={(e) => handleAgreementValueChange(Number(e.target.value))}
                  onBlur={() => setIsEditingAgreementValue(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") setIsEditingAgreementValue(false); }}
                  placeholder="1000000"
                  className="w-28 text-xs font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900 border border-indigo-300 rounded px-1.5 py-0.5 focus:outline-none"
                />
              ) : (
                <span 
                  onClick={() => setIsEditingAgreementValue(true)}
                  className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer hover:text-indigo-600 transition"
                  title="Click to edit Agreement Value"
                >
                  {agreementValue ? agreementValue.toLocaleString("en-IN") : "0"}
                </span>
              )}
              <button 
                onClick={() => setIsEditingAgreementValue(!isEditingAgreementValue)}
                className="ml-1.5 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition"
                title="Edit Agreement Value"
              >
                <Edit2 size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* ── 3. Refined 4 Taller Summary Cards with Soft Borders & Exact Typography ── */}
        <div className="px-6 py-4 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          
          {/* Card 1: Agreement Value */}
          <div className="bg-white dark:bg-slate-800/80 rounded-xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between min-h-[110px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs">
                  <IndianRupee size={14} />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Agreement Value
                </span>
              </div>
              <span className="text-[11px] font-normal text-indigo-500">₹</span>
            </div>
            
            <div className="my-1">
              <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {formatIndianCurrency(metrics.agreementValue)}
              </div>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-normal flex items-center gap-1.5">
              <span>{milestones.length} Stages</span>
              <span>•</span>
              <span className={isPercentageValid ? "text-emerald-600 dark:text-emerald-400 font-normal" : "text-red-500 font-normal"}>
                {metrics.totalPercentage.toFixed(1)}% Allocated
              </span>
            </div>
          </div>

          {/* Card 2: Total Paid */}
          <div className="bg-white dark:bg-slate-800/80 rounded-xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between min-h-[110px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Wallet size={14} />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Total Paid
                </span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>

            <div className="my-1">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
                {formatIndianCurrency(metrics.totalPaid)}
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-300 font-normal mt-0.5">
                {metrics.paidProgress}% Collected
              </div>
            </div>

            {/* Collected Progress Bar */}
            <div className="space-y-1">
              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, metrics.paidProgress)}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 text-right font-normal">
                {formatIndianCurrency(metrics.totalPaid)} / {formatIndianCurrency(metrics.agreementValue)}
              </div>
            </div>
          </div>

          {/* Card 3: Total Pending */}
          <div className="bg-white dark:bg-slate-800/80 rounded-xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between min-h-[110px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Clock size={14} />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Total Pending
                </span>
              </div>
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            </div>

            <div className="my-1">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 tracking-tight">
                {formatIndianCurrency(metrics.totalPending)}
              </div>
              <div className="text-xs text-amber-700 dark:text-amber-300 font-normal mt-0.5">
                {(100 - metrics.paidProgress).toFixed(0)}% Remaining
              </div>
            </div>

            {/* Pending Progress Bar */}
            <div className="space-y-1">
              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, 100 - metrics.paidProgress))}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 font-normal">
                {metrics.remainingMilestonesCount} stages with outstanding balance
              </div>
            </div>
          </div>

          {/* Card 4: Savings & 20Y EMI */}
          <div className="bg-white dark:bg-slate-800/80 rounded-xl p-4 border border-indigo-100 dark:border-indigo-900/60 shadow-2xs flex flex-col justify-between min-h-[110px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Sparkles size={14} />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Savings & 20Y EMI
                </span>
              </div>
              <span className="text-[10px] font-normal text-indigo-600 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-100 px-2 py-0.5 rounded-full">
                EMI: {formatIndianCurrency(emiMetrics.monthlyEmi)}/mo
              </span>
            </div>

            <div className="my-1">
              <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-400 tracking-tight">
                {formatIndianCurrency(metrics.buyerSavings)}
              </div>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 font-normal flex items-center justify-between pt-1 border-t border-slate-50 dark:border-slate-700">
              <span>RTMI: {formatIndianCurrency(metrics.rtmiCost)}</span>
              <span>UC: {formatIndianCurrency(metrics.ucCost)}</span>
            </div>
          </div>

        </div>

        {/* ── 4. Main Content Area ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-white dark:bg-slate-900">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
              <RefreshCw className="w-7 h-7 animate-spin text-indigo-500 mb-2" />
              <p className="text-xs">Loading construction payment schedule...</p>
            </div>
          ) : activeTab === "schedule" ? (
            <div className="space-y-3">
              
              {/* Validation Alert if != 100% */}
              {!isPercentageValid && (
                <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className="text-red-500 shrink-0" />
                    <span>
                      Milestone percentages must sum to 100%. Current sum: <strong>{metrics.totalPercentage.toFixed(2)}%</strong>.
                    </span>
                  </div>
                  <button
                    onClick={handleResetDefaults}
                    className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition"
                  >
                    Reset to 100%
                  </button>
                </div>
              )}

              {/* 12-Column Construction Milestones Table */}
              <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 border-collapse table-auto">
                  <thead className="bg-slate-50/90 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200/80 dark:border-slate-700 uppercase tracking-wider text-[10px] sticky top-0 z-10">
                    <tr>
                      <th className="py-3 px-2 text-center w-8">#</th>
                      <th className="py-3 px-3 min-w-[200px]">Construction Stage</th>
                      <th className="py-3 px-2 text-center w-16">% Slab</th>
                      <th className="py-3 px-3 text-right whitespace-nowrap">Milestone Amt</th>
                      <th className="py-3 px-3 text-right whitespace-nowrap">0.9% Inst.</th>
                      <th className="py-3 px-3 text-right whitespace-nowrap">Cumulative Inst.</th>
                      <th className="py-3 px-2 text-center w-14">Phase</th>
                      <th className="py-3 px-2 w-32">Stage Status</th>
                      <th className="py-3 px-2 w-32">Payment Status</th>
                      <th className="py-3 px-2 w-32">Due Date</th>
                      <th className="py-3 px-2 w-32">Completed Date</th>
                      <th className="py-3 px-2 text-center w-10">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {milestones.map((m) => {
                      const isPaid = m.paymentStatus === "Paid";
                      const isCompleted = m.milestoneStatus === "Completed";
                      const isInProgress = m.milestoneStatus === "In-Progress";

                      return (
                        <tr
                          key={m.order}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* 1. Order (Rounded Pill Indicator: 01, 02, 03) */}
                          <td className="py-2.5 px-2 text-center">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold text-xs">
                              {String(m.order).padStart(2, "0")}
                            </span>
                          </td>

                          {/* 2. Construction Stage Name (Clean wrapped typography) */}
                          <td className="py-2.5 px-3">
                            <span className="font-medium text-xs text-slate-800 dark:text-slate-100 leading-snug">
                              {m.stageName}
                            </span>
                          </td>

                          {/* 3. Percentage Input */}
                          <td className="py-2.5 px-2 text-center">
                            <div className="inline-flex items-center justify-center gap-0.5">
                              <input
                                type="number"
                                step="0.1"
                                value={m.percentage}
                                onChange={(e) => updateMilestone(m.order, { percentage: Number(e.target.value) })}
                                className="w-10 text-center font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                              />
                              <span className="text-slate-400 text-xs font-semibold">%</span>
                            </div>
                          </td>

                          {/* 4. Calculated Milestone Amount */}
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap text-xs">
                            {formatIndianCurrency(m.amount || 0)}
                          </td>

                          {/* 5. Calculated 0.9% Installment */}
                          <td className="py-2.5 px-3 text-right font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap text-xs">
                            {formatIndianCurrency(m.installment || 0)}
                          </td>

                          {/* 6. Calculated Cumulative Installment */}
                          <td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap text-xs">
                            {formatIndianCurrency(m.cumulativeInstallment ?? m.cumulativeEmi ?? 0)}
                          </td>

                          {/* 7. Soft Phase Badge (40% / 30%) */}
                          <td className="py-2.5 px-2 text-center">
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                m.slabRatio === "40%"
                                  ? "bg-blue-50/80 text-blue-600 border border-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900"
                                  : "bg-purple-50/80 text-purple-600 border border-purple-100 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-900"
                              }`}
                            >
                              {m.slabRatio || "30%"}
                            </span>
                          </td>

                          {/* 8. Stage Status Dropdown */}
                          <td className="py-2.5 px-2">
                            <div className="relative">
                              <select
                                value={m.milestoneStatus}
                                onChange={(e) => {
                                  const newStatus = e.target.value as MilestoneStatus;
                                  const updates: Partial<ConstructionMilestone> = { milestoneStatus: newStatus };
                                  if (newStatus === "Completed" && !m.completionDate) {
                                    updates.completionDate = new Date().toISOString().substring(0, 10);
                                  }
                                  updateMilestone(m.order, updates);
                                }}
                                className={`w-full appearance-none pl-6 pr-6 py-1 text-xs rounded-lg border font-medium focus:outline-none transition shadow-2xs ${
                                  isCompleted
                                    ? "bg-emerald-50/90 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                                    : isInProgress
                                    ? "bg-amber-50/90 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                                    : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                }`}
                              >
                                <option value="Upcoming">Upcoming</option>
                                <option value="In-Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                              </select>
                              {/* Status Icon Indicator */}
                              <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                {isCompleted ? (
                                  <CheckCircle size={12} className="text-emerald-600" />
                                ) : isInProgress ? (
                                  <Clock size={12} className="text-amber-600" />
                                ) : (
                                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                )}
                              </div>
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                ▾
                              </div>
                            </div>
                          </td>

                          {/* 9. Payment Status Dropdown */}
                          <td className="py-2.5 px-2">
                            <div className="relative">
                              <select
                                value={m.paymentStatus}
                                onChange={(e) => {
                                  const newPaymentStatus = e.target.value as PaymentStatus;
                                  const updates: Partial<ConstructionMilestone> = { paymentStatus: newPaymentStatus };
                                  if (newPaymentStatus === "Paid") {
                                    updates.paidAmount = m.amount;
                                    updates.remainingAmount = 0;
                                    updates.milestoneStatus = "Completed";
                                    if (!m.completionDate) updates.completionDate = new Date().toISOString().substring(0, 10);
                                  } else if (newPaymentStatus === "Pending") {
                                    updates.paidAmount = 0;
                                    updates.remainingAmount = m.amount;
                                  }
                                  updateMilestone(m.order, updates);
                                }}
                                className={`w-full appearance-none pl-6 pr-6 py-1 text-xs rounded-lg border font-medium focus:outline-none transition shadow-2xs ${
                                  m.paymentStatus === "Paid"
                                    ? "bg-emerald-50/90 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                                    : m.paymentStatus === "Partially Paid"
                                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
                                    : m.paymentStatus === "Overdue"
                                    ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
                                    : "bg-amber-50/90 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                                }`}
                              >
                                <option value="Pending">Pending</option>
                                <option value="Paid">Paid</option>
                                <option value="Partially Paid">Partially Paid</option>
                                <option value="Overdue">Overdue</option>
                              </select>
                              {/* Payment Icon Indicator */}
                              <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                {m.paymentStatus === "Paid" ? (
                                  <Check size={12} className="text-emerald-600 font-bold" />
                                ) : (
                                  <Clock size={12} className="text-amber-600" />
                                )}
                              </div>
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                ▾
                              </div>
                            </div>
                          </td>

                          {/* 10. Due Date */}
                          <td className="py-2.5 px-2">
                            <div 
                              onClick={(e) => {
                                const input = e.currentTarget.querySelector('input');
                                if (input && 'showPicker' in input) {
                                  try { input.showPicker(); } catch {}
                                }
                              }}
                              className="relative flex items-center bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 rounded-lg px-2.5 py-1.5 shadow-2xs cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600 transition"
                              title="Click to change Due Date"
                            >
                              <Calendar size={13} className="text-slate-400 shrink-0 mr-1.5" />
                              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium flex-1">
                                {formatDateDisplay(m.dueDate) || "dd-mm-yyyy"}
                              </span>
                              <input
                                type="date"
                                value={m.dueDate ? String(m.dueDate).substring(0, 10) : ""}
                                onChange={(e) => updateMilestone(m.order, { dueDate: e.target.value || null })}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              />
                            </div>
                          </td>

                          {/* 11. Completed Date */}
                          <td className="py-2.5 px-2">
                            {m.completionDate ? (
                              <div 
                                onClick={(e) => {
                                  const input = e.currentTarget.querySelector('input');
                                  if (input && 'showPicker' in input) {
                                    try { input.showPicker(); } catch {}
                                  }
                                }}
                                className="relative flex items-center bg-white dark:bg-slate-800 border border-emerald-200/80 dark:border-emerald-800/80 rounded-lg px-2.5 py-1.5 shadow-2xs cursor-pointer hover:border-emerald-400 transition group"
                                title="Click to edit Completed Date"
                              >
                                <Calendar size={13} className="text-emerald-600 shrink-0 mr-1.5" />
                                <span className="text-xs text-emerald-800 dark:text-emerald-300 font-medium flex-1">
                                  {formatDateDisplay(m.completionDate)}
                                </span>
                                <input
                                  type="date"
                                  value={String(m.completionDate).substring(0, 10)}
                                  onChange={(e) => updateMilestone(m.order, { completionDate: e.target.value || null })}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                />
                              </div>
                            ) : (
                              <div 
                                onClick={(e) => {
                                  const input = e.currentTarget.querySelector('input');
                                  if (input && 'showPicker' in input) {
                                    try { input.showPicker(); } catch {}
                                  }
                                }}
                                className="relative flex items-center justify-center py-1.5 px-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition text-center"
                                title="Click to record Completion Date"
                              >
                                <span className="text-slate-400 font-semibold text-xs tracking-wider">—</span>
                                <input
                                  type="date"
                                  onChange={(e) => {
                                    updateMilestone(m.order, { 
                                      completionDate: e.target.value || null,
                                      milestoneStatus: "Completed"
                                    });
                                  }}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                />
                              </div>
                            )}
                          </td>

                          {/* 12. Quick Action Dropdown (3 dots menu) */}
                          <td className="py-2.5 px-2 text-center relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionMenu(openActionMenu === m.order ? null : m.order);
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                              title="Milestone Actions"
                            >
                              <MoreVertical size={15} />
                            </button>

                            {/* Floating Action Menu */}
                            {openActionMenu === m.order && (
                              <div 
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-8 z-50 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200/90 dark:border-slate-700 py-1.5 text-left text-xs animate-in fade-in zoom-in-95 duration-150"
                              >
                                <button
                                  onClick={() => {
                                    updateMilestone(m.order, {
                                      paymentStatus: isPaid ? "Pending" : "Paid",
                                      milestoneStatus: isPaid ? "In-Progress" : "Completed",
                                      paidAmount: isPaid ? 0 : m.amount,
                                      remainingAmount: isPaid ? m.amount : 0,
                                      completionDate: isPaid ? null : new Date().toISOString().substring(0, 10),
                                    });
                                    setOpenActionMenu(null);
                                    toast.success(isPaid ? "Marked as Pending" : "Marked as Paid");
                                  }}
                                  className="w-full px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-200 font-medium"
                                >
                                  <Check size={13} className="text-emerald-600 font-bold" />
                                  {isPaid ? "Mark as Pending" : "Mark as Paid"}
                                </button>
                                <button
                                  onClick={() => {
                                    updateMilestone(m.order, {
                                      milestoneStatus: isCompleted ? "In-Progress" : "Completed",
                                      completionDate: isCompleted ? null : new Date().toISOString().substring(0, 10),
                                    });
                                    setOpenActionMenu(null);
                                    toast.success(isCompleted ? "Marked as In-Progress" : "Marked as Completed");
                                  }}
                                  className="w-full px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-200 font-medium"
                                >
                                  <CheckCircle size={13} className="text-indigo-600" />
                                  {isCompleted ? "Mark In-Progress" : "Mark Completed"}
                                </button>
                                <button
                                  onClick={() => {
                                    updateMilestone(m.order, { dueDate: new Date().toISOString().substring(0, 10) });
                                    setOpenActionMenu(null);
                                    toast.info("Due date set to today");
                                  }}
                                  className="w-full px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-200 font-medium"
                                >
                                  <Calendar size={13} className="text-amber-600" />
                                  Set Due Today
                                </button>
                                <div className="border-t border-slate-100 dark:border-slate-700 my-1"></div>
                                <button
                                  onClick={() => {
                                    updateMilestone(m.order, { completionDate: null });
                                    setOpenActionMenu(null);
                                    toast.info("Completed date cleared");
                                  }}
                                  className="w-full px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-rose-600 text-xs font-medium"
                                >
                                  <X size={13} />
                                  Clear Completed Date
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          ) : activeTab === "comparison" ? (
            /* ── Tab 2: 40:30:30 + RTMI vs UC Savings Analysis ── */
            <div className="space-y-4 w-full max-w-5xl mx-auto py-2">
              <div className="bg-white dark:bg-slate-800/80 rounded-2xl p-5 border border-slate-200/90 dark:border-slate-700 shadow-2xs relative overflow-hidden space-y-4">
                {/* Comparison Header */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center shrink-0">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      40:30:30 Construction vs Ready-To-Move-In
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                      Customer Pre-EMI vs Full Disbursal Comparison
                    </p>
                  </div>
                </div>

                {/* 3 Comparison Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {/* Card 1: RTMI */}
                  <div className="bg-white dark:bg-slate-800/90 p-4 rounded-xl border border-rose-100/90 dark:border-rose-900/40 shadow-2xs flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-medium tracking-wider">
                        RTMI ESTIMATED INTEREST
                      </span>
                      <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1 tracking-tight">
                        {formatIndianCurrency(metrics.rtmiCost)}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-normal mt-2">
                      100% full upfront loan disbursement
                    </p>
                  </div>

                  {/* Card 2: UC */}
                  <div className="bg-white dark:bg-slate-800/90 p-4 rounded-xl border border-emerald-100/90 dark:border-emerald-900/40 shadow-2xs flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-medium tracking-wider">
                        UNDER CONSTRUCTION (UC) PRE-EMI
                      </span>
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 tracking-tight">
                        {formatIndianCurrency(metrics.ucCost)}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-normal mt-2">
                      Phased tranche loan disbursement
                    </p>
                  </div>

                  {/* Card 3: Savings (Slightly more prominent) */}
                  <div className="bg-indigo-50/25 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-200/90 dark:border-indigo-800/70 shadow-2xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 uppercase font-medium tracking-wider">
                          NET BUYER SAVINGS
                        </span>
                        <span className="text-[10px] font-normal text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/50 border border-indigo-100 dark:border-indigo-800 px-1.5 py-0.5 rounded">
                          RTMI − UC
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1 tracking-tight">
                        {formatIndianCurrency(metrics.buyerSavings)}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-2">
                      Total cost saved by the buyer during construction
                    </p>
                  </div>
                </div>

                {/* Explanation Section (Informational Note Style) */}
                <div className="bg-slate-50/80 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    WHY THE 40:30:30 MODEL SAVES MONEY
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 text-xs font-normal">
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
            <div className="space-y-3.5 max-w-6xl mx-auto py-1">
              
              {/* ── Upper Section: 3-Column Layout (Inputs | 2x2 Results | Donut Breakup) ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
                
                {/* Column 1 (Col 4/12): Loan Inputs */}
                <div className="lg:col-span-4 bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-700 shadow-2xs space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Calculator size={14} />
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                          LOAN INPUTS
                        </h4>
                        <p className="text-[10px] text-slate-400 font-normal">
                          Customize loan terms for live recalculation
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 mt-3">
                      {/* Input 1: Loan Amount */}
                      <div>
                        <div className="flex justify-between items-center text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          <span className="text-[11px] text-slate-500 font-medium">Loan Amount (₹)</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatIndianCurrency(agreementValue)}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="10000"
                          value={agreementValue}
                          onChange={(e) => handleAgreementValueChange(Number(e.target.value))}
                          className="w-full px-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Input 2: Interest Rate */}
                      <div>
                        <div className="flex justify-between items-center text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          <span className="text-[11px] text-slate-500 font-medium">Interest Rate (% p.a.)</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">
                            {loanInterestRate}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="5.0"
                            max="18.0"
                            step="0.1"
                            value={loanInterestRate}
                            onChange={(e) => setLoanInterestRate(Number(e.target.value))}
                            className="flex-1 accent-indigo-600 cursor-pointer"
                          />
                          <input
                            type="number"
                            step="0.1"
                            min="1"
                            max="30"
                            value={loanInterestRate}
                            onChange={(e) => setLoanInterestRate(Number(e.target.value))}
                            className="w-14 px-2 py-1 text-xs text-center font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      {/* Input 3: Loan Tenure */}
                      <div>
                        <div className="flex justify-between items-center text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          <span className="text-[11px] text-slate-500 font-medium">Loan Tenure (Years)</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">
                            {loanTenureYears} Years ({loanTenureYears * 12} Mos)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="1"
                            max="30"
                            step="1"
                            value={loanTenureYears}
                            onChange={(e) => setLoanTenureYears(Number(e.target.value))}
                            className="flex-1 accent-indigo-600 cursor-pointer"
                          />
                          <input
                            type="number"
                            min="1"
                            max="30"
                            value={loanTenureYears}
                            onChange={(e) => setLoanTenureYears(Number(e.target.value))}
                            className="w-14 px-2 py-1 text-xs text-center font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 2 (Col 5/12): 2x2 Metric Cards Grid */}
                <div className="lg:col-span-5 grid grid-cols-2 gap-3">
                  
                  {/* Result 1: Monthly EMI */}
                  <div className="bg-emerald-50/40 dark:bg-emerald-950/30 p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-emerald-100/80 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <Calendar size={13} />
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        Monthly Loan EMI
                      </span>
                    </div>
                    <div className="my-1.5">
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
                        {formatIndianCurrency(emiMetrics.monthlyEmi)}
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-600/90 dark:text-emerald-400 font-normal">
                      Equal monthly installment for {loanTenureYears} years @ {loanInterestRate}% p.a.
                    </p>
                  </div>

                  {/* Result 2: Principal Amount */}
                  <div className="bg-white dark:bg-slate-800/90 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                        <IndianRupee size={13} />
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Principal Loan Amount
                      </span>
                    </div>
                    <div className="my-1.5">
                      <div className="text-2xl font-bold text-sky-600 dark:text-sky-400 tracking-tight">
                        {formatIndianCurrency(emiMetrics.principal)}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal">
                      {( (emiMetrics.principal / (emiMetrics.totalPayment || 1)) * 100 ).toFixed(1)}% of total payment
                    </p>
                  </div>

                  {/* Result 3: Total Interest Payable */}
                  <div className="bg-white dark:bg-slate-800/90 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                        <Percent size={13} />
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Total Interest Payable
                      </span>
                    </div>
                    <div className="my-1.5">
                      <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 tracking-tight">
                        {formatIndianCurrency(emiMetrics.totalInterest)}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal">
                      {( (emiMetrics.totalInterest / (emiMetrics.totalPayment || 1)) * 100 ).toFixed(1)}% of total payment
                    </p>
                  </div>

                  {/* Result 4: Total Amount Payable */}
                  <div className="bg-white dark:bg-slate-800/90 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                        <Calculator size={13} />
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Total Amount Payable
                      </span>
                    </div>
                    <div className="my-1.5">
                      <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                        {formatIndianCurrency(emiMetrics.totalPayment)}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal">
                      Principal + Total Interest combined
                    </p>
                  </div>

                </div>

                {/* Column 3 (Col 3/12): Payment Break-Up Donut Chart */}
                <div className="lg:col-span-3 bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                    <div className="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <PieIcon size={13} />
                    </div>
                    <h5 className="text-xs font-semibold text-slate-900 dark:text-white">Loan Payment Break-Up</h5>
                  </div>
                  <div className="h-36 my-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={emiBreakupData}
                          cx="50%"
                          cy="50%"
                          innerRadius={36}
                          outerRadius={58}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {emiBreakupData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any) => formatIndianCurrency(Number(value))}
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
                  <div className="flex flex-col gap-1 text-[11px] pt-1.5 border-t border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                        <span className="text-slate-600 dark:text-slate-300 font-normal text-[11px]">Principal</span>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                        {formatIndianCurrency(emiMetrics.principal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                        <span className="text-slate-600 dark:text-slate-300 font-normal text-[11px]">Interest</span>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                        {formatIndianCurrency(emiMetrics.totalInterest)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* ── Lower Section: 2-Column Side-by-Side (Amortization Chart | Repayment Schedule Table) ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
                
                {/* Left Column (Col 6/12): Loan Repayment Chart */}
                <div className="lg:col-span-6 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <BarChart3 size={13} />
                      </div>
                      <h5 className="text-xs font-semibold text-slate-900 dark:text-white">
                        Loan Repayment Chart ({loanTenureYears} Years)
                      </h5>
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Yearly Principal vs Interest vs Balance
                    </span>
                  </div>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={emiMetrics.yearlySchedule} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                        <XAxis dataKey="year" tick={{ fontSize: 10 }} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={(v) => `₹${Math.round(v / 100000)}L`} />
                        <Tooltip
                          formatter={(value: any, name: any) => [formatIndianCurrency(Number(value)), name]}
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
                  <div className="flex items-center justify-center gap-4 text-[10px] font-normal pt-2 border-t border-slate-100 dark:border-slate-700">
                    <span className="flex items-center gap-1 text-rose-600"><span className="w-2 h-2 bg-rose-600 rounded"></span> Interest</span>
                    <span className="flex items-center gap-1 text-sky-600"><span className="w-2 h-2 bg-sky-600 rounded"></span> Principal</span>
                    <span className="flex items-center gap-1 text-amber-600"><span className="w-2 h-2 bg-amber-500 rounded-full"></span> Principal Outstanding Line</span>
                  </div>
                </div>

                {/* Right Column (Col 6/12): Loan Repayment Schedule Table */}
                <div className="lg:col-span-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-2xs overflow-hidden flex flex-col justify-between">
                  <div className="p-3 bg-slate-50/80 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Calendar size={13} />
                      </div>
                      <h5 className="text-xs font-semibold text-slate-900 dark:text-white">
                        Loan Repayment Schedule ({repaymentView === "yearly" ? "Yearly Breakdown" : "Monthly Breakdown"})
                      </h5>
                    </div>

                    {/* Toggle between Yearly & Monthly */}
                    <div className="flex items-center bg-slate-200/70 dark:bg-slate-900 p-0.5 rounded-lg text-xs font-medium">
                      <button
                        onClick={() => setRepaymentView("yearly")}
                        className={`px-2.5 py-0.5 rounded-md transition-all text-xs ${
                          repaymentView === "yearly"
                            ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        Yearly ({loanTenureYears} Years)
                      </button>
                      <button
                        onClick={() => setRepaymentView("monthly")}
                        className={`px-2.5 py-0.5 rounded-md transition-all text-xs ${
                          repaymentView === "monthly"
                            ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                        }`}
                      >
                        Monthly ({loanTenureYears * 12} Months)
                      </button>
                    </div>
                  </div>

                  <div className="h-60 overflow-y-auto">
                    <table className="w-full text-left text-[11px] text-slate-700 dark:text-slate-300 border-collapse table-auto">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[9px] sticky top-0 z-10">
                        <tr>
                          <th className="py-2 px-2 text-center w-10">{repaymentView === "yearly" ? "Year" : "Month"}</th>
                          <th className="py-2 px-2 text-right">Principal Pmt (P)</th>
                          <th className="py-2 px-2 text-right">Interest Pmt (I)</th>
                          <th className="py-2 px-2 text-right text-slate-900 dark:text-white font-semibold">Total Payment (P+I)</th>
                          <th className="py-2 px-2 text-right text-amber-600 dark:text-amber-400 font-semibold">Principal Outstanding</th>
                          <th className="py-2 px-2 text-right text-rose-600 dark:text-rose-400 font-medium">Cumulative Interest</th>
                          <th className="py-2 px-2 text-right text-sky-600 dark:text-sky-400 font-medium">Cumulative Principal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 text-[11px]">
                        {(repaymentView === "yearly" ? emiMetrics.yearlySchedule : emiMetrics.monthlySchedule).map((row: any) => (
                          <tr key={row.year ?? row.month} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                            <td className="py-1 px-2 text-center font-semibold text-slate-500">
                              {row.year ?? row.month}
                            </td>
                            <td className="py-1 px-2 text-right text-sky-600 dark:text-sky-400">
                              {formatIndianCurrency(row.principal)}
                            </td>
                            <td className="py-1 px-2 text-right text-rose-600 dark:text-rose-400">
                              {formatIndianCurrency(row.interest)}
                            </td>
                            <td className="py-1 px-2 text-right font-bold text-slate-900 dark:text-white">
                              {formatIndianCurrency(row.totalPayment)}
                            </td>
                            <td className="py-1 px-2 text-right font-bold text-amber-600 dark:text-amber-400">
                              {row.outstandingBalance <= 0 ? "₹0" : formatIndianCurrency(row.outstandingBalance)}
                            </td>
                            <td className="py-1 px-2 text-right text-slate-500">
                              {formatIndianCurrency(row.cumulativeInterest)}
                            </td>
                            <td className="py-1 px-2 text-right text-slate-500">
                              {formatIndianCurrency(row.cumulativePrincipal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-100 dark:bg-slate-800 font-semibold text-slate-900 dark:text-white text-[11px] border-t-2 border-slate-200 dark:border-slate-700 sticky bottom-0">
                        <tr>
                          <td className="py-1.5 px-2 text-center font-bold">Total</td>
                          <td className="py-1.5 px-2 text-right text-sky-600 dark:text-sky-400 font-bold">
                            {formatIndianCurrency(emiMetrics.principal)}
                          </td>
                          <td className="py-1.5 px-2 text-right text-rose-600 dark:text-rose-400 font-bold">
                            {formatIndianCurrency(emiMetrics.totalInterest)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold">
                            {formatIndianCurrency(emiMetrics.totalPayment)}
                          </td>
                          <td className="py-1.5 px-2 text-right text-emerald-600 font-bold">Paid Off (₹0)</td>
                          <td className="py-1.5 px-2 text-right text-rose-600 dark:text-rose-400 font-bold">{formatIndianCurrency(emiMetrics.totalInterest)}</td>
                          <td className="py-1.5 px-2 text-right text-sky-600 dark:text-sky-400 font-bold">{formatIndianCurrency(emiMetrics.principal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

              </div>

            </div>
          )}
        </div>

        {/* ── 5. Clean Modal Footer ── */}
        <div className="px-6 py-3.5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {scheduleId ? "Schedule synced with server" : "Draft schedule (ready to save)"}
              </span>
            </div>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span>24 stages • 100% allocated</span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-slate-400">Last edited: just now</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isPercentageValid}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={13} />
                  Save Schedule
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
