# 👔 Sales Manager Role - Implementation Change Report

## Overview

This report details every file and code location that needs to change to fully implement the **Sales Manager** role as defined. The analysis covers both the **backend** (`server.js` in `vigozen`) and the **frontend** (`vigozen-src/src/app`).

---

## Part A - Backend Changes (server.js)

### A1. Fix `getPermissionScope` hierarchy (line 512-527)

**Location:** `server.js` → `getPermissionScope()` function

**Current Sales Manager entry:**
```js
'Sales Manager': { leads: 'dept', deals: 'dept', users: 'dept', reports: 'dept', settings: 'none', billing: 'none', tickets: 'dept', activities: 'dept', tasks: 'dept', calendar: 'dept' },
```

**Issues:**
1. `users` is set to `'dept'` but the role definition says Sales Manager manages only their **team** (Team Leaders + Sales Executives under them) → should be `'team'`
2. Missing `contacts` module entirely
3. Missing `tasks` and `calendar` modules for some roles

**Required change:**
```js
'Sales Manager': { leads: 'dept', deals: 'dept', users: 'team', reports: 'dept', settings: 'none', billing: 'none', tickets: 'dept', activities: 'dept', tasks: 'dept', calendar: 'dept', contacts: 'dept' },
```

---

### A2. Fix `role_permissions` seeding bug (line 234-240, 259)

**Location:** `server.js` → `seedPermissions()` function

**Current bug:** Line 259 has a duplicate Sales Manager users entry:
```js
{ role: 'Sales Manager', module: 'users', permission: 'team' },  // line 259 - DUPLICATE
```

**Required change:**
- Remove the duplicate at line 259
- Update the Sales Manager `users` permission from `'dept'` to `'team'` at line 237
- Add `contacts` module for Sales Manager:
```js
{ role: 'Sales Manager', module: 'contacts', permission: 'dept' },
```

---

### A3. Add `contacts` module to `checkPermission` middleware usage

**Location:** `server.js` → Various route definitions

**Current state:** The `checkPermission('leads')`, `checkPermission('deals')` middleware is used on routes, but there's no `checkPermission('contacts')` on contact routes.

**Required change:** Add `checkPermission('contacts')` middleware to all contact-related routes (GET/POST/PUT/DELETE `/contacts`).

---

### A4. Verify `checkUserManagementAccess` for Sales Manager (line 529-588)

**Location:** `server.js` → `checkUserManagementAccess()` function

**Current state (CORRECT):**
- Sales Manager can only manage Team Leaders and Sales Executives under them (line 567-571)
- Uses `getSubordinateUserIds` to verify reporting hierarchy
- Cannot manage Org Admin, Super Admin, or other Sales Managers

**No change needed** - this already matches the role definition.

---

### A5. Verify `getScopedQueryFilters` for Sales Manager (line 662-729)

**Location:** `server.js` → `getScopedQueryFilters()` function

**Current state (CORRECT):**
- `dept` scope → uses `getSubordinateUserIds` to filter by owner_id
- `team` scope → same subordinate filtering
- `contacts` table already supported (line 686-695)

**No change needed** - this already correctly scopes data for Sales Manager.

---

### A6. Verify `requireRole` middleware (line 492-507)

**Location:** `server.js` → `requireRole()` function

**Current state (CORRECT):** Uses exact role string matching. Sales Manager role string is `'Sales Manager'`.

**No change needed.**

---

## Part B - Frontend Changes (vigozen-src/src/app)

### B1. Update `src/app/hooks/usePermissions.ts`

**Location:** `moduleAccessMap` (line 57-69)

**Current sales_manager entry:**
```ts
'sales_manager': ['leads', 'contacts', 'deals', 'users', 'reports', 'tickets', 'activities'],
```

