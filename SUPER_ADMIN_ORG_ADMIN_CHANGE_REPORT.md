# 👑 Super Admin & Organization Admin - Implementation Change Report

## Overview

This report details every file and code location that needs to change to fully implement the **Super Admin** and **Organization Admin** roles as defined. The analysis covers both the **backend** (`server.js` in `vigozen`) and the **frontend** (`vigozen-src/src/app`).

---

## Part A - Backend Changes (server.js)

### A1. CRITICAL BUG: `getScopedQueryFilters` returns empty for ALL admin roles (line 666-668)

**Location:** `server.js` → `getScopedQueryFilters()` function

**Current code:**
```js
if (isAdminRole(role)) {
  return { joinClause: '', whereClause: '', params: [] };
}
```

**Problem:** This returns NO company filter for **both** Super Admin AND Org Admin. This means:
- **Super Admin** → Correct (should see ALL companies)
- **Org Admin** → **WRONG** (should only see their OWN company)

**Required change:**
```js
if (role === 'Super Admin' || role === 'super_admin') {
  // Super Admin sees ALL companies
  return { joinClause: '', whereClause: '', params: [] };
}

if (role === 'Org Admin' || role === 'org_admin' || role === 'admin') {
  // Org Admin sees ONLY their own company
  return { joinClause: '', whereClause: 'WHERE company_id = $1', params: [company_id] };
}
```

**Why:** The role definition states Org Admin "cannot access or modify data belonging to other organizations." The current code violates this by returning all companies' data.

---

### A2. Add `Super Admin` to `seedPermissions` (line 225-266)

**Location:** `server.js` → `seedPermissions()` function

**Current state:** There are NO `Super Admin` entries in the permissions array. Super Admin is only handled by the `isAdminRole` check at the top of `getPermissionScope`.

**Required change - Add Super Admin entries:**
```js
const permissions = [
  // Super Admin (Platform-wide)
  { role: 'Super Admin', module: 'leads', permission: 'full' },
  { role: 'Super Admin', module: 'deals', permission: 'full' },
  { role: 'Super Admin', module: 'users', permission: 'full' },
  { role: 'Super Admin', module: 'reports', permission: 'full' },
  { role: 'Super Admin', module: 'settings', permission: 'full' },
  { role: 'Super Admin', module: 'billing', permission: 'full' },
  { role: 'Super Admin', module: 'tickets', permission: 'full' },
  { role: 'Super Admin', module: 'activities', permission: 'full' },
  // Org Admin
  { role: 'Org Admin', module: 'leads', permission: 'full' },
  { role: 'Org Admin', module: 'deals', permission: 'full' },
  { role: 'Org Admin', module: 'users', permission: 'full' },
  { role: 'Org Admin', module: 'reports', permission: 'full' },
  { role: 'Org Admin', module: 'settings', permission: 'full' },
  { role: 'Org Admin', module: 'billing', permission: 'full' },
  { role: 'Org Admin', module: 'tickets', permission: 'full' },
  { role: 'Org Admin', module: 'activities', permission: 'full' },
  // ... rest of roles
];
```

**Why:** Explicitly seeding Super Admin permissions ensures the `role_permissions` table has entries for the platform-level role, and allows company-specific overrides if needed.

---

### A3. Fix `getPermissionScope` hierarchy (line 516-530)

**Location:** `server.js` → `getPermissionScope()` function

**Current state:**
```js
const getPermissionScope = (role, module) => {
  if (isAdminRole(role)) return 'full';  // Both Super Admin AND Org Admin get 'full'
  ...
  'Org Admin': { leads: 'full', deals: 'full', users: 'full', reports: 'full', settings: 'full', billing: 'full', tickets: 'full', activities: 'full' },
```

**Issues:**
1. `isAdminRole` returns `'full'` for both Super Admin and Org Admin - this is correct for scope, but the company filtering in `getScopedQueryFilters` (A1) is what differentiates them
2. Missing `Super Admin` entry in the hierarchy (handled by `isAdminRole` check)

