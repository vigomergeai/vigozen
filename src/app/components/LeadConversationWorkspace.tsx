import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Search,
  MessageCircle,
  Mail,
  Phone,
  Send,
  Paperclip,
  Smile,
  RefreshCw,
  CheckCheck,
  Check,
  Clock,
  User,
  Building,
  TrendingUp,
  Bot,
  Calendar,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  Copy,
  ExternalLink,
  Sparkles,
  Zap,
  MoreVertical,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Lead, LeadStatus } from "../data/mockData";
import { api } from "../lib/api";

export interface MessageItem {
  id: string;
  lead_id: string;
  sender_type: "customer" | "salesperson" | "system";
  sender_name?: string;
  sender_phone?: string;
  sender_email?: string;
  channel?: "whatsapp" | "email" | "sms";
  message: string;
  direction: "inbound" | "outbound";
  read_by_salesperson?: boolean;
  created_at: string;
}

interface LeadConversationWorkspaceProps {
  initialLead: Lead;
  allLeads: Lead[];
  onBack: () => void;
  onOpenFullDetails?: (lead: Lead) => void;
  statusConfig: Record<string, { color: string; dot: string; icon: React.ElementType }>;
}

const TEMPLATES = [
  {
    title: "Welcome Greeting",
    text: "Hi {{name}}! 👋 Thank you for connecting with us. I'm your dedicated advisor and would love to help answer any questions you have.",
  },
  {
    title: "Follow-up Meeting",
    text: "Hi {{name}}, just checking in regarding our conversation. Would you be free for a quick 10-minute call today or tomorrow?",
  },
  {
    title: "Site Visit Confirmation",
    text: "Hi {{name}}, confirming your site visit schedule. Our team is ready to show you the property. Let me know if you need location directions!",
  },
  {
    title: "Proposal Follow-up",
    text: "Hi {{name}}, following up on the proposal sent earlier. Have you had a chance to review the terms? Happy to walk you through any details.",
  },
];