**Issues:**
1. Missing `tasks` and `calendar` modules
2. Missing `settings` (should be own-profile only, but the module map doesn't distinguish)

**Required change:**
```ts
'sales_manager': ['leads', 'contacts', 'deals', 'users', 'reports', 'tickets', 'activities', 'tasks', 'calendar'],
```

**Also update `canOpenAdminPanel` (line 90):**
```ts
const canOpenAdminPanel = ['super_admin', 'org_admin', 'admin', 'sales_manager', 'lead_manager', 'team_leader'].includes(role);
```
This is **CORRECT** - Sales Manager can open Admin Panel.

---

### B2. Update `src/app/utils/permissions.ts`

**Location:** `hasModuleAccess` and `canWrite` functions

**Current state:** These functions are basic and don't handle the `dept`/`team`/`own` scope distinction properly for Sales Manager.

**Required change:** Add a `getPermissionScope` helper that maps Sales Manager to `dept` scope for leads/deals/reports/contacts, `team` for users, and `none` for settings/billing.

---

### B3. Update `src/app/context/AppContext.tsx`

**Change 1 - `loadUsers` gate (line 860):**
```ts
// BEFORE:
const isAdmin = role === 'Super Admin' || role === 'super_admin' || role === 'Org Admin' || role === 'admin';
// AFTER:
const isAdmin = isAdminRole(role) || role === 'Sales Manager' || role === 'sales_manager';
```

**Why:** Sales Manager needs to load department users in the Admin Panel.

**Change 2 - Company subscription effect (line 820-828):**
```ts
// BEFORE:
if (userProfile?.id && role === "admin") {
// AFTER:
if (userProfile?.id && (isAdminRole(role) || role === 'Sales Manager' || role === 'sales_manager')) {
```

**Why:** Sales Manager needs company subscription info for user limit checks.

**Change 3 - Add `permissions` state (new):**
Add a `permissions` state object to store the backend permission matrix, fetched from `/auth/permissions` endpoint.

---

### B4. Update `src/app/pages/AdminPage.tsx`

**Change 1 - `ROLE_CREATION_RULES` (line 32-43):**
```ts
'Sales Manager': ['Team Leader', 'Sales Executive'],
```
**CORRECT** - matches role definition.

**Change 2 - `REPORTING_RULES` (line 46-55):**
```ts
'Sales Manager': ['Org Admin'],
```
**CORRECT** - matches role definition.

**Change 3 - `canEdit` logic (line 770-775):**
```ts
(role === 'Sales Manager' && isTargetSubordinate && ['Team Leader', 'Sales Executive'].includes(user.role)) ||
```
**CORRECT** - Sales Manager can edit Team Leaders and Sales Executives under them.

**Change 4 - `canDelete` logic (line 777-781):**
```ts
const canDelete = !isSelf && (role === 'Super Admin' || ... || ((role === 'Org Admin' || role === 'org_admin' || role === 'admin') && ...));
```
**CORRECT** - Sales Manager cannot delete users.

**Change 5 - `canActivateDeactivate` logic (line 783-790):**
```ts
(role === 'Sales Manager' && isTargetSubordinate && ['Team Leader', 'Sales Executive'].includes(user.role)) ||
```
**CORRECT** - Sales Manager can activate/deactivate subordinates.

**Change 6 - Bulk action toolbar (line 655):**
```tsx
{selectedUsers.length > 0 && role !== "Team Leader" && (
```
**CORRECT** - Sales Manager sees bulk actions.

**Change 7 - Bulk action delete option (line 666):**
```tsx
{isAdmin && <option value="delete">Delete</option>}
```
**CORRECT** - Sales Manager cannot bulk delete.

**Change 8 - Subscriptions tab (line 582-591):**
```tsx
{isAdmin && (
  <button onClick={() => { setActiveTab("subscriptions" as any); fetchSubscriptions(); }}>
```
**CORRECT** - Sales Manager cannot see subscriptions tab.

**Change 9 - "Manage Subscription" button (line 482-489):**
```tsx
{isAdmin && (
  <button onClick={() => navigate("/subscription")}>
```
**CORRECT** - Sales Manager cannot manage subscriptions.

**Change 10 - Stats label (line 511-514):**
```tsx
role === "Sales Manager" ? "Department Users" :
```
**CORRECT** - Shows "Department Users" for Sales Manager.

**Change 11 - `availableRoles` (line 206-210):**
```ts
const userRole = userProfile?.role || 'Sales Executive';
const roles = ROLE_CREATION_RULES[userRole] || ['Sales Executive'];
```
**CORRECT** - Sales Manager sees only Team Leader and Sales Executive options.

**Change 12 - `getAvailableManagers` (line 291-298):**
```ts
const allowedManagerRoles = REPORTING_RULES[selectedRole] || [];
```
**CORRECT** - Uses reporting rules to filter managers.

**Change 13 - `useEffect` role gate (line 254-258):**
```ts
const allowed = ['Super Admin', 'Org Admin', 'admin', 'Sales Manager', 'Lead Manager', 'Team Leader'];
if (!allowed.includes(role)) { navigate("/"); return; }
```
**CORRECT** - Sales Manager can access Admin Panel.

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
const canAssignLeads     = hasModuleAccess(permissions, 'leads', ['full', 'dept']);
```

**Why:** Sales Manager has `dept` scope for leads → can see all department leads, assign leads, but cannot delete (only `full` scope can delete).

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

**Why:** The backend already scopes `/deals` via `getScopedQueryFilters` (dept scope for Sales Manager). Re-filtering on the frontend double-restricts data.

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

**Why:** Sales Manager has `dept` scope for deals → can edit deals but should not delete (only `full` scope can delete).

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

**Why:** Sales Manager has `billing: 'none'` → cannot access billing/pricing pages.

---

### B8. Update `src/app/components/Layout.tsx`

**Change 1 - Add Contacts, Tasks, Calendar nav items (line 15-22):**
```ts
const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, end: true, module: "leads" },
  { path: "/leads", label: "Leads", icon: Users, module: "leads" },
  { path: "/contacts", label: "Contacts", icon: Users, module: "contacts" },  // NEW
  { path: "/sales", label: "Sales", icon: TrendingUp, module: "deals" },
  { path: "/analysis", label: "Reports", icon: BarChart3, module: "reports" },
  { path: "/tasks", label: "Tasks", icon: CheckSquare, module: "tasks" },  // NEW
  { path: "/calendar", label: "Calendar", icon: Calendar, module: "calendar" },  // NEW
  { path: "/help", label: "Help & Support", icon: HelpCircle, module: "leads" },
  { path: "/settings", label: "Settings", icon: Settings, module: "settings" },
];
```

**Why:** Sales Manager has access to contacts, tasks, and calendar per the role definition.

**Change 2 - Admin Panel link (line 206-236):**
```tsx
{canOpenAdminPanel && (
```
**CORRECT** - Sales Manager can see Admin Panel link.

---

### B9. Update `src/app/routes.tsx`

**Change 1 - Add route guards for new pages:**
```tsx
{ path: "contacts", Component: () => (<RequireSubscription><LazyRoute Component={ContactsPage} /></RequireSubscription>) },
{ path: "tasks", Component: () => (<RequireSubscription><LazyRoute Component={TasksPage} /></RequireSubscription>) },
{ path: "calendar", Component: () => (<RequireSubscription><LazyRoute Component={CalendarPage} /></RequireSubscription>) },
```

**Change 2 - `RequireAdmin` guard (line 61-75):**
```tsx
const { canOpenAdminPanel } = usePermissions();
```
**CORRECT** - Uses `canOpenAdminPanel` which includes sales_manager.

---

### B10. Update `src/app/pages/SettingsPage.tsx`

**Change 1 - Restrict to own profile only for Sales Manager:**
```ts
const canAccessCompanySettings = hasModuleAccess(permissions, 'settings', ['full']);
// Sales Manager: settings = 'none' → only show personal settings
```

**Why:** Sales Manager can only update own profile, change password, enable 2FA, configure personal notifications. Cannot modify company settings.

---

### B11. Update `src/app/pages/BillingPage.tsx`

**Change 1 - Restrict access:**
```ts
const canAccessBilling = hasModuleAccess(permissions, 'billing', ['full']);
if (!canAccessBilling) {
  return <AccessRestricted />;
}
```

**Why:** Sales Manager has `billing: 'none'` → completely restricted.

---

### B12. Update `src/app/pages/SupportPage.tsx`

**Change 1 - Restrict to department tickets:**
```ts
const canViewAllTickets = hasModuleAccess(permissions, 'tickets', ['full', 'dept']);
// Sales Manager: tickets = 'dept' → can view department tickets
```

**Why:** Sales Manager can create support tickets and view department tickets, but cannot manage organization-wide support settings.

---

## Part C - Summary Table

| # | File | Location | Change Description |
|---|------|----------|--------------------|
| A1 | server.js | `getPermissionScope()` (L512-527) | Fix Sales Manager `users` to `'team'`, add `contacts` module |
| A2 | server.js | `seedPermissions()` (L234-240, L259) | Remove duplicate, fix users to `'team'`, add contacts |
| A3 | server.js | Contact routes | Add `checkPermission('contacts')` middleware |
| B1 | usePermissions.ts | `moduleAccessMap` (L57-69) | Add `tasks`, `calendar` to sales_manager |
| B2 | utils/permissions.ts | `hasModuleAccess`, `canWrite` | Add scope-aware permission helpers |
| B3 | AppContext.tsx | `loadUsers` (L860), effect (L820) | Include Sales Manager in admin gates |
| B4 | AdminPage.tsx | Multiple | Verify role creation/reporting rules (mostly correct) |
| B5 | LeadsPage.tsx | L675, L712, L812, L931, L1077, L1220, L1633 | Replace `role === "admin"` with permission flags |
| B6 | SalesPage.tsx | L78-92, Edit/Delete buttons | Remove client filter, gate buttons with `canWrite` |
| B7 | PriceListPage.tsx | L220-241 | Replace static role gate with `hasModuleAccess` |
| B8 | Layout.tsx | navItems (L15-22) | Add Contacts, Tasks, Calendar nav items |
| B9 | routes.tsx | Route definitions | Add routes for Contacts, Tasks, Calendar pages |
| B10 | SettingsPage.tsx | Settings access | Restrict to own profile only for Sales Manager |
| B11 | BillingPage.tsx | Billing access | Restrict completely for Sales Manager |
| B12 | SupportPage.tsx | Ticket access | Restrict to department tickets |

---

## Part D - Post-Change Behavior Matrix for Sales Manager

| Module | Backend Scope | Frontend Behavior | Delete/Edit |
|--------|---------------|-------------------|-------------|
| Dashboard | dept | Department KPIs, team performance, revenue | N/A |
| Leads | dept | All department leads, create/edit/assign/import/export | Edit: ✅, Delete: ❌ |
| Contacts | dept | All department contacts, create/edit/assign | Edit: ✅, Delete: ❌ |
| Deals | dept | All department deals, create/edit/assign/kanban | Edit: ✅, Delete: ❌ |
| Reports | dept | Department reports, employee-wise, export | N/A |
| Users | team | Only Team Leaders + Sales Executives under them | Edit: ✅, Delete: ❌ |
| Tasks | dept | Department tasks | Edit: ✅, Delete: ❌ |
| Calendar | dept | Department events | Edit: ✅, Delete: ❌ |
| Help & Support | dept | Create tickets, view department tickets | N/A |
| AI Insights | dept | Department-level AI insights | N/A |
| Settings | none | Own profile only | N/A |
| Billing | none | Completely restricted | N/A |
| Subscription | none | Completely restricted | N/A |
| Audit Logs | dept | Department activities only | N/A |

---

## Part E - Files NOT Changed (Already Correct)

| File | Why No Change |
|------|---------------|
| `AdminPage.tsx` ROLE_CREATION_RULES | Sales Manager can only create Team Leader + Sales Executive ✅ |
| `AdminPage.tsx` REPORTING_RULES | Sales Manager reports to Org Admin ✅ |
| `AdminPage.tsx` canEdit/canDelete/canActivateDeactivate | Correctly scoped to subordinates ✅ |
| `AdminPage.tsx` Subscriptions tab | Only for isAdmin ✅ |
| `AdminPage.tsx` Bulk delete option | Only for isAdmin ✅ |
| `routes.tsx` RequireAdmin | Uses canOpenAdminPanel which includes sales_manager ✅ |
| `Layout.tsx` Admin Panel link | Uses canOpenAdminPanel ✅ |
| `server.js` checkUserManagementAccess | Sales Manager can only manage Team Leaders + Sales Executives ✅ |
| `server.js` getScopedQueryFilters | Correctly scopes dept/team data ✅ |
| `server.js` requireRole | Uses exact role string matching ✅ |