**Required change - Add explicit Super Admin entry:**
```js
const getPermissionScope = (role, module) => {
  if (role === 'Super Admin' || role === 'super_admin') return 'full';
  if (role === 'Org Admin' || role === 'org_admin' || role === 'admin') return 'full';

  const hierarchy = {
    'Org Admin': { leads: 'full', deals: 'full', users: 'full', reports: 'full', settings: 'full', billing: 'full', tickets: 'full', activities: 'full' },
    // ... rest
  };
  return hierarchy[role]?.[module] || 'none';
};
```

**Why:** While both roles get `'full'` scope, the company filtering in `getScopedQueryFilters` (A1) is what differentiates them. This change makes the distinction explicit.

---

### A4. Verify `checkUserManagementAccess` for Super Admin & Org Admin (line 533-553)

**Location:** `server.js` → `checkUserManagementAccess()` function

**Current state (CORRECT):**
```js
// Super Admin can edit/manage anyone
if (role === 'Super Admin' || role === 'super_admin') {
  return { allowed: true, targetUser };
}

// Org Admin / admin can edit/manage anyone in same company except Super Admin
if (role === 'Org Admin' || role === 'org_admin' || role === 'admin') {
  if (targetUser.company_id !== company_id) {
    return { allowed: false, error: "User belongs to another company" };
  }
  if (targetUser.role === 'Super Admin' || targetUser.role === 'super_admin') {
    return { allowed: false, error: "Cannot manage Super Admin" };
  }
  return { allowed: true, targetUser };
}
```

**No change needed** - this already correctly:
- Super Admin can manage anyone across all companies
- Org Admin can manage anyone in their company except Super Admin

---

### A5. Verify `requireRole` middleware (line 496-511)

**Location:** `server.js` → `requireRole()` function

**Current state (CORRECT):** Uses exact role string matching. Super Admin role string is `'Super Admin'`, Org Admin is `'Org Admin'`.

**No change needed.**

---

### A6. Verify `isAdminRole` helper (line 514)

**Location:** `server.js` → `isAdminRole()` function

**Current state:**
```js
const isAdminRole = (role) => role === 'Super Admin' || role === 'super_admin' || role === 'Org Admin' || role === 'admin';
```

**CORRECT** - includes both Super Admin and Org Admin.

---

## Part B - Frontend Changes (vigozen-src/src/app)

### B1. Update `src/app/hooks/usePermissions.ts`

**Location:** `moduleAccessMap` (line 60-72)

**Current super_admin and org_admin entries:**
```ts
'super_admin': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities', 'settings', 'billing'],
'org_admin': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities', 'settings', 'billing'],
```

**CORRECT** - Both have access to all modules.

**Verify `roleCreationRules` (line 74-86):**
```ts
'super_admin': ['org_admin'],
'org_admin': ['sales_manager', 'lead_manager', 'team_leader', 'sales_executive', 'lead_executive', 'telecaller', 'lead_qualifier'],
```

**CORRECT** - matches role definitions:
- Super Admin can only create Org Admin
- Org Admin can create all lower roles but NOT Super Admin or another Org Admin

**Verify `canOpenAdminPanel` (line 93):**
```ts
const canOpenAdminPanel = ['super_admin', 'org_admin', 'admin', 'sales_manager', 'lead_manager', 'team_leader'].includes(role);
```
**CORRECT** - both can open Admin Panel.

**No changes needed** - this file is already correct for Super Admin and Org Admin.

---

### B2. Update `src/app/utils/permissions.ts`

**Location:** `isAdminRole` (line 1-5)

**Current state:**
```ts
export const isAdminRole = (role: string | null | undefined): boolean => {
  if (!role) return false;
  const adminRoles = ["admin", "super_admin", "Super Admin", "Org Admin"];
  return adminRoles.includes(role);
};
```

**CORRECT** - includes both Super Admin and Org Admin.

**Location:** `getPermissionScope` (line 47-62)

**Current state:**
```ts
export function getPermissionScope(role, module) {
  if (!role) return 'none';
  if (isAdminRole(role)) return 'full';
  ...
}
```

**CORRECT** - both Super Admin and Org Admin get `'full'` scope.

**No changes needed** - this file is already correct for Super Admin and Org Admin.

---

### B3. Update `src/app/context/AppContext.tsx`

**Location:** `loadUsers` gate (line 904-907)

