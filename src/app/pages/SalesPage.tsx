import React, { useState, useMemo, useEffect } from "react";
import {
  TrendingUp, Target, Plus, Bot, MoreHorizontal,
  Calendar, User, ChevronRight, ArrowUp, Trophy, BarChart2, Clock,
  Edit, Trash2, X, AlertTriangle, RefreshCw, DollarSign, CheckCircle, Lock
} from "lucide-react";
import { useNavigate } from "react-router";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";
import { Deal, LeadStatus } from "../data/mockData";
import { useApp } from "../context/AppContext";
import { RevenueForecast } from '../components/RevenueForecast';
import { formatCurrency } from '../../utils/formatters';

const stages: LeadStatus[] = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

const stageConfig: Record<LeadStatus, { color: string; bg: string; header: string }> = {
  New: { color: "border-blue-400", bg: "bg-blue-50", header: "bg-blue-500" },
  Contacted: { color: "border-amber-400", bg: "bg-amber-50", header: "bg-amber-500" },
  Qualified: { color: "border-indigo-400", bg: "bg-indigo-50", header: "bg-indigo-500" },
  Proposal: { color: "border-purple-400", bg: "bg-purple-50", header: "bg-purple-500" },
  Negotiation: { color: "border-orange-400", bg: "bg-orange-50", header: "bg-orange-500" },
  Won: { color: "border-emerald-400", bg: "bg-emerald-50", header: "bg-emerald-500" },
  Lost: { color: "border-red-400", bg: "bg-red-50", header: "bg-red-500" },
};

const probColor = (p: number) => p === 100 ? "text-emerald-600" : p === 0 ? "text-red-500" : p >= 70 ? "text-emerald-500" : p >= 50 ? "text-amber-500" : "text-orange-500";

interface DealForm {
  title: string; company: string; value: string;
  stage: LeadStatus; owner: string; ownerId?: string | null; probability: string; expectedClose: string; 
}
const emptyDealForm: DealForm = { title: "", company: "", value: "", stage: "New", owner: "", ownerId: "", probability: "50", expectedClose: "" };

