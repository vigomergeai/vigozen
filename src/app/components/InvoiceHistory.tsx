import React, { useState } from "react";
import {
    FileText,
    Download,
    Search,
    RefreshCw,
    Filter,
    ChevronDown,
    ChevronUp,
    Eye,
    Calendar,
    DollarSign,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    CheckCircle,
    XCircle,
    Clock,
    Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──
export interface Invoice {
    id: string;
    invoice_number: string;
    amount: number;
    gst_amount: number;
    total_amount: number;
    status: "paid" | "pending" | "failed";
    due_date: string;
    created_at: string;
    invoice_url?: string;
    currency?: string;
    billing_period_start?: string;
    billing_period_end?: string;
}

interface InvoiceHistoryProps {
    invoices: Invoice[];
    loading?: boolean;
    onRefresh?: () => Promise<void>;
    onDownload?: (invoice: Invoice) => Promise<void>;
    currency?: string;
}

const STATUS_COLORS = {
    paid: {
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-emerald-200",
        icon: CheckCircle,
        label: "Paid",
    },
    pending: {
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        icon: Clock,
        label: "Pending",
    },
    failed: {
        bg: "bg-red-50",
        text: "text-red-700",
        border: "border-red-200",
        icon: XCircle,
        label: "Failed",
    },
};

export default function InvoiceHistory({
    invoices,
    loading = false,
    onRefresh,
    onDownload,
    currency = "₹",
}: InvoiceHistoryProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending" | "failed">("all");
    const [sortField, setSortField] = useState<"date" | "amount" | "status">("date");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // ── Format currency ──
    const formatCurrency = (amount: number) => {
        return `${currency}${amount.toLocaleString("en-IN")}`;
    };

    // ── Format date ──
    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    const formatDateFull = (date: string) => {
        return new Date(date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // ── Filter and sort invoices ──
    const filteredAndSorted = React.useMemo(() => {
        let filtered = [...invoices];

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(
                (inv) =>
                    inv.invoice_number.toLowerCase().includes(term) ||
                    inv.id.toLowerCase().includes(term)
            );
        }

        // Status filter
        if (statusFilter !== "all") {
            filtered = filtered.filter((inv) => inv.status === statusFilter);
        }

        // Sort
        filtered.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case "date":
                    comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                    break;
                case "amount":
                    comparison = a.total_amount - b.total_amount;
                    break;
                case "status":
                    comparison = a.status.localeCompare(b.status);
                    break;
                default:
                    comparison = 0;
            }
            return sortDirection === "asc" ? comparison : -comparison;
        });

        return filtered;
    }, [invoices, searchTerm, statusFilter, sortField, sortDirection]);

    // ── Toggle sort ──
    const handleSort = (field: "date" | "amount" | "status") => {
        if (sortField === field) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("desc");
        }
    };

    // ── Handle refresh ──
    const handleRefresh = async () => {
        if (!onRefresh) return;
        setRefreshing(true);
        try {
            await onRefresh();
            toast.success("Invoices refreshed");
        } catch (error) {
            toast.error("Failed to refresh invoices");
        } finally {
            setRefreshing(false);
        }
    };

    // ── Handle download ──
    const handleDownload = async (invoice: Invoice) => {
        if (onDownload) {
            await onDownload(invoice);
        } else if (invoice.invoice_url) {
            window.open(invoice.invoice_url, "_blank");
        } else {
            toast.info("Invoice download not available");
        }
    };

    // ── Toggle expand ──
    const toggleExpand = (id: string) => {
        setExpandedInvoice(expandedInvoice === id ? null : id);
    };

    // ── Stats ──
    const stats = React.useMemo(() => {
        const total = invoices.length;
        const paid = invoices.filter((i) => i.status === "paid").length;
        const pending = invoices.filter((i) => i.status === "pending").length;
        const failed = invoices.filter((i) => i.status === "failed").length;
        const totalRevenue = invoices
            .filter((i) => i.status === "paid")
            .reduce((sum, i) => sum + i.total_amount, 0);

        return { total, paid, pending, failed, totalRevenue };
    }, [invoices]);

    // ── Status Badge Component ──
    const StatusBadge = ({ status }: { status: keyof typeof STATUS_COLORS }) => {
        const config = STATUS_COLORS[status];
        const Icon = config.icon;
        return (
            <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}
            >
                <Icon size={12} />
                {config.label}
            </span>
        );
    };

    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {/* ── Header ── */}
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                        <FileText size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800">Invoice History</h3>
                        <p className="text-xs text-slate-400">
                            {invoices.length} invoices · {stats.paid} paid · {stats.pending} pending
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {onRefresh && (
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="p-2 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
                            title="Refresh"
                        >
                            <RefreshCw
                                size={14}
                                className={`text-slate-500 ${refreshing || loading ? "animate-spin" : ""}`}
                            />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Stats Bar ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-slate-100">
                {[
                    { label: "Total", value: stats.total, color: "text-slate-700" },
                    { label: "Paid", value: stats.paid, color: "text-emerald-600" },
                    { label: "Pending", value: stats.pending, color: "text-amber-600" },
                    { label: "Revenue", value: formatCurrency(stats.totalRevenue), color: "text-indigo-600" },
                ].map((stat, index) => (
                    <div
                        key={stat.label}
                        className={`px-4 py-3 text-center ${index < 3 ? "border-r border-slate-100" : ""}`}
                    >
                        <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* ── Filters ── */}
            <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50/50">
                <div className="relative flex-1 min-w-[180px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search invoices..."
                        className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                    />
                </div>

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                    <option value="all">All Status</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                </select>

                <div className="flex items-center gap-1 text-xs text-slate-400 ml-auto">
                    <span>{filteredAndSorted.length} invoices</span>
                </div>
            </div>

            {/* ── Table ── */}
            {loading ? (
                <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                    <Loader2 size={24} className="animate-spin text-indigo-400" />
                    <span className="text-sm">Loading invoices...</span>
                </div>
            ) : filteredAndSorted.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                    <FileText size={32} className="opacity-30" />
                    <p className="text-sm">No invoices found</p>
                    {invoices.length === 0 && (
                        <p className="text-xs text-slate-300">Your invoice history will appear here</p>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                                <th
                                    className="text-left py-3 px-4 text-xs text-slate-500 font-medium cursor-pointer hover:text-slate-700 transition-colors"
                                    onClick={() => handleSort("date")}
                                >
                                    <div className="flex items-center gap-1">
                                        Invoice
                                        {sortField === "date" && (
                                            sortDirection === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Date</th>
                                <th
                                    className="text-left py-3 px-3 text-xs text-slate-500 font-medium cursor-pointer hover:text-slate-700 transition-colors"
                                    onClick={() => handleSort("amount")}
                                >
                                    <div className="flex items-center gap-1">
                                        Amount
                                        {sortField === "amount" && (
                                            sortDirection === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">GST</th>
                                <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Total</th>
                                <th
                                    className="text-left py-3 px-3 text-xs text-slate-500 font-medium cursor-pointer hover:text-slate-700 transition-colors"
                                    onClick={() => handleSort("status")}
                                >
                                    <div className="flex items-center gap-1">
                                        Status
                                        {sortField === "status" && (
                                            sortDirection === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-4 text-xs text-slate-500 font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredAndSorted.map((invoice) => (
                                <React.Fragment key={invoice.id}>
                                    <tr
                                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${expandedInvoice === invoice.id ? "bg-indigo-50/30" : ""
                                            }`}
                                        onClick={() => toggleExpand(invoice.id)}
                                    >
                                        <td className="py-3 px-4">
                                            <div className="text-xs font-medium text-slate-800">
                                                {invoice.invoice_number}
                                            </div>
                                            <div className="text-[10px] text-slate-400">
                                                {invoice.id.slice(0, 8)}...
                                            </div>
                                        </td>
                                        <td className="py-3 px-3 text-xs text-slate-500">
                                            {formatDate(invoice.created_at)}
                                        </td>
                                        <td className="py-3 px-3 text-xs text-slate-600">
                                            {formatCurrency(invoice.amount)}
                                        </td>
                                        <td className="py-3 px-3 text-xs text-slate-600">
                                            {formatCurrency(invoice.gst_amount)}
                                        </td>
                                        <td className="py-3 px-3 text-xs font-semibold text-slate-800">
                                            {formatCurrency(invoice.total_amount)}
                                        </td>
                                        <td className="py-3 px-3">
                                            <StatusBadge status={invoice.status} />
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDownload(invoice);
                                                    }}
                                                    className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                                                    title="Download"
                                                >
                                                    <Download size={14} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleExpand(invoice.id);
                                                    }}
                                                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                                                    title="Details"
                                                >
                                                    {expandedInvoice === invoice.id ? (
                                                        <ChevronUp size={14} />
                                                    ) : (
                                                        <ChevronDown size={14} />
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>

                                    {/* ── Expanded Row ── */}
                                    {expandedInvoice === invoice.id && (
                                        <tr>
                                            <td colSpan={7} className="py-4 px-6 bg-indigo-50/30 border-t border-indigo-100">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                                    <div>
                                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Invoice Number</div>
                                                        <div className="text-sm font-medium text-slate-800">{invoice.invoice_number}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Created</div>
                                                        <div className="text-sm text-slate-700">{formatDateFull(invoice.created_at)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Due Date</div>
                                                        <div className="text-sm text-slate-700">
                                                            {invoice.due_date ? formatDate(invoice.due_date) : "—"}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Status</div>
                                                        <StatusBadge status={invoice.status} />
                                                    </div>
                                                    {invoice.billing_period_start && invoice.billing_period_end && (
                                                        <>
                                                            <div>
                                                                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Period Start</div>
                                                                <div className="text-sm text-slate-700">{formatDate(invoice.billing_period_start)}</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Period End</div>
                                                                <div className="text-sm text-slate-700">{formatDate(invoice.billing_period_end)}</div>
                                                            </div>
                                                        </>
                                                    )}
                                                    <div>
                                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Amount</div>
                                                        <div className="text-sm font-semibold text-slate-800">{formatCurrency(invoice.amount)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">GST (18%)</div>
                                                        <div className="text-sm text-slate-700">{formatCurrency(invoice.gst_amount)}</div>
                                                    </div>
                                                </div>
                                                {invoice.invoice_url && (
                                                    <div className="mt-4 pt-3 border-t border-indigo-100">
                                                        <button
                                                            onClick={() => handleDownload(invoice)}
                                                            className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                                                        >
                                                            <Download size={14} />
                                                            Download Invoice PDF
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Footer ── */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <AlertCircle size={12} />
                    <span>Showing {filteredAndSorted.length} of {invoices.length} invoices</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px]">
                        {invoices.length > 0 && `Last invoice: ${formatDate(invoices[0]?.created_at)}`}
                    </span>
                </div>
            </div>
        </div>
    );
}