**Current state:**
```ts
const isAllowed = ['Super Admin', 'super_admin', 'Org Admin', 'admin', 'Sales Manager', 'sales_manager', 'Lead Manager', 'lead_manager', 'Team Leader', 'team_leader'].includes(role) || isAdminRole(role);
```

**CORRECT** - both Super Admin and Org Admin can load users.

**Location:** Company subscription effect (line 864-874)

**Current state:**
```ts
const isPowerRole = ['Super Admin', 'super_admin', 'Org Admin', 'admin', 'Sales Manager', 'sales_manager', 'Lead Manager', 'lead_manager', 'Team Leader', 'team_leader'].includes(role) || isAdminRole(role);
if (userProfile?.id && isPowerRole) {
  fetchCompanySubscription();
  fetchPaymentMethods();
  fetchInvoices();
  loadUsers();
  fetchPricingConfig();
  fetchPermissions();
}
```

**CORRECT** - both Super Admin and Org Admin can access company subscription, payment methods, invoices, users, pricing config, and permissions.

**No changes needed** - this file is already correct for Super Admin and Org Admin.

---

### B4. Update `src/app/pages/AdminPage.tsx`

**Change 1 - `ROLE_CREATION_RULES` (line 32-43):**
```ts
'Super Admin': ['Org Admin'],
'Org Admin': ['Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
```
**CORRECT** - matches role definitions.

**Change 2 - `REPORTING_RULES` (line 46-55):**
```ts
'Org Admin': ['Super Admin'],
```
**CORRECT** - Org Admin reports to Super Admin.

**Change 3 - `canEdit` logic (line 770-775):**
```ts
role === 'Super Admin' || role === 'super_admin' ||
((role === 'Org Admin' || role === 'org_admin' || role === 'admin') && user.role !== 'Super Admin' && user.role !== 'super_admin') ||
```
**CORRECT** - Super Admin can edit anyone, Org Admin can edit anyone except Super Admin.

**Change 4 - `canDelete` logic (line 777-781):**
```ts
const canDelete = !isSelf && (
  role === 'Super Admin' || role === 'super_admin' ||
  ((role === 'Org Admin' || role === 'org_admin' || role === 'admin') && user.role !== 'Super Admin' && user.role !== 'super_admin')
);
```
**CORRECT** - Super Admin can delete anyone, Org Admin can delete anyone except Super Admin.

**Change 5 - `canActivateDeactivate` logic (line 783-790):**
```ts
role === 'Super Admin' || role === 'super_admin' ||
((role === 'Org Admin' || role === 'org_admin' || role === 'admin') && user.role !== 'Super Admin' && user.role !== 'super_admin') ||
```
**CORRECT** - Super Admin can activate/deactivate anyone, Org Admin can activate/deactivate anyone except Super Admin.

**Change 6 - Bulk action toolbar (line 655):**
```tsx
{selectedUsers.length > 0 && role !== "Team Leader" && (
```
**CORRECT** - Super Admin and Org Admin see bulk actions.

**Change 7 - Bulk action delete option (line 666):**
```tsx
{isAdmin && <option value="delete">Delete</option>}
```
**CORRECT** - Both Super Admin and Org Admin can bulk delete.

**Change 8 - Subscriptions tab (line 582-591):**
```tsx
{isAdmin && (
  <button onClick={() => { setActiveTab("subscriptions" as any); fetchSubscriptions(); }}>
```
**CORRECT** - Both can see subscriptions tab.

**Change 9 - "Manage Subscription" button (line 482-489):**
```tsx
{isAdmin && (
  <button onClick={() => navigate("/subscription")}>
```
**CORRECT** - Both can manage subscriptions.

**Change 10 - Stats label (line 511-514):**
```tsx
label: isAdmin ? "Total Users" : ...
```
**CORRECT** - Shows "Total Users" for both.

**Change 11 - `availableRoles` (line 206-210):**
```ts
const userRole = userProfile?.role || 'Sales Executive';
const roles = ROLE_CREATION_RULES[userRole] || ['Sales Executive'];
```
**CORRECT** - Super Admin sees only Org Admin option, Org Admin sees all lower roles.