export default function LeadConversationWorkspace({
  initialLead,
  allLeads,
  onBack,
  onOpenFullDetails,
  statusConfig,
}: LeadConversationWorkspaceProps) {
  const [selectedLeadId, setSelectedLeadId] = useState<string>(initialLead.id);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeChannel, setActiveChannel] = useState<"whatsapp" | "email" | "sms">("whatsapp");
  
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Find currently selected lead
  const currentLead = useMemo(() => {
    return allLeads.find((l) => l.id === selectedLeadId) || initialLead;
  }, [allLeads, selectedLeadId, initialLead]);

  // Filtered conversation list - all leads are displayed, filtered only by search query
  const filteredLeads = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allLeads;
    return allLeads.filter((l) => {
      return (
        l.name.toLowerCase().includes(q) ||
        (l.company && l.company.toLowerCase().includes(q)) ||
        (l.phone && l.phone.includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q))
      );
    });
  }, [allLeads, searchQuery]);

  // Fetch messages whenever selectedLeadId changes
  const fetchMessages = async (leadId: string) => {
    try {
      setLoadingMessages(true);
      const res = await api.messages.getLeadMessages(leadId);
      if (Array.isArray(res)) {
        setMessages(res);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.warn("Could not fetch messages for lead:", err);
      // Fallback: create mock greeting if no messages exist yet
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (selectedLeadId) {
      fetchMessages(selectedLeadId);
    }
  }, [selectedLeadId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingMessages]);

  // Handle sending a message
  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || messageInput).trim();
    if (!textToSend || !currentLead) return;

    // Check channel requirements
    if (activeChannel === "whatsapp" && !currentLead.phone) {
      toast.error("This lead does not have a phone number for WhatsApp.");
      return;
    }
    if (activeChannel === "email" && !currentLead.email) {
      toast.error("This lead does not have an email address.");
      return;
    }

    try {
      setSending(true);
      const res = await api.messages.sendMessage(currentLead.id, {
        message: textToSend,
        channel: activeChannel,
      });

      // Append locally
      const newMsg: MessageItem = {
        id: res?.data?.id || `msg_${Date.now()}`,
        lead_id: currentLead.id,
        sender_type: "salesperson",
        sender_name: "You",
        channel: activeChannel,
        message: textToSend,
        direction: "outbound",
        read_by_salesperson: true,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, newMsg]);
      setMessageInput("");
      setShowTemplates(false);
      toast.success(
        activeChannel === "whatsapp"
          ? "WhatsApp message dispatched!"
          : "Message sent successfully!"
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  // Insert template text
  const applyTemplate = (templateText: string) => {
    const personalized = templateText
      .replace(/{{name}}/gi, currentLead.name.split(" ")[0] || "there")
      .replace(/{{company}}/gi, currentLead.company || "our team");
    setMessageInput(personalized);
    setShowTemplates(false);
  };

  // Copy text to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  // Helper for status config
  const leadStatusConfig = statusConfig[currentLead.status] || {
    color: "bg-slate-50 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
    icon: User,
  };

  const StatusIcon = leadStatusConfig.icon;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] min-h-[680px] bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Top Navigation & Workspace Header */}
      <div className="h-14 px-4 lg:px-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 border border-slate-200 rounded-xl transition-all"
            title="Return to Leads Table"
          >
            <ArrowLeft size={14} />
            <span>Back to Leads</span>
          </button>
          <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <MessageCircle size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                Communication Workspace
              </h2>
              <p className="text-[11px] text-slate-500">
                Active conversation with{" "}
                <span className="font-semibold text-slate-700">
                  {currentLead.name}
                </span>{" "}
                ({filteredLeads.length} leads in roster)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchMessages(currentLead.id)}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-all border border-slate-200"
            title="Refresh messages"
          >
            <RefreshCw size={14} className={loadingMessages ? "animate-spin" : ""} />
          </button>

          {onOpenFullDetails && (
            <button
              onClick={() => onOpenFullDetails(currentLead)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-indigo-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 transition-all"
            >
              <ExternalLink size={12} />
              <span className="hidden sm:inline">View Full Drawer</span>
            </button>
          )}
        </div>
      </div>

      {/* 3-Panel Main Workspace Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── PANEL 1: CONVERSATION LIST (LEFT - ~23%) ── */}
        <div className="w-[280px] xl:w-[290px] bg-white border-r border-slate-200 flex flex-col shrink-0">
          {/* Search Bar */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all text-slate-800"
              />
            </div>
          </div>

          {/* Conversations Scrollable List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredLeads.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                No conversations found matching filters.
              </div>
            ) : (
              filteredLeads.map((lead) => {
                const isSelected = lead.id === selectedLeadId;
                const statusConf = statusConfig[lead.status] || {
                  color: "bg-slate-50 text-slate-600 border-slate-200",
                  dot: "bg-slate-400",
                };

                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`py-3 px-3.5 cursor-pointer transition-all flex items-start gap-3 relative border-l-2 ${
                      isSelected
                        ? "bg-indigo-50/80 border-l-indigo-600 shadow-2xs"
                        : "border-l-transparent hover:bg-slate-50/90"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-2xs">
                        {lead.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${statusConf.dot}`}
                      />
                    </div>

                    {/* Meta info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <h4
                          className={`text-xs truncate ${
                            isSelected ? "text-indigo-950 font-bold" : "text-slate-800 font-semibold"
                          }`}
                        >
                          {lead.name}
                        </h4>
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          {lead.createdAt ? lead.createdAt.slice(5) : "Today"}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500 truncate mb-1">
                        {lead.company || lead.email || "Individual Client"}
                      </p>

                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-[9.5px] px-2 py-0.5 rounded-full font-medium border truncate max-w-[130px] ${statusConf.color}`}
                        >
                          {lead.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── PANEL 2: MAIN CHAT AREA (CENTER - ~52%) ── */}
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden min-w-0">
          {/* Chat Header */}
          <div className="h-16 px-5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-2xs">
                {currentLead.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                {/* Line 1: Lead Name and Status Pill */}
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {currentLead.name}
                  </h3>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${leadStatusConfig.color}`}
                  >
                    {currentLead.status}
                  </span>
                </div>
                {/* Line 2: Phone and Email Secondary Line */}
                <div className="flex items-center gap-3 text-[11px] text-slate-500 truncate mt-0.5">
                  {currentLead.phone && (
                    <span className="flex items-center gap-1 font-medium">
                      <Phone size={11} className="text-slate-400 shrink-0" />
                      {currentLead.phone}
                    </span>
                  )}
                  {currentLead.email && (
                    <span className="flex items-center gap-1 font-medium hidden md:flex">
                      <Mail size={11} className="text-slate-400 shrink-0" />
                      {currentLead.email}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Compact Channel Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveChannel("whatsapp")}
                className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  activeChannel === "whatsapp"
                    ? "bg-emerald-500 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Send via WhatsApp"
              >
                <MessageCircle size={12} />
                <span>WhatsApp</span>
              </button>
              <button
                onClick={() => setActiveChannel("email")}
                className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  activeChannel === "email"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Send via Email"
              >
                <Mail size={12} />
                <span>Email</span>
              </button>
            </div>
          </div>

          {/* Messages Thread */}
          <div className="flex-1 p-4 lg:p-6 overflow-y-auto space-y-4">
            {loadingMessages ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs">
                <RefreshCw size={20} className="animate-spin text-indigo-500 mb-2" />
                <span>Loading messages...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto px-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2.5 border border-indigo-100 shadow-2xs">
                  <MessageCircle size={22} />
                </div>
                <h4 className="text-sm font-bold text-slate-800 mb-0.5">
                  Start the conversation
                </h4>
                <p className="text-xs text-slate-500 mb-3.5 leading-relaxed">
                  Choose a quick template below or write a custom message.
                </p>

                {/* Compact Template Suggestions Directly Below */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {TEMPLATES.slice(0, 3).map((t) => (
                    <button
                      key={t.title}
                      onClick={() => applyTemplate(t.text)}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 rounded-xl text-xs font-semibold text-slate-700 transition-all shadow-2xs hover:bg-indigo-50/40"
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isOutbound = msg.direction === "outbound";
                const channel = msg.channel || "whatsapp";

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl p-3.5 shadow-xs relative ${
                        isOutbound
                          ? "bg-indigo-600 text-white rounded-br-xs"
                          : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
                      }`}
                    >
                      {/* Sender / Channel Header */}
                      <div className="flex items-center gap-1.5 mb-1 text-[10.5px]">
                        <span
                          className={`font-semibold ${
                            isOutbound ? "text-indigo-200" : "text-slate-500"
                          }`}
                        >
                          {msg.sender_name || (isOutbound ? "You" : currentLead.name)}
                        </span>
                        <span
                          className={`flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9.5px] uppercase font-bold tracking-wider ${
                            isOutbound
                              ? "bg-indigo-700/60 text-indigo-100"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {channel === "whatsapp" ? (
                            <>
                              <MessageCircle size={9} /> WA
                            </>
                          ) : (
                            <>
                              <Mail size={9} /> Email
                            </>
                          )}
                        </span>
                      </div>

                      {/* Message Content */}
                      <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                        {msg.message}
                      </p>

                      {/* Timestamp & Delivery Check */}
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                          isOutbound ? "text-indigo-200" : "text-slate-400"
                        }`}
                      >
                        <span>
                          {msg.created_at
                            ? new Date(msg.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Just now"}
                        </span>
                        {isOutbound && <CheckCheck size={12} className="text-indigo-200" />}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Template Picker Menu */}
          {showTemplates && (
            <div className="mx-4 mb-2 p-3 bg-white border border-slate-200 rounded-2xl shadow-lg animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-indigo-600" />
                  Quick Response Templates
                </span>
                <button
                  onClick={() => setShowTemplates(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.title}
                    onClick={() => applyTemplate(tmpl.text)}
                    className="p-2.5 text-left border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/50 rounded-xl transition-all"
                  >
                    <p className="text-xs font-semibold text-slate-800 mb-0.5">
                      {tmpl.title}
                    </p>
                    <p className="text-[11px] text-slate-500 line-clamp-2">
                      {tmpl.text.replace(/{{name}}/gi, currentLead.name)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Message Composer */}
          <div className="p-3 bg-white border-t border-slate-200 shrink-0">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[11px] text-slate-400">
                Shift + Enter for new line
              </span>

              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline"
              >
                <Sparkles size={12} />
                <span>Templates</span>
              </button>
            </div>

            <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all focus-within:bg-white">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors shrink-0 mb-0.5"
                title="Attach file"
              >
                <Paperclip size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={() => toast.info("Attachment uploaded for message.")}
              />

              <button
                type="button"
                onClick={() => setMessageInput((prev) => prev + " 👋")}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors shrink-0 mb-0.5"
                title="Add emoji"
              >
                <Smile size={16} />
              </button>

              <textarea
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={1}
                placeholder={
                  activeChannel === "whatsapp"
                    ? `Message ${currentLead.name} on WhatsApp...`
                    : `Email ${currentLead.name}...`
                }
                className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none resize-none px-2 py-1 max-h-32 min-h-[32px]"
              />

              <button
                onClick={() => handleSendMessage()}
                disabled={!messageInput.trim() || sending}
                className={`p-2 rounded-xl text-white font-semibold transition-all shadow-xs flex items-center justify-center shrink-0 mb-0.5 ${
                  !messageInput.trim() || sending
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : activeChannel === "whatsapp"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
                title="Send message"
              >
                {sending ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── PANEL 3: COMPACT LEAD DETAILS (RIGHT - ~25%) ── */}
        <div className="w-[290px] xl:w-[310px] bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-y-auto">
          {/* Lead Summary Header */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-2xs shrink-0">
                {currentLead.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {currentLead.name}
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {currentLead.company || "Individual Client"}
                </p>
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${leadStatusConfig.color}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${leadStatusConfig.dot}`} />
                    {currentLead.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Button - Call */}
            {currentLead.phone && (
              <div className="mt-3">
                <a
                  href={`tel:${currentLead.phone}`}
                  className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-2xs"
                  title="Call Lead"
                >
                  <Phone size={13} className="text-indigo-600" />
                  <span>Call {currentLead.name.split(" ")[0]}</span>
                </a>
              </div>
            )}
          </div>

          {/* AI Score Card */}
          <div className="p-4 border-b border-slate-100">
            <div className="bg-indigo-50/50 border border-indigo-100/80 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Bot size={13} className="text-indigo-600" />
                  AI Lead Score
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    (currentLead.aiScore || 50) >= 80
                      ? "bg-emerald-100 text-emerald-800"
                      : (currentLead.aiScore || 50) >= 60
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-200/80 text-slate-700"
                  }`}
                >
                  {(currentLead.aiScore || 50) >= 80
                    ? "Hot Lead"
                    : (currentLead.aiScore || 50) >= 60
                    ? "Warm Lead"
                    : "Cold Lead"}
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-2xl font-black text-indigo-900">
                  {currentLead.aiScore || 50}
                </span>
                <span className="text-xs text-indigo-400 font-medium">/ 100</span>
              </div>

              <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (currentLead.aiScore || 50) >= 80
                      ? "bg-emerald-500"
                      : (currentLead.aiScore || 50) >= 60
                      ? "bg-amber-500"
                      : "bg-indigo-400"
                  }`}
                  style={{ width: `${currentLead.aiScore || 50}%` }}
                />
              </div>
            </div>
          </div>

          {/* Contact Details (Clean Flat Rows) */}
          <div className="p-4 border-b border-slate-100 space-y-2">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Contact Information
            </h4>

            {currentLead.phone ? (
              <div className="flex items-center justify-between py-1 text-xs group">
                <span className="text-slate-400 font-medium">Phone</span>
                <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <span>{currentLead.phone}</span>
                  <button
                    onClick={() => copyToClipboard(currentLead.phone, "Phone")}
                    className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                    title="Copy Phone"
                  >
                    <Copy size={11} />
                  </button>
                </div>
              </div>
            ) : null}

            {currentLead.email ? (
              <div className="flex items-center justify-between py-1 text-xs group">
                <span className="text-slate-400 font-medium">Email</span>
                <div className="flex items-center gap-1.5 font-semibold text-slate-700 truncate max-w-[170px]">
                  <span className="truncate">{currentLead.email}</span>
                  <button
                    onClick={() => copyToClipboard(currentLead.email, "Email")}
                    className="p-1 text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                    title="Copy Email"
                  >
                    <Copy size={11} />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Lead Parameters (Flat Key-Value Rows) */}
          <div className="p-4 border-b border-slate-100 space-y-2">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Lead Parameters
            </h4>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-0.5">
                <span className="text-slate-400 font-medium">Est. Value</span>
                <span className="font-bold text-slate-800">
                  ₹{((currentLead.value || 0) / 1000).toLocaleString()}K
                </span>
              </div>

              <div className="flex items-center justify-between py-0.5">
                <span className="text-slate-400 font-medium">Source</span>
                <span className="font-semibold text-slate-700">
                  {currentLead.source || "Direct"}
                </span>
              </div>

              <div className="flex items-center justify-between py-0.5">
                <span className="text-slate-400 font-medium">Lead Owner</span>
                <span className="font-semibold text-slate-700 truncate max-w-[150px]">
                  {currentLead.owner || "Unassigned"}
                </span>
              </div>

              <div className="flex items-center justify-between py-0.5">
                <span className="text-slate-400 font-medium">Industry</span>
                <span className="font-semibold text-slate-700">
                  {currentLead.industry || "General"}
                </span>
              </div>
            </div>
          </div>

          {/* Follow-up Section */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Next Follow-up
              </h4>
              <Calendar size={13} className="text-slate-400" />
            </div>

            <div className="text-xs font-semibold text-slate-800">
              {currentLead.next_followup
                ? new Date(currentLead.next_followup).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "No follow-up set"}
            </div>
          </div>

          {/* Notes Collapsible Section */}
          <div className="p-4">
            <button
              onClick={() => setNotesExpanded(!notesExpanded)}
              className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-slate-900 mb-2"
            >
              <span className="flex items-center gap-1.5">
                <FileText size={13} className="text-slate-400" />
                Lead Notes
              </span>
              {notesExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {notesExpanded && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed break-words">
                {currentLead.notes || "No notes recorded for this lead yet."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
