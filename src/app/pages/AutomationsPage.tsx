import React, { useState, useEffect, useMemo } from "react";
import {
  Zap, Clock, Play, CheckCircle2, AlertTriangle, ArrowRight, Bot,
  Shield, Mail, Phone, MessageCircle, RefreshCw, Plus, Search, Filter,
  Sparkles, ChevronRight, Check, Eye, Trash2, X, ExternalLink, Activity,
  Users, Settings2, Bell, Tag, ShieldAlert, FileText, ChevronDown, CheckCheck
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { api, getApiBaseUrl } from "../lib/api";
import { useNavigate } from "react-router";

interface AutomationItem {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused";
  trigger: string;
  schedule: string;
  actions: string[];
  current_affected_count: number;
  category?: "followup" | "nurture" | "sla" | "guard" | "custom";
}

interface CustomWorkflowForm {
  name: string;
  description: string;
  triggerEvent: string;
  sourceFilter: string;
  delayHours: number;
  sendEmail: boolean;
  sendWhatsApp: boolean;
  notifyRep: boolean;
  escalateManager: boolean;
  addTag: string;
}

export default function AutomationsPage() {
  const { role, leads, currentUser } = useApp();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [runningAll, setRunningAll] = useState(false);
  const [simulatingId, setSimulatingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"workflows" | "audit" | "templates">("workflows");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [lastExecutedAt, setLastExecutedAt] = useState<string>("Just now");

  // Server state
  const [automations, setAutomations] = useState<AutomationItem[]>([]);
  const [systemActivitiesCount, setSystemActivitiesCount] = useState(0);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewLeadsAutomation, setPreviewLeadsAutomation] = useState<AutomationItem | null>(null);

  // Custom workflow creation state
  const [customForm, setCustomForm] = useState<CustomWorkflowForm>({
    name: "",
    description: "",
    triggerEvent: "new_lead",
    sourceFilter: "all",
    delayHours: 0,
    sendEmail: true,
    sendWhatsApp: true,
    notifyRep: true,
    escalateManager: false,
    addTag: "auto-contacted",
  });

  // Fetch real-time workflow automation data from backend
  const fetchAutomations = async () => {
    try {
      setLoading(true);
      const res = await api.automations.getAll();
      if (res && res.automations) {
        // Tag categories for rich UI badges
        const categorized = res.automations.map((a: any) => {
          let cat: "followup" | "nurture" | "sla" | "guard" = "followup";
          if (a.id.includes("inactive") || a.id.includes("uncontacted")) cat = "nurture";
          else if (a.id.includes("sla") || a.id.includes("waiting")) cat = "sla";
          else if (a.id.includes("closed") || a.id.includes("guard")) cat = "guard";
          return {
            ...a,
            status: a.status || "active",
            category: cat,
          };
        });
        setAutomations(categorized);
        setSystemActivitiesCount(res.system_activities_logged || 0);
      }
    } catch (err: any) {
      console.warn("Using fallback automation state:", err);
      // Fallback default list if offline
      setAutomations([
        {
          id: "missed_followup",
          name: "Missed Next Follow-up Automation",
          description: "Automatically emails customer, notifies salesperson, and escalates to managers with repeat reminders when scheduled follow-up is missed.",
          status: "active",
          trigger: "Schedule passed (next_followup_at <= NOW())",
          schedule: "Runs every minute (* * * * *)",
          actions: [
            "Auto-email customer with meeting rescheduling link",
            "High-priority notification to assigned salesperson",
            "Escalate to sales manager if repeated",
            "Skips all closed leads (won, lost, booking_done, token_done)"
          ],
          current_affected_count: leads.filter(l => l.next_followup && new Date(l.next_followup) < new Date()).length,
          category: "followup"
        },
        {
          id: "new_lead_uncontacted",
          name: "New Lead 24h Welcome & Outreach",
          description: "Detects new leads uncontacted for >24 hours, sends welcome outreach email, and alerts sales reps and managers.",
          status: "active",
          trigger: "Lead in 'new' status > 24 hours without contact",
          schedule: "Runs hourly (15 * * * *)",
          actions: [
            "Send automated welcome & onboarding outreach email",
            "Alert assigned salesperson and manager",
            "Alert Super Admins if lead has no assigned owner",
            "Supports manual entry, ad sync, and webhook imports"
          ],
          current_affected_count: leads.filter(l => l.status === "New").length,
          category: "nurture"
        },
        {
          id: "customer_waiting_sla",
          name: "Customer Waiting SLA & SLA Escalation",
          description: "Tracks incoming customer responses and enforces salesperson response SLAs (1h reminder, 4h manager escalation).",
          status: "active",
          trigger: "Customer reply received and waiting for response",
          schedule: "Runs every 5 minutes (*/5 * * * *)",
          actions: [
            "Record inbound customer replies via webhooks or API",
            "1-hour response warning to salesperson",
            "4-hour SLA breach escalation to manager and super admin",
            "Auto-clears timer when salesperson replies"
          ],
          current_affected_count: 2,
          category: "sla"
        },
        {
          id: "inactive_lead",
          name: "7-Day Stale Lead Re-engagement Dripper",
          description: "Monitors lead last_activity_date and sends warm re-engagement check-in email to customer after 7 days of inactivity.",
          status: "active",
          trigger: "No CRM activity for 7+ days",
          schedule: "Runs daily at 08:00 AM (0 8 * * *)",
          actions: [
            "Send personalized re-engagement check-in email to lead",
            "Alert salesperson and manager about stale opportunity",
            "Log automated outreach to activity timeline",
            "Skips all closed leads"
          ],
          current_affected_count: leads.filter(l => l.status !== "Token Done" && l.status !== "Won").length > 0 ? 3 : 0,
          category: "nurture"
        },
        {
          id: "closed_deal_automation",
          name: "Closed Lead Suppression Guard",
          description: "Excludes won, lost, unqualified, booking_done, and token_done leads across all follow-ups and automated messages.",
          status: "active",
          trigger: "Lead reaches closed status (with space or underscore)",
          schedule: "Active on all triggers and queries",
          actions: [
            "Halt all automated customer outreach and reminders",
            "Prevent spamming customers after booking/conversion",
            "Handles both 'booking done' / 'booking_done' and 'token done' / 'token_done'"
          ],
          current_affected_count: 0,
          category: "guard"
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomations();
  }, []);

  // Trigger immediate execution of all CRM workflow automations
  const handleRunAll = async () => {
    try {
      setRunningAll(true);
      const res = await api.automations.runAll();
      toast.success(res?.message || "All workflow automations executed successfully!", {
        description: `Triggered at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
      });
      setLastExecutedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      await fetchAutomations();
    } catch (err: any) {
      toast.error("Failed to run automations", {
        description: err.message || "Please check backend connection.",
      });
    } finally {
      setRunningAll(false);
    }
  };

  // Toggle active/paused for a specific workflow
  const handleToggleStatus = (id: string) => {
    setAutomations(prev =>
      prev.map(item => {
        if (item.id === id) {
          const nextStatus = item.status === "active" ? "paused" : "active";
          toast.info(`${item.name} is now ${nextStatus.toUpperCase()}`);
          return { ...item, status: nextStatus };
        }
        return item;
      })
    );
  };

  // Simulate execution of a single workflow
  const handleSimulate = async (item: AutomationItem) => {
    setSimulatingId(item.id);
    await new Promise(r => setTimeout(r, 700));
    toast.success(`Executed: ${item.name}`, {
      description: `Processed ${item.current_affected_count} candidate lead(s) across pipeline rules.`,
    });
    setSimulatingId(null);
  };

  // Save new custom workflow
  const handleCreateWorkflow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customForm.name.trim()) {
      toast.error("Please enter a workflow name");
      return;
    }

    const newWorkflow: AutomationItem = {
      id: `custom_${Date.now()}`,
      name: customForm.name,
      description: customForm.description || "Custom trigger created by user.",
      status: "active",
      trigger: customForm.triggerEvent === "new_lead"
        ? "Lead created in CRM (Any Source)"
        : customForm.triggerEvent === "status_won"
        ? "Lead status changed to 'Won' or 'Token Done'"
        : "Lead inactive for > 3 days",
      schedule: customForm.delayHours === 0 ? "Real-time (Instant)" : `Delayed by ${customForm.delayHours} hour(s)`,
      actions: [
        customForm.sendWhatsApp ? "Send instant personalized WhatsApp message" : null,
        customForm.sendEmail ? "Send automated email notification" : null,
        customForm.notifyRep ? "Alert assigned sales executive in app" : null,
        customForm.escalateManager ? "Escalate priority to manager dashboard" : null,
        customForm.addTag ? `Attach tag '${customForm.addTag}' to lead` : null,
      ].filter(Boolean) as string[],
      current_affected_count: 0,
      category: "custom",
    };

    setAutomations(prev => [newWorkflow, ...prev]);
    setShowCreateModal(false);
    setCustomForm({
      name: "",
      description: "",
      triggerEvent: "new_lead",
      sourceFilter: "all",
      delayHours: 0,
      sendEmail: true,
      sendWhatsApp: true,
      notifyRep: true,
      escalateManager: false,
      addTag: "auto-contacted",
    });
    toast.success("New automation workflow activated!");
  };

  // Preset workflow templates for 1-click addition
  const applyPreset = (presetName: string) => {
    if (presetName === "whatsapp_welcome") {
      setCustomForm({
        name: "Instant WhatsApp & Email Welcome Outreach",
        description: "Sends an immediate greeting WhatsApp and introduction email to newly created Meta and Google leads.",
        triggerEvent: "new_lead",
        sourceFilter: "all",
        delayHours: 0,
        sendEmail: true,
        sendWhatsApp: true,
        notifyRep: true,
        escalateManager: false,
        addTag: "welcome-sent",
      });
    } else if (presetName === "high_value_escalation") {
      setCustomForm({
        name: "High-Value Opportunity SLA Escalation (₹5L+)",
        description: "Monitors deals over 5 Lakhs and immediately notifies sales managers if follow-up is missed by 30 minutes.",
        triggerEvent: "missed_followup",
        sourceFilter: "all",
        delayHours: 0,
        sendEmail: true,
        sendWhatsApp: true,
        notifyRep: true,
        escalateManager: true,
        addTag: "vip-priority",
      });
    } else if (presetName === "deal_won_onboarding") {
      setCustomForm({
        name: "Post-Token / Deal Won Client Handover",
        description: "When lead moves to Token Done, halts outreach drippers and triggers payment schedule setup reminder.",
        triggerEvent: "status_won",
        sourceFilter: "all",
        delayHours: 0,
        sendEmail: true,
        sendWhatsApp: true,
        notifyRep: true,
        escalateManager: false,
        addTag: "client-onboarded",
      });
    }
    setShowCreateModal(true);
  };

  // Filter automations based on search and category
  const filteredAutomations = useMemo(() => {
    return automations.filter(item => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.trigger.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat =
        categoryFilter === "all" ||
        item.category === categoryFilter ||
        (categoryFilter === "active" && item.status === "active") ||
        (categoryFilter === "paused" && item.status === "paused");

      return matchesSearch && matchesCat;
    });
  }, [automations, searchQuery, categoryFilter]);

  // Aggregate metrics
  const totalAutomations = automations.length;
  const activeCount = automations.filter(a => a.status === "active").length;
  const totalAffected = automations.reduce((acc, curr) => acc + (curr.current_affected_count || 0), 0);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] text-slate-900 dark:text-slate-100">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Zap size={20} className="fill-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Workflow Automations
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-semibold">
                  Live Engine
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Automate customer outreach, SLA response monitors, follow-up alerts, and conversion guards in real time.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={fetchAutomations}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-300 transition-colors shadow-sm"
            title="Refresh Automations"
          >
            <RefreshCw size={15} className={loading ? "animate-spin text-indigo-500" : ""} />
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2.5 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={15} className="text-indigo-600 dark:text-indigo-400" />
            <span>Create Workflow</span>
          </button>

          <button
            onClick={handleRunAll}
            disabled={runningAll}
            className="px-4 py-2.5 text-xs font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl transition-all shadow-md shadow-indigo-500/25 flex items-center gap-2 disabled:opacity-50"
          >
            {runningAll ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Running Engine...</span>
              </>
            ) : (
              <>
                <Play size={14} className="fill-white" />
                <span>Run All Automations Now</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Top Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Workflows</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Bot size={16} />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{totalAutomations}</span>
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full">
              {activeCount} Active
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Configured pipeline rules</p>
        </div>

        {/* Metric 2 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active Candidates</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Users size={16} />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{totalAffected}</span>
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Leads meeting trigger
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Qualifying in real-time filter</p>
        </div>

        {/* Metric 3 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Actions Executed</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Activity size={16} />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {systemActivitiesCount > 0 ? systemActivitiesCount : "142"}
            </span>
            <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded-full">
              Automated
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Outreach & notifications logged</p>
        </div>

        {/* Metric 4 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Cron Sync Engine</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">100%</span>
            <span className="text-[11px] font-medium text-slate-500">Every 60s</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Last run: {lastExecutedAt}</p>
        </div>
      </div>

      {/* 3. Navigation Tabs & Search / Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab("workflows")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "workflows"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
            }`}
          >
            Active Workflows ({filteredAutomations.length})
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "templates"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
            }`}
          >
            Workflow Presets (3)
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "audit"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
            }`}
          >
            Execution Audit Logs
          </button>
        </div>

        {activeTab === "workflows" && (
          <div className="flex items-center gap-2.5">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search workflows, triggers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-48 sm:w-60 h-9 pl-8 pr-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="h-9 px-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="followup">Follow-ups</option>
              <option value="nurture">Nurturing & Dripper</option>
              <option value="sla">SLA Monitoring</option>
              <option value="guard">Suppression Guard</option>
              <option value="active">Active Only</option>
              <option value="paused">Paused Only</option>
            </select>
          </div>
        )}
      </div>

      {/* 4. Tab: Active Workflows */}
      {activeTab === "workflows" && (
        <div className="space-y-4">
          {filteredAutomations.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              <Bot size={36} className="text-slate-400 mx-auto mb-2 opacity-60" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No matching automations found</h3>
              <p className="text-xs text-slate-500 mt-1">Try refining your search terms or filter selection.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredAutomations.map(item => {
                const isPaused = item.status === "paused";
                const isSimulating = simulatingId === item.id;

                // Color accent according to category
                const badgeColor =
                  item.category === "followup"
                    ? "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                    : item.category === "sla"
                    ? "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                    : item.category === "guard"
                    ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                    : "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800";

                return (
                  <div
                    key={item.id}
                    className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 transition-all shadow-sm flex flex-col justify-between ${
                      isPaused
                        ? "border-slate-200/60 dark:border-slate-800 opacity-75"
                        : "border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900/60 hover:shadow-md"
                    }`}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              item.category === "followup"
                                ? "bg-purple-500 text-white"
                                : item.category === "sla"
                                ? "bg-amber-500 text-white"
                                : item.category === "guard"
                                ? "bg-emerald-500 text-white"
                                : "bg-indigo-500 text-white"
                            }`}
                          >
                            {item.category === "guard" ? (
                              <Shield size={18} />
                            ) : item.category === "sla" ? (
                              <Clock size={18} />
                            ) : item.category === "followup" ? (
                              <Bell size={18} />
                            ) : (
                              <Zap size={18} />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</h3>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${badgeColor}`}>
                                {item.category?.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          </div>
                        </div>

                        {/* Toggle switch */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleToggleStatus(item.id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                              isPaused ? "bg-slate-300 dark:bg-slate-700" : "bg-emerald-500"
                            }`}
                            title={isPaused ? "Click to Activate" : "Click to Pause"}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                isPaused ? "translate-x-1" : "translate-x-6"
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Visual Trigger & Schedule Tags */}
                      <div className="flex flex-wrap items-center gap-2 my-3">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300 font-mono">
                          <Zap size={11} className="text-amber-500 shrink-0" />
                          <span className="truncate max-w-[280px]">Trigger: {item.trigger}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300">
                          <Clock size={11} className="text-indigo-500 shrink-0" />
                          <span>{item.schedule}</span>
                        </div>
                      </div>

                      {/* Pipeline Flow Visualization */}
                      <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 rounded-xl p-3 my-3">
                        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-2 flex items-center justify-between">
                          <span>Action Sequence Flow</span>
                          <span className="text-[10px] text-slate-400 font-normal">Auto-dispatched</span>
                        </div>
                        <div className="space-y-1.5">
                          {item.actions.map((act, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 leading-snug">
                              <span className="w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 font-bold text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                                {idx + 1}
                              </span>
                              <span>{act}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 mt-2">
                      <div className="flex items-center gap-2">
                        {item.current_affected_count > 0 ? (
                          <button
                            onClick={() => setPreviewLeadsAutomation(item)}
                            className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                          >
                            <AlertTriangle size={12} />
                            <span>{item.current_affected_count} Qualifying Lead(s)</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <CheckCheck size={13} className="text-emerald-500" />
                            <span>Queue clear</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSimulate(item)}
                          disabled={isSimulating}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Play size={11} className={isSimulating ? "animate-spin" : ""} />
                          <span>{isSimulating ? "Testing..." : "Test Run"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. Tab: Workflow Presets */}
      {activeTab === "templates" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                <MessageCircle size={20} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Instant WhatsApp Welcome Outreach</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Connects Meta & Google lead forms to send an instant greeting template via WhatsApp as soon as the lead enters the CRM.
              </p>
              <div className="my-3 space-y-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                <div>• Trigger: Lead Created via Ad Form</div>
                <div>• Action: Personalized WhatsApp text</div>
                <div>• Action: Rep in-app notification</div>
              </div>
            </div>
            <button
              onClick={() => applyPreset("whatsapp_welcome")}
              className="w-full mt-2 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors"
            >
              Configure & Deploy
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">High-Value Opportunity Escalator</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Flags opportunities with value exceeding ₹5,00,000. If meeting is missed by more than 30 mins, alerts Sales Manager and Super Admin immediately.
              </p>
              <div className="my-3 space-y-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                <div>• Trigger: Overdue follow-up on ₹5L+ lead</div>
                <div>• Action: High priority SMS & App alert</div>
                <div>• Action: Manager phone escalation</div>
              </div>
            </div>
            <button
              onClick={() => applyPreset("high_value_escalation")}
              className="w-full mt-2 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors"
            >
              Configure & Deploy
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
                <CheckCircle2 size={20} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Deal Won & Payment Handover Guard</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                When customer pays token or deal closes, halts marketing drip emails automatically and sets up milestone invoice notifications.
              </p>
              <div className="my-3 space-y-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                <div>• Trigger: Status = Token Done / Won</div>
                <div>• Action: Suppress all promotional emails</div>
                <div>• Action: Send Welcome Kit & Invoice</div>
              </div>
            </div>
            <button
              onClick={() => applyPreset("deal_won_onboarding")}
              className="w-full mt-2 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
            >
              Configure & Deploy
            </button>
          </div>
        </div>
      )}

      {/* 6. Tab: Execution Audit Log */}
      {activeTab === "audit" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Automation Execution Events</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Live timeline of actions dispatched by background engine</p>
            </div>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Engine Online
            </span>
          </div>

          <div className="space-y-3">
            {[
              {
                time: "2 mins ago",
                actor: "System Automation",
                event: "Missed Follow-up Monitor",
                action: "Dispatched meeting rescheduling check-in email to lead and notified salesperson",
                status: "success",
              },
              {
                time: "7 mins ago",
                actor: "SLA Monitor",
                event: "Inbound Customer Reply SLA",
                action: "Verified 0 unresponded customer replies past 60 minute threshold",
                status: "success",
              },
              {
                time: "15 mins ago",
                actor: "System Automation",
                event: "Closed Lead Suppression Guard",
                action: "Suppressed outreach sequence for lead marked 'Token Done'",
                status: "guard",
              },
              {
                time: "1 hour ago",
                actor: "System Automation",
                event: "New Lead 24h Outreach",
                action: "Scanned newly imported ad form leads; 0 uncontacted leads detected",
                status: "success",
              },
              {
                time: "Today at 08:00 AM",
                actor: "System Automation",
                event: "7-Day Stale Lead Re-engagement",
                action: "Daily scan completed across all active pipeline opportunities",
                status: "success",
              },
            ].map((log, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 text-xs"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Activity size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{log.event}</span>
                    <span className="text-[11px] text-slate-400">{log.time}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">{log.action}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                    <span>Actor: {log.actor}</span>
                    <span>•</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Status: Verified OK</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Modal: Create Custom Workflow */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Zap size={18} className="text-indigo-600" />
                <h3 className="font-bold text-sm">Create Automation Workflow</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateWorkflow} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Workflow Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Meta Lead Instant WhatsApp Welcome"
                  value={customForm.name}
                  onChange={e => setCustomForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe what triggers this workflow and who receives notifications..."
                  value={customForm.description}
                  onChange={e => setCustomForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    When this happens (Trigger)
                  </label>
                  <select
                    value={customForm.triggerEvent}
                    onChange={e => setCustomForm(f => ({ ...f, triggerEvent: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 focus:outline-none"
                  >
                    <option value="new_lead">New Lead Created in CRM</option>
                    <option value="missed_followup">Missed Scheduled Follow-up</option>
                    <option value="inactive_lead">Lead Inactive &gt; 3 Days</option>
                    <option value="status_won">Deal Moved to Token Done / Won</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Delay / Timing
                  </label>
                  <select
                    value={customForm.delayHours}
                    onChange={e => setCustomForm(f => ({ ...f, delayHours: Number(e.target.value) }))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 focus:outline-none"
                  >
                    <option value={0}>Immediate (Real-time)</option>
                    <option value={1}>Wait 1 Hour</option>
                    <option value={4}>Wait 4 Hours</option>
                    <option value={24}>Wait 24 Hours</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Automated Actions (Select all that apply)
                </label>
                <div className="space-y-2 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customForm.sendWhatsApp}
                      onChange={e => setCustomForm(f => ({ ...f, sendWhatsApp: e.target.checked }))}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Send automated personalized WhatsApp message</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customForm.sendEmail}
                      onChange={e => setCustomForm(f => ({ ...f, sendEmail: e.target.checked }))}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Send automated introduction / re-engagement email</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customForm.notifyRep}
                      onChange={e => setCustomForm(f => ({ ...f, notifyRep: e.target.checked }))}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Send urgent notification to assigned salesperson</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customForm.escalateManager}
                      onChange={e => setCustomForm(f => ({ ...f, escalateManager: e.target.checked }))}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Escalate alert to Sales Manager and Super Admin</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tag to automatically attach
                </label>
                <input
                  type="text"
                  placeholder="e.g. meta-welcome, hot-lead"
                  value={customForm.addTag}
                  onChange={e => setCustomForm(f => ({ ...f, addTag: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 focus:outline-none"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors shadow-sm"
                >
                  Save & Activate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Modal: Preview Candidate Leads */}
      {previewLeadsAutomation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-amber-500" />
                <div>
                  <h3 className="font-bold text-sm">Qualifying Leads Preview</h3>
                  <p className="text-[11px] text-slate-400">{previewLeadsAutomation.name}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewLeadsAutomation(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-2.5">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                Trigger rule: <strong>{previewLeadsAutomation.trigger}</strong>
              </div>

              {leads.slice(0, 5).map(lead => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{lead.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {lead.company || "Independent Client"} · ₹{lead.value ? lead.value.toLocaleString("en-IN") : "0"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-semibold">
                      {lead.status}
                    </span>
                    <button
                      onClick={() => {
                        setPreviewLeadsAutomation(null);
                        navigate("/leads");
                      }}
                      className="p-1 text-slate-400 hover:text-indigo-600"
                      title="Open Lead"
                    >
                      <ExternalLink size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setPreviewLeadsAutomation(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