**Change 12 - `useEffect` role gate (line 254-258):**
```ts
const allowed = ['Super Admin', 'Org Admin', 'admin', 'Sales Manager', 'Lead Manager', 'Team Leader'];
if (!allowed.includes(role)) { navigate("/"); return; }
```
**CORRECT** - Both can access Admin Panel.

**No changes needed** - this file is already correct for Super Admin and Org Admin.

---

### B5. Update `src/app/pages/LeadsPage.tsx`

**Change 1 - Replace `role === "admin"` checks with permission-based flags:**

| Line | Current Code | Required Change |
|------|-------------|-----------------|
| ~675 | `{role === "admin" && (<select> employees)}` | `{canSeeAllEmployees && (<select> employees)}` |
| ~712 | `{role === "admin" && selectedIds.length > 0 && (...)}` | `{canDeleteLeadsSeq && selectedIds.length > 0 && (...)}` |
| ~812 | `{role === "admin" && visibleColumns.includes("owner") && (<th>)}` | `{canSeeAllEmployees && visibleColumns.includes("owner") && (<th>)}` |
| ~931 | `{role === "admin" && visibleColumns.includes("owner") && (<td>)}` | `{canSeeAllEmployees && visibleColumns.includes("owner") && (<td>)}` |
| ~1077 | `{role === "admin" && (<Delete button>)}` | `{canDeleteLeadsSeq && (<Delete button>)}` |
| ~1220 | `const isAdmin = role === "admin";` | `const isAdmin = isAdminRole(role);` |
| ~1633 | `{role === "admin" && (<Assign To select>)}` | `{canAssignLeads && (<Assign To select>)}` |

**Add access flags after the hook:**
```ts
const canSeeAllEmployees = hasModuleAccess(permissions, 'leads', ['full', 'dept', 'team']);
const canDeleteLeadsSeq  = hasModuleAccess(permissions, 'leads', ['full']);
const canWriteLeads      = canWrite(permissions, 'leads');
const canAssignLeads     = hasModuleAccess(permissions, 'leads', ['full', 'dept', 'team']);
```

**Why:** Both Super Admin and Org Admin have `full` scope for leads → can see all leads, assign leads, and delete leads.

---

### B6. Update `src/app/pages/SalesPage.tsx`

**Change 1 - Remove client-side filtering (line 78-92):**
```ts
// BEFORE (WRONG - double filters backend data):
const visibleDeals = useMemo(() =>
  (role === "user"
    ? deals.filter(d => d.owner?.toLowerCase().trim() === currentUser.name?.toLowerCase().trim())
    : deals
  ).map(...),
  [deals, role, currentUser]);

// AFTER (CORRECT - display backend-scoped data as-is):
const visibleDeals = useMemo(() =>
  deals.map(d => ({ ...d, value: Number(d.value) || 0, probability: Number(d.probability) || 50, owner: d.owner || "Unknown" })),
  [deals]);
```

**Why:** The backend already scopes `/deals` via `getScopedQueryFilters`. For Super Admin, this returns all companies' deals. For Org Admin (after A1 fix), this returns only their company's deals.

**Change 2 - Gate Edit/Delete buttons by write permission:**
```ts
const canManageDeals = canWrite(permissions, 'deals');
```
Wrap the Edit/Trash buttons in:
```tsx
{canManageDeals && (
  <>
    <button onClick={() => openEdit(deal)} ...><Edit size={11} /></button>
    <button onClick={() => setDeleteConfirm(deal)} ...><Trash2 size={11} /></button>
  </>
)}
```

**Why:** Both Super Admin and Org Admin have `full` scope for deals → can edit and delete deals.

---

### B7. Update `src/app/pages/PriceListPage.tsx`

**Change 1 - Replace static role gate (line 220-241):**
```ts
// BEFORE:
if ((role as any) !== "admin" && (role as any) !== "super_admin") {
  return <AccessRestricted />;
}

// AFTER:
const canAccessBilling = hasModuleAccess(permissions, 'billing', ['full', 'dept', 'team', 'view']);
if (!canAccessBilling) {
  return <AccessRestricted />;
}
```

**Why:** Both Super Admin and Org Admin have `billing: 'full'` → can access billing/pricing pages.