export default function SalesPage() {
  const { role, currentUser, deals, loading, addDeal, updateDeal, deleteDeal, refreshData, employees, importDeals, subscription } = useApp();
  const navigate = useNavigate();  // ← ADD THIS
  const [view, setView] = useState<"kanban" | "forecast">("kanban");
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [dealForm, setDealForm] = useState<DealForm>(emptyDealForm);
  const [deleteConfirm, setDeleteConfirm] = useState<Deal | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // ── Check if trial expired ──
  const isLocked = subscription && 
    !subscription.is_trial_active && 
    !subscription.is_subscription_active;

  if (isLocked) {
    return (
      <div className="p-4 lg:p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={40} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Your Trial Has Expired</h2>
          <p className="text-slate-500 mb-6">
            Upgrade to continue managing your sales pipeline.
          </p>
          <button
            onClick={() => navigate("/billing")}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Upgrade Now →
          </button>
        </div>
      </div>
    );
  }

  const visibleDeals = useMemo(() =>
  (role === "user"
    ? deals.filter(
        d =>
          d.owner?.toLowerCase().trim() ===
          currentUser.name?.toLowerCase().trim()
      )
    : deals
  ).map(d => ({
    ...d,
    value: Number(d.value) || 0,
    probability: Number(d.probability) || 50,
    owner: d.owner || "Unknown"
  })),
[deals, role, currentUser]);

  const salesWiseData = useMemo(() => {
    const grouped = deals.reduce((acc: any, deal: any) => {
      if (!deal.created_at) return acc;

      const date = new Date(deal.created_at);
      const week = `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`;

      if (!acc[week]) {
        acc[week] = {
          week,
          target: 80000,
          achieved: 0,
          deals: 0,
          avgDealSize: 0,
        };
      }

      if (deal.stage?.toLowerCase() === "won") {
        const value = Number(deal.value || 0);
        acc[week].achieved += value;
        acc[week].deals += 1;
      }

      return acc;
    }, {});

    return Object.values(grouped).map((row: any) => ({
      ...row,
      avgDealSize: row.deals > 0 ? row.achieved / row.deals : 0,
    })).sort((a: any, b: any) => a.week.localeCompare(b.week));
  }, [deals]);

  const dealsByStage = (stage: LeadStatus) => visibleDeals.filter(d => d.stage === stage);
  const stageValue = (stage: LeadStatus) => dealsByStage(stage).reduce((s, d) => s + d.value, 0);
  const totalPipeline = visibleDeals.filter(d => d.stage !== "Lost").reduce((s, d) => s + d.value * (d.probability / 100), 0);
  const wonValue = visibleDeals.filter(d => d.stage === "Won").reduce((s, d) => s + d.value, 0);
  const activeDeals = visibleDeals.filter(d => !["Won", "Lost"].includes(d.stage)).length;

  const handleDragStart = (dealId: string) => setDraggedDeal(dealId);
  const handleDrop = async (stage: LeadStatus) => {
    if (!draggedDeal) return;
    setDragOverStage(null);
    await updateDeal(draggedDeal, { stage });
    setDraggedDeal(null);
  };

  const forecastData = stages.filter(s => s !== "Lost").map(s => ({
    stage: s,
    value: stageValue(s),
    weighted: dealsByStage(s).reduce((sum, d) => sum + d.value * (d.probability / 100), 0),
    count: dealsByStage(s).length,
  }));

  const openAdd = (stage: LeadStatus = "New") => {
    setDealForm({ ...emptyDealForm, stage, owner: currentUser.name });
    setEditDeal(null);
    setShowAddModal(true);
  };

  const openEdit = (deal: Deal) => {
    setDealForm({
      title: deal.title, company: deal.company, value: String(deal.value),
      stage: deal.stage, owner: deal.owner, probability: String(deal.probability),
     expectedClose: deal.expectedClose
  ? new Date(deal.expectedClose).toISOString().split("T")[0]
  : "",
    });
    // console.log('Deal is', deal)
    setEditDeal(deal);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!dealForm.title.trim() || !dealForm.company.trim()) return;
    setSaving(true);
    const payload: Partial<Deal> = {
      title: dealForm.title.trim(),
      company: dealForm.company.trim(),
      value: Number(dealForm.value) || 0,
      stage: dealForm.stage,
      owner: (dealForm.owner || currentUser.name).trim(),
      probability: Number(dealForm.probability) || 50,
      expectedClose: dealForm.expectedClose,
    };
    if (editDeal) {
      
      await updateDeal(editDeal.id, payload);
    } else {
      await addDeal(payload);
    }
    setSaving(false);
    setShowAddModal(false);
    setEditDeal(null);
  };

  const handleDelete = async (deal: Deal) => {
    // console.log('Deal is', deal);
    setDeleteConfirm(null);
    await deleteDeal(deal.id);
  };

  useEffect(() => {
  refreshData();
}, []);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-slate-900 dark:text-white">Sales Pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">{activeDeals} active deals · Weighted pipeline {formatCurrency(totalPipeline)} {loading && "· Syncing..."}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refreshData()} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50" title="Refresh">
            <RefreshCw size={14} className={`text-slate-500 ${loading ? "animate-spin" : ""}`} />
          </button>
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {(["kanban", "forecast"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-4 py-1.5 text-xs rounded-lg capitalize transition-all ${view === v ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
                {v === "kanban" ? "📋 Kanban" : "📈 Forecast"}
              </button>
            ))}
          </div>
          <button onClick={() => openAdd()} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 transition-colors">
            <Plus size={14} />New Deal
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Won (MTD)", value: formatCurrency(wonValue), icon: Trophy, color: "text-emerald-600", bg: "bg-emerald-50", trend: "+23%" },
          { label: "Pipeline Value", value: formatCurrency(totalPipeline), icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50", trend: "+12%" },
          { label: "Active Deals", value: activeDeals, icon: BarChart2, color: "text-blue-600", bg: "bg-blue-50", trend: `${activeDeals > 0 ? "+" : ""}${activeDeals}` },
          { label: "Avg Deal Size", value: visibleDeals.length > 0 ? formatCurrency(visibleDeals.reduce((s, d) => s + d.value, 0) / visibleDeals.length) : "₹0", icon: Target, color: "text-purple-600", bg: "bg-purple-50", trend: "+8%" },
        ].map(kpi => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-xl ${kpi.bg}`}><Icon size={16} className={kpi.color} /></div>
                <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1"><ArrowUp size={10} />{kpi.trend}</span>
              </div>
              <div className="text-xl font-bold text-slate-900">{kpi.value}</div>
              <div className="text-xs text-slate-500">{kpi.label}</div>
            </div>
          );
        })}
      </div>

   
      {/* AI Revenue Forecast */}
<RevenueForecast />

      {loading && deals.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
          <RefreshCw size={24} className="animate-spin text-indigo-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading deals from database...</p>
        </div>
      ) : view === "kanban" ? (
        /* Kanban Board */
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {stages.map(stage => {
              const cfg = stageConfig[stage];
              const stageDeals = dealsByStage(stage);
              const total = stageValue(stage);
              return (
                <div
                  key={stage}
                  className="w-64 flex-shrink-0 flex flex-col"
                  onDragOver={e => { e.preventDefault(); setDragOverStage(stage); }}
                  onDragLeave={() => setDragOverStage(null)}
                  onDrop={() => handleDrop(stage)}
                >
                  <div className={`px-3 py-2.5 rounded-t-xl ${cfg.header} text-white`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{stage}</span>
                      <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{stageDeals.length}</span>
                    </div>
                    <div className="text-xs text-white/70 mt-0.5">{formatCurrency(total)} total</div>
                  </div>
                  <div className={`flex-1 p-2 space-y-2 rounded-b-xl min-h-[200px] border-x border-b transition-colors ${cfg.bg} ${cfg.color} ${dragOverStage === stage ? "opacity-80 border-dashed" : ""}`}>
                    {stageDeals.length === 0 && <div className="text-center py-6 text-xs text-slate-400">Drop deals here</div>}
                    {stageDeals.map(deal => (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={() => handleDragStart(deal.id)}
                        className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-800 leading-tight truncate">{deal.title || "Untitled"}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{deal.company || "—"}</div>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
                            <button onClick={() => openEdit(deal)} className="p-1 hover:bg-slate-100 rounded-lg"><Edit size={11} className="text-slate-400" /></button>
                            <button onClick={() => setDeleteConfirm(deal)} className="p-1 hover:bg-red-50 rounded-lg"><Trash2 size={11} className="text-red-400" /></button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold text-slate-900">{formatCurrency(deal.value)}</span>
                          <span className={`text-xs font-semibold ${probColor(deal.probability)}`}>{deal.probability}%</span>
                        </div>
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-2">
                          <div className={`h-full rounded-full ${deal.probability === 100 ? "bg-emerald-500" : deal.probability === 0 ? "bg-red-400" : "bg-indigo-500"}`} style={{ width: `${deal.probability}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <div className="flex items-center gap-1"><User size={9} /><span>{deal.owner?.split(" ")[0] || "—"}</span></div>
                          {deal.expectedClose ? ( <div className="flex items-center gap-1"><Calendar size={9} /><span>{deal.expectedClose?.slice(5)}</span></div> ) : null}
                          {(deal.daysInStage ?? 0) > 5 && (<div className="flex items-center gap-1 text-orange-500"><Clock size={9} />  <span>{deal.daysInStage ?? 0}d</span></div>)}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => openAdd(stage)} className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl border border-dashed border-slate-200 transition-colors flex items-center justify-center gap-1">
                      <Plus size={11} />Add deal
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Forecast View */
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-slate-800 mb-4">Pipeline by Stage</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={forecastData} barSize={20} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number) => [`₹${(v / 1000).toFixed(0)}K`, ""]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                  <Bar dataKey="value" fill="#6366F1" radius={[4, 4, 0, 0]} name="Total Value" opacity={0.4} />
                  <Bar dataKey="weighted" fill="#6366F1" radius={[4, 4, 0, 0]} name="Weighted Value" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-slate-800 mb-4">Weekly Sales Performance</h3>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={salesWiseData}>
                  <defs>
                    <linearGradient id="tgtG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="achG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number) => [`₹${(v / 1000).toFixed(0)}K`, ""]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                  <Area type="monotone" dataKey="target" stroke="#6366F1" strokeWidth={2} strokeDasharray="5 3" fill="url(#tgtG)" name="Target" />
                  <Area type="monotone" dataKey="achieved" stroke="#10B981" strokeWidth={2.5} fill="url(#achG)" name="Achieved" dot={{ fill: "#10B981", r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Deals Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-slate-800">All Deals ({visibleDeals.length})</h3>
              <button onClick={() => openAdd()} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-1"><Plus size={11} />New Deal</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["Deal Title", "Company", "Value", "Stage", "Owner", "Probability", "Expected Close", "Actions"].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-xs text-slate-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleDeals.map(deal => (
                    <tr key={deal.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 text-xs font-medium text-slate-800">{deal.title}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{deal.company}</td>
                      <td className="py-3 px-4 text-xs font-bold text-slate-900">₹{(deal.value / 1000).toFixed(0)}K</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${deal.stage === "Won" ? "bg-emerald-50 text-emerald-700" : deal.stage === "Lost" ? "bg-red-50 text-red-700" : deal.stage === "Negotiation" ? "bg-orange-50 text-orange-700" : "bg-indigo-50 text-indigo-700"}`}>{deal.stage}</span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">{deal.owner}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${deal.probability}%` }} />
                          </div>
                          <span className={`text-xs font-medium ${probColor(deal.probability)}`}>{deal.probability}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">{deal.expectedClose || "—"}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(deal)} className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600"><Edit size={12} /></button>
                          <button onClick={() => setDeleteConfirm(deal)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Deal Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowAddModal(false); setEditDeal(null); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-slate-800">{editDeal ? "Edit Deal" : "Create New Deal"}</h2>
              <button onClick={() => { setShowAddModal(false); setEditDeal(null); }} className="p-2 hover:bg-slate-100 rounded-xl"><X size={16} /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1.5">Deal Title *</label>
                <input value={dealForm.title} onChange={e => setDealForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. TechCorp Enterprise License" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Company *</label>
                <input value={dealForm.company} onChange={e => setDealForm(f => ({ ...f, company: e.target.value }))} placeholder="Acme Corp" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Deal Value (₹)</label>
                <input type="number" value={dealForm.value} onChange={e => setDealForm(f => ({ ...f, value: e.target.value }))} placeholder="100000" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Stage</label>
                <select value={dealForm.stage} onChange={e => setDealForm(f => ({ ...f, stage: e.target.value as LeadStatus }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-slate-50">
                  {stages.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Win Probability (%)</label>
                <input type="number" min="0" max="100" value={dealForm.probability} onChange={e => setDealForm(f => ({ ...f, probability: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-slate-50" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Expected Close Date</label>
                <input type="date" value={dealForm.expectedClose} onChange={e => setDealForm(f => ({ ...f, expectedClose: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-slate-50" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Owner</label>
<select
  value={dealForm.owner}
  onChange={(e) => {
    const emp = employees.find(
      (em) => em.name === e.target.value
    );

    setDealForm((f) => ({
      ...f,
      owner: e.target.value,
      ownerId: emp?.id || ""
    }));
  }}
  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
>
  <option value="">Select Owner</option>

  {employees.map((em) => (
    <option key={em.id} value={em.name}>
      {em.name}
    </option>
  ))}
</select>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
              <button onClick={() => { setShowAddModal(false); setEditDeal(null); }} className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving || !dealForm.title.trim() || !dealForm.company.trim()} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <><RefreshCw size={13} className="animate-spin" />Saving...</> : editDeal ? "Save Changes" : "Create Deal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle size={22} className="text-red-500" /></div>
            <h3 className="text-slate-800 mb-2">Delete Deal?</h3>
            <p className="text-sm text-slate-500 mb-5">This deal will be permanently removed from the pipeline.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
