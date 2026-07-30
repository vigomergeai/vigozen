import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import {
  BarChart3, Bot, Download, Calendar, Filter, TrendingUp, Users, Target,
  ArrowUp, ArrowDown, ChevronDown, Sparkles, Brain, FileText, Lock, RefreshCw
} from "lucide-react";
import { useNavigate } from "react-router";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, Legend, Cell
} from "recharts";
import { useApp } from "../context/AppContext";

type ReportType = "employee" | "status" | "sales";
type DateFilter = "daily" | "weekly" | "custom";

type EmployeeSummary = {
  name: string;
  new: number;
  contacted: number;
  qualified: number;
  proposal: number;
  negotiation: number;
  won: number;
  lost: number;
};

type StatusSummary = {
  status: string;
  count: number;
  value: number;
};


const COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#3B82F6", "#EC4899"];




export default function AnalysisPage() {
  const { role, leads, deals, refreshData, subscription } = useApp();
  const navigate = useNavigate();  // ← ADD THIS

  // Helper to format date as YYYY-MM-DD
  const formatYYYYMMDD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // ── Reports State ──
  const [reports, setReports] = useState({
    summary: null as any,
    employeeWise: [] as any[],
    statusWise: [] as any[],
    salesWise: [] as any[],
    loading: true
  });

  const [reportType, setReportType] = useState<ReportType>("employee");
  const [dateFilter, setDateFilter] = useState<DateFilter>("weekly");

  // Set initial dates dynamically based on current date
  const todayStr = formatYYYYMMDD(new Date());
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysAgoStr = formatYYYYMMDD(sevenDaysAgo);

  const [startDate, setStartDate] = useState(sevenDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);

  // ── Fetch Reports from API ──
  useEffect(() => {
    const fetchReports = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setReports(prev => ({ ...prev, loading: false }));
        return;
      }

      setReports(prev => ({ ...prev, loading: true }));
      try {
        let queryStart = "";
        let queryEnd = "";

        if (dateFilter === "daily") {
          queryStart = todayStr;
          queryEnd = todayStr;
        } else if (dateFilter === "weekly") {
          queryStart = sevenDaysAgoStr;
          queryEnd = todayStr;
        } else if (dateFilter === "custom") {
          queryStart = startDate;
          queryEnd = endDate;
        }

        const [summary, employeeWise, statusWise, salesWise] = await Promise.all([
          api.reports.getSummary(token, queryStart, queryEnd),
          api.reports.getEmployeeWise(token, queryStart, queryEnd),
          api.reports.getStatusWise(token, queryStart, queryEnd),
          api.reports.getSalesWise(token, queryStart, queryEnd),
        ]);
        setReports({
          summary,
          employeeWise: employeeWise || [],
          statusWise: statusWise || [],
          salesWise: salesWise || [],
          loading: false
        });
      } catch (error) {
        console.error("Failed to fetch reports:", error);
        setReports(prev => ({ ...prev, loading: false }));
      }
    };

    fetchReports();
  }, [startDate, endDate, dateFilter]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // ✅ CORRECT - Map backend snake_case fields
  const empWiseData: EmployeeSummary[] = reports.employeeWise.length > 0
    ? reports.employeeWise.map((item: any) => ({
      name: item.employee_name || 'Unassigned',  // Backend sends employee_name
      new: item.new_leads || 0,                   // Backend sends new_leads
      contacted: item.contacted_leads || 0,       // Backend sends contacted_leads
      qualified: item.qualified_leads || 0,       // Backend sends qualified_leads
      proposal: item.proposal_leads || 0,         // Backend sends proposal_leads
      negotiation: item.negotiation_leads || 0,   // Backend sends negotiation_leads
      won: item.won_deals || 0,                   // Backend sends won_deals
      lost: item.lost_leads || 0,                 // Backend sends lost_leads
    }))
    : [];

  const empRadarData = empWiseData.map((e: EmployeeSummary) => ({
    name: e.name.split(" ")[0],
    Won: e.won,
    Qualified: e.qualified,
    Proposal: e.proposal,
  }));


  // ✅ CORRECT - Backend sends total_value
  const statusWiseData: StatusSummary[] = reports.statusWise.length > 0
    ? reports.statusWise.map((item: any) => ({
      status: item.stage || 'Unknown',        // Backend sends stage
      count: item.count || 0,
      value: item.total_value || 0,            // Backend sends total_value
    }))
    : [];

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
            Upgrade to continue viewing reports and analytics.
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

  const pipelineOrder = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
  const statusChartData = pipelineOrder.map(stage => {
    const found = statusWiseData.find(s => s.status.toLowerCase() === stage.toLowerCase());
    return {
      name: stage,
      Count: found ? Number(found.count) : 0,
    };
  });
  // ===== EXPORT CSV =====
  const handleExportCSV = () => {
    if (!deals.length) return;

    const headers = ["Title", "Company", "Stage", "Value", "Owner", "Expected Close", "Created At"];

    const rows = deals.map((d: any) => [
      d.title || '',
      d.company || '',
      d.stage || '',
      d.value || 0,
      d.owner || '',
      d.expectedclose || '',
      d.createdAt || ''
    ]);

    const csvContent =
      [headers, ...rows]
        .map(e => e.join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "crm-report.csv";
    link.click();
  };
  // ===== PDF DOWNLOAD =====
  const handleDownloadPDF = () => {
    window.print();
  };
  // ===== REAL SALES DATA FROM LEADS =====


  // ===== REAL SALES DATA FROM DEALS =====
  const salesWiseData = reports.salesWise.length > 0
    ? reports.salesWise.map((item: any) => ({
      week: item.week || 'Week',
      target: 100000,
      achieved: item.total_value || 0,
      deals: item.deals_count || 0,
      avgDealSize: item.avg_value || 0,
    }))
    : [];

  const [showAI, setShowAI] = useState(true);

  const filteredEmpData = empWiseData;

  const [aiInsight, setAiInsight] = useState("");
  const [aiInsightLoading, setAiInsightLoading] = useState(false);

  useEffect(() => {
    const fetchInsight = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      setAiInsightLoading(true);
      try {
        // Determine which data to send based on reportType
        let dataToSend = {};
        if (reportType === "sales") dataToSend = salesWiseData;
        else if (reportType === "employee") dataToSend = filteredEmpData;
        else if (reportType === "status") dataToSend = statusWiseData;

     const res = await fetch(`${import.meta.env.VITE_API_URL}/ai-insights/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            reportType,
            dateFilter,
            data: dataToSend
          })
        });
        const data = await res.json();
        setAiInsight(data.insight_text || "");
      } catch { setAiInsight(""); }
      finally { setAiInsightLoading(false); }
    };
    fetchInsight();
  }, [reportType, dateFilter, reports.loading]);

  // console.log("Filtered Employee Data is: ", filteredEmpData);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-slate-900 dark:text-white">Analysis & Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">AI-powered insights · Real-time data</p>
        </div>
        <div className="flex items-center gap-2">

          <button
            onClick={() => setShowAI(!showAI)}
            className={`flex items-center gap-2 px-3 py-2 text-xs rounded-xl border transition-colors ${showAI
              ? "bg-purple-50 border-purple-200 text-purple-700"
              : "bg-white border-slate-200 text-slate-600"
              }`}
          >
            <Brain size={13} />
            AI Insights
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3 py-2 text-sm text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl flex items-center gap-2 transition-colors"
          >
            <Download size={14} />
            Export
          </button>

          <button
            onClick={handleDownloadPDF}
            className="px-3 py-2 text-sm text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl flex items-center gap-2 transition-colors"
          >
            <FileText size={14} />
            PDF Report
          </button>

        </div>
      </div>

      {/* Report Type Selector */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { type: "employee" as ReportType, label: "Employee Wise", desc: "Performance by team member", icon: Users, color: "indigo" },
          { type: "status" as ReportType, label: "Status Wise", desc: "Lead funnel by stage", icon: Target, color: "emerald" },
          { type: "sales" as ReportType, label: "Sales Wise", desc: "Revenue & deal analysis", icon: TrendingUp, color: "amber" },
        ].map(({ type, label, desc, icon: Icon, color }) => (
          <button
            key={type}
            onClick={() => setReportType(type)}
            className={`p-4 rounded-2xl border-2 text-left transition-all ${reportType === type
              ? `border-${color}-500 bg-${color}-50 shadow-sm`
              : "border-slate-200 bg-white hover:border-slate-300"
              }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${reportType === type ? `bg-${color}-100` : "bg-slate-100"}`}>
              <Icon size={16} className={reportType === type ? `text-${color}-600` : "text-slate-500"} />
            </div>
            <div className={`text-sm font-semibold ${reportType === type ? `text-${color}-700` : "text-slate-700"}`}>{label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
          </button>
        ))}
      </div>

      {/* Date Filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Calendar size={15} className="text-indigo-500" />
          Filter Period:
        </div>

        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          {(["daily", "weekly", "custom"] as DateFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-4 py-1.5 text-xs rounded-lg capitalize transition-all ${dateFilter === f ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
            >
              {f === "daily" ? "📅 Daily" : f === "weekly" ? "📆 Weekly" : "🗓️ Custom Range"}
            </button>
          ))}
        </div>

        {dateFilter === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button className="px-3 py-2 text-xs bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
              Apply
            </button>
          </div>
        )}

        {dateFilter === "daily" && (
          <div className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            Showing: <span className="font-medium text-slate-700">{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
          </div>
        )}
        {dateFilter === "weekly" && (
          <div className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            Showing: <span className="font-medium text-slate-700">{(() => {
              const end = new Date();
              const start = new Date();
              start.setDate(end.getDate() - 6);
              const formatOpt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
              const yearOpt: Intl.DateTimeFormatOptions = { year: "numeric" };
              return `${start.toLocaleDateString("en-US", formatOpt)} – ${end.toLocaleDateString("en-US", formatOpt)}, ${end.toLocaleDateString("en-US", yearOpt)}`;
            })()}</span>
          </div>
        )}
      </div>

      {/* AI Insight Banner */}
      {showAI && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Sparkles size={16} className="text-purple-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-purple-800">AI Analysis Summary</span>
                <span className="text-[10px] bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full">AI Powered</span>
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-sm text-purple-700 leading-relaxed">
                {aiInsightLoading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw size={13} className="animate-spin" />
                    AI analyzing your data...
                  </span>
                ) : aiInsight || "No insights available for this period."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== EMPLOYEE WISE REPORT ===== */}
      {reportType === "employee" && (
        <div className="space-y-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Leads", value: reports.summary?.total_leads || 0, trend: "+18%", color: "indigo" },
              { label: "Total Won", value: reports.summary?.won_deals || 0, trend: "+23%", color: "emerald" },
              { label: "Total Lost", value: reports.summary?.total_deals - (reports.summary?.won_deals || 0) || 0, trend: "-5%", color: "red" },
              { label: "Avg Conv. Rate", value: reports.summary?.win_rate ? `${reports.summary.win_rate}%` : "0%", trend: "+2.3%", color: "purple" },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
                <div className={`text-xs mt-1 flex items-center gap-1 ${stat.trend.startsWith("-") ? "text-red-500" : "text-emerald-600"}`}>
                  {stat.trend.startsWith("-") ? <ArrowDown size={10} /> : <ArrowUp size={10} />}{stat.trend} vs last period
                </div>
              </div>
            ))}
          </div>

          {/* Stacked Bar Chart */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h3 className="text-slate-800 mb-4">Lead Distribution by Employee</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart id="analysis-emp-bar" data={filteredEmpData} barSize={30}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => v.split(" ")[0]} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                <Legend iconSize={8} iconType="circle" />
                <Bar key="bar-new" dataKey="new" stackId="a" fill="#6366F1" name="New" />
                <Bar key="bar-contacted" dataKey="contacted" stackId="a" fill="#8B5CF6" name="Contacted" />
                <Bar key="bar-qualified" dataKey="qualified" stackId="a" fill="#F59E0B" name="Qualified" />
                <Bar key="bar-proposal" dataKey="proposal" stackId="a" fill="#3B82F6" name="Proposal" />
                <Bar key="bar-won" dataKey="won" stackId="a" fill="#10B981" name="Won" />
                <Bar key="bar-lost" dataKey="lost" stackId="a" fill="#EF4444" name="Lost" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Radar + Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-slate-800 mb-4">Performance Radar</h3>
              <ResponsiveContainer width="100%" height={240}>
                <RadarChart id="analysis-emp-radar" data={empRadarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => v.split(" ")[0]} />
                  <PolarRadiusAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                  <Radar name="Won" dataKey="won" stroke="#10B981" fill="#10B981" fillOpacity={0.2} />
                  <Radar name="Qualified" dataKey="qualified" stroke="#6366F1" fill="#6366F1" fillOpacity={0.1} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-slate-800 mb-4">Detailed Employee Report</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left pb-2 text-slate-400 font-medium">Employee</th>
                      <th className="text-right pb-2 text-slate-400 font-medium">New</th>
                      <th className="text-right pb-2 text-slate-400 font-medium">Qualified</th>
                      <th className="text-right pb-2 text-slate-400 font-medium">Won</th>
                      <th className="text-right pb-2 text-slate-400 font-medium">Lost</th>
                      <th className="text-right pb-2 text-slate-400 font-medium">Conv%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredEmpData.map((e: EmployeeSummary) => {
                      const total = e.won + e.lost;
                      const conv = total > 0 ? ((e.won / total) * 100).toFixed(0) : "0";
                      return (
                        <tr key={e.name} className="hover:bg-slate-50">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center text-indigo-600 text-[9px] font-bold">
                                {e.name.split(" ").map(n => n[0]).join("")}
                              </div>
                              <span className="text-slate-700 font-medium">{e.name.split(" ")[0]}</span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right text-slate-600">{e.new}</td>
                          <td className="py-2.5 text-right text-slate-600">{e.qualified}</td>
                          <td className="py-2.5 text-right text-emerald-600 font-semibold">{e.won}</td>
                          <td className="py-2.5 text-right text-red-500">{e.lost}</td>
                          <td className="py-2.5 text-right">
                            <span className={`px-1.5 py-0.5 rounded-full font-semibold ${Number(conv) >= 50 ? "text-emerald-700 bg-emerald-50" : Number(conv) >= 35 ? "text-amber-700 bg-amber-50" : "text-red-600 bg-red-50"}`}>
                              {conv}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== STATUS WISE REPORT ===== */}
      {reportType === "status" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Total in Funnel",
                value: reports.summary?.total_deals || 0,
                trend: "",
                color: "indigo"
              },
              {
                label: "Revenue",
                value: reports.summary?.total_revenue ? `₹${(reports.summary.total_revenue / 100000).toFixed(2)}L` : "₹0",
                trend: "",
                color: "emerald"
              },
              {
                label: "Active Deals",
                value: reports.summary?.active_deals || 0,
                trend: "",
                color: "amber"
              },
              {
                label: "Win Rate",
                value: reports.summary?.win_rate ? `${reports.summary.win_rate}%` : "0%",
                trend: "",
                color: "purple"
              },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-xs mt-1 flex items-center gap-1 text-slate-400">
                  <ArrowUp size={10} className="opacity-0" />{stat.trend} vs last period
                </div>
              </div>
            ))}
          </div>

          {/* Funnel Flow */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h3 className="text-slate-800 mb-4">Lead Stage Trend ({dateFilter === "daily" ? "Today" : dateFilter === "weekly" ? "This Week" : "Custom Period"})</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart id="analysis-status-bar" data={statusChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="Count" radius={[4, 4, 0, 0]} barSize={35} name="Deals Count">
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>


          {/* Status Table - Dynamic */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-slate-800">Status-wise Lead Breakdown</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Status", "Count", "Value (₹)", "Avg. Age", "Conversion Rate", "Trend", "AI Risk"].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs text-slate-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {statusWiseData.map((row: any) => {
                  const statusKey = String(row.status).toLowerCase();

                  // ✅ DYNAMIC: Calculate average age from deals
                  const dealsInStage = deals.filter(d => d.stage?.toLowerCase() === statusKey);
                  const avgAge = dealsInStage.length > 0
                    ? `${(dealsInStage.reduce((sum, d) => sum + (d.daysInStage || 0), 0) / dealsInStage.length).toFixed(1)}d`
                    : '—';

                  // ✅ DYNAMIC: Calculate conversion rate
                  const totalDeals = deals.length;
                  const stageDeals = deals.filter(d => d.stage?.toLowerCase() === statusKey).length;
                  const conversion = totalDeals > 0
                    ? `${((stageDeals / totalDeals) * 100).toFixed(1)}%`
                    : '0%';

                  // ✅ DYNAMIC: Calculate trend based on stage
                  const prevPeriodDeals = deals.filter(d => {
                    const date = new Date(d.createdAt);
                    const now = new Date();
                    const prev = new Date();
                    prev.setDate(prev.getDate() - 7);
                    return date >= prev && date <= now && d.stage?.toLowerCase() === statusKey;
                  });
                  const trendPct = prevPeriodDeals.length > 0 ? ((stageDeals / prevPeriodDeals.length) - 1) * 100 : 0;
                  const trendText = trendPct === 0 ? '→ 0.0%' : trendPct > 0 ? `↑ ${trendPct.toFixed(1)}%` : `↓ ${Math.abs(trendPct).toFixed(1)}%`;
                  const trendColor = trendPct > 0 ? 'text-emerald-600 bg-emerald-50 border border-emerald-100' :
                    trendPct < 0 ? 'text-rose-600 bg-rose-50 border border-rose-100' :
                      'text-slate-600 bg-slate-50 border border-slate-100';

                  // ✅ DYNAMIC: AI Risk based on stage and age
                  const riskLevel = statusKey === 'negotiation' ? 'High' :
                    statusKey === 'proposal' || statusKey === 'qualified' ? 'Medium' :
                      statusKey === 'new' || statusKey === 'contacted' ? 'Low' : 'None';
                  const riskColor = riskLevel === 'High' ? 'text-rose-600 bg-rose-50 border border-rose-100' :
                    riskLevel === 'Medium' ? 'text-amber-600 bg-amber-50 border border-amber-100' :
                      riskLevel === 'Low' ? 'text-emerald-600 bg-emerald-50 border border-emerald-100' :
                        'text-slate-600 bg-slate-50 border border-slate-100';

                  return (
                    <tr key={row.status} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 capitalize">
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-slate-800">{row.count}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">₹{(row.value / 1000).toFixed(1)}K</td>
                      <td className="py-3 px-4 text-xs text-slate-500">{avgAge}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">{conversion}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${trendColor}`}>
                          {trendText}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${riskColor}`}>
                          {riskLevel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== SALES WISE REPORT ===== */}
      {reportType === "sales" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Total Revenue",
                value: reports.summary?.total_revenue ? `₹${(reports.summary.total_revenue / 100000).toFixed(2)}L` : "₹0",
                trend: "+0%",
                up: true
              },
              {
                label: "Total Deals Won",
                value: reports.summary?.won_deals || 0,
                trend: "+0%",
                up: true
              },
              {
                label: "Avg Deal Size",
                value: reports.summary?.total_deals && reports.summary.won_deals ? `₹${((reports.summary.total_revenue || 0) / (reports.summary.won_deals || 1) / 1000).toFixed(1)}K` : "₹0",
                trend: "+0%",
                up: true
              },
              {
                label: "Win Rate",
                value: reports.summary?.win_rate ? `${reports.summary.win_rate}%` : "0%",
                trend: "+0%",
                up: true
              }
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
                <div className={`text-xs mt-1 flex items-center gap-1 ${stat.up ? "text-emerald-600" : "text-red-500"}`}>
                  {stat.up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{stat.trend}
                </div>
              </div>
            ))}
          </div>

          {/* Target vs Achieved */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-slate-800 mb-4">Target vs Achieved ({dateFilter === "daily" ? "Daily" : dateFilter === "weekly" ? "Weekly" : "Period"})</h3>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart id="analysis-sales-bar" data={salesWiseData} barGap={6} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number) => [`₹${(v / 1000).toFixed(0)}K`, ""]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                  <Bar key="bar-target" dataKey="target" fill="#E0E7FF" radius={[4, 4, 0, 0]} name="Target" />
                  <Bar key="bar-achieved" dataKey="achieved" fill="#6366F1" radius={[4, 4, 0, 0]} name="Achieved" />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-indigo-200" /><span className="text-xs text-slate-500">Target</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-indigo-600" /><span className="text-xs text-slate-500">Achieved</span></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-slate-800 mb-4">Deals Closed per Period</h3>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart id="analysis-sales-line" data={salesWiseData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                  <Line key="line-deals" type="monotone" dataKey="deals" stroke="#10B981" strokeWidth={2.5} dot={{ fill: "#10B981", r: 4 }} name="Deals Closed" />
                  <Line key="line-avg" type="monotone" dataKey="avgDealSize" stroke="#F59E0B" strokeWidth={2} strokeDasharray="4 2" dot={false} name="Avg Deal Size" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sales wise table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-slate-800">Sales Performance Breakdown</h3>
              <div className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-200">
                <Bot size={12} />AI Graded
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Period", "Target", "Achieved", "Variance", "Deals", "Avg Deal", "AI Grade"].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs text-slate-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {salesWiseData.map(row => {
                  const variance = row.achieved - row.target;
                  const pct = row.target > 0
                    ? ((row.achieved / row.target) * 100 - 100).toFixed(1)
                    : "0";
                  const grade = row.achieved >= row.target * 1.1 ? "A+" : row.achieved >= row.target ? "A" : row.achieved >= row.target * 0.9 ? "B" : "C";
                  return (
                    <tr key={row.week} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 text-xs font-semibold text-slate-700">{row.week}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">₹{(row.target / 1000).toFixed(0)}K</td>
                      <td className="py-3 px-4 text-xs font-bold text-slate-900">₹{(row.achieved / 1000).toFixed(0)}K</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium flex items-center gap-1 ${variance >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {variance >= 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                          ₹{(Math.abs(variance) / 1000).toFixed(0)}K ({Math.abs(Number(pct))}%)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 font-medium">{row.deals}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">₹{(row.avgDealSize / 1000).toFixed(1)}K</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${grade === "A+" ? "bg-emerald-100 text-emerald-700" : grade === "A" ? "bg-blue-100 text-blue-700" : grade === "B" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                          {grade}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