---

### B8. Update `src/app/components/Layout.tsx`

**Change 1 - Admin Panel link (line 206-236):**
```tsx
{canOpenAdminPanel && (
```
**CORRECT** - Both can see Admin Panel link.

**Change 2 - Role badge (line 154-156):**
```tsx
{isAdmin ? <Crown size={13} className="text-purple-300" /> : <User size={13} className="text-emerald-300" />}
<span className="text-xs font-medium text-white/90">{isAdmin ? "Admin Access" : "User Access"}</span>
```
**CORRECT** - Both show "Admin Access".

**No changes needed** - this file is already correct for Super Admin and Org Admin.

---

### B9. Update `src/app/routes.tsx`

**Change 1 - `RequireAdmin` guard (line 61-75):**
```tsx
const { canOpenAdminPanel } = usePermissions();
```
**CORRECT** - Uses `canOpenAdminPanel` which includes both super_admin and org_admin.

**No changes needed** - this file is already correct for Super Admin and Org Admin.

---

### B10. Update `src/app/pages/SettingsPage.tsx`

**Change 1 - Allow company settings for Org Admin, global settings for Super Admin:**
```ts
const canAccessCompanySettings = hasModuleAccess(permissions, 'settings', ['full']);
// Both Super Admin and Org Admin have settings: 'full'
```

**Why:** 
- **Super Admin** → can manage global system settings, AI settings, integrations, security policies, departments, role permissions, email settings, platform branding
- **Org Admin** → can manage company profile, organization settings, notification preferences, integrations, departments, role permissions, company branding

**No change needed** - both have `settings: 'full'` scope.

---

### B11. Update `src/app/pages/BillingPage.tsx`

**Change 1 - Allow billing access:**
```ts
const canAccessBilling = hasModuleAccess(permissions, 'billing', ['full']);
if (!canAccessBilling) {
  return <AccessRestricted />;
}
```

**Why:** Both Super Admin and Org Admin have `billing: 'full'` → can access billing pages.

**No change needed** - both have `billing: 'full'` scope.

---

### B12. Update `src/app/pages/SupportPage.tsx`

**Change 1 - Allow full ticket access:**
```ts
const canViewAllTickets = hasModuleAccess(permissions, 'tickets', ['full', 'dept', 'team']);
// Both Super Admin and Org Admin have tickets: 'full'
```

**Why:** 
- **Super Admin** → can view every support ticket, respond to tickets, manage documentation, configure knowledge base, access complete audit logs
- **Org Admin** → can create and manage support tickets, access company documentation, view company audit logs

**No change needed** - both have `tickets: 'full'` scope.

---

## Part C - Summary Table

| # | File | Location | Change Description |
|---|------|----------|--------------------|
| A1 | server.js | `getScopedQueryFilters()` (L666-668) | **CRITICAL BUG FIX**: Org Admin must be scoped to their own company, only Super Admin sees all companies |
| A2 | server.js | `seedPermissions()` (L225-266) | Add explicit Super Admin permission entries |
| A3 | server.js | `getPermissionScope()` (L516-530) | Add explicit Super Admin entry, differentiate from Org Admin |
| B1 | usePermissions.ts | `moduleAccessMap`, `roleCreationRules` | **No change** - already correct |
| B2 | utils/permissions.ts | `isAdminRole`, `getPermissionScope` | **No change** - already correct |
| B3 | AppContext.tsx | `loadUsers`, company subscription effect | **No change** - already correct |
| B4 | AdminPage.tsx | Multiple | **No change** - already correct |
| B5 | LeadsPage.tsx | L675, L712, L812, L931, L1077, L1220, L1633 | Replace `role === "admin"` with permission flags |
| B6 | SalesPage.tsx | L78-92, Edit/Delete buttons | Remove client filter, gate buttons with `canWrite` |
| B7 | PriceListPage.tsx | L220-241 | Replace static role gate with `hasModuleAccess` |
| B8 | Layout.tsx | Admin Panel link, role badge | **No change** - already correct |
| B9 | routes.tsx | RequireAdmin | **No change** - already correct |
| B10 | SettingsPage.tsx | Settings access | **No change** - both have `full` scope |
| B11 | BillingPage.tsx | Billing access | **No change** - both have `full` scope |
| B12 | SupportPage.tsx | Ticket access | **No change** - both have `full` scope |

