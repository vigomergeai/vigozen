import React, { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import {
  Users, Shield, Plus, Edit, Trash2, Key, Search, RefreshCw,
  CheckCircle, XCircle, Crown, User, Mail, Building, ChevronDown,
  AlertTriangle, Eye, EyeOff, X, Loader2, Activity, TrendingUp,
  UserCheck, UserX, Lock,
  AlertCircle, FileText, CreditCard
} from "lucide-react";
import { z } from 'zod'
import { useApp } from "../context/AppContext";
import type { UserProfile } from "../context/AppContext";
import { useNavigate } from "react-router";

const ROLE_OPTIONS = ["admin", "user"] as const;
const DEPT_OPTIONS = [
  {
    value: "sales",
    label: "Sales",
  },
  {
    value: "inside_sales",
    label: "Inside Sales",
  },
  {
    value: "bd",
    label: "BD",
  },
  {
    value: "administration",
    label: "Administration",
  },
  {
    value: "marketing",
    label: "Marketing",
  },
  {
    value: "support",
    label: "Support",
  },
];

const newPasswordSchema = z.object({
  password: z
    .string()
    .min(6, "Password must be atleast 6 characters")
    .max(12, "Password must be at most 12 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/\d/, "Password must contain at least one number")
    .regex(
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
      "Password must contain at least one special character",
    ),
});


const editUserSchema = z.object({
  name: z
    .string()
    .min(1, "Full Name is Required")
    .min(3, "Full Name must have atleast 3 characters")
    .max(30, "Full Name must be at most 50 characters")
    .regex(
      /^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/,
      "Special characters or numbers are not allowed",
    ),
});

const EMPLOYEE_OPTIONS = [
  { id: "", label: "— No assignment —" },
  { id: "e1", label: "Arjun Sharma (e1)" },
  { id: "e2", label: "Priya Patel (e2)" },
  { id: "e3", label: "Rahul Verma (e3)" },
  { id: "e4", label: "Sneha Gupta (e4)" },
  { id: "e5", label: "Karan Mehta (e5)" },
  { id: "e6", label: "Divya Singh (e6)" },
];

interface UserForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: "admin" | "user";
  employeeId: string;
  department: string;
}

const emptyForm: UserForm = {
  name: "", email: "", password: "", confirmPassword: "",
  role: "user", employeeId: "", department: "sales",
};

export default function AdminPage() {
  const { role, users, usersLoading, loadUsers, createUser, updateUser, deleteUser, toggleUserAccess, resetUserPassword } = useApp();
  const navigate = useNavigate();

  const employeeOptions = [
    { id: "", label: "— No assignment —" },
    ...users.map((u) => ({
      id: u.id,
      label: `${u.name || u.email} (${u.id ? u.id.slice(0, 8) : ""})`
    }))
  ];

  const [activeTab, setActiveTab] = useState<"users" | "audit" | "subscriptions">("users");
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  const fetchSubscriptions = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setSubLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSubscriptions(data || []);
    } catch {} finally { setSubLoading(false); }
  };
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState({ action: "", entity_type: "", user_id: "" });

  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "user">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState<UserProfile | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UserProfile | null>(null);

  const [form, setForm] = useState<UserForm>(emptyForm);
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [error, setError] = useState('');

  useEffect(() => {
    if (role !== "admin") { navigate("/"); return; }
    loadUsers();
  }, [role]);

  const filtered = useMemo(() => {
    let data = [...users];
    if (search) data = data.filter(u =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    );
    if (filterRole !== "all") data = data.filter(u => u.role === filterRole);
    if (filterStatus === "active") data = data.filter(u => u.isActive);
    if (filterStatus === "inactive") data = data.filter(u => !u.isActive);
    return data;
  }, [users, search, filterRole, filterStatus]);

  const fetchAuditLogs = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setAuditLogsLoading(true);
    try {
      const data = await api.auditLogs.list(auditFilters, token);
      setAuditLogs(data || []);
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setAuditLogsLoading(false);
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedUsers.length === 0) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    setBulkActionLoading(true);
    try {
      const value = bulkAction === 'assign_department' ? 'sales' :
        bulkAction === 'assign_role' ? 'user' : undefined;
      await api.users.bulkAction({
        userIds: selectedUsers,
        action: bulkAction,
        value
      }, token);
      await loadUsers();
      setSelectedUsers([]);
      setBulkAction("");
    } catch (error) {
      console.error("Bulk action failed:", error);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.isActive).length,
    admins: users.filter(u => u.role === "admin").length,
    users: users.filter(u => u.role === "user").length,
  }), [users]);

  const openCreate = () => {
    setForm(emptyForm);
    setFormError("");
    setShowCreateModal(true);
  };

  const openEdit = (user: UserProfile) => {
    // console.log(user);
    setForm({
      name: user.name, email: user.email, password: "", confirmPassword: "",
      role: user.role, employeeId: user.employeeId || "", department: user.department,
    });
    setFormError("");
    setEditUser(user);
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setFormError("Name, email, and password are required");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }
    if (form.password.length < 6) {
      setFormError("Password must be at least 6 characters");
      return;
    }
    setSaving(true);
    setFormError("");
    const result = await createUser({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      employeeId: form.employeeId || undefined,
      department: form.department,
    });
    setSaving(false);
    if (result) {
      setShowCreateModal(false);
      setForm(emptyForm);
    } else {
      setFormError("Failed to create user. Email may already be registered.");
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;

    const validation = editUserSchema.safeParse({ name: form.name.trim() });

    if (!validation.success) {
      setFormError(validation.error.issues[0].message);
      return;
    }

    setSaving(true);
    setFormError("");

    await updateUser(editUser.id, {
      name: form.name.trim(),
      role: form.role,
      employeeId: form.employeeId || null,
      department: form.department,
    });
    setSaving(false);
    setEditUser(null);
  };

  const handleResetPassword = async () => {
    if (!showPasswordModal || !newPassword) return;
    // console.log(newPassword);
    const result = newPasswordSchema.safeParse({ password: newPassword });
    if (!result.success) {
      // console.log(result);
      setError(result.error.issues[0].message);
      return;
    }

    setSaving(true);
    await resetUserPassword(showPasswordModal.id, newPassword);
    setSaving(false);
    setShowPasswordModal(null);
    setNewPassword("");
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    await deleteUser(deleteConfirm.id);
    setSaving(false);
    setDeleteConfirm(null);
  };

  const getRoleBadge = (r: string) => {
    if (r === "admin") return "bg-purple-50 text-purple-700 border-purple-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-slate-900 dark:text-white flex items-center gap-2">
            <Shield size={22} className="text-indigo-600" /> Admin Panel
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage user accounts, roles, and access permissions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadUsers}
            disabled={usersLoading}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw
              size={14}
              className={`text-slate-500 ${usersLoading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 transition-colors shadow-sm shadow-indigo-200"
          >
            <Plus size={15} /> Add User
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Users",
            value: stats.total,
            icon: Users,
            color: "from-blue-500 to-indigo-500",
          },
          {
            label: "Active",
            value: stats.active,
            icon: UserCheck,
            color: "from-emerald-500 to-teal-500",
          },
          {
            label: "Admins",
            value: stats.admins,
            icon: Crown,
            color: "from-purple-500 to-violet-500",
          },
          {
            label: "Regular Users",
            value: stats.users,
            icon: User,
            color: "from-amber-500 to-orange-500",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className={`w-9 h-9 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-sm`}
                >
                  <Icon size={16} className="text-white" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {stat.value}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{stat.label}</div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "users"
            ? "border-indigo-600 text-indigo-600"
            : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
        >
          <Users size={14} className="inline mr-2" />
          User Management
        </button>
        <button
          onClick={() => { setActiveTab("audit"); fetchAuditLogs(); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "audit"
            ? "border-indigo-600 text-indigo-600"
            : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
        >
          <FileText size={14} className="inline mr-2" />
          Audit Logs
        </button>
        <button
          onClick={() => { setActiveTab("subscriptions" as any); fetchSubscriptions(); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "subscriptions" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500"
          }`}
        >
          <CreditCard size={14} className="inline mr-2" />
          Subscriptions
        </button>
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as any)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none text-slate-600"
        >
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none text-slate-600"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span className="text-xs text-slate-400 ml-auto">
          {filtered.length} users
        </span>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedUsers.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-200 w-full">
          <span className="text-sm font-medium text-indigo-700">{selectedUsers.length} users selected</span>
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">Select Action</option>
            <option value="activate">Activate</option>
            <option value="deactivate">Deactivate</option>
            <option value="delete">Delete</option>
            <option value="assign_department">Assign Department</option>
            <option value="assign_role">Assign Role</option>
          </select>
          <button
            onClick={handleBulkAction}
            disabled={!bulkAction || bulkActionLoading}
            className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {bulkActionLoading ? <RefreshCw size={14} className="animate-spin" /> : "Apply"}
          </button>
          <button onClick={() => setSelectedUsers([])} className="text-sm text-slate-400 hover:text-slate-600">Clear</button>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {usersLoading ? (
          <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 size={28} className="animate-spin text-indigo-400" />
            <span className="text-sm">Loading users...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
            <Users size={32} className="opacity-30" />
            <p className="text-sm">No users found</p>
            <button
              onClick={openCreate}
              className="text-xs text-indigo-600 hover:text-indigo-700"
            >
              Create the first user
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">
                    <input
                      type="checkbox"
                      className="rounded"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUsers(filtered.map(u => u.id));
                        } else {
                          setSelectedUsers([]);
                        }
                      }}
                      checked={selectedUsers.length === filtered.length && filtered.length > 0}
                    />
                  </th>
                  <th className="text-left py-3 px-4 text-xs text-slate-500 font-medium">
                    User
                  </th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">
                    Role
                  </th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">
                    Department
                  </th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">
                    Employee
                  </th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">
                    Status
                  </th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">
                    Last Login
                  </th>
                  <th className="text-left py-3 px-4 text-xs text-slate-500 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${user.role === "admin" ? "bg-gradient-to-br from-purple-500 to-indigo-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"} text-white`}
                        >
                          {user.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                            {user.name}
                            {user.role === "admin" && (
                              <Crown size={10} className="text-purple-500" />
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Mail size={9} />
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getRoleBadge(user.role)}`}
                      >
                        {user.role === "admin" ? "Admin" : "User"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600">
                      {user.department}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-500">
                      {user.employeeId ? (
                        <span className="bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full">
                          {user.employeeId}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <button
                        onClick={() =>
                          toggleUserAccess(user.id, !user.isActive)
                        }
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${user.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"}`}
                        title={
                          user.isActive
                            ? "Click to deactivate"
                            : "Click to activate"
                        }
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-emerald-500" : "bg-red-500"}`}
                        />
                        {user.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-400">
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(user)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                          title="Edit"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={() => setShowPasswordModal(user)}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                          title="Reset Password"
                        >
                          <Key size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(user)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* Audit Logs Tab */}
      {activeTab === "audit" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm p-6">
          <div className="flex items-center gap-4 mb-4">
            <select
              value={auditFilters.action}
              onChange={(e) => setAuditFilters(f => ({ ...f, action: e.target.value }))}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none"
            >
              <option value="">All Actions</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="BULK_ACTIVATE">BULK_ACTIVATE</option>
              <option value="BULK_DEACTIVATE">BULK_DEACTIVATE</option>
            </select>
            <select
              value={auditFilters.entity_type}
              onChange={(e) => setAuditFilters(f => ({ ...f, entity_type: e.target.value }))}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none"
            >
              <option value="">All Entities</option>
              <option value="lead">Lead</option>
              <option value="deal">Deal</option>
              <option value="ticket">Ticket</option>
              <option value="user">User</option>
            </select>
            <button
              onClick={fetchAuditLogs}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2"
            >
              <RefreshCw size={14} className={auditLogsLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left py-3 px-4 text-xs text-slate-500 font-medium">Timestamp</th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">User</th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Action</th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Entity</th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {auditLogsLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-400" />
                      Loading audit logs...
                    </td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">No audit logs found</td>
                  </tr>
                ) : (
                  auditLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600">
                        {log.user_name || log.user_id || 'System'}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${log.action === 'CREATE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            log.action === 'UPDATE' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              log.action === 'DELETE' ? 'bg-red-50 text-red-700 border border-red-200' :
                                'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-500">{log.entity_type}</td>
                      <td className="py-3 px-3 text-xs text-slate-500 max-w-xs truncate">
                        {log.changes ? JSON.stringify(log.changes).slice(0, 100) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "subscriptions" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-slate-800">User Subscriptions</h3>
            <button onClick={fetchSubscriptions} className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50">
              <RefreshCw size={14} className={subLoading ? "animate-spin text-indigo-400" : "text-slate-500"} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left py-3 px-4 text-xs text-slate-500">User</th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500">Plan</th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500">Trial Start</th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500">Trial End</th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500">Status</th>
                  <th className="text-left py-3 px-3 text-xs text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {subLoading ? (
                  <tr><td colSpan={6} className="py-12 text-center text-slate-400">Loading...</td></tr>
                ) : subscriptions.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-slate-400">No users found</td></tr>
                ) : (
                  subscriptions.map(user => {
                    const trialEnd = user.trial_end ? new Date(user.trial_end) : null;
                    const isExpired = trialEnd && new Date() > trialEnd;
                    return (
                      <tr key={user.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="text-xs font-semibold text-slate-800">{user.name}</div>
                          <div className="text-[10px] text-slate-400">{user.email}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-xs capitalize">{user.plan_type || 'Trial'}</span>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500">
                          {user.trial_start ? new Date(user.trial_start).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500">
                          {trialEnd ? trialEnd.toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            user.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            isExpired ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {user.subscription_status === 'active' ? 'Active' : isExpired ? 'Expired' : 'Trialing'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <select
                            value={user.subscription_status || 'trialing'}
                            onChange={async (e) => {
                              const token = localStorage.getItem('token');
                              await fetch(`${import.meta.env.VITE_API_URL}/users/${user.id}/subscription`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ subscription_status: e.target.value }),
                              });
                              fetchSubscriptions();
                            }}
                            className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white focus:outline-none"
                          >
                            <option value="trialing">Trialing</option>
                            <option value="active">Active</option>
                            <option value="expired">Expired</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Permissions Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Crown size={16} className="text-purple-600" />
            <h3 className="text-sm font-bold text-purple-800">
              Admin Permissions
            </h3>
          </div>
          <ul className="space-y-1.5">
            {[
              "View all leads & deals",
              "Manage all employees",
              "Create & manage users",
              "Full analytics access",
              "System settings & reset",
              "Lead integrations control",
            ].map((p) => (
              <li
                key={p}
                className="flex items-center gap-2 text-xs text-purple-700"
              >
                <CheckCircle
                  size={11}
                  className="text-purple-500 flex-shrink-0"
                />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-emerald-600" />
            <h3 className="text-sm font-bold text-emerald-800">
              User Permissions
            </h3>
          </div>
          <ul className="space-y-1.5">
            {[
              "View own leads only",
              "Manage assigned deals",
              "Personal analytics",
              "Update own profile",
              "Create support tickets",
              "View shared reports",
            ].map((p) => (
              <li
                key={p}
                className="flex items-center gap-2 text-xs text-emerald-700"
              >
                <CheckCircle
                  size={11}
                  className="text-emerald-500 flex-shrink-0"
                />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Create User Modal ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-slate-800 flex items-center gap-2">
                <Plus size={16} className="text-indigo-600" />
                Create New User
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {formError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Full Name *
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="John Smith"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    placeholder="john@leadops360.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={form.password}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, password: e.target.value }))
                      }
                      placeholder="Min 6 chars"
                      className="w-full px-3 py-2 pr-9 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((s) => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      <EyeOff size={13} />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        confirmPassword: e.target.value,
                      }))
                    }
                    placeholder="Repeat password"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Role
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, role: e.target.value as any }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Department
                  </label>
                  <select
                    value={form.department}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, department: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none"
                  >
                    {DEPT_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Employee Link
                  </label>
                  <select
                    value={form.employeeId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, employeeId: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none"
                  >
                    {usersLoading ? (
                      <option value="">Loading employees...</option>
                    ) : (
                      employeeOptions.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-6 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={13} />
                    Create User
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-slate-800 flex items-center gap-2">
                <Edit size={16} className="text-indigo-600" />
                Edit User
              </h2>
              <button
                onClick={() => setEditUser(null)}
                className="p-2 rounded-xl hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {formError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  {formError}
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                  {editUser.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {editUser.email}
                  </div>
                  <div className="text-xs text-slate-400">
                    Created {editUser.createdAt}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Full Name
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Role
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, role: e.target.value as any }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Department
                  </label>
                  <select
                    value={form.department}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, department: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none"
                  >
                    {DEPT_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Employee Link
                </label>
                <select
                  value={form.employeeId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, employeeId: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none"
                >
                  {usersLoading ? (
                    <option value="">Loading employees...</option>
                  ) : (
                    employeeOptions.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setEditUser(null)}
                className="px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={saving}
                className="px-6 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Edit size={13} />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Password Reset Modal ── */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-slate-800 flex items-center gap-2">
                <Key size={16} className="text-amber-600" />
                Reset Password
              </h2>
              <button
                onClick={() => setShowPasswordModal(null)}
                className="p-2 rounded-xl hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {error && (
                <div className="mb-4 flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <p className="text-sm text-slate-500">
                Setting new password for{" "}
                <span className="font-medium text-slate-800">
                  {showPasswordModal.name}
                </span>
              </p>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full px-3 py-2 pr-9 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowPasswordModal(null)}
                className="px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={saving || !newPassword}
                className="px-6 py-2 text-sm bg-amber-600 text-white rounded-xl hover:bg-amber-700 flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <Lock size={13} />
                    Reset Password
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">
                Remove User Access
              </h3>
              <p className="text-sm text-slate-500 mb-1">
                Are you sure you want to remove{" "}
                <span className="font-medium text-slate-800">
                  {deleteConfirm.name}
                </span>
                ?
              </p>
              <p className="text-xs text-slate-400">
                This will deactivate their account and revoke all access.
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex-1 py-2.5 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
