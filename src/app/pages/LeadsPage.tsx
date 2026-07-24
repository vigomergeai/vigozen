import React, { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Search, Plus, Download, Bot, Star, Phone, Mail,
  ArrowUpDown, Edit, Trash2, Eye, Zap, Tag, Building,
  User, X, CheckCircle, XCircle, Clock, Target, RefreshCw,
  AlertTriangle, ChevronLeft, ChevronRight, Upload, FileSpreadsheet,
  FileDown, CheckSquare, AlertCircle, Loader2, MessagesSquare, Lock,
  Check, TrendingUp, Minus, Circle
} from "lucide-react";
import { useNavigate } from "react-router";


import { Lead, LeadStatus, LeadSource, Industry } from "../data/mockData";
import { useApp } from "../context/AppContext";
import {z} from 'zod';
import ConvertLeadModal from "../components/ConvertLeadModal";
import DeleteCommentModal from "../components/DeleteCommentModal";



const statusConfig: Record<LeadStatus, { color: string; dot: string; icon: React.ElementType }> = {
  New: { color: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", icon: Clock },
  Contacted: { color: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", icon: Phone },
  Qualified: { color: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-500", icon: Star },
  Proposal: { color: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500", icon: Mail },
  Negotiation: { color: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500", icon: Zap },
  Won: { color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", icon: CheckCircle },
  Lost: { color: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500", icon: XCircle },
};

const scoreColor = (s: number) => s >= 80 ? "text-emerald-600 bg-emerald-50 border-emerald-200" : s >= 60 ? "text-amber-600 bg-amber-50 border-amber-200" : "text-red-600 bg-red-50 border-red-200";
const scoreLabel = (s: number) => s >= 80 ? "Hot" : s >= 60 ? "Warm" : "Cold";

const STATUSES: LeadStatus[] = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const SOURCES: LeadSource[] = ["Facebook", "Website", "CRM Import", "LinkedIn", "Referral", "Cold Call", "Email Campaign"];
const INDUSTRIES: Industry[] = ["Technology", "Healthcare", "Finance", "Retail", "Manufacturing", "Real Estate", "Education", "Others"];

interface LeadForm {
  name: string; company: string; email: string; phone: string;
  status: LeadStatus; source: LeadSource; industry: Industry;
  value: string; notes: string; tags: string;
  owner: string; ownerId: string; probability: string;
}

const emptyForm: LeadForm = {
  name: "", company: "", email: "", phone: "",
  status: "New", source: "Website", industry: "Technology",
  value: "", notes: "", tags: "", owner: "", ownerId: "", probability: "50",
};

export default function LeadsPage() {
  const columns = ["lead","source","status","aiScore","value","owner","created"];
  const [visibleColumns, setVisibleColumns] = useState(columns);
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const { role, currentUser, leads, loading, addLead, updateLead, deleteLead, bulkDeleteLeads, importLeads, refreshData, employees, convertLeadToDeal, leadComments, loadingComments, fetchLeadComments, addLeadComment,
  updateLeadComment, deleteLeadComment, userProfile, subscription } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  // ── Convert Lead Modal State ──
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertLeadData, setConvertLeadData] = useState<Lead | null>(null);
  const [converting, setConverting] = useState(false);

  // ── Delete Comment Modal State ──
  const [showDeleteCommentModal, setShowDeleteCommentModal] = useState(false);
  const [deleteCommentData, setDeleteCommentData] = useState<{ id: string; text: string } | null>(null);
  const [deletingComment, setDeletingComment] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [sourceFilter, setSourceFilter] = useState<string>("All");
  const [empFilter, setEmpFilter] = useState<string>("All");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [sortField, setSortField] = useState<keyof Lead>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<Partial<Lead>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const perPage = 8;
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState<string>("");
  const [newCommentText, setNewCommentText] = useState<string>("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [leadComments]);
  const myLeads = useMemo(() => leads, [leads, role, currentUser]);

  const filtered = useMemo(() => {
    let data = [...myLeads];
    if (search) data = data.filter(l =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.company.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase())
    );
    if (statusFilter !== "All") data = data.filter(l => l.status === statusFilter);
    if (sourceFilter !== "All") data = data.filter(l => l.source === sourceFilter);
    if (empFilter !== "All") data = data.filter(l => l.owner === empFilter);
    const today = new Date();
    if (dateFilter === "today") {
      const todayStr = today.toISOString().split("T")[0];
      data = data.filter(l => l.createdAt === todayStr);
    } else if (dateFilter === "week") {
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      data = data.filter(l => new Date(l.createdAt) >= weekAgo);
    } else if (dateFilter === "month") {
      const m = today.toISOString().slice(0, 7);
      data = data.filter(l => l.createdAt.startsWith(m));
    }
    data.sort((a, b) => {
      const av = a[sortField] as string | number;
      const bv = b[sortField] as string | number;
      const c = typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? c : -c;
    });
    return data;
  }, [myLeads, search, statusFilter, sourceFilter, empFilter, dateFilter, sortField, sortDir]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const toggleSort = (field: keyof Lead) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

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
            Upgrade to continue managing your leads and deals.
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

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { All: myLeads.length };
    myLeads.forEach(l => { c[l.status] = (c[l.status] || 0) + 1; });
    return c;
  }, [myLeads]);


  const openAdd = () => {
    setForm({ ...emptyForm, owner: currentUser.name, ownerId: currentUser.employeeId });
    setEditLead(null);
    setShowAddModal(true);
  };

  const openEdit = (lead: Lead) => {
    setForm({
      name: lead.name, company: lead.company, email: lead.email, phone: lead.phone,
      status: lead.status, source: lead.source, industry: lead.industry,
      value: String(lead.value), notes: lead.notes, tags: lead.tags.join(", "),
      owner: lead.owner, ownerId: lead.ownerId, probability: String(lead.probability),
    });
    setEditLead(lead);
    setShowAddModal(true);
    setSelectedLead(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.company.trim()) return;
    setSaving(true);
    const payload: Partial<Lead> = {
  name: form.name.trim(),
  company: form.company.trim(),
  email: form.email.trim(),
  phone: form.phone.trim(),
  status: form.status,
  source: form.source,
  industry: form.industry,
  value: Number(form.value) || 0,
  notes: form.notes.trim(),

  tags: form.tags
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean),

  owner: form.owner || currentUser.name,
  ownerId: form.ownerId || currentUser.employeeId,
  probability: Number(form.probability) || 50,

  createdAt: new Date().toISOString().split("T")[0], // ✅ ADD
};

    // console.log(payload);
    if (editLead) await updateLead(editLead.id, payload);
    else await addLead(payload);
    setSaving(false);
    setShowAddModal(false);
    setEditLead(null);
    setForm(emptyForm);
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm(null);
    await deleteLead(id);
    setSelectedLead(null);
  };

  // ── Convert to Deal ──
  // ── Convert to Deal ──
const handleOpenConvertModal = (lead: Lead) => {
  setConvertLeadData(lead);
  setShowConvertModal(true);
};

const handleConvert = async (data: { title: string; value: number; stage: LeadStatus }) => {
  if (!convertLeadData) return;
  setConverting(true);
  try {
    await convertLeadToDeal(convertLeadData, {
      title: data.title,
      value: data.value,
      stage: data.stage,
      probability: 50,
    });
    setShowConvertModal(false);
    setConvertLeadData(null);
    refreshData();
  } catch (error) {
    console.error("Conversion failed:", error);
  } finally {
    setConverting(false);
  }
};

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
    if (lead) {
      fetchLeadComments(lead.id);
    }
  };

  // ── Post Comment ──
  const handlePostComment = async () => {
    if (!selectedLead || !newCommentText.trim()) return;
    setSubmittingComment(true);
    try {
      await addLeadComment(selectedLead.id, newCommentText.trim());
      setNewCommentText("");
    } catch (error) {
      console.error('Failed to post comment:', error);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    await bulkDeleteLeads(selectedIds);
    setSelectedIds([]);
  };

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ["Name", "Company", "Email", "Phone", "Status", "Source", "Industry", "Value", "AI Score", "Probability", "Owner", "Created", "Last Contact", "Notes", "Tags"];
    const rows = filtered.map(l => [
      l.name, l.company, l.email, l.phone, l.status, l.source, l.industry,
      l.value, l.aiScore, l.probability, l.owner, l.createdAt, l.lastContact,
      l.notes, l.tags.join("; ")
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `leads_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  // ── Export Excel ───────────────────────────────────────────────────────────
  const exportExcel = () => {
    const data = filtered.map(l => ({
      "Name": l.name,
      "Company": l.company,
      "Email": l.email,
      "Phone": l.phone,
      "Status": l.status,
      "Source": l.source,
      "Industry": l.industry,
      "Value (₹)": l.value,
      "AI Score": l.aiScore,
      "Win Probability (%)": l.probability,
      "Owner": l.owner,
      "Created Date": l.createdAt,
      "Last Contact": l.lastContact,
      "Notes": l.notes,
      "Tags": l.tags.join("; "),
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    // Column widths
    ws["!cols"] = [
      { wch: 20 }, { wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 14 },
      { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 18 },
      { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 20 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");

    // Add a summary sheet
    const summaryData = [
      { "Metric": "Total Leads", "Value": filtered.length },
      { "Metric": "Won Leads", "Value": filtered.filter(l => l.status === "Won").length },
      { "Metric": "Lost Leads", "Value": filtered.filter(l => l.status === "Lost").length },
      { "Metric": "Hot Leads (AI≥80)", "Value": filtered.filter(l => l.aiScore >= 80).length },
      { "Metric": "Total Pipeline Value (₹)", "Value": filtered.reduce((s, l) => s + (Number(l.value) || 0), 0) },
      { "Metric": "Avg AI Score", "Value": filtered.length > 0 ? Math.round(filtered.reduce((s, l) => s + l.aiScore, 0) / filtered.length) : 0 },
      { "Metric": "Export Date", "Value": new Date().toLocaleDateString() },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary["!cols"] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    XLSX.writeFile(wb, `LeadOps360_Leads_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // ── Import Excel ───────────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        // Map columns (flexible column naming)
        const mapped: Partial<Lead>[] = rows.map((row: any) => ({
          name: row["Name"] || row["name"] || row["Lead Name"] || "",
          company: row["Company"] || row["company"] || row["Company Name"] || "",
          email: row["Email"] || row["email"] || row["Email Address"] || "",
          phone: row["Phone"] || row["phone"] || row["Phone Number"] || "",
          status: (row["Status"] || row["status"] || "New") as LeadStatus,
          source: (row["Source"] || row["source"] || row["Lead Source"] || "CRM Import") as LeadSource,
          industry: (row["Industry"] || row["industry"] || "Technology") as Industry,
          value: Number(row["Value (₹)"] || row["Value"] || row["value"] || 0),
          probability: Number(row["Win Probability (%)"] || row["Probability"] || row["probability"] || 50),
          notes: row["Notes"] || row["notes"] || "",
          tags: String(row["Tags"] || row["tags"] || "").split(";").map((t: string) => t.trim()).filter(Boolean),
          owner: row["Owner"] || row["owner"] || currentUser.name,
          ownerId: row["Owner ID"] || row["ownerId"] || currentUser.employeeId,
        })).filter((l: Partial<Lead>) => l.name && l.company);

        setImportPreview(mapped);
        setShowImportModal(true);
      } catch (err) {
        alert("Failed to parse Excel file. Please use the correct format.");
        console.error(err);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };
  

  const handleConfirmImport = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);
      try {
    const result = await importLeads(importPreview);

    setImportResult({
      imported: result.imported,
      errors: []
    });

    await refreshData(); // 🔥 ye lagao (VERY IMPORTANT)

  } catch (err: any) {
    setImportResult({
      imported: 0,
      errors: [err.message]
    });
  }
    setImporting(false);
    setShowImportModal(false);
    setImportPreview([]);
  };

  // Download Excel template
  const downloadTemplate = () => {
    const template = [
      {
        "Name": "John Smith",
        "Company": "Acme Corp",
        "Email": "john@acme.com",
        "Phone": "+91 98765 43210",
        "Status": "New",
        "Source": "Website",
        "Industry": "Technology",
        "Value (₹)": 50000,
        "Win Probability (%)": 50,
        "Owner": "Arjun Sharma",
        "Notes": "Initial inquiry about enterprise plan",
        "Tags": "hot; enterprise",
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    ws["!cols"] = Array(12).fill({ wch: 20 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads Template");
    XLSX.writeFile(wb, "LeadOps360_Import_Template.xlsx");
  };

  useEffect(() => {
  refreshData(); // 🔥 DB se leads load karo
}, []);
useEffect(() => {
  const handleClickOutside = () => {
    setShowColumnDropdown(false);
  };

  if (showColumnDropdown) {
    window.addEventListener("click", handleClickOutside);
  }

  return () => {
    window.removeEventListener("click", handleClickOutside);
  };
}, [showColumnDropdown]);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-slate-900">Lead Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {filtered.length} leads · AI scoring active{" "}
            {loading && "· Syncing..."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => refreshData()}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw
              size={14}
              className={`text-slate-500 ${loading ? "animate-spin" : ""}`}
            />
          </button>

          {/* Import Excel button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 text-sm text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-xl flex items-center gap-2 transition-colors"
          >
            <Upload size={14} />
            Import Excel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Export dropdown */}
          <div className="relative group">
            <button className="px-3 py-2 text-sm text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl flex items-center gap-2 transition-colors">
              <FileDown size={14} />
              Export
              <ChevronRight size={11} className="rotate-90" />
            </button>
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all">
              <button
                onClick={exportExcel}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                <FileSpreadsheet size={14} className="text-emerald-600" />
                Export Excel (.xlsx)
              </button>
              <button
                onClick={exportCSV}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                <Download size={14} className="text-slate-500" />
                Export CSV
              </button>
              <div className="border-t border-slate-100" />
              <button
                onClick={downloadTemplate}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-indigo-600 hover:bg-indigo-50"
              >
                <FileSpreadsheet size={14} />
                Download Template
              </button>
            </div>
          </div>
          <div className="relative">
  <button
    onClick={(e) => {
      e.stopPropagation();
      setShowColumnDropdown(!showColumnDropdown);
    }}
    className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl flex items-center gap-2 text-slate-700 dark:text-slate-200"
  >
    All Columns
    <ChevronRight size={12} className="rotate-90" />
  </button>

  {showColumnDropdown && (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 p-3"
    >
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">
        Show / Hide Columns
      </p>

      {columns.map((col) => (
        <label
          key={col}
          className="flex items-center gap-2 text-sm py-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 px-2 rounded-lg text-slate-700 dark:text-slate-200"
        >
          <input
            type="checkbox"
            checked={visibleColumns.includes(col)}
            onChange={() => {
              if (visibleColumns.includes(col)) {
                setVisibleColumns(visibleColumns.filter(c => c !== col));
              } else {
                setVisibleColumns([...visibleColumns, col]);
              }
            }}
          />
          <span className="capitalize">{col}</span>
        </label>
      ))}

      <button
  onClick={() => setVisibleColumns(columns)}
  className="mt-2 text-xs text-indigo-600 hover:underline flex items-center gap-1"
>
  <RefreshCw size={12} />
  Reset to Default
</button>
    </div>
  )}
</div>

          <button
            onClick={openAdd}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 transition-colors"
          >
            <Plus size={15} />
            Add Lead
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div
          className={`flex items-center gap-3 p-4 rounded-2xl border ${importResult.errors.length > 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}
        >
          {importResult.errors.length > 0 ? (
            <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          ) : (
            <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-800">
              {importResult.errors.length > 0
                ? "Import failed"
                : `${importResult.imported} leads imported successfully!`}
            </p>
            {importResult.errors.map((e, i) => (
              <p key={i} className="text-xs text-red-600">
                {e}
              </p>
            ))}
          </div>
          <button
            onClick={() => setImportResult(null)}
            className="p-1 hover:bg-black/5 rounded-lg"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {["All", ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${statusFilter === s ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"}`}
          >
            {s}{" "}
            {statusCounts[s] !== undefined && (
              <span className="ml-1 opacity-70">({statusCounts[s]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, company, email..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-600"
        >
          <option value="All">All Sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {role === "admin" && (
          <select
            value={empFilter}
            onChange={(e) => {
              setEmpFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-600"
          >
            <option value="All">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.name}>
                {e.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(["all", "today", "week", "month"] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setDateFilter(f);
                setPage(1);
              }}
              className={`px-3 py-1 text-xs rounded-lg transition-all capitalize ${dateFilter === f ? "bg-white shadow-sm text-slate-800 font-medium" : "text-slate-500 hover:text-slate-700"}`}
            >
              {f === "all"
                ? "All Time"
                : f === "month"
                  ? "This Month"
                  : f === "week"
                    ? "This Week"
                    : "Today"}
            </button>
          ))}
        </div>
        {role === "admin" && selectedIds.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl">
            <span className="text-xs text-red-600 font-medium">
              {selectedIds.length} selected
            </span>
            <button
              onClick={handleBulkDelete}
              className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 font-medium"
            >
              <Trash2 size={12} />
              Delete All
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>
  

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {loading && leads.length === 0 ? (
          <div className="py-16 text-center">
            <RefreshCw
              size={24}
              className="animate-spin text-indigo-400 mx-auto mb-3"
            />
            <p className="text-sm text-slate-400">
              Loading leads from database...
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="w-10 py-3 px-4">
                    <input
                      type="checkbox"
                      className="rounded"
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked ? paginated.map((l) => l.id) : [],
                        )
                      }
                      checked={
                        selectedIds.length === paginated.length &&
                        paginated.length > 0
                      }
                    />
                  </th>
                  {visibleColumns.includes("lead") && (
                  <th className="text-left py-3 px-3">
                    <button
                      onClick={() => toggleSort("name")}
                      className="flex items-center gap-1 text-xs text-slate-500 font-medium hover:text-slate-700"
                    >
                      Lead <ArrowUpDown size={11} />
                    </button>
                  </th>
                  )}
                  {visibleColumns.includes("source") && (
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">
                    Source
                  </th>
                  )}
                  {visibleColumns.includes("status") && (
                  <th className="text-left py-3 px-3">
                    <button
                      onClick={() => toggleSort("status")}
                      className="flex items-center gap-1 text-xs text-slate-500 font-medium hover:text-slate-700"
                    >
                      Status <ArrowUpDown size={11} />
                    </button>
                  </th>
                  )}
                  {visibleColumns.includes("aiScore") && (
                  <th className="text-left py-3 px-3">
                    <button
                      onClick={() => toggleSort("aiScore")}
                      className="flex items-center gap-1 text-xs text-slate-500 font-medium hover:text-slate-700"
                    >
                      AI Score <Bot size={11} />
                    </button>
                  </th>
                  )}
                  {visibleColumns.includes("value") && (
                  <th className="text-left py-3 px-3">
                    <button
                      onClick={() => toggleSort("value")}
                      className="flex items-center gap-1 text-xs text-slate-500 font-medium hover:text-slate-700"
                    >
                      Value <ArrowUpDown size={11} />
                    </button>
                  </th>
                  )}
                    {role === "admin" && visibleColumns.includes("owner") && (
                    <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">
                      Owner
                    </th>
                  )}
                  {visibleColumns.includes("created") && (
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">
                    Created
                  </th>
                  )}
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginated.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 2}
                      className="py-12 text-center text-slate-400 text-sm"
                    >
                      No leads found matching your filters.
                    </td>
                  </tr>
                ) : (
                  paginated.map((lead) => (
                    <tr
                      key={lead.id}
                      className={`hover:bg-slate-50 transition-colors ${selectedIds.includes(lead.id) ? "bg-indigo-50/40" : ""}`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedIds.includes(lead.id)}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(lead.id)
                                ? prev.filter((i) => i !== lead.id)
                                : [...prev, lead.id],
                            )
                          }
                        />
                      </td>
                      {visibleColumns.includes("lead") && (
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                            {lead.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-800 leading-tight">
                              {lead.name}
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Building size={9} />
                              {lead.company}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {lead.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      )}
                      {visibleColumns.includes("source") && (
                      <td className="py-3 px-3 text-xs text-slate-600">
                        {lead.source}
                      </td>
                      )}
                      {visibleColumns.includes("status") && (
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-medium ${statusConfig[lead.status].color}`}
                        >
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${statusConfig[lead.status].dot}`}
                          />
                          {lead.status}
                        </span>
                      </td>
                      )}
                      {visibleColumns.includes("aiScore") && (
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full w-12 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${lead.aiScore >= 80 ? "bg-emerald-500" : lead.aiScore >= 60 ? "bg-amber-500" : "bg-red-400"}`}
                              style={{ width: `${lead.aiScore}%` }}
                            />
                          </div>
                          <span
                            className={`text-xs font-bold px-1.5 py-0.5 rounded-lg border ${scoreColor(lead.aiScore)}`}
                          >
                            {lead.aiScore}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ${lead.aiScore >= 80 ? "bg-red-50 text-red-500" : lead.aiScore >= 60 ? "bg-amber-50 text-amber-500" : "bg-slate-100 text-slate-400"}`}
                          >
                            {scoreLabel(lead.aiScore)}
                          </span>
                        </div>
                      </td>
                      )}
                      {visibleColumns.includes("value") && (
                      <td className="py-3 px-3">
                        <span className="text-xs font-semibold text-slate-800">
                          ₹{(lead.value / 1000).toFixed(0)}K
                        </span>
                        <div className="text-[10px] text-slate-400">
                          {lead.probability}% prob.
                        </div>
                      </td>
                      )}
                      {role === "admin" && visibleColumns.includes("owner") && (
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-md bg-indigo-100 flex items-center justify-center text-indigo-600 text-[9px] font-bold">
                              {lead.owner
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </div>
                            <span className="text-xs text-slate-600 hidden xl:block">
                              {lead.owner.split(" ")[0]}
                            </span>
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes("created") && (
                      <td className="py-3 px-3">
                        <div className="text-xs text-slate-500">
                          {lead.createdAt.slice(5)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {lead.industry}
                        </div>
                      </td>
                      )}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          {/* ── CONVERT TO DEAL BUTTON ── */}
                          <button
                            onClick={() => handleOpenConvertModal(lead)}
                            className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                              lead.converted_to_deal
                                ? "bg-emerald-100 text-emerald-700 cursor-default"
                                : "hover:bg-emerald-50 text-slate-400 hover:text-emerald-600"
                            }`}
                            title={lead.converted_to_deal ? "Converted to Deal" : "Convert to Deal"}
                            disabled={lead.converted_to_deal}
                          >
                            {lead.converted_to_deal ? (
                              <Check size={13} className="text-emerald-600 stroke-[3]" />
                            ) : (
                              <Circle size={13} className="text-slate-300" />
                            )}
                          </button>
                          <button
                            onClick={() => handleSelectLead(lead)}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="View"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            onClick={() => openEdit(lead)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Edit"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(lead.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                            title="Delete Lead"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <span className="text-xs text-slate-400">
            Showing{" "}
            {filtered.length === 0
              ? 0
              : Math.min((page - 1) * perPage + 1, filtered.length)}
            –{Math.min(page * perPage, filtered.length)} of {filtered.length}{" "}
            leads
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = page <= 3 ? i + 1 : page - 2 + i;
              if (p < 1 || p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-7 text-xs rounded-lg transition-colors ${page === p ? "bg-indigo-600 text-white" : "border border-slate-200 hover:bg-slate-50 text-slate-600"}`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="p-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Lead Detail Drawer */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/40"
            onClick={() => setSelectedLead(null)}
          />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10 flex-shrink-0">
              <h2 className="text-slate-800">Lead Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenConvertModal(selectedLead)}
                  disabled={selectedLead.converted_to_deal}
                  className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 transition-colors ${
                    selectedLead.converted_to_deal
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200 opacity-75 cursor-default"
                      : "bg-emerald-600 text-white hover:bg-emerald-700 font-medium"
                  }`}
                >
                  <TrendingUp size={11} />
                  {selectedLead.converted_to_deal ? "Converted" : "Convert to Deal"}
                </button>
                <button
                  onClick={() => openEdit(selectedLead)}
                  className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg flex items-center gap-1 hover:bg-indigo-100"
                >
                  <Edit size={11} />
                  Edit
                </button>
                {role === "admin" && (
                  <button
                    onClick={() => setDeleteConfirm(selectedLead.id)}
                    className="px-3 py-1.5 text-xs bg-red-50 text-red-500 border border-red-200 rounded-lg flex items-center gap-1 hover:bg-red-100"
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                )}
                <button
                  onClick={() => setSelectedLead(null)}
                  className="p-2 rounded-xl hover:bg-slate-100"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {selectedLead.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-slate-900">{selectedLead.name}</h2>
                  <p className="text-sm text-slate-500">
                    {selectedLead.company}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${statusConfig[selectedLead.status].color}`}
                    >
                      {selectedLead.status}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${scoreColor(selectedLead.aiScore)}`}
                    >
                      AI: {selectedLead.aiScore}/100
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bot size={14} className="text-indigo-600" />
                  <span className="text-xs font-semibold text-indigo-700">
                    AI Lead Score Analysis
                  </span>
                </div>
                <div className="h-3 bg-white rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full ${selectedLead.aiScore >= 80 ? "bg-gradient-to-r from-emerald-400 to-emerald-600" : selectedLead.aiScore >= 60 ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-gradient-to-r from-red-400 to-red-500"}`}
                    style={{ width: `${selectedLead.aiScore}%` }}
                  />
                </div>
                <p className="text-xs text-indigo-600">
                  {selectedLead.aiScore >= 80
                    ? "🔥 High probability of conversion. Prioritize immediately."
                    : selectedLead.aiScore >= 60
                      ? "⚡ Moderate interest. Nurture with targeted content."
                      : "❄️ Low engagement. Consider re-qualification approach."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Email", value: selectedLead.email, icon: Mail },
                  { label: "Phone", value: selectedLead.phone, icon: Phone },
                  {
                    label: "Industry",
                    value: selectedLead.industry,
                    icon: Building,
                  },
                  { label: "Source", value: selectedLead.source, icon: Zap },
                  {
                    label: "Value",
                    value: `₹${(selectedLead.value / 1000).toFixed(0)}K`,
                    icon: Star,
                  },
                  {
                    label: "Probability",
                    value: `${selectedLead.probability}%`,
                    icon: Target,
                  },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <Icon size={11} />
                      <span className="text-[10px]">{label}</span>
                    </div>
                    <div className="text-xs font-medium text-slate-800 truncate">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
              {selectedLead.tags.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                    <Tag size={11} />
                    Tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLead.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* ────────────────────────────────────────────────────────────── */}
              {/* INTERNAL CONVERSATION - replaces Notes                      */}
              {/* ────────────────────────────────────────────────────────────── */}

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500 font-medium flex items-center gap-2">
                    <MessagesSquare size={14} />
                    Internal Conversation
                  </p>
                  <span className="text-[10px] text-slate-400">
                    {leadComments.length} comments
                  </span>
                </div>

                {loadingComments ? (
                  <div className="text-center py-4">
                    <RefreshCw size={16} className="animate-spin text-slate-400 mx-auto" />
                  </div>
                ) : leadComments.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400 bg-slate-50 rounded-xl">
                    No comments yet. Start the conversation.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {leadComments.map((comment) => {
                      const isAuthor = comment.user_id === userProfile?.id;
                      const isAdmin = role === "admin";
                      const canEdit = isAuthor || isAdmin;
                      const isEditing = editingCommentId === comment.id;

                      return (
                        <div key={comment.id} className="bg-slate-50 rounded-xl p-3">
                          <div className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                              {comment.user_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "U"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-slate-800">
                                  {comment.user_name}
                                </span>
                                <span className="text-[10px] text-slate-400 capitalize">
                                  {comment.user_role || "user"}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(comment.created_at).toLocaleDateString()} · {new Date(comment.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                                {comment.updated_at !== comment.created_at && (
                                  <span className="text-[10px] text-slate-400 italic">(edited)</span>
                                )}
                              </div>
                              {isEditing ? (
                                <div className="mt-1.5">
                                  <textarea
                                    value={editingCommentText}
                                    onChange={(e) => setEditingCommentText(e.target.value)}
                                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                    rows={2}
                                  />
                                  <div className="flex gap-2 mt-1.5">
                                    <button
                                      onClick={async () => {
                                        if (await updateLeadComment(selectedLead.id, comment.id, editingCommentText)) {
                                          setEditingCommentId(null);
                                          setEditingCommentText("");
                                        }
                                      }}
                                      className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingCommentId(null);
                                        setEditingCommentText("");
                                      }}
                                      className="px-2.5 py-1 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{comment.comment}</p>
                              )}

                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={commentsEndRef} />
                  </div>
                )}
              </div>
            </div>
            {/* Fixed Footer */}
            <div className="border-t border-slate-200 p-5 bg-slate-50/50 space-y-4 flex-shrink-0 z-10">
              {/* Add Comment Box */}
              <div className="flex gap-2">
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white resize-none"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handlePostComment();
                    }
                  }}
                />
                <button
                  onClick={handlePostComment}
                  disabled={!newCommentText.trim() || submittingComment}
                  className="px-4 py-2 text-xs bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 self-end"
                >
                  {submittingComment ? <RefreshCw size={14} className="animate-spin" /> : "Post"}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    handleOpenConvertModal(selectedLead);
                    setSelectedLead(null);
                  }}
                  disabled={selectedLead.converted_to_deal}
                  className={`flex-1 py-2.5 text-sm rounded-xl transition-colors flex items-center justify-center gap-2 ${
                    selectedLead.converted_to_deal
                      ? "bg-emerald-100 text-emerald-600 cursor-default"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {selectedLead.converted_to_deal ? "✅ Converted" : "→ Convert to Deal"}
                </button>
                <a
                  href={`tel:${selectedLead.phone}`}
                  className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Phone size={14} />
                  Call
                </a>
                <a
                  href={`mailto:${selectedLead.email}`}
                  className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Mail size={14} />
                  Email
                </a>
                <button
                  onClick={() => openEdit(selectedLead)}
                  className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit size={14} />
                  Edit
                </button>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-2 font-medium">
                  Quick Status Update
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={async () => {
                        const ok = await updateLead(selectedLead.id, {
                          status: s,
                        });
                        if (ok)
                          setSelectedLead((prev) =>
                            prev ? { ...prev, status: s } : null,
                          );
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${selectedLead.status === s ? statusConfig[s].color : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setShowAddModal(false);
              setEditLead(null);
            }}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-slate-800">
                {editLead ? "Edit Lead" : "Add New Lead"}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditLead(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-xl"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-2 gap-4 max-h-[72vh] overflow-y-auto">
              {/* {[
                { k: "name", label: "Full Name *", ph: "John Doe", col: 2 },
                { k: "company", label: "Company *", ph: "Acme Corp", col: 1 },
                { k: "email", label: "Email", ph: "john@acme.com", col: 1 },
                { k: "phone", label: "Phone", ph: "+91 98765 43210", col: 1 },
                { k: "value", label: "Deal Value (₹)", ph: "50000", col: 1 },
                {
                  k: "probability",
                  label: "Win Probability (%)",
                  ph: "50",
                  col: 1,
                },
                {
                  k: "tags",
                  label: "Tags (comma-separated)",
                  ph: "hot, enterprise, demo",
                  col: 1,
                },
              ].map((f) => (
                <div key={f.k} className={f.col === 2 ? "col-span-2" : ""}>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    {f.label}
                  </label>
                  <input
                    value={(form as any)[f.k]}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [f.k]: e.target.value }))
                    }
                    placeholder={f.ph}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50"
                  />
                </div>
              ))} */}

              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1.5">
                  Full Name *
                </label>
                <input
                  placeholder="John Doe"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Company
                </label>
                <input
                  type="text"
                  required={true}
                  placeholder="Acme Corp"
                  value={form.company}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      company: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required={true}
                  placeholder="john@acme.com"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      email: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Phone
                </label>
                <input
                  type="text"
                  required={true}
                  placeholder="+919876543210"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      phone: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Deal Value (₹)
                </label>
                <input
                  type="number"
                  required={true}
                  placeholder="50000"
                  min={0}
                  max={9999999999}
                  value={form.value}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      value: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Win Probablity (%)
                </label>
                <input
                  type="number"
                  required={true}
                  placeholder="50%"
                  value={form.probability}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      probability: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  required={true}
                  placeholder="hot, enterprise, demo"
                  value={form.tags}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tags: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      status: e.target.value as LeadStatus,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-slate-50"
                >
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Source
                </label>
                <select
                  value={form.source}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      source: e.target.value as LeadSource,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-slate-50"
                >
                  {SOURCES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Industry
                </label>
                <select
                  value={form.industry}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      industry: e.target.value as Industry,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-slate-50"
                >
                  {INDUSTRIES.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </div>
              {role === "admin" && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Assign To
                  </label>
                  <select
                    value={form.owner}
                    onChange={(e) => {
                      const emp = employees.find(
                        (em) => em.name === e.target.value,
                      );
                      setForm((f) => ({
                        ...f,
                        owner: e.target.value,
                        ownerId: emp?.id || "",
                      }));
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-slate-50"
                  >
                    <option value="">Select Employee</option>
                    {employees.map((em) => (
                      <option key={em.id} value={em.name}>
                        {em.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1.5">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Initial notes about this lead..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditLead(null);
                }}
                className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.company.trim()}
                className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Saving...
                  </>
                ) : editLead ? (
                  "Save Changes"
                ) : (
                  "Add Lead"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDeleteConfirm(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={22} className="text-red-500" />
            </div>
            <h3 className="text-slate-800 mb-2">Delete Lead?</h3>
            <p className="text-sm text-slate-500 mb-5">
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-emerald-600" />
                <h2 className="text-slate-800">Import Preview</h2>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  {importPreview.length} leads
                </span>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreview([]);
                }}
                className="p-2 rounded-xl hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4 flex items-start gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700">
                <CheckSquare size={16} className="flex-shrink-0 mt-0.5" />
                <div>
                  <strong>{importPreview.length} leads</strong> ready to import.
                  Leads with missing Name or Company are excluded.
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left py-2 px-3 font-medium text-slate-500">
                        #
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">
                        Name
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">
                        Company
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">
                        Email
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">
                        Status
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {importPreview.slice(0, 20).map((l, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-400">{i + 1}</td>
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {l.name || "—"}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {l.company || "—"}
                        </td>
                        <td className="py-2 px-3 text-slate-400">
                          {l.email || "—"}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded-full border ${statusConfig[(l.status as LeadStatus) || "New"]?.color || "bg-slate-50 text-slate-600 border-slate-200"}`}
                          >
                            {l.status || "New"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {l.value
                            ? `₹${Number(l.value).toLocaleString()}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreview.length > 20 && (
                  <p className="text-xs text-slate-400 mt-3 text-center">
                    ... and {importPreview.length - 20} more leads
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
              <button
                onClick={downloadTemplate}
                className="text-xs text-indigo-600 flex items-center gap-1 hover:text-indigo-700"
              >
                <FileSpreadsheet size={12} />
                Download Template
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportPreview([]);
                  }}
                  className="px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importing || importPreview.length === 0}
                  className="px-6 py-2 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload size={13} />
                      Import {importPreview.length} Leads
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}




{/* ── Convert Lead Modal ── */}
      <ConvertLeadModal
        isOpen={showConvertModal}
        lead={convertLeadData}
        onClose={() => {
          setShowConvertModal(false);
          setConvertLeadData(null);
        }}
        onConvert={handleConvert}
        loading={converting}
      />

      {/* ── Delete Comment Modal ── */}
      <DeleteCommentModal
        isOpen={showDeleteCommentModal}
        onClose={() => {
          setShowDeleteCommentModal(false);
          setDeleteCommentData(null);
        }}
        onConfirm={async () => {
          if (!deleteCommentData || !selectedLead) return;
          setDeletingComment(true);
          try {
            await deleteLeadComment(selectedLead.id, deleteCommentData.id);
            setShowDeleteCommentModal(false);
            setDeleteCommentData(null);
          } finally {
            setDeletingComment(false);
          }
        }}
        loading={deletingComment}
        commentText={deleteCommentData?.text || ""}
      />
    </div>
    
  );
}