---

## Part D - Post-Change Behavior Matrix

### Super Admin
| Module | Backend Scope | Frontend Behavior | Delete/Edit |
|--------|---------------|-------------------|-------------|
| Dashboard | full (all companies) | Platform-wide KPIs, all organizations, total users, revenue | N/A |
| Leads | full (all companies) | All leads across every organization | Edit: ✅, Delete: ✅ |
| Deals | full (all companies) | All deals from every organization | Edit: ✅, Delete: ✅ |
| Reports | full (all companies) | Reports from all organizations | N/A |
| Users | full (all companies) | All users across all organizations | Edit: ✅, Delete: ✅ |
| Settings | full | Global system settings, AI, integrations, security | N/A |
| Billing | full | All company subscriptions, pricing plans, invoices | N/A |
| Tickets | full | Every support ticket, respond, manage docs | N/A |
| Audit Logs | full (all companies) | Complete audit logs | N/A |

### Organization Admin
| Module | Backend Scope | Frontend Behavior | Delete/Edit |
|--------|---------------|-------------------|-------------|
| Dashboard | full (own company) | Company KPIs, revenue, active users, conversion rate | N/A |
| Leads | full (own company) | All company leads | Edit: ✅, Delete: ✅ |
| Deals | full (own company) | All company deals | Edit: ✅, Delete: ✅ |
| Reports | full (own company) | Company-wide reports | N/A |
| Users | full (own company) | All company users | Edit: ✅, Delete: ✅ |
| Settings | full (own company) | Company profile, organization settings | N/A |
| Billing | full (own company) | Company subscription, invoices, payment methods | N/A |
| Tickets | full (own company) | Company tickets, audit logs | N/A |
| Audit Logs | full (own company) | Company audit logs only | N/A |

---

## Part E - Files NOT Changed (Already Correct)

| File | Why No Change |
|------|---------------|
| `AdminPage.tsx` ROLE_CREATION_RULES | Super Admin → Org Admin only; Org Admin → all lower roles ✅ |
| `AdminPage.tsx` REPORTING_RULES | Org Admin reports to Super Admin ✅ |
| `AdminPage.tsx` canEdit/canDelete/canActivateDeactivate | Super Admin can manage anyone; Org Admin can manage anyone except Super Admin ✅ |
| `AdminPage.tsx` Subscriptions tab | Both can see subscriptions ✅ |
| `AdminPage.tsx` Bulk delete option | Both can bulk delete ✅ |
| `AdminPage.tsx` "Manage Subscription" button | Both can manage subscriptions ✅ |
| `AdminPage.tsx` Stats label | Shows "Total Users" for both ✅ |
| `AdminPage.tsx` availableRoles | Super Admin sees Org Admin only; Org Admin sees all lower roles ✅ |
| `AdminPage.tsx` useEffect role gate | Both can access Admin Panel ✅ |
| `routes.tsx` RequireAdmin | Uses canOpenAdminPanel which includes both ✅ |
| `Layout.tsx` Admin Panel link | Uses canOpenAdminPanel ✅ |
| `Layout.tsx` Role badge | Shows "Admin Access" for both ✅ |
| `usePermissions.ts` moduleAccessMap | Both have access to all modules ✅ |
| `usePermissions.ts` roleCreationRules | Super Admin → org_admin; Org Admin → all lower roles ✅ |
| `usePermissions.ts` canOpenAdminPanel | Includes both ✅ |
| `utils/permissions.ts` isAdminRole | Includes both ✅ |
| `utils/permissions.ts` getPermissionScope | Both return 'full' ✅ |
| `AppContext.tsx` loadUsers gate | Both can load users ✅ |
| `AppContext.tsx` company subscription effect | Both can access company data ✅ |
| `server.js` checkUserManagementAccess | Super Admin manages anyone; Org Admin manages same company except Super Admin ✅ |
| `server.js` requireRole | Uses exact role string matching ✅ |
| `server.js` isAdminRole | Includes both ✅ |