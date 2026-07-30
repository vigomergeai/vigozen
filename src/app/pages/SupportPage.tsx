// src/app/pages/SupportPage.tsx
import React, { useState, useRef, useEffect } from "react";
import {
  HelpCircle, MessageSquare, Phone, Mail, Book, Search, ChevronDown,
  Plus, Send, Bot, CheckCircle, Clock, AlertTriangle, Star,
  Zap, ArrowRight, Headphones, X, ExternalLink, RefreshCw, Trash2, Edit, Users, User,
  Layout, Code, Target, Facebook, Instagram, Linkedin, Webhook, Settings, Plug, Globe, Copy, MessageCircle, Lock
} from "lucide-react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";

import { useTickets, useFAQs, useGuides, Guide } from "../../hooks/useSupport";
import { useUsers } from "../../hooks/useUsers";
import { useLeadPages } from "../../hooks/useLeadPages";
import { useAdConnections } from "../../hooks/useAdConnections";
import { useLeadSources } from "../../hooks/useLeadSources";
import { toast } from "sonner";

const priorityConfig = {
  Critical: { color: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  High: { color: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  Medium: { color: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  Low: { color: "bg-slate-50 text-slate-600 border-slate-200", dot: "bg-slate-400" },
};

const statusConfig = {
  Open: { color: "bg-blue-50 text-blue-700 border-blue-200", icon: Clock },
  "In Progress": { color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: Zap },
  Resolved: { color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle },
  Closed: { color: "bg-slate-50 text-slate-500 border-slate-200", icon: CheckCircle },
};

const guidesData: Guide[] = [
  { id: "g1", title: "Getting Started with Vigozen CRM", read_time: "5 min", icon: "🚀", type: "Guide" as const, sort_order: 1 },
  { id: "g2", title: "Setting Up Facebook Lead Ads Integration", read_time: "8 min", icon: "📘", type: "Tutorial" as const, sort_order: 2 },
  { id: "g3", title: "AI Lead Scoring Explained", read_time: "10 min", icon: "🤖", type: "Video" as const, sort_order: 3 },
  { id: "g4", title: "Creating Custom Workflows", read_time: "12 min", icon: "⚙️", type: "Tutorial" as const, sort_order: 4 },
  { id: "g5", title: "Generating Advanced Reports", read_time: "6 min", icon: "📊", type: "Guide" as const, sort_order: 5 },
  { id: "g6", title: "Team Collaboration Best Practices", read_time: "7 min", icon: "👥", type: "Guide" as const, sort_order: 6 },
];

const aiResponses: Record<string, string> = {
  score: "AI Lead Scoring analyzes 50+ data points including engagement behavior, company profile, industry fit, and historical conversion patterns. Scores range from 0-100. Scores 80+ = Hot Lead, 60-79 = Warm Lead, below 60 = Cold Lead.",
  facebook: "To connect Facebook Lead Ads: Go to Settings → Lead Integrations → Facebook Ads. Click 'Connect', authorize with your Facebook Business Manager. Leads sync automatically every 15 minutes.",
  report: "Vigozen CRM offers 3 report types: Employee-wise, Status-wise, and Sales-wise. All support Daily, Weekly, and Custom date filters. Use the AI Insights toggle for GPT-4 powered analysis.",
  pipeline: "The Sales Pipeline shows deals in a Kanban view. Drag and drop deals between stages (New → Won/Lost). The Forecast view shows weighted pipeline value and predicted revenue.",
  integration: "Vigozen CRM supports: Facebook Lead Ads, LinkedIn Sales Navigator, Google Ads, Website Forms, Salesforce, HubSpot, Zapier, and WhatsApp Business. Go to Settings → Lead Integrations to manage.",
  default: "I'm Vigozen CRM AI Assistant! I can help with lead management, pipeline setup, integrations, reports, and more. Try asking about: lead scoring, Facebook integration, report generation, or pipeline management.",
};

function getAIResponse(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("score") || lower.includes("ai")) return aiResponses.score;
  if (lower.includes("facebook") || lower.includes("ads")) return aiResponses.facebook;
  if (lower.includes("report") || lower.includes("analysis")) return aiResponses.report;
  if (lower.includes("pipeline") || lower.includes("deal") || lower.includes("kanban")) return aiResponses.pipeline;
  if (lower.includes("integrat") || lower.includes("connect")) return aiResponses.integration;
  return aiResponses.default;
}

export default function SupportPage() {
  const { tickets, loading, isAdmin, addTicket, updateTicket, deleteTicket, fetchTickets } = useTickets();
  const { faqs } = useFAQs();
  const { guides } = useGuides();
  const { users } = useUsers();
  const { subscription } = useApp();  // ← ADD THIS
  const navigate = useNavigate();  
  
  const [activeTab, setActiveTab] = useState<"overview" | "tickets" | "chat" | "docs" | "leadpages" | "adsmanager" | "leadintegrations">("overview");
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState([
    { id: 1, role: "ai", text: "Hello! I'm your Vigozen CRM AI Assistant. How can I help you today?", time: "Now" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [ticketForm, setTicketForm] = useState({ 
    title: "", 
    category: "Integration", 
    priority: "Medium" as "Low" | "Medium" | "High" | "Critical", 
    description: "" 
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [editTicket, setEditTicket] = useState<any | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [savingTicket, setSavingTicket] = useState(false);
  const [showPhoneMenu, setShowPhoneMenu] = useState(false);
  const [showEmailMenu, setShowEmailMenu] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
const [autoCreate, setAutoCreate] = useState(false);
    // ========== LEAD MANAGEMENT HOOKS ==========
  const { leadPages, loading: pagesLoading, addLeadPage, updateLeadPage, deleteLeadPage, fetchLeadPages } = useLeadPages();
  const { adConnections, loading: adsLoading, connectAdPlatform, disconnectAdPlatform, syncAdLeads, fetchAdConnections } = useAdConnections();
  const { leadSources, loading: sourcesLoading, addLeadSource, fetchLeadSources } = useLeadSources();
  
  // ========== LOCAL STATE ==========
  const [showLeadPageModal, setShowLeadPageModal] = useState(false);
  const [editingLeadPage, setEditingLeadPage] = useState<any>(null);
  const [leadPageForm, setLeadPageForm] = useState({
    name: "", slug: "", description: "", status: "active" as "active" | "draft" | "paused", webhookUrl: "", redirectUrl: ""
  });
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  // ========== ADD SOURCE MODAL STATE ==========
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [newSourceForm, setNewSourceForm] = useState({
    name: "",
    type: "facebook",
    status: "pending",
    config: {}
  });

  const [displayedGuides, setDisplayedGuides] = useState<Guide[]>(guidesData);

  useEffect(() => {
    if (guides && guides.length > 0) {
      setDisplayedGuides(guides);
    }
  }, [guides]);

  const chatEndRef = useRef<HTMLDivElement>(null);

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
            Upgrade to continue accessing support and help resources.
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isTyping]);

 const sendMessage = async () => {
  if (!chatInput.trim()) return;

  const userMsg = { id: chatMessages.length + 1, role: "user", text: chatInput, time: "Now" };
  setChatMessages(prev => [...prev, userMsg]);
  setIsTyping(true);
  setChatInput("");

  await new Promise(resolve => setTimeout(resolve, 800));

  const aiText = getAIResponse(chatInput);

  setChatMessages(prev => [...prev, {
    id: prev.length + 1,
    role: "ai",
    text: aiText,
    time: "Now"
  }]);

  setIsTyping(false);
};
const handleSubmitTicket = async () => {
    if (!ticketForm.title.trim()) {
      alert("Please enter a title for your ticket");
      return;
    }
    setSavingTicket(true);
    try {
      if (editTicket) {
        await updateTicket(editTicket.id, {
          title: ticketForm.title,
          category: ticketForm.category,
          priority: ticketForm.priority,
          description: ticketForm.description,
          status: editTicket.status,
        });
        alert("Ticket updated successfully!");
      } else {
        await addTicket({
          title: ticketForm.title,
          category: ticketForm.category,
          priority: ticketForm.priority,
          description: ticketForm.description,
          status: "Open",
        });
        alert("Ticket created successfully!");
      }
      setShowNewTicket(false);
      setEditTicket(null);
      setTicketForm({ title: "", category: "Integration", priority: "Medium", description: "" });
    } catch (error: any) {
      console.error("Error saving ticket:", error);
      alert("Error saving ticket: " + error.message);
    } finally {
      setSavingTicket(false);
    }
  };

 
  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateTicket(id, { status: status as any });
      alert(`Status updated to ${status}`);
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Error updating status");
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm(null);
    try {
      await deleteTicket(id);
      alert("Ticket deleted successfully!");
    } catch (error) {
      console.error("Error deleting ticket:", error);
      alert("Error deleting ticket");
    }
  };

  const handleAssignTicket = async (ticketId: string, userId: string) => {
    try {
      const user = users.find(u => u.id === userId);
      await updateTicket(ticketId, { 
        assigned_to: userId || undefined,
        assigned_to_name: user?.full_name || user?.email || undefined
      });
      alert(userId ? `Ticket assigned to ${user?.full_name || user?.email}` : 'Ticket unassigned');
    } catch (error) {
      console.error("Error assigning ticket:", error);
      alert("Error assigning ticket");
    }
  };

  const openEditTicket = (ticket: any) => {
    setTicketForm({
      title: ticket.title,
      category: ticket.category,
      priority: ticket.priority,
      description: ticket.description || "",
    });
    setEditTicket(ticket);
    setShowNewTicket(true);
  };

// ========== HELPER FUNCTIONS ==========
const copyTextToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  alert("Copied to clipboard!");
};

const saveLeadPage = async () => {
  console.log("===== SAVE LEAD PAGE STARTED =====");
  console.log("editingLeadPage:", editingLeadPage);
  console.log("leadPageForm:", leadPageForm);
  
  if (!leadPageForm.name || !leadPageForm.name.trim()) {
    toast.error("Please enter a page name");
    return;
  }
  
  try {
    const payload = {
      name: leadPageForm.name.trim(),
      slug: leadPageForm.slug?.trim() || null,
      description: leadPageForm.description?.trim() || null,
      status: leadPageForm.status,
      webhook_url: leadPageForm.webhookUrl?.trim() || null,
      redirect_url: leadPageForm.redirectUrl?.trim() || null
    };

    if (editingLeadPage) {
      console.log("🟡 UPDATING existing page:", editingLeadPage.id);
      await updateLeadPage(editingLeadPage.id, payload);
      toast.success("Lead page updated successfully!");
    } else {
      console.log("🟢 CREATING new page");
      await addLeadPage(payload);
      toast.success("Lead page created successfully!");
    }
    
    // Reset form and close modal
    setShowLeadPageModal(false);
    setEditingLeadPage(null);
    setLeadPageForm({ 
      name: "", slug: "", description: "", 
      status: "active", webhookUrl: "", redirectUrl: "" 
    });
    
    // Refresh the list
    await fetchLeadPages();
    console.log("Lead pages refreshed");
    
  } catch (error: any) {
    console.error("🔴 Error:", error);
    toast.error("Failed to save: " + error.message);
  }
};
const openEditLeadPage = (page: any) => {
  console.log("===== EDIT BUTTON CLICKED =====");
  console.log("Page to edit:", page);
  
  if (!page || !page.id) {
    console.error("Invalid page data");
    alert("Error: Invalid page data");
    return;
  }
  
  setEditingLeadPage(page);
  setLeadPageForm({
    name: page.name || "",
    slug: page.slug || "",
    description: page.description || "",
    status: page.status || "active",
    webhookUrl: page.webhook_url || "",
    redirectUrl: page.redirect_url || ""
  });
  setShowLeadPageModal(true);
  console.log("Modal opened with editingLeadPage:", page.id);
};
const handleViewSubmissions = (page: any) => {
  alert(`📋 Submissions for "${page.name}"\n\nTotal Leads: ${page.leads_count || 0}\nConversion Rate: ${page.conversion_rate || 0}%`);
};

const handleAnalytics = (page: any) => {
  alert(`📊 Analytics for "${page.name}"\n\nLeads: ${page.leads_count || 0}\nConversion: ${page.conversion_rate || 0}%\nCreated: ${new Date(page.created_at).toLocaleDateString()}`);
};
const handleConnectAd = async (platform: string, platformName: string) => {
  const accountId = prompt(`Enter your ${platformName} Account ID:`);
  const accountName = prompt(`Enter your ${platformName} Account Name:`);
  if (accountId && accountName) {
    await connectAdPlatform(platform, platformName, accountId, accountName);
  }
};

const handleDisconnectAd = async (id: string, platformName: string) => {
  if (confirm(`Are you sure you want to disconnect ${platformName}?`)) {
    await disconnectAdPlatform(id, platformName);
  }
};
  // ========== EXISTING copyToClipboard FUNCTION (keep this) ==========
    const handleAddLeadSource = async () => {
    if (!newSourceForm.name) {
      alert("Please enter source name");
      return;
    }
    try {
           const sourceData = {
        name: newSourceForm.name,
        type: newSourceForm.type,
        status: "pending" as "pending" | "connected" | "disconnected",
        leads_count: 0,
        config: {}
      };
      await addLeadSource(sourceData);
      alert("Lead source added successfully!");
      setShowAddSourceModal(false);
      setNewSourceForm({ name: "", type: "facebook", status: "pending", config: {} });
      fetchLeadSources();
    } catch (error) {
      alert("Failed to add lead source");
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(type);
    setTimeout(() => setCopySuccess(null), 2000);
  };
  const displayedFaqs = faqs.length > 0 ? faqs : [];
  const filteredFaqs = displayedFaqs.filter((f: any) =>
    searchQuery === "" ||
    f.question?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.answer?.toLowerCase().includes(searchQuery.toLowerCase())
  );


  const userOpenCount = tickets.filter((t: any) => t.status === "Open").length;
  const userResolvedCount = tickets.filter((t: any) => t.status === "Resolved").length;

   const tabs = [
    { id: "overview" as const, label: "Overview", icon: HelpCircle },
    { id: "tickets" as const, label: isAdmin ? `All Tickets (${tickets.length})` : `My Tickets (${tickets.length})`, icon: MessageSquare },
    { id: "chat" as const, label: "AI Chat", icon: Bot },
    { id: "docs" as const, label: "Docs & Guides", icon: Book },
    ...(isAdmin ? [
      { id: "leadpages" as const, label: "Lead Pages", icon: Layout },
      { id: "adsmanager" as const, label: "Ads Manager", icon: Target },
      { id: "leadintegrations" as const, label: "Lead Integrations", icon: Plug }
    ] : [])
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-slate-900 dark:text-white text-2xl font-bold">Help & Support</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isAdmin ? "Admin Portal · Manage all support tickets" : "AI-powered support · 24/7 assistance"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
  onClick={() => setActiveTab("tickets")}
  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isAdmin ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
>
  {isAdmin ? (
    <span className="flex items-center gap-1"><Users size={12} /> Admin View</span>
  ) : (
    <span className="flex items-center gap-1"><User size={12} /> My Tickets</span>
  )}
</button>
          <button onClick={() => fetchTickets()} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
            <RefreshCw size={14} className={`text-slate-500 ${loading ? "animate-spin" : ""}`} />
          </button>
         <button 
  onClick={() => setActiveTab("chat")}
  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full hover:bg-emerald-100 transition-colors"
>
  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
  <span className="text-xs text-emerald-700 font-medium">Support Online</span>
</button>
          <button onClick={() => { setActiveTab("tickets"); setShowNewTicket(true); setEditTicket(null); setTicketForm({ title: "", category: "Integration", priority: "Medium", description: "" }); }} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 transition-colors">
            <Plus size={14} />New Ticket
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 text-xs rounded-lg transition-all ${activeTab === tab.id ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
              <Icon size={13} />{tab.label}
            </button>
          );
        })}
      </div>

      {/* ===== OVERVIEW ===== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Contact Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button onClick={() => setActiveTab("chat")} className="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:shadow-md transition-all group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <MessageSquare size={18} className="text-white" />
              </div>
              <div className="text-sm font-semibold text-slate-800 mb-0.5">Live Chat</div>
              <div className="text-xs text-slate-500 mb-2">Chat with our team now</div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">Available</span>
            </button>

            <div className="relative">
              <button onClick={() => setShowPhoneMenu(!showPhoneMenu)} className="w-full bg-white border border-slate-200 rounded-2xl p-5 text-left hover:shadow-md transition-all group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Phone size={18} className="text-white" />
                </div>
                <div className="text-sm font-semibold text-slate-800 mb-0.5">Phone Support</div>
                <div className="text-xs text-slate-500 mb-2">Click to view number</div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">Mon–Sat 9am–6pm</span>
              </button>
              {showPhoneMenu && (
                <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-xl shadow-lg border border-slate-200 z-10 p-3">
                  <div className="text-sm font-medium text-slate-700 mb-2">Call us at:</div>
                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg">
                    <span className="text-sm font-mono text-indigo-600">+91 9529782361</span>
                    <button onClick={() => copyToClipboard("+91 9529782361", "phone")} className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">
                      {copySuccess === "phone" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <button onClick={() => setShowPhoneMenu(false)} className="mt-2 text-xs text-slate-400 hover:text-slate-600 w-full text-center">Close</button>
                </div>
              )}
            </div>

            <div className="relative">
              <button onClick={() => setShowEmailMenu(!showEmailMenu)} className="w-full bg-white border border-slate-200 rounded-2xl p-5 text-left hover:shadow-md transition-all group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Mail size={18} className="text-white" />
                </div>
                <div className="text-sm font-semibold text-slate-800 mb-0.5">Email Support</div>
                <div className="text-xs text-slate-500 mb-2">Click to copy email</div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">&lt; 4hr response</span>
              </button>
              {showEmailMenu && (
                <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-xl shadow-lg border border-slate-200 z-10 p-3">
                  <div className="text-sm font-medium text-slate-700 mb-2">Email us at:</div>
                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg">
                    <span className="text-sm font-mono text-amber-600">vigomerge@zohomail.in</span>
                    <button onClick={() => copyToClipboard("vigomerge@zohomail.in", "email")} className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200">
                      {copySuccess === "email" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <button onClick={() => setShowEmailMenu(false)} className="mt-2 text-xs text-slate-400 hover:text-slate-600 w-full text-center">Close</button>
                </div>
              )}
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {isAdmin ? (
              <>
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <div className="text-2xl font-bold text-blue-600">{tickets.filter((t: any) => t.status === "Open").length}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Total Open Tickets</div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <div className="text-2xl font-bold text-emerald-600">{tickets.filter((t: any) => t.status === "Resolved").length}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Total Resolved</div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <div className="text-2xl font-bold text-indigo-600">{tickets.length}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Total Tickets</div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <div className="text-2xl font-bold text-amber-600">&lt;2hrs</div>
                  <div className="text-xs text-slate-500 mt-0.5">Avg Response</div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <div className="text-2xl font-bold text-blue-600">{userOpenCount}</div>
                  <div className="text-xs text-slate-500 mt-0.5">My Open Tickets</div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <div className="text-2xl font-bold text-emerald-600">{userResolvedCount}</div>
                  <div className="text-xs text-slate-500 mt-0.5">My Resolved</div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <div className="text-2xl font-bold text-indigo-600">{tickets.length}</div>
                  <div className="text-xs text-slate-500 mt-0.5">My Total Tickets</div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <div className="text-2xl font-bold text-amber-600">&lt;2hrs</div>
                  <div className="text-xs text-slate-500 mt-0.5">Avg Response</div>
                </div>
              </>
            )}
          </div>

          {/* FAQs Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-slate-800 font-semibold">Frequently Asked Questions</h3>
                <p className="text-xs text-slate-400 mt-0.5">Quick answers to common questions</p>
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search FAQs..." className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50" />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredFaqs.length > 0 ? (
                filteredFaqs.map((faq: any, i: number) => (
                  <div key={i}>
                    <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors">
                      <span className="text-sm font-medium text-slate-800 pr-4">{faq.question}</span>
                      <ChevronDown size={16} className={`text-slate-400 flex-shrink-0 transition-transform ${faqOpen === i ? "rotate-180" : ""}`} />
                    </button>
                    {faqOpen === i && <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed bg-slate-50/50">{faq.answer}</div>}
                  </div>
                ))
              ) : (
                <div className="px-5 py-8 text-center text-sm text-slate-400">{searchQuery ? "No FAQs match your search." : "No FAQs available."}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== TICKETS ===== */}
      {activeTab === "tickets" && (
        <div className="space-y-5">
          {/* New/Edit Ticket Modal */}
          {showNewTicket && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => { setShowNewTicket(false); setEditTicket(null); }} />
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                  <h2 className="text-slate-800 font-semibold">{editTicket ? "Edit Ticket" : "Create Support Ticket"}</h2>
                  <button onClick={() => { setShowNewTicket(false); setEditTicket(null); }} className="p-2 hover:bg-slate-100 rounded-xl"><X size={16} /></button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Issue Title *</label>
                    <input value={ticketForm.title} onChange={e => setTicketForm(f => ({ ...f, title: e.target.value }))} placeholder="Briefly describe your issue..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1.5">Category</label>
                      <select value={ticketForm.category} onChange={e => setTicketForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-slate-50">
                        {["Integration", "Reports", "Dashboard", "Notifications", "Billing", "API", "Other"].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1.5">Priority</label>
                      <select value={ticketForm.priority} onChange={e => setTicketForm(f => ({ ...f, priority: e.target.value as any }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-slate-50">
                        {["Low", "Medium", "High", "Critical"].map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Description</label>
                    <textarea value={ticketForm.description} onChange={e => setTicketForm(f => ({ ...f, description: e.target.value }))} placeholder="Provide detailed information about the issue..." rows={4} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 resize-none" />
                  </div>
                </div>
                <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
                  <button onClick={() => { setShowNewTicket(false); setEditTicket(null); }} className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                  <button onClick={handleSubmitTicket} disabled={savingTicket || !ticketForm.title.trim()} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {savingTicket ? <><RefreshCw size={13} className="animate-spin" />Saving...</> : editTicket ? "Save Changes" : "Submit Ticket"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-slate-800 font-semibold">
              {isAdmin ? `All Support Tickets (${tickets.length})` : `My Support Tickets (${tickets.length})`}
            </h3>
            <button onClick={() => { setShowNewTicket(true); setEditTicket(null); setTicketForm({ title: "", category: "Integration", priority: "Medium", description: "" }); }} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 transition-colors">
              <Plus size={14} />New Ticket
            </button>
          </div>

          {loading && tickets.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
              <RefreshCw size={24} className="animate-spin text-indigo-400 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Loading tickets...</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
              <p className="text-sm text-slate-400">No tickets yet. Click "New Ticket" to create one.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left py-3 px-4 text-xs text-slate-400 font-medium">Ticket ID</th>
                      <th className="text-left py-3 px-4 text-xs text-slate-400 font-medium">Issue</th>
                      <th className="text-left py-3 px-4 text-xs text-slate-400 font-medium">Category</th>
                      <th className="text-left py-3 px-4 text-xs text-slate-400 font-medium">Priority</th>
                      <th className="text-left py-3 px-4 text-xs text-slate-400 font-medium">Status</th>
                      {isAdmin && <th className="text-left py-3 px-4 text-xs text-slate-400 font-medium">Assigned To</th>}
                      <th className="text-left py-3 px-4 text-xs text-slate-400 font-medium">Created</th>
                      <th className="text-left py-3 px-4 text-xs text-slate-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tickets.map((ticket: any, idx: number) => {
                      const priorityCfg = priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.Medium;
                      const statusCfg = statusConfig[ticket.status as keyof typeof statusConfig] || statusConfig.Open;
                      return (
                        <tr key={ticket.id || idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 text-xs font-mono text-slate-500">#{ticket.id?.toUpperCase().slice(0, 8) || 'N/A'}</td>
                          <td className="py-3 px-4">
                            <div className="text-xs font-medium text-slate-800 max-w-[200px] truncate">{ticket.title}</div>
                            {ticket.description && <div className="text-[10px] text-slate-400 mt-0.5">{ticket.description}</div>}
                          </td>
                          <td className="py-3 px-4"><span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{ticket.category}</span></td>
                          <td className="py-3 px-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${priorityCfg.color}`}>
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${priorityCfg.dot}`} />{ticket.priority}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {isAdmin ? (
                              <select
                                value={ticket.status}
                                onChange={e => handleStatusChange(ticket.id, e.target.value)}
                                className={`text-xs px-2 py-0.5 rounded-full border font-medium cursor-pointer focus:outline-none ${statusCfg.color}`}
                              >
                                <option value="Open"> Open</option>
                                <option value="In Progress"> In Progress</option>
                                <option value="Resolved"> Resolved</option>
                                <option value="Closed"> Closed</option>
                              </select>
                            ) : (
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusCfg.color}`}>
                                {ticket.status}
                              </span>
                            )}
                          </td>
                          {isAdmin && (
                            <td className="py-3 px-4">
                              <select
                                value={ticket.assigned_to || ''}
                                onChange={(e) => handleAssignTicket(ticket.id, e.target.value)}
                                className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[140px]"
                              >
                                <option value="">📋 Unassigned</option>
                                {users.map((user) => (
                                  <option key={user.id} value={user.id}>
                                    👤 {user.full_name || user.email}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                          <td className="py-3 px-4 text-xs text-slate-400">{new Date(ticket.created_at).toLocaleDateString()}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEditTicket(ticket)} className="p-1.5 hover:bg-indigo-50 rounded-lg" title="Edit"><Edit size={12} /></button>
                              <button onClick={() => setDeleteConfirm(ticket.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 size={12} /></button>
                            </div>
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
      )}

      {/* ===== AI CHAT ===== */}
      {activeTab === "chat" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden" style={{ height: "600px" }}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"><Bot size={16} className="text-white" /></div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Vigozen CRM AI Assistant</div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs text-emerald-600">Online · GPT-4 Powered</span>
                </div>
              </div>
              <button onClick={() => setChatMessages([{ id: 1, role: "ai", text: "Hello! I'm your Vigozen CRM AI Assistant. How can I help you today?", time: "Now" }])} className="ml-auto text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                <RefreshCw size={11} />Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "ai" && <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5"><Bot size={13} className="text-indigo-600" /></div>}
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-slate-100 text-slate-700 rounded-bl-sm"}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center"><Bot size={13} className="text-indigo-600" /></div>
                  <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="px-4 py-3 border-t border-slate-100">
              <div className="flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}  placeholder="Ask anything about Vigozen CRM..." className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50" />
                <button onClick={sendMessage} disabled={!chatInput.trim()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"><Send size={14} /></button>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h4 className="text-slate-800 mb-3 flex items-center gap-2"><Zap size={14} className="text-amber-500" />Quick Questions</h4>
              <div className="space-y-2">
                {["How does AI lead scoring work?", "How to connect Facebook Ads?", "How to generate reports?", "How to set up the sales pipeline?", "What integrations are supported?"].map(q => (
                  <button key={q} onClick={() => setChatInput(q)} className="w-full text-left text-xs text-slate-600 px-3 py-2.5 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-colors border border-slate-200 hover:border-indigo-200 flex items-center justify-between gap-2">
                    {q}<ArrowRight size={11} className="flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2"><Headphones size={16} className="text-indigo-600" /><span className="text-sm font-semibold text-indigo-800">Talk to a Human</span></div>
              <p className="text-xs text-indigo-600 mb-3">For complex issues, our support engineers are available.</p>
              <a 
  href="tel:+919529782361" 
  className="w-full py-2 text-xs bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-center block"
>
  Schedule a Call
</a>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">{/* Stars */}</div>
              <p className="text-xs text-slate-600 italic">"Vigozen CRM support team resolved my issue in under an hour. Excellent service!"</p>
              <p className="text-[10px] text-slate-400 mt-1">— Priya M., Sales Manager</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== DOCS & GUIDES ===== */}
      {activeTab === "docs" && (
        <div className="space-y-5">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder="Search documentation, guides, tutorials..." className="w-full pl-11 pr-4 py-3 text-sm border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white shadow-sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedGuides.map((guide, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-slate-200 hover:shadow-md transition-all p-4 cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{guide.icon}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    guide.type === "Video" ? "bg-red-50 text-red-600" : 
                    guide.type === "Tutorial" ? "bg-blue-50 text-blue-600" : 
                    "bg-emerald-50 text-emerald-600"
                  }`}>
                    {guide.type}
                  </span>
                </div>
                <h4 className="text-slate-800 text-sm mb-1 group-hover:text-indigo-600 transition-colors">{guide.title}</h4>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1"><Clock size={9} />{guide.read_time || "5 min"} read</span>
                  <button className="text-xs text-indigo-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">Read <ExternalLink size={10} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <a href="https://docs.vigozen.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-all group">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Book size={18} /></div>
              <div><div className="text-sm font-medium text-slate-800 group-hover:text-indigo-600">Full Documentation</div><div className="text-xs text-slate-400">Complete API & feature docs</div></div>
              <ExternalLink size={14} className="ml-auto text-slate-300 group-hover:text-indigo-400" />
            </a>
            <a href="https://api.vigozen.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-all group">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center"><Bot size={18} /></div>
              <div><div className="text-sm font-medium text-slate-800 group-hover:text-indigo-600">API Reference</div><div className="text-xs text-slate-400">REST API endpoints & examples</div></div>
              <ExternalLink size={14} className="ml-auto text-slate-300 group-hover:text-indigo-400" />
            </a>
            <a href="https://community.vigozen.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-all group">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Headphones size={18} /></div>
              <div><div className="text-sm font-medium text-slate-800 group-hover:text-indigo-600">Community Forum</div><div className="text-xs text-slate-400">Connect with other users</div></div>
              <ExternalLink size={14} className="ml-auto text-slate-300 group-hover:text-indigo-400" />
            </a>
          </div>
        </div>
      )}
      {/* ===== LEAD PAGES (ADMIN ONLY) ===== */}
   {/* ===== LEAD PAGES (ADMIN ONLY) ===== */}
{activeTab === "leadpages" && isAdmin && (
  <div className="space-y-5">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-slate-800 dark:text-white">Lead Capture Pages</h3>
        <p className="text-xs text-slate-400 mt-0.5">Create forms for Facebook Ads, Google Ads, Website, and more</p>
      </div>
      <button 
        onClick={() => setShowLeadPageModal(true)} 
        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 transition-colors"
      >
        <Plus size={14} /> Create Lead Page
      </button>
    </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200">
              <div className="text-xs text-slate-400">Total Lead Pages</div>
              <div className="text-2xl font-bold text-indigo-600">{leadPages.length}</div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200">
              <div className="text-xs text-slate-400">Total Leads</div>
              <div className="text-2xl font-bold text-purple-600">{leadPages.reduce((sum, p) => sum + (p.leads_count || 0), 0)}</div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200">
              <div className="text-xs text-slate-400">Conversion Rate</div>
              <div className="text-2xl font-bold text-amber-600">{leadPages.reduce((sum, p) => sum + (p.conversion_rate || 0), 0) / leadPages.length || 0}%</div>
            </div>
          </div>

          <div className="space-y-4">
            {leadPages.map((page: any) => (
              <div key={page.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-slate-800">{page.name}</h4>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${page.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{page.status}</span>
                    </div>
                   <div className="flex items-center gap-4 text-xs text-slate-400">
  <span>📊 {page.leads_count || 0} leads</span>
  <span>🎯 {page.conversion_rate || 0}% conversion</span>
</div>
                  </div>
                 <div className="flex gap-2">
  <button onClick={() => copyTextToClipboard(`<script src="https://leadops360.com/embed.js?page=${page.id}"></script>`)} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg"><Code size={16} /></button>
  <button onClick={() => openEditLeadPage(page)} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg"><Edit size={16} /></button>
  <button 
    onClick={async () => {
      if (confirm(`⚠️ Delete "${page.name}"? This cannot be undone.`)) {
        try {
          await deleteLeadPage(page.id);
          alert("✅ Page deleted successfully!");
          await fetchLeadPages();
        } catch (error: any) {
          alert("❌ Delete failed: " + error.message);
        }
      }
    }} 
    className="p-2 text-slate-400 hover:text-red-600 rounded-lg"
    title="Delete Page"
  >
    <Trash2 size={16} />
  </button>
</div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
  <button 
    onClick={() => handleViewSubmissions(page)}
    className="flex-1 text-xs py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
  >
    📋 View Submissions ({page.leads_count || 0})
  </button>
  <button 
    onClick={() => handleAnalytics(page)}
    className="flex-1 text-xs py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
  >
    📊 Analytics
  </button>
</div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center"><Webhook size={16} className="text-indigo-600" /></div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-indigo-800 mb-1">Incoming Lead Webhook</div>
                <div className="text-xs text-indigo-600 mb-3">Use this URL to send leads from ANY tool</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white border border-indigo-200 rounded-lg px-3 py-2 text-slate-600 font-mono break-all">
                    {`${window.location.origin}/api/webhooks/lead`}
                  </code>
                  <button onClick={() => copyTextToClipboard(`${window.location.origin}/api/webhooks/lead`)} className="px-3 py-2 text-xs bg-indigo-600 text-white rounded-lg">Copy</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

           {/* ===== ADS MANAGER (ADMIN ONLY) ===== */}
      {activeTab === "adsmanager" && isAdmin && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-slate-800 mb-4 flex items-center gap-2">
              <Target size={18} className="text-indigo-600" />
              Connected Ad Platforms
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {adsLoading ? (
                <div className="col-span-2 text-center py-8">Loading...</div>
              ) : (
                [
                  { platform: "facebook", name: "Facebook Ads", icon: Facebook },
                  { platform: "google", name: "Google Ads", icon: Globe },
                  { platform: "linkedin", name: "LinkedIn Ads", icon: Linkedin },
                  { platform: "instagram", name: "Instagram Ads", icon: Instagram }
                ].map(ad => {
                  const connection = adConnections.find(c => c.platform === ad.platform);
                  const Icon = ad.icon;
                  return (
                    <div key={ad.platform} className={`border rounded-xl p-4 ${connection?.connected ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${connection?.connected ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                            <Icon size={20} className={connection?.connected ? 'text-indigo-600' : 'text-slate-400'} />
                          </div>
                          <div>
                            <div className="font-medium text-slate-800">{ad.name}</div>
                          <div className="text-xs text-slate-400">
  {connection?.connected ? 
    `${(connection.leads_imported || 0).toLocaleString()} leads · ₹${(connection.cost_spent || 0).toLocaleString()}` : 
    "Not connected"
  }
</div>
                          </div>
                        </div>
                        {connection?.connected ? (
                          <button onClick={() => handleDisconnectAd(connection.id, ad.name)} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600">
                            Disconnect
                          </button>
                        ) : (
                          <button onClick={() => handleConnectAd(ad.platform, ad.name)} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white">
                            Connect
                          </button>
                        )}
                      </div>
                      {connection?.connected && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
                          <button onClick={() => syncAdLeads(connection.id)} className="flex-1 text-xs py-1.5 bg-indigo-600 text-white rounded-lg flex items-center justify-center gap-1">
                            <RefreshCw size={10} /> Sync Now
                          </button>
                          <button className="flex-1 text-xs py-1.5 border border-slate-200 rounded-lg">Analytics</button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
  <h3 className="text-slate-800 mb-4 flex items-center gap-2">
    <Settings size={18} className="text-indigo-600" />
    Auto-Import Settings
  </h3>
  <div className="space-y-4">
    {/* Auto-sync toggle */}
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium text-slate-800">Auto-sync leads from ads</div>
        <div className="text-xs text-slate-400">Automatically import leads every 15 minutes</div>
      </div>
      <button 
        onClick={() => setAutoSync(!autoSync)}
        className={`w-11 h-6 rounded-full flex items-center transition-all ${autoSync ? 'bg-indigo-600 justify-end' : 'bg-slate-200 justify-start'}`}
      >
        <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
      </button>
    </div>
    
    {/* Auto-create toggle */}
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium text-slate-800">Create leads automatically</div>
        <div className="text-xs text-slate-400">Auto-create lead records from ad submissions</div>
      </div>
      <button 
        onClick={() => setAutoCreate(!autoCreate)}
        className={`w-11 h-6 rounded-full flex items-center transition-all ${autoCreate ? 'bg-indigo-600 justify-end' : 'bg-slate-200 justify-start'}`}
      >
        <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
      </button>
    </div>
  </div>
  
  <button 
    onClick={() => {
      // Save settings to localStorage
      localStorage.setItem('auto_sync', String(autoSync));
      localStorage.setItem('auto_create', String(autoCreate));
      alert(`✅ Settings saved!\nAuto-sync: ${autoSync ? "ON" : "OFF"}\nAuto-create: ${autoCreate ? "ON" : "OFF"}`);
    }}
    className="mt-6 w-full py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
  >
    Save Settings
  </button>
</div>
        </div>
      )}

                    {/* ===== LEAD INTEGRATIONS (ADMIN ONLY) ===== */}
      {activeTab === "leadintegrations" && isAdmin && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-800">Connected Lead Sources</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => fetchLeadSources()} 
                  className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-indigo-50"
                >
                  <RefreshCw size={12} /> Refresh
                </button>
                <button 
                  onClick={() => setShowAddSourceModal(true)} 
                  className="text-xs bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1 px-3 py-1 rounded-lg transition-colors"
                >
                  <Plus size={12} /> Add Source
                </button>
              </div>
            </div>
            
            {sourcesLoading ? (
              <div className="text-center py-8">
                <RefreshCw size={24} className="animate-spin text-indigo-400 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Loading lead sources...</p>
              </div>
            ) : leadSources.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                <Plug size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">No lead sources connected yet</p>
                <button 
                  onClick={() => setShowAddSourceModal(true)} 
                  className="mt-2 text-xs text-indigo-600 hover:text-indigo-700"
                >
                  + Add Source
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {leadSources.map((source: any) => {
                  const Icon = source.type === 'facebook' ? Facebook : 
                               source.type === 'google' ? Globe : 
                               source.type === 'website' ? Layout : 
                               source.type === 'whatsapp' ? MessageCircle : Plug;
                  
                  return (
                    <div key={source.id} className="border rounded-xl p-4 hover:shadow-md transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                            <Icon size={20} className="text-indigo-600" />
                          </div>
                          <div>
                            <div className="font-medium text-slate-800">{source.name}</div>
                            <div className="text-xs text-slate-400">
                              {source.leads_count || 0} leads imported
                              {source.last_sync && (
                                <span className="ml-2 text-[10px] text-slate-300">
                                  · Synced {new Date(source.last_sync).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          source.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 
                          source.status === 'pending' ? 'bg-amber-100 text-amber-700' : 
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {source.status === 'connected' ? 'Connected' : 
                           source.status === 'pending' ? 'Pending' : 'Disconnected'}
                        </span>
                      </div>
                      {source.status === 'connected' && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
                          <button className="flex-1 text-xs py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">
                            Sync Now
                          </button>
                          <button className="flex-1 text-xs py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                            Configure
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
               {/* Add Lead Source Modal */}
      {showAddSourceModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddSourceModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-slate-800 text-lg font-semibold">Add Lead Source</h3>
              <p className="text-xs text-slate-400 mt-0.5">Connect a new lead source to your CRM</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Source Name *</label>
                <input 
                  type="text" 
                  value={newSourceForm.name} 
                  onChange={(e) => setNewSourceForm({ ...newSourceForm, name: e.target.value })} 
                  placeholder="e.g., Twitter Ads, LinkedIn, etc." 
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" 
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Source Type</label>
                <select 
                  value={newSourceForm.type} 
                  onChange={(e) => setNewSourceForm({ ...newSourceForm, type: e.target.value })} 
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                >
                  <option value="facebook">Facebook</option>
                  <option value="google">Google</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="instagram">Instagram</option>
                  <option value="website">Website</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  💡 After adding, you'll need to configure the API settings in the source settings page.
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button 
                onClick={() => { setShowAddSourceModal(false); setNewSourceForm({ name: "", type: "facebook", status: "pending", config: {} }); }} 
                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddLeadSource} 
                disabled={!newSourceForm.name} 
                className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
              >
                Add Source
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Page Modal */}
      {showLeadPageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLeadPageModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-slate-800 text-lg font-semibold">
                {editingLeadPage ? "Edit Lead Page" : "Create New Lead Page"}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Create a form to capture leads from any source</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Page Name *</label>
                <input 
                  type="text" 
                  value={leadPageForm.name} 
                  onChange={(e) => setLeadPageForm({ ...leadPageForm, name: e.target.value })} 
                  placeholder="e.g., Facebook Summer Campaign" 
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" 
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Page Slug</label>
                <input 
                  type="text" 
                  value={leadPageForm.slug} 
                  onChange={(e) => setLeadPageForm({ ...leadPageForm, slug: e.target.value })} 
                  placeholder="facebook-summer-campaign" 
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" 
                />
                <p className="text-[10px] text-slate-400 mt-1">leadops360.com/p/{leadPageForm.slug || 'page-name'}</p>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Description</label>
                <textarea 
                  value={leadPageForm.description} 
                  onChange={(e) => setLeadPageForm({ ...leadPageForm, description: e.target.value })} 
                  rows={2} 
                  placeholder="What is this lead page for?" 
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none" 
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Status</label>
                <select 
                  value={leadPageForm.status} 
                  onChange={(e) => setLeadPageForm({ ...leadPageForm, status: e.target.value as "active" | "draft" | "paused" })} 
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                >
                  <option value="active">Active - Accepting leads</option>
                  <option value="draft">Draft - Not live yet</option>
                  <option value="paused">Paused - Temporarily off</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Redirect URL (Optional)</label>
                <input 
                  type="url" 
                  value={leadPageForm.redirectUrl} 
                  onChange={(e) => setLeadPageForm({ ...leadPageForm, redirectUrl: e.target.value })} 
                  placeholder="https://yourwebsite.com/thank-you" 
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" 
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Webhook URL (Optional)</label>
                <input 
                  type="url" 
                  value={leadPageForm.webhookUrl} 
                  onChange={(e) => setLeadPageForm({ ...leadPageForm, webhookUrl: e.target.value })} 
                  placeholder="https://your-server.com/webhook" 
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" 
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => { 
                  setShowLeadPageModal(false); 
                  setEditingLeadPage(null); 
                  setLeadPageForm({ name: "", slug: "", description: "", status: "active", webhookUrl: "", redirectUrl: "" });
                }}
                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveLeadPage}
                disabled={!leadPageForm.name}
                className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {editingLeadPage ? "Update Page" : "Create Page"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>  
  );
}
