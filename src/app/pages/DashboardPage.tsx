import React, { useState, useEffect } from "react";
import {
  Users, TrendingUp, IndianRupee, Target, ArrowUp, ArrowDown, Bot, AlertTriangle,
  Lightbulb, Activity, Star, Trophy, ChevronRight, RefreshCw, Flame
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
// Mock data imports removed to use live database data
import { useApp } from "../context/AppContext";
import { useLocation, useNavigate } from "react-router";

const insightColors: Record<string, string> = {
  opportunity: "bg-emerald-50 border-emerald-200 text-emerald-700",
  warning: "bg-amber-50 border-amber-200 text-amber-700",
  insight: "bg-blue-50 border-blue-200 text-blue-700",
  trend: "bg-purple-50 border-purple-200 text-purple-700",
  alert: "bg-red-50 border-red-200 text-red-700",
};

const insightIcons: Record<string, React.ElementType> = {
  opportunity: Star,
  warning: AlertTriangle,
  insight: Lightbulb,
  trend: TrendingUp,
  alert: Flame,
};

const activityIcons: Record<string, { icon: React.ElementType; color: string }> = {
  won: { icon: Trophy, color: "text-emerald-600 bg-emerald-100" },
  lead: { icon: Users, color: "text-blue-600 bg-blue-100" },
  note: { icon: Activity, color: "text-purple-600 bg-purple-100" },
  status: { icon: RefreshCw, color: "text-amber-600 bg-amber-100" },
  email: { icon: Target, color: "text-indigo-600 bg-indigo-100" },
  call: { icon: Activity, color: "text-teal-600 bg-teal-100" },
};

const COLORS = ["#6366F1", "#8B5CF6", "#F59E0B", "#3B82F6", "#10B981", "#22C55E"];

const formatCurrency = (val: any) => {
  const num = Number(val) || 0;
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)} K`;
  return `₹${num.toLocaleString("en-IN")}`;
};

const formatNumber = (val: number) => (val || 0).toLocaleString("en-IN");

export default function DashboardPage() {
  const { role, leads, deals, activities, loading, refreshData, subscription } = useApp();
  const navigate = useNavigate();  
  useEffect(() => {
    refreshData();
  }, []);

    // ── Trial Banner ──
  const renderTrialBanner = () => {
    if (!subscription) return null;
    
    if (subscription.is_trial_active) {
      return (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <span className="text-xl">🎯</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-800">
                Free Trial — {subscription.days_remaining} Days Remaining
              </p>
              <p className="text-xs text-indigo-600">
                Your trial ends on {new Date(subscription.trial_end).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/billing")}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Upgrade Now →
          </button>
        </div>
      );
    }
    
    if (!subscription.is_subscription_active) {
      return (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <span className="text-xl">⚠️</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-red-800">
                Trial Expired — Upgrade Now
              </p>
              <p className="text-xs text-red-600">
                Your trial has ended. Upgrade to continue using the CRM.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/billing")}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
          >
            Upgrade Now →
          </button>
        </div>
      );
    }
    
    return null;
  };

  const [revenueFilter, setRevenueFilter] = useState<"6m" | "3m" | "1m">("6m");

  const wonLeads = leads.filter(l => l.status === "Won").length;
  const hotLeads = leads.filter(l => l.aiScore >= 80).length;
  const activeDealsValue = deals.filter(d => !["Won", "Lost"].includes(d.stage)).reduce((s, d) => s + (Number(d.value) || 0), 0);
  const wonDealsValue = deals.filter(d => d.stage === "Won").reduce((s, d) => s + (Number(d.value) || 0), 0);
  const conversionRate = leads.length > 0 ? Number(((wonLeads / leads.length) * 100).toFixed(1)) : 0;
  const pipelineValue = formatCurrency(activeDealsValue);

  const sourceData = React.useMemo(() => {
    const sourceCounts = leads.reduce((acc: any, lead: any) => {
      acc[lead.source] = (acc[lead.source] || 0) + 1;
      return acc;
    }, {});
    const total = leads.length || 1;
    
    return [
      { name: "Facebook Ads", value: Math.round(((sourceCounts.Facebook || 0) / total) * 100), color: "#1877F2", leads: sourceCounts.Facebook || 0 },
      { name: "Website Forms", value: Math.round(((sourceCounts.Website || 0) / total) * 100), color: "#6366F1", leads: sourceCounts.Website || 0 },
      { name: "LinkedIn", value: Math.round(((sourceCounts.LinkedIn || 0) / total) * 100), color: "#0A66C2", leads: sourceCounts.LinkedIn || 0 },
      { name: "Referrals", value: Math.round(((sourceCounts.Referral || 0) / total) * 100), color: "#10B981", leads: sourceCounts.Referral || 0 },
      { name: "Email Campaign", value: Math.round((((sourceCounts["Email Campaign"] || sourceCounts.email_campaign || 0)) / total) * 100), color: "#F59E0B", leads: (sourceCounts["Email Campaign"] || sourceCounts.email_campaign || 0) },
      { name: "Cold Calls", value: Math.round((((sourceCounts["Cold Call"] || sourceCounts.cold_call || 0)) / total) * 100), color: "#EF4444", leads: (sourceCounts["Cold Call"] || sourceCounts.cold_call || 0) },
    ];
  }, [leads]);

  const weeklyLeadData = React.useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const initialData = days.map(day => ({ day, new: 0, contacted: 0, won: 0 }));
    
    leads.forEach(lead => {
      if (!lead.createdAt) return;
      const date = new Date(lead.createdAt);
      const dayName = days[date.getDay()];
      const targetDay = initialData.find(d => d.day === dayName);
      if (targetDay) {
        const status = lead.status?.toLowerCase();
        if (status === "new") targetDay.new++;
        else if (status === "contacted") targetDay.contacted++;
        else if (status === "won") targetDay.won++;
      }
    });
    
    return initialData;
  }, [leads]);

  const aiInsights = React.useMemo(() => {
    const list = [];
    const wonCount = leads.filter(l => l.status === "Won").length;
    const hotCount = leads.filter(l => l.aiScore >= 80).length;
    const pipelineVal = deals.filter(d => !["Won", "Lost"].includes(d.stage)).reduce((s, d) => s + d.value, 0);

    if (hotCount > 0) {
      list.push({
        id: 1,
        type: "opportunity",
        title: "High-Value Opportunity Detected",
        message: `${hotCount} leads show high AI score. Immediate action recommended to convert them.`,
        priority: "high"
      });
    }
    
    const staleDeals = deals.filter(d => !["Won", "Lost"].includes(d.stage) && d.daysInStage > 7);
    if (staleDeals.length > 0) {
      list.push({
        id: 2,
        type: "warning",
        title: "Stale Deals Alert",
        message: `${staleDeals.length} deals have been stalled for over 7 days. Risk of losing to competitors.`,
        priority: "medium"
      });
    }

    list.push({
      id: 3,
      type: "insight",
      title: "Pipeline Strength",
      message: `Active pipeline value is ${formatCurrency(pipelineVal)} across ${formatNumber(deals.filter(d => !["Won", "Lost"].includes(d.stage)).length)} active deals.`,
      priority: "medium"
    });

    if (wonCount > 0) {
      list.push({
        id: 4,
        type: "trend",
        title: "Conversion Achievement",
        message: `Total of ${wonCount} deals successfully closed won. Conversion rate is at ${leads.length > 0 ? ((wonCount / leads.length) * 100).toFixed(1) : 0}%.`,
        priority: "low"
      });
    }
    
    if (list.length === 0) {
      list.push({
        id: 5,
        type: "insight",
        title: "AI Analysis Active",
        message: "Welcome to Vigozen CRM! Load or import your leads to see AI-powered suggestions here.",
        priority: "low"
      });
    }
    
    return list.slice(0, 4);
  }, [leads, deals]);

  const revenueData = React.useMemo(() => {
    const months = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
    
    const last6Months: {
      monthIndex: number;
      year: number;
      month: string;
      revenue: number;
      target: number;
      leads: number;
    }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last6Months.push({
        monthIndex: d.getMonth(),
        year: d.getFullYear(),
        month: months[d.getMonth()],
        revenue: 0,
        target: 100000 * (i + 1),
        leads: 0,
      });
    }

    deals.forEach(deal => {
      if (deal.stage !== "Won") return;
      const dateStr = deal.expectedClose || deal.createdAt;
      if (!dateStr) return;
      const date = new Date(dateStr);
      const targetMonth = last6Months.find(m => m.monthIndex === date.getMonth() && m.year === date.getFullYear());
      if (targetMonth) {
        targetMonth.revenue += Number(deal.value) || 0;
      }
    });

    leads.forEach(lead => {
      if (!lead.createdAt) return;
      const date = new Date(lead.createdAt);
      const targetMonth = last6Months.find(m => m.monthIndex === date.getMonth() && m.year === date.getFullYear());
      if (targetMonth) {
        targetMonth.leads += 1;
      }
    });

    return last6Months.map(m => ({
      month: m.month,
      revenue: m.revenue || 50000,
      target: m.target || 80000,
      leads: m.leads || 5,
    }));
  }, [deals, leads]);

  const totalRevenue = revenueData.reduce((s, d) => s + d.revenue, 0);

  const liveKpiCards = [
    { label: "Total Leads", value: loading ? "..." : formatNumber(leads.length), change: "+18.4%", trend: "up", icon: Users, color: "from-indigo-500 to-indigo-600", bg: "bg-indigo-50", text: "text-indigo-600" },
    { label: "Active Deals", value: formatCurrency(activeDealsValue), change: "+12.3%", trend: "up", icon: TrendingUp, color: "from-emerald-500 to-emerald-600", bg: "bg-emerald-50", text: "text-emerald-600" },
    { label: "Revenue (MTD)", value: formatCurrency(wonDealsValue), change: "+9.8%", trend: "up", icon: IndianRupee, color: "from-amber-500 to-orange-500", bg: "bg-amber-50", text: "text-amber-600" },
    { label: "Conversion Rate", value: `${conversionRate}%`, change: "-2.1%", trend: "down", icon: Target, color: "from-purple-500 to-purple-600", bg: "bg-purple-50", text: "text-purple-600" },
  ];

  const liveActivities = activities;
  const leaderboardData = Object.values(
  leads.reduce((acc: any, lead: any) => {

    if (!lead.owner) return acc; // 🔥 skip unassigned

    const owner = lead.owner;

    if (!acc[owner]) {
      acc[owner] = {
        name: owner,
        leads: 0,
        won: 0,
        revenue: 0,
      };
    }

    acc[owner].leads += 1;

    if (lead.status === "Won") {
      acc[owner].won += 1;

      const relatedDeals = deals.filter((d: any) => d.leadId === lead.id);
      const totalDealValue = relatedDeals.reduce((s: number, d: any) => s + d.value, 0);

      acc[owner].revenue += totalDealValue;
    }

    return acc;
  }, {})
).map((emp: any) => ({
  ...emp,
  conversionRate: emp.leads > 0 ? Math.round((emp.won / emp.leads) * 100) : 0,
}));
  const location = useLocation();

useEffect(() => {
  const params = new URLSearchParams(location.search);
  const scroll = params.get("scroll");

  if (scroll === "activity") {
    const el = document.getElementById("recent-activity");
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }
}, [location]);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-slate-900 dark:text-white">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">{new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · AI insights active {loading && "· Syncing..."}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-700 font-medium">All systems operational</span>
          </div>
          <button onClick={() => refreshData()} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors flex items-center gap-2">
            <Bot size={15} />
            AI Report
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {liveKpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${card.bg}`}>
                  <Icon size={18} className={card.text} />
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${card.trend === "up" ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50"}`}>
                  {card.trend === "up" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                  {card.change}
                </div>
              </div>
              <div className="text-xl font-bold text-slate-900">{card.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{card.label}</div>
            </div>
          );
        })}
      </div>

      {/* Mini Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Hot Leads (AI)", value: formatNumber(hotLeads), sub: "Score 80+", color: "text-red-500" },
          { label: "Deals Won", value: formatNumber(wonLeads), sub: "All time", color: "text-emerald-500" },
          { label: "Pipeline Value", value: pipelineValue, sub: "All stages", color: "text-indigo-500" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-sm text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-700 font-medium">{s.label}</div>
            <div className="text-[11px] text-slate-400">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="xl:col-span-2 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-slate-800">Revenue vs Target</h3>
              <p className="text-xs text-slate-400 mt-0.5">Monthly performance overview</p>
            </div>
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              {(["6m", "3m", "1m"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setRevenueFilter(f)}
                  className={`px-3 py-1 text-xs rounded-lg transition-all ${revenueFilter === f ? "bg-white text-slate-800 shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart id="dash-revenue" data={revenueData.slice(revenueFilter === "1m" ? 5 : revenueFilter === "3m" ? 3 : 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
              <Tooltip formatter={(v: number) => [`₹${(v / 100000).toFixed(1)}L`, ""]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }} />
              <Line key="line-revenue" type="monotone" dataKey="revenue" stroke="#6366F1" strokeWidth={2.5} name="Revenue" dot={{ fill: "#6366F1", strokeWidth: 2, r: 3 }} />
              <Line key="line-target" type="monotone" dataKey="target" stroke="#10B981" strokeWidth={2} strokeDasharray="5 3" name="Target" dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-indigo-500 rounded" /><span className="text-xs text-slate-500">Revenue</span></div>
            <div className="flex items-center gap-1.5"><div className="w-4 border-t-2 border-dashed border-emerald-500" /><span className="text-xs text-slate-500">Target</span></div>
          </div>
        </div>

        {/* Lead Sources */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="mb-5">
            <h3 className="text-slate-800">Lead Sources</h3>
            <p className="text-xs text-slate-400 mt-0.5">Where your leads are coming from</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart id="dash-sources">
              <Pie
                data={sourceData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {sourceData.map((s, index) => (
                  <Cell key={`pie-cell-${index}-${s.name}`} fill={s.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [`${v}%`, ""]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-3">
            {sourceData.map((s) => (
              <div key={`source-legend-${s.name}`} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-slate-600 flex-1">{s.name}</span>
                <span className="text-xs font-semibold text-slate-800">{s.value}%</span>
                <span className="text-[10px] text-slate-400">{s.leads} leads</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* AI Insights */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-xl bg-purple-50">
              <Bot size={16} className="text-purple-600" />
            </div>
            <div>
              <h3 className="text-slate-800">AI Insights</h3>
              <p className="text-[11px] text-slate-400">Real-time recommendations</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {aiInsights.map((insight) => {
              const InsightIcon = insightIcons[insight.type];
              return (
                <div key={insight.id} className={`p-3 rounded-xl border text-sm ${insightColors[insight.type]}`}>
                  <div className="flex items-start gap-2">
                    <InsightIcon size={13} className="mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs leading-tight">{insight.title}</div>
                      <div className="text-[11px] opacity-80 mt-1 leading-relaxed">{insight.message}</div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${insight.priority === "high" ? "bg-red-100 text-red-600" : insight.priority === "medium" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                      {insight.priority}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly Leads Chart */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="mb-5">
            <h3 className="text-slate-800">Weekly Lead Activity</h3>
            <p className="text-xs text-slate-400 mt-0.5">Lead distribution by day</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart id="dash-weekly" data={weeklyLeadData} barSize={8} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
              <Bar key="bar-new" dataKey="new" fill="#6366F1" radius={[4, 4, 0, 0]} name="New" />
              <Bar key="bar-contacted" dataKey="contacted" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Contacted" />
              <Bar key="bar-won" dataKey="won" fill="#10B981" radius={[4, 4, 0, 0]} name="Won" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /><span className="text-xs text-slate-500">New</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-purple-500" /><span className="text-xs text-slate-500">Contacted</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /><span className="text-xs text-slate-500">Won</span></div>
          </div>
        </div>

        {/* Recent Activity */}
        <div id="recent-activity" className="xl:col-span-2 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-slate-800">Recent Activity</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Live feed from your team</p>
            </div>
            <button onClick={() => refreshData()} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <RefreshCw size={13} className={`text-slate-400 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="space-y-3">
            {liveActivities.slice(0, 6).map((activity: any, i: number) => {
              const cfg = activityIcons[activity.type] || activityIcons.lead;
              const Icon = cfg.icon;
              return (
                <div key={activity.id || i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}><Icon size={14} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-700 leading-relaxed">
                      <span className="font-semibold">{activity.user}</span> {activity.action} <span className="text-indigo-600 font-medium">{activity.target}</span>
                      {activity.value && <span className="text-emerald-600 font-semibold ml-1">+₹{(activity.value / 1000).toFixed(0)}K</span>}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{activity.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Team Leaderboard */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-slate-800">Team Leaderboard</h3>
            <p className="text-xs text-slate-400 mt-0.5">Performance rankings for March 2026</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
            <Trophy size={12} />
            <span>Monthly Rankings</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left pb-3 text-xs text-slate-400 font-medium">#</th>
                <th className="text-left pb-3 text-xs text-slate-400 font-medium">Employee</th>
                <th className="text-left pb-3 text-xs text-slate-400 font-medium">Leads</th>
                <th className="text-left pb-3 text-xs text-slate-400 font-medium">Won</th>
                <th className="text-left pb-3 text-xs text-slate-400 font-medium">Revenue</th>
                <th className="text-left pb-3 text-xs text-slate-400 font-medium">Conv. Rate</th>
                <th className="text-left pb-3 text-xs text-slate-400 font-medium">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {leaderboardData.sort((a, b) => b.revenue - a.revenue).map((emp, idx) => (
                <tr key={emp.id || emp.name || idx} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-3">
                    <span className={`text-xs font-bold ${idx === 0 ? "text-amber-500" : idx === 1 ? "text-slate-400" : idx === 2 ? "text-orange-500" : "text-slate-400"}`}>
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                        {emp.name
  .split(" ")
  .map((n: string) => n[0])
  .join("")
  .toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-800">{emp.name}</div>
                        <div className="text-[10px] text-slate-400">Sales</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-xs text-slate-600">{emp.leads}</td>
                  <td className="py-3 text-xs text-emerald-600 font-medium">{emp.won}</td>
                  <td className="py-3 text-xs font-semibold text-slate-800">₹{(emp.revenue / 100000).toFixed(1)}L</td>
                  <td className="py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${emp.conversionRate >= 40 ? "text-emerald-700 bg-emerald-50" : emp.conversionRate >= 30 ? "text-blue-700 bg-blue-50" : "text-amber-700 bg-amber-50"}`}>
                      {emp.conversionRate}%
                    </span>
                  </td>
                  <td className="py-3 w-24">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                        style={{ width: `${(emp.revenue / 500000) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}