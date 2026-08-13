import React, { useState, useEffect, useMemo } from "react";
import { api, getApiBaseUrl } from "../lib/api";
import { toast } from "sonner";
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
import { usePermissions } from "../hooks/usePermissions";
import { isAdminRole, hasModuleAccess, canWrite, normalizeRole } from "../utils/permissions";

// All hierarchy roles available to create


const ALL_HIERARCHY_ROLES = [
  { value: "Org Admin", label: "Org Admin" },
  { value: "Sales Manager", label: "Sales Manager" },
  { value: "Team Leader", label: "Team Leader" },
  { value: "Sales Executive", label: "Sales Executive" },
  { value: "Lead Manager", label: "Lead Manager" },
];
// ── ROLE HIERARCHY CONFIGURATION ── (Add this after the existing constants)

// Who can create whom (Creation Rules)
export const ROLE_CREATION_RULES: Record<string, string[]> = {
  'Super Admin': ['Super Admin', 'Org Admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
  'super_admin': ['Super Admin', 'Org Admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
  'Org Admin': ['Org Admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
  'org_admin': ['Org Admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
  'Sales Manager': ['Team Leader', 'Sales Executive'],
  'sales_manager': ['Team Leader', 'Sales Executive'],
  'Lead Manager': ['Lead Executive', 'Telecaller', 'Lead Qualifier'],
  'lead_manager': ['Lead Executive', 'Telecaller', 'Lead Qualifier'],
  'Team Leader': ['Sales Executive'],
  'team_leader': ['Sales Executive'],
  'Lead Executive': [],
  'Telecaller': [],
  'Lead Qualifier': [],
  'Sales Executive': []
};

// Who reports to whom (Reporting Rules)
export const REPORTING_RULES: Record<string, string[]> = {
  'Org Admin': ['Super Admin', 'super_admin', 'Org Admin', 'org_admin'],
  'org_admin': ['Super Admin', 'super_admin', 'Org Admin', 'org_admin'],
  'Sales Manager': ['Org Admin', 'org_admin'],
  'sales_manager': ['Org Admin', 'org_admin'],
  'Lead Manager': ['Org Admin', 'org_admin'],
  'lead_manager': ['Org Admin', 'org_admin'],
  'Team Leader': ['Sales Manager', 'sales_manager', 'Org Admin', 'org_admin'],
  'team_leader': ['Sales Manager', 'sales_manager', 'Org Admin', 'org_admin'],
  'Sales Executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
  'sales_executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
  'Lead Executive': ['Lead Manager', 'lead_manager'],
  'lead_executive': ['Lead Manager', 'lead_manager'],
  'Telecaller': ['Lead Manager', 'lead_manager'],
  'telecaller': ['Lead Manager', 'lead_manager'],
  'Lead Qualifier': ['Lead Manager', 'lead_manager'],
  'lead_qualifier': ['Lead Manager', 'lead_manager']
};

// All roles list for dropdown (filtered by user's role)
export const ALL_ROLES = [
  'Super Admin',
  'Org Admin',
  'Sales Manager',
  'Lead Manager',
  'Team Leader',
  'Sales Executive',
  'Lead Executive',
  'Telecaller',
  'Lead Qualifier'
];

// Avatar color helper
// Avatar color helper
const getAvatarColor = (role: string): string => {
  const colors: Record<string, string> = {
    // ── ADMIN ROLES ──
    'Super Admin': 'bg-gradient-to-br from-purple-600 to-indigo-600',
    'super_admin': 'bg-gradient-to-br from-purple-600 to-indigo-600',
    'Org Admin': 'bg-gradient-to-br from-indigo-600 to-blue-600',
    'org_admin': 'bg-gradient-to-br from-indigo-600 to-blue-600',

    // ── SALES MANAGEMENT ROLES ──
    'Sales Manager': 'bg-gradient-to-br from-blue-600 to-cyan-600',
    'sales_manager': 'bg-gradient-to-br from-blue-600 to-cyan-600',
    'Lead Manager': 'bg-gradient-to-br from-orange-600 to-amber-600',
    'lead_manager': 'bg-gradient-to-br from-orange-600 to-amber-600',
    'Team Leader': 'bg-gradient-to-br from-cyan-600 to-teal-600',
    'team_leader': 'bg-gradient-to-br from-cyan-600 to-teal-600',

    // ── SALES ROLES ──
    'Sales Executive': 'bg-gradient-to-br from-emerald-600 to-green-600',
    'sales': 'bg-gradient-to-br from-emerald-600 to-green-600',
    'sales_executive': 'bg-gradient-to-br from-emerald-600 to-green-600',
    'Lead Executive': 'bg-gradient-to-br from-yellow-600 to-amber-600',
    'lead_executive': 'bg-gradient-to-br from-yellow-600 to-amber-600',
    'Telecaller': 'bg-gradient-to-br from-pink-600 to-rose-600',
    'telecaller': 'bg-gradient-to-br from-pink-600 to-rose-600',
    'Lead Qualifier': 'bg-gradient-to-br from-gray-600 to-slate-600',
    'lead_qualifier': 'bg-gradient-to-br from-gray-600 to-slate-600',
  };
  return colors[role] || 'bg-gradient-to-br from-gray-500 to-slate-500';
};

// Prettify snake_case / raw DB role values → human-readable display labels
const ROLE_DISPLAY: Record<string, string> = {
  'super_admin':    'Super Admin',
  'org_admin':      'Org Admin',
  'admin':          'Admin',
  'sales_manager':  'Sales Manager',
  'lead_manager':   'Lead Manager',
  'team_leader':    'Team Leader',
  'sales_executive':'Sales Executive',
  'lead_executive': 'Lead Executive',
  'telecaller':     'Telecaller',
  'lead_qualifier': 'Lead Qualifier',
};
const prettifyRole = (role: string): string =>
  ROLE_DISPLAY[role] ?? ROLE_DISPLAY[role?.toLowerCase()] ?? role;


// Role color helper
const getRoleColor = (role: string): string => {
  const colors: Record<string, string> = {
    // ── ADMIN ROLES ──
    'Super Admin': 'bg-purple-100 text-purple-700',
    'super_admin': 'bg-purple-100 text-purple-700',
    'Org Admin': 'bg-indigo-100 text-indigo-700',
    'org_admin': 'bg-indigo-100 text-indigo-700',

    // ── SALES MANAGEMENT ROLES ──
    'Sales Manager': 'bg-blue-100 text-blue-700',
    'sales_manager': 'bg-blue-100 text-blue-700',
    'Lead Manager': 'bg-orange-100 text-orange-700',
    'lead_manager': 'bg-orange-100 text-orange-700',
    'Team Leader': 'bg-cyan-100 text-cyan-700',
    'team_leader': 'bg-cyan-100 text-cyan-700',

    // ── SALES ROLES ──
    'Sales Executive': 'bg-green-100 text-green-700',
    'sales': 'bg-green-100 text-green-700',
    'sales_executive': 'bg-green-100 text-green-700',
    'Lead Executive': 'bg-yellow-100 text-yellow-700',
    'lead_executive': 'bg-yellow-100 text-yellow-700',
    'Telecaller': 'bg-pink-100 text-pink-700',
    'telecaller': 'bg-pink-100 text-pink-700',
    'Lead Qualifier': 'bg-gray-100 text-gray-700',
    'lead_qualifier': 'bg-gray-100 text-gray-700',
  };
  return colors[role] || 'bg-gray-100 text-gray-500';
};

// Legacy constant (kept for compatibility)
const ROLE_OPTIONS = ["user"] as const;
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
    .min(1, "Password is Required"),
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

interface UserForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
  department: string;
  manager_id: string;
}

const emptyForm: UserForm = {
  name: "", email: "", password: "", confirmPassword: "",
  role: "Sales Executive", department: "Sales",
  manager_id: "",
};

const ManagerCell = ({ managerId, userMap, managerCache }: {
  managerId: string;
  userMap: Record<string, any>;
  managerCache: Record<string, { name: string; role: string }>;
}) => {
  const cached = managerCache[managerId];
  const local = userMap[managerId];

  if (cached) {
    return (
      <span className="flex items-center gap-1">
        <span className="font-medium text-slate-700">{cached.name || 'Unknown'}</span>
        <span className="text-[10px] text-slate-400">({prettifyRole(cached.role) || 'N/A'})</span>
      </span>
    );
  }

  if (local) {
    return (
      <span className="flex items-center gap-1">
        <span className="font-medium text-slate-700">{local.name || 'Unknown'}</span>
        <span className="text-[10px] text-slate-400">({prettifyRole(local.role) || 'N/A'})</span>
      </span>
    );
  }

  return <span className="text-slate-400 text-[10px]">Loading...</span>;
};

export default function AdminPage() {
  const { role, users, usersLoading, userMap, loadUsers, createUser, updateUser, deleteUser, toggleUserAccess, resetUserPassword, activateUser, deactivateUser, userProfile, getUserById, fetchUser, } = useApp();
  const navigate = useNavigate();
  const { canCreate, isAdmin } = usePermissions();

  // Filter role options based on the creator's permission level
  const availableRoles = useMemo(() => {
    const rawRole = userProfile?.role || 'Sales Executive';
    const userRole = normalizeRole(rawRole);
    const roles = ROLE_CREATION_RULES[userRole] || ROLE_CREATION_RULES[rawRole] || ['Sales Executive'];
    return roles.map(r => ({ value: r, label: r }));
  }, [userProfile]);

  const [activeTab, setActiveTab] = useState<"users" | "audit" | "subscriptions" | "permissions">("users");
  const [rolePermissions, setRolePermissions] = useState<any[]>([]);
  const [rolePermissionsLoading, setRolePermissionsLoading] = useState(false);

  const [availableManagers, setAvailableManagers] = useState<any[]>([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const [managerCache, setManagerCache] = useState<Record<string, { name: string; role: string }>>({});
  const permsLoading = rolePermissionsLoading;

  const fetchManager = async (managerId: string) => {
    if (!managerId || managerCache[managerId]) return;
    const cached = getUserById(managerId);
    if (cached) {
      setManagerCache(prev => ({ ...prev, [managerId]: { name: cached.name, role: cached.role } }));
      return;
    }
    const user = await fetchUser(managerId);
    if (user) {
      setManagerCache(prev => ({ ...prev, [managerId]: { name: user.name, role: user.role } }));
    }
  };

  useEffect(() => {
    const missingIds = users
      .map(u => u.manager_id)
      .filter((id): id is string => !!id && !managerCache[id] && !userMap[id]);
    if (missingIds.length === 0) return;
    const unique = Array.from(new Set(missingIds));
    unique.forEach(id => fetchManager(id));
  }, [users, userMap, managerCache, fetchManager]);

  const fetchRolePermissions = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setRolePermissionsLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/role-permissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRolePermissions(Array.isArray(data) ? data : []);
      } else {
        setRolePermissions([]);
      }
    } catch {
      setRolePermissions([]);
    } finally {
      setRolePermissionsLoading(false);
    }
  };

  const updateRolePermission = async (id: string, permission: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/role-permissions/${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ permission })
      });
      if (res.ok) {
        toast.success("Permission updated successfully");
        fetchRolePermissions();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update permission");
      }
    } catch {
      toast.error("Failed to update permission");
    }
  };

  const deleteRolePermission = async (id: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/role-permissions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Permission deleted successfully");
        fetchRolePermissions();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete permission");
      }
    } catch {
      toast.error("Failed to delete permission");
    }
  };

  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  const fetchSubscriptions = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setSubLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/users/visible`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSubscriptions(Array.isArray(data) ? data : []);
    } catch { setSubscriptions([]); } finally { setSubLoading(false); }
  };
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState({ action: "", entity_type: "", user_id: "" });

  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkActionValue, setBulkActionValue] = useState<string>('');

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState<UserProfile | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UserProfile | null>(null);

  // ── Transfer Data State ──
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFrom, setTransferFrom] = useState<UserProfile | null>(null);
  const [transferTo, setTransferTo] = useState<string>("");
  const [transferLoading, setTransferLoading] = useState(false);

  const [form, setForm] = useState<UserForm>(emptyForm);
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [error, setError] = useState('');

  useEffect(() => {
    const allowed = ['Super Admin', 'super_admin', 'Org Admin', 'org_admin', 'Sales Manager', 'Lead Manager', 'Team Leader'];
    if (!allowed.includes(role)) { navigate("/"); return; }
    loadUsers();
  }, [role]);

  const filtered = useMemo(() => {
    let data = [...users];

    // Search filter
    if (search) data = data.filter(u =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    );

    // Role filter
    if (filterRole !== "all") data = data.filter(u => u.role === filterRole);

    // Status filter
    if (filterStatus !== "all") data = data.filter(u =>
      filterStatus === "active" ? u.isActive : !u.isActive
    );

    return data;
  }, [users, search, filterRole, filterStatus]);

  // Helper to traverse hierarchy and verify recursive manager relationship
  const isSubordinate = (managerId: string, targetUserId: string, allUsers: UserProfile[]): boolean => {
    let current = allUsers.find(u => u.id === targetUserId);
    while (current && current.manager_id) {
      if (current.manager_id === managerId) return true;
      current = allUsers.find(u => u.id === current.manager_id);
    }
    return false;
  };

  // Get available managers based on selected role
  const getAvailableManagers = (selectedRole: string, targetUserId?: string) => {
    const allowedManagerRoles = REPORTING_RULES[selectedRole] || [];
    return users.filter(u =>
      u.id !== targetUserId &&
      allowedManagerRoles.includes(u.role) &&
      u.isActive
    );
  };

  // ── Fetch available managers from backend ──
  const fetchAvailableManagers = async (selectedRole: string, excludeUserId?: string) => {
    if (!selectedRole) return;
    setManagersLoading(true);
    try {
      const token = localStorage.getItem('token');
      const companyId = editUser ? (editUser as any).company_id : userProfile?.company_id;
      const params = new URLSearchParams({ role: selectedRole });
      if (companyId) params.set('company_id', companyId);
      const res = await fetch(
        `${getApiBaseUrl()}/users/available-managers?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to fetch managers');
      const data = await res.json();
      const isSuperAdmin = userProfile?.role === 'Super Admin' || userProfile?.role === 'super_admin';
      const allowedManagerRoles = REPORTING_RULES[selectedRole] || [];
      let filtered = data.filter((m: any) => {
        if (excludeUserId && m.id === excludeUserId) return false;
        if (!isSuperAdmin && !allowedManagerRoles.includes(m.role)) return false;
        return true;
      });
      setAvailableManagers(filtered);
    } catch (error) {
      console.error('Failed to fetch managers:', error);
      setAvailableManagers([]);
    } finally {
      setManagersLoading(false);
    }
  };
  // ── Fetch managers when role changes ──
  useEffect(() => {
    if (form.role) {
      fetchAvailableManagers(form.role, editUser?.id);
    }
  }, [form.role, editUser?.id]);

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

    // ✅ Show confirmation for delete
    if (bulkAction === 'delete') {
      setShowBulkDeleteConfirm(true);
      return;
    }


    setBulkActionLoading(true);
    try {
      const value = bulkAction === 'assign_department' ? bulkActionValue :
        bulkAction === 'assign_role' ? bulkActionValue : undefined;

      await api.users.bulkAction({
        userIds: selectedUsers,
        action: bulkAction,
        value
      }, token);

      toast.success(`Bulk action completed successfully`);
      await loadUsers();
      setSelectedUsers([]);
      setBulkAction("");
      setBulkActionValue("");
    } catch (error) {
      console.error("Bulk action failed:", error);
      toast.error('Bulk action failed');
    } finally {
      setBulkActionLoading(false);
    }
  };



  const stats = useMemo(() => {
    const admins = users.filter(u => isAdminRole(u.role)).length;
    const regularUsers = users.filter(u => !isAdminRole(u.role)).length;

    return {
      total: users.length,
      active: users.filter(u => u.isActive).length,
      admins,
      users: regularUsers,
      inactive: users.filter(u => !u.isActive).length,
    };
  }, [users]);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      role: availableRoles[0]?.value || "Sales Executive"
    });
    setFormError("");
    setShowCreateModal(true);
  };

  const openEdit = (user: UserProfile) => {
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      confirmPassword: "",
      role: normalizeRole(user.role) || user.role,
      department: user.department || "Sales",
      manager_id: user.manager_id || "",
    });
    setFormError("");
    setEditUser(user);
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setFormError("Name and email are required");
      return;
    }
    if (!form.role) {
      setFormError("Please select a role for the new user");
      return;
    }

    // ── REPORTING MANAGER VALIDATION (RELAXED) ──
    // Manager is optional - backend will auto-assign if not provided
    const noManagerRoles = ['Org Admin', 'org_admin', 'Super Admin', 'super_admin'];
    if (!noManagerRoles.includes(form.role) && !form.manager_id) {
      // ⚠️ Warning only - not blocking
      console.warn(`No manager selected for ${form.role}. Backend will auto-assign.`);
    }



    setSaving(true);
    setFormError("");
    const result = await createUser({
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      manager_id: form.manager_id || undefined,
      department: form.department,
    });
    setSaving(false);

    if (result) {
      setShowCreateModal(false);
      setForm(emptyForm);

      // ── SHOW AUTO-ASSIGN INFO ──
      if (result.manager_id) {
        const manager = getUserById(result.manager_id);
        const managerName = manager?.name || 'Unknown';
        toast.success(`User created! Reporting manager: ${managerName}`);
      } else {
        toast.success(`User created successfully!`);
      }

      // Refresh users to show the new user with auto-assigned manager
      await loadUsers();
    } else {
      setFormError("Failed to invite user. Email may already be registered.");
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;

    const userId = editUser.id; // ← Store ID before it's cleared
    const validation = editUserSchema.safeParse({ name: form.name.trim() });
    if (!validation.success) {
      setFormError(validation.error.issues[0].message);
      return;
    }

    // ── REPORTING MANAGER VALIDATION (RELAXED) ──
    const noManagerRoles = ['Org Admin', 'org_admin', 'Super Admin', 'super_admin'];
    if (!noManagerRoles.includes(form.role) && !form.manager_id) {
      console.warn(`No manager selected for ${form.role}. Backend will auto-assign.`);
    }

    setSaving(true);
    setFormError("");

    const updated = await updateUser(editUser.id, {
      name: form.name.trim(),
      role: form.role as any,
      manager_id: form.manager_id || null,
      department: form.department,
    });

    setSaving(false);
    setEditUser(null);

    if (updated) {
      // ── SHOW AUTO-ASSIGN INFO ──
      // Use stored userId instead of editUser.id
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${getApiBaseUrl()}/users/${userId}`, {  // ← Use stored userId
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const updatedUser = await res.json();
          if (updatedUser.manager_id) {
            const manager = getUserById(updatedUser.manager_id);
            const managerName = manager?.name || 'Unknown';
            toast.success(`User updated! Reporting manager: ${managerName}`);
          } else {
            toast.success(`User updated successfully!`);
          }
        } else {
          toast.success(`User updated successfully!`);
        }
      } catch {
        toast.success(`User updated successfully!`);
      }

      await loadUsers();
    }
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

  // ── Transfer Data Handlers ──
  const openTransferModal = (user: UserProfile) => {
    setTransferFrom(user);
    setTransferTo("");
    setShowTransferModal(true);
  };

  const handleTransferData = async () => {
    if (!transferFrom || !transferTo) return;
    setTransferLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${getApiBaseUrl()}/admin/users/${transferFrom.id}/transfer-data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ transfer_to: transferTo })
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Transfer failed');
      toast.success(
        `Transferred ${data.transferred?.leads ?? 0} leads and ${data.transferred?.deals ?? 0} deals from ${transferFrom.name}`
      );
      setShowTransferModal(false);
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || 'Transfer failed');
    } finally {
      setTransferLoading(false);
    }
  };

  const getRoleBadge = (r: string) => {
    if (r === "org_admin") return "bg-purple-50 text-purple-700 border-purple-200";
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
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <button
              onClick={() => navigate("/subscription")}
              className="px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors flex items-center gap-2"
            >
              <CreditCard size={14} /> Manage Subscription
            </button>
          )}
          <button
            onClick={loadUsers}
            disabled={usersLoading}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={`text-slate-500 ${usersLoading ? "animate-spin" : ""}`} />
          </button>
          {role !== 'Team Leader' && role !== 'team_leader' && (
            <button
              onClick={openCreate}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 transition-colors shadow-sm shadow-indigo-200"
            >
              <Plus size={15} /> Add User
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: isAdmin ? "Total Users" :
              (role === "Sales Manager" ? "Department Users" :
                role === "Lead Manager" ? "Lead Team Users" :
                  role === "Team Leader" ? "Team Members" : "Total Users"),
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

      {/* ── TEAM LEADER HEADING ── */}
      {role === 'Team Leader' || role === 'team_leader' ? (
        <div className="flex items-center gap-2 mb-2">
          <Users size={16} className="text-indigo-600" />
          <h2 className="text-sm font-semibold text-slate-700">My Team</h2>
          <span className="text-xs text-slate-400">({filtered.length} members)</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-2">
          <Users size={16} className="text-indigo-600" />
          <h2 className="text-sm font-semibold text-slate-700">
            {isAdminRole(role) ? 'All Users' : 'Team Members'}
          </h2>
          <span className="text-xs text-slate-400">({filtered.length} users)</span>
        </div>
      )}

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
        {!['Team Leader', 'team_leader', 'Lead Manager', 'lead_manager'].includes(role) && (
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
        )}
        {isAdmin && (
          <button
            onClick={() => { setActiveTab("subscriptions" as any); fetchSubscriptions(); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "subscriptions" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500"
              }`}
          >
            <CreditCard size={14} className="inline mr-2" />
            Subscriptions
          </button>
        )}
      </div>


      {activeTab === "users" && (
        <>
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
            {/* ── ROLE FILTER (Clean Static List) ── */}
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none text-slate-600 min-w-[150px]"
            >
              <option value="all">All Roles</option>

              <optgroup label="Admin">
                <option value="Super Admin">Super Admin</option>
                <option value="Org Admin">Org Admin</option>
              </optgroup>

              <optgroup label="Management">
                <option value="Sales Manager">Sales Manager</option>
                <option value="Lead Manager">Lead Manager</option>
                <option value="Team Leader">Team Leader</option>
              </optgroup>

              <optgroup label="Sales">
                <option value="Sales Executive">Sales Executive</option>
                <option value="Lead Executive">Lead Executive</option>
                <option value="Telecaller">Telecaller</option>
                <option value="Lead Qualifier">Lead Qualifier</option>
              </optgroup>
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
          {selectedUsers.length > 0 && role !== "Team Leader" && (
            <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-200 w-full flex-wrap">
              <span className="text-sm font-medium text-indigo-700">{selectedUsers.length} users selected</span>
              <select
                value={bulkAction}
                onChange={(e) => setBulkAction(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">Select Action</option>
                <option value="activate">Activate</option>
                <option value="deactivate">Deactivate</option>
                {isAdmin && <option value="delete">Delete</option>}
                <option value="assign_department">Assign Department</option>
                <option value="assign_role">Assign Role</option>
              </select>

              {/* Value selector for department/role */}
              {bulkAction === 'assign_department' && (
                <select
                  value={bulkActionValue}
                  onChange={(e) => setBulkActionValue(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Select Department</option>
                  {DEPT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              )}
              {bulkAction === 'assign_role' && (
                <select
                  value={bulkActionValue}
                  onChange={(e) => setBulkActionValue(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Select Role</option>
                  {availableRoles.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              )}

              <button
                onClick={handleBulkAction}
                disabled={!bulkAction || bulkActionLoading || ((bulkAction === 'assign_department' || bulkAction === 'assign_role') && !bulkActionValue)}
                className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {bulkActionLoading ? <RefreshCw size={14} className="animate-spin" /> : "Apply"}
              </button>
              <button onClick={() => { setSelectedUsers([]); setBulkAction(""); setBulkActionValue(""); }} className="text-sm text-slate-400 hover:text-slate-600">Clear</button>
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
                        Reports To
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
                    {filtered.map((user) => {
                      const isSelf = userProfile?.id === user.id;
                      const isTargetSubordinate = userProfile && isSubordinate(userProfile.id, user.id, users);

                      const canEdit =
                        role === 'Super Admin' || role === 'super_admin' ||
                         ((role === 'Org Admin' || role === 'org_admin') && user.role !== 'Super Admin' && user.role !== 'super_admin') ||
                        (role === 'Sales Manager' && isTargetSubordinate && ['Team Leader', 'Sales Executive'].includes(user.role)) ||
                        (role === 'Lead Manager' && isTargetSubordinate && ['Lead Executive', 'Telecaller', 'Lead Qualifier'].includes(user.role));

                      const canDelete =
                        !isSelf && (
                          role === 'Super Admin' || role === 'super_admin' ||
                          ((role === 'Org Admin' || role === 'org_admin') && user.role !== 'Super Admin' && user.role !== 'super_admin')
                        );

                      const canActivateDeactivate =
                        !isSelf && (
                          role === 'Super Admin' || role === 'super_admin' ||
                          ((role === 'Org Admin' || role === 'org_admin') && user.role !== 'Super Admin' && user.role !== 'super_admin') ||
                          (role === 'Sales Manager' && isTargetSubordinate && ['Team Leader', 'Sales Executive'].includes(user.role))
                        );

                      const canResetPassword = canEdit;

                      return (
                        <tr
                          key={user.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="py-3 px-3">
                            <input
                              type="checkbox"
                              className="rounded"
                              checked={selectedUsers.includes(user.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUsers([...selectedUsers, user.id]);
                                } else {
                                  setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                                }
                              }}
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${getAvatarColor(user.role)} text-white`}
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
                                  {isAdminRole(user.role) && (
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
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getRoleColor(user.role)}`}>
                              {prettifyRole(user.role)}
                            </span>
                          </td>
                           <td className="py-3 px-3 text-xs text-slate-500">
                             {user.manager_id ? (
                               <ManagerCell managerId={user.manager_id} userMap={userMap} managerCache={managerCache} />
                             ) : (
                               <span className="text-slate-300">—</span>
                             )}
                           </td>
                          <td className="py-3 px-3">
                            <button
                              onClick={() =>
                                canActivateDeactivate && toggleUserAccess(user.id, !user.isActive)
                              }
                              disabled={!canActivateDeactivate}
                              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${!canActivateDeactivate ? "opacity-50 cursor-not-allowed" : ""} ${user.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"}`}
                              title={
                                !canActivateDeactivate ? "You don't have permission to toggle access for this user" :
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
                              {/* Activate/Deactivate Button */}
                              {user.id !== userProfile?.id && canActivateDeactivate && (
                                <button
                                  onClick={() => user.isActive ? deactivateUser(user.id) : activateUser(user.id)}
                                  className={`p-1.5 rounded-lg transition-colors ${user.isActive
                                    ? "text-red-400 hover:text-red-600 hover:bg-red-50"
                                    : "text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50"
                                    }`}
                                  title={user.isActive ? "Deactivate User" : "Activate User"}
                                >
                                  {user.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                                </button>
                              )}
                              {canEdit && (
                                <button onClick={() => openEdit(user)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Edit">
                                  <Edit size={13} />
                                </button>
                              )}
                              {canResetPassword && (
                                <button onClick={() => setShowPasswordModal(user)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors" title="Reset Password">
                                  <Key size={13} />
                                </button>
                              )}
                              {canDelete && (
                                <button onClick={() => setDeleteConfirm(user)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                                  <Trash2 size={13} />
                                </button>
                              )}
                              {/* Transfer Data - only Super Admin / Org Admin */}
                              {(role === 'Super Admin' || role === 'super_admin' || role === 'Org Admin' || role === 'org_admin') && !isSelf && (
                                <button
                                  onClick={() => openTransferModal(user)}
                                  className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                                  title="Transfer Data"
                                >
                                  <Users size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}


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
              <option value="BULK_DELETE">BULK_DELETE</option>
              <option value="BULK_ASSIGN_DEPARTMENT">BULK_ASSIGN_DEPARTMENT</option>
              <option value="BULK_ASSIGN_ROLE">BULK_ASSIGN_ROLE</option>
              <option value="avatar_upload">AVATAR_UPLOAD</option>
              <option value="avatar_removed">AVATAR_REMOVED</option>
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
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${user.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
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
                              const newStatus = e.target.value;

                              // Optimistic update
                              const originalStatus = user.subscription_status;
                              const updatedUser = { ...user, subscription_status: newStatus };
                              setSubscriptions(prev => prev.map(u => u.id === user.id ? updatedUser : u));

                              try {
                                const response = await fetch(`${getApiBaseUrl()}/users/${user.id}/subscription`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ subscription_status: newStatus }),
                                });

                                if (!response.ok) {
                                  throw new Error('Failed to update subscription');
                                }

                                toast.success(`Subscription updated to ${newStatus}`);

                                // Sync with user management - update user's active status
                                const isActive = newStatus === 'active';
                                await updateUser(user.id, { isActive });

                                // Refresh both subscriptions and users list
                                await Promise.all([
                                  fetchSubscriptions(),
                                  loadUsers()
                                ]);
                              } catch (error) {
                                // Revert on error
                                setSubscriptions(prev => prev.map(u => u.id === user.id ? { ...user, subscription_status: originalStatus } : u));
                                toast.error('Failed to update subscription');
                              }
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
              {/* Invite info notice */}
              <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-700">
                <Shield size={14} className="flex-shrink-0 mt-0.5" />
                <span>An <strong>invitation link</strong> will be sent to this email. The user will set their own password when they accept the invite.</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Role
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      setForm((f) => ({
                        ...f,
                        role: newRole,
                        manager_id: '' // Reset manager when role changes
                      }));
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none"
                  >
                    {availableRoles.length > 0 ? (
                      availableRoles.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))
                    ) : (
                      <option value="Sales Executive">Sales Executive</option>
                    )}
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

              {/* ── REPORTING MANAGER ── */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  Reporting Manager
                  <span className="text-[10px] text-slate-400 ml-2">
                    (Optional - auto-assigned if left blank)
                  </span>
                </label>
                <select
                  value={form.manager_id}
                  onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">— Select Reporting Manager —</option>
                  {managersLoading ? (
                    <option value="" disabled>Loading managers...</option>
                  ) : (
                    availableManagers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name} ({manager.role})
                      </option>
                    ))
                  )}
                </select>
                {form.manager_id && (
                  <p className="text-[10px] text-emerald-600 mt-1">
                    ✅ Valid reporting relationship
                  </p>
                )}
                {!form.manager_id && !['Org Admin', 'org_admin', 'Super Admin', 'super_admin'].includes(form.role) && (
                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                    <span>⚡</span>
                    {form.role} will be auto-assigned to the nearest higher role in the organization.
                  </p>
                )}
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
      {
        editUser && (
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
                    <label className="block text-xs text-slate-500 mb-1.5">Role *</label>
                    <select
                      value={form.role}
                      onChange={(e) => {
                        const newRole = e.target.value;
                        setForm((f) => ({
                          ...f,
                          role: newRole,
                          manager_id: '' // Reset manager when role changes
                        }));
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {availableRoles.length > 0 ? (
                        availableRoles.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))
                      ) : (
                        <option value="Sales Executive">Sales Executive</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Department</label>
                    <select
                      value={form.department}
                      onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none"
                    >
                      {DEPT_OPTIONS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ── REPORTING MANAGER ── */}
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    Reporting Manager
                    <span className="text-[10px] text-slate-400 ml-2">
                      (Optional - auto-assigned if left blank)
                    </span>
                  </label>
                  <select
                    value={form.manager_id}
                    onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">— Auto-assign —</option>
                    {managersLoading ? (
                      <option value="" disabled>Loading managers...</option>
                    ) : (
                      availableManagers.map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {manager.name} ({manager.role})
                        </option>
                      ))
                    )}
                  </select>

                  {/* ── AUTO-ASSIGN HINT ── */}
                  {!form.manager_id && (
                    <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                      <span>⚡</span>
                      {form.role} will be auto-assigned to the nearest higher role in the organization.
                    </p>
                  )}
                  {form.manager_id && (
                    <p className="text-[10px] text-emerald-600 mt-1">
                      ✅ Reporting manager selected manually
                    </p>
                  )}
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
        )
      }

      {/* ── Password Reset Modal ── */}
      {
        showPasswordModal && (
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
                      placeholder="Enter new password"
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
        )
      }

      {/* ── Delete Confirm Modal ── */}
      {
        deleteConfirm && (
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
        )
      }



      {/* ── Transfer Data Modal ── */}
      {
        showTransferModal && transferFrom && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                  <Users size={16} className="text-indigo-600" />
                  Transfer Employee Data
                </h2>
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X size={16} className="text-slate-400" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                {/* From */}
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Employee Leaving</label>
                  <div className="p-3 bg-slate-50 rounded-xl text-sm text-slate-700 font-medium">
                    {transferFrom.name}
                    <span className="text-xs text-slate-400 font-normal ml-1">({transferFrom.role})</span>
                  </div>
                </div>

                {/* To */}
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Transfer To *</label>
                  <select
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Select Employee</option>
                    {users
                      .filter(u =>
                        u.id !== transferFrom.id &&
                        u.isActive &&
                        (u as any).company_id === (transferFrom as any).company_id
                      )
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Info box */}
                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <p className="text-xs font-medium text-indigo-700 mb-2">
                    The following active business data will be transferred:
                  </p>
                  <ul className="text-xs text-indigo-600 space-y-1">
                    <li>✓ Active Leads (non-won / non-lost)</li>
                    <li>✓ Open Deals (non-won / non-lost)</li>
                  </ul>
                  <p className="text-[10px] text-indigo-400 mt-2 pt-2 border-t border-indigo-200">
                    Historical ownership, activities, performance and audit records will remain unchanged.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTransferData}
                  disabled={!transferTo || transferLoading}
                  className="px-6 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50 transition-colors"
                >
                  {transferLoading ? (
                    <><Loader2 size={13} className="animate-spin" /> Transferring...</>
                  ) : (
                    <><Users size={13} /> Transfer Data</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* ── Bulk Delete Confirmation Modal ── */}
      {
        showBulkDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowBulkDeleteConfirm(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={22} className="text-red-500" />
              </div>
              <h3 className="text-slate-800 mb-2">Delete {selectedUsers.length} Users?</h3>
              <p className="text-sm text-slate-500 mb-5">This action cannot be undone. All selected users will be permanently deactivated.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowBulkDeleteConfirm(false);
                    // Proceed with delete
                    const token = localStorage.getItem('token');
                    if (!token) return;

                    setBulkActionLoading(true);
                    try {
                      await api.users.bulkAction({
                        userIds: selectedUsers,
                        action: 'delete',
                        value: undefined
                      }, token);

                      toast.success(`${selectedUsers.length} users deleted successfully`);
                      await loadUsers();
                      setSelectedUsers([]);
                      setBulkAction("");
                    } catch (error) {
                      console.error("Bulk delete failed:", error);
                      toast.error('Failed to delete users');
                    } finally {
                      setBulkActionLoading(false);
                    }
                  }}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 transition-colors"
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
