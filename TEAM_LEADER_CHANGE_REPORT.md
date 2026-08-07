# 👥 Team Leader Role - Implementation Change Report

## Overview

This report details every file and code location that needs to change to fully implement the **Team Leader** role as defined. The analysis covers both the **backend** (`server.js` in `vigozen`) and the **frontend** (`vigozen-src/src/app`).

---

## Part A - Backend Changes (server.js)

### A1. Fix `getPermissionScope` hierarchy (line 512-527)

**Location:** `server.js` → `getPermissionScope()` function

**Current Team Leader entry:**
```js
'Team Leader': { leads: 'team', deals: 'team', users: 'team', reports: 'team', settings: 'none', billing: 'none', tickets: 'team', activities: 'team', tasks: 'team', calendar: 'team' },
```

**Issues:**
1. Missing `contacts` module entirely
2. `users` is set to `'team'` which is correct (Team Leader manages only their team members)

**Required change:**
```js
'Team Leader': { leads: 'team', deals: 'team', users: 'team', reports: 'team', settings: 'none', billing: 'none', tickets: 'team', activities: 'team', tasks: 'team', calendar: 'team', contacts: 'team' },
```

---

### A2. Fix `role_permissions` seeding (line 241-247)

**Location:** `server.js` → `seedPermissions()` function

**Current Team Leader entries:**
```js
{ role: 'Team Leader', module: 'leads', permission: 'team' },
{ role: 'Team Leader', module: 'deals', permission: 'team' },
{ role: 'Team Leader', module: 'users', permission: 'team' },
{ role: 'Team Leader', module: 'reports', permission: 'team' },
{ role: 'Team Leader', module: 'settings', permission: 'none' },
{ role: 'Team Leader', module: 'billing', permission: 'none' },
```

**Required change - Add missing modules:**
```js
{ role: 'Team Leader', module: 'leads', permission: 'team' },
{ role: 'Team Leader', module: 'deals', permission: 'team' },
{ role: 'Team Leader', module: 'users', permission: 'team' },
{ role: 'Team Leader', module: 'reports', permission: 'team' },
{ role: 'Team Leader', module: 'settings', permission: 'none' },
{ role: 'Team Leader', module: 'billing', permission: 'none' },
{ role: 'Team Leader', module: 'contacts', permission: 'team' },   // NEW
{ role: 'Team Leader', module: 'tickets', permission: 'team' },    // NEW
{ role: 'Team Leader', module: 'activities', permission: 'team' }, // NEW
{ role: 'Team Leader', module: 'tasks', permission: 'team' },      // NEW
{ role: 'Team Leader', module: 'calendar', permission: 'team' },   // NEW
```

---

### A3. Add `contacts` module to `checkPermission` middleware usage

**Location:** `server.js` → Various route definitions

**Current state:** The `checkPermission('leads')`, `checkPermission('deals')` middleware is used on routes, but there's no `checkPermission('contacts')` on contact routes.

**Required change:** Add `checkPermission('contacts')` middleware to all contact-related routes (GET/POST/PUT/DELETE `/contacts`).

---

### A4. Verify `checkUserManagementAccess` for Team Leader (line 529-588)

**Location:** `server.js` → `checkUserManagementAccess()` function

**Current state (CORRECT):**
```js
// - Team Leader can edit/manage only Sales Executives reporting to them
else if (currentRoleLower === 'team leader' || currentRoleLower === 'team_leader') {
  if (!['sales executive', 'sales_executive'].includes(targetRoleLower)) {
    return { allowed: false, error: "Team Leader can only manage Sales Executives" };
  }
}
```

**No change needed** - this already matches the role definition (Team Leader can only manage Sales Executives under them).

---

### A5. Verify `getScopedQueryFilters` for Team Leader (line 662-729)

**Location:** `server.js` → `getScopedQueryFilters()` function

**Current state (CORRECT):**
- `team` scope → uses `getSubordinateUserIds` to filter by owner_id
- `contacts` table already supported (line 686-695)
- `tickets`, `tasks`, `calendar` tables already supported

**No change needed** - this already correctly scopes data for Team Leader.

---

### A6. Verify `requireRole` middleware (line 492-507)

**Location:** `server.js` → `requireRole()` function

**Current state (CORRECT):** Uses exact role string matching. Team Leader role string is `'Team Leader'`.

**No change needed.**

---

## Part B - Frontend Changes (vigozen-src/src/app)

### B1. Update `src/app/hooks/usePermissions.ts`

**Location:** `moduleAccessMap` (line 57-69)

**Current team_leader entry:**
```ts
'team_leader': ['leads', 'contacts', 'deals', 'users', 'reports', 'tickets', 'activities'],
```

**Issues:**
1. Missing `tasks` and `calendar` modules

**Required change:**
```ts
'team_leader': ['leads', 'contacts', 'deals', 'users', 'reports', 'tickets', 'activities', 'tasks', 'calendar'],
```

**Also verify `canOpenAdminPanel` (line 90):**
```ts
const canOpenAdminPanel = ['super_admin', 'org_admin', 'admin', 'sales_manager', 'lead_manager', 'team_leader'].includes(role);
```
**CORRECT** - Team Leader can open Admin Panel.

**Verify `roleCreationRules` (line 76):**
```ts
'team_leader': ['sales_executive'],
```
**CORRECT** - Team Leader can only create Sales Executives.

---

### B2. Update `src/app/utils/permissions.ts`

**Location:** `hasModuleAccess` and `canWrite` functions

**Current state:** These functions are basic and don't handle the `team` scope distinction properly for Team Leader.

**Required change:** Add a `getPermissionScope` helper that maps Team Leader to `team` scope for leads/deals/reports/contacts/users/tickets/activities/tasks/calendar, and `none` for settings/billing.

---

### B3. Update `src/app/context/AppContext.tsx`

**Change 1 - `loadUsers` gate (line 860):**
```ts
// BEFORE:
const isAdmin = role === 'Super Admin' || role === 'super_admin' || role === 'Org Admin' || role === 'admin';
// AFTER:
const isAdmin = isAdminRole(role) || role === 'Sales Manager' || role === 'sales_manager' || role === 'Team Leader' || role === 'team_leader';
```

**Why:** Team Leader needs to load their team members in the Admin Panel.

**Change 2 - Company subscription effect (line 820-828):**
```ts
// BEFORE:
if (userProfile?.id && role === "admin") {
// AFTER:
if (userProfile?.id && (isAdminRole(role) || role === 'Sales Manager' || role === 'sales_manager' || role === 'Team Leader' || role === 'team_leader')) {
```

**Why:** Team Leader needs company subscription info for user limit checks when creating Sales Executives.

**Change 3 - Add `permissions` state (new):**
Add a `permissions` state object to store the backend permission matrix, fetched from `/auth/permissions` endpoint.

---

### B4. Update `src/app/pages/AdminPage.tsx`

**Change 1 - `ROLE_CREATION_RULES` (line 32-43):**
```ts
'Team Leader': ['Sales Executive'],
```
**CORRECT** - matches role definition.

**Change 2 - `REPORTING_RULES` (line 46-55):**
```ts
'Team Leader': ['Sales Manager', 'Org Admin'],
```
**CORRECT** - matches role definition (Team Leader reports to Sales Manager).

**Change 3 - `canEdit` logic (line 770-775):**
```ts
(role === 'Team Leader' && isTargetSubordinate && user.role === 'Sales Executive') ||
```
**CORRECT** - Team Leader can edit Sales Executives under them.

**Change 4 - `canDelete` logic (line 777-781):**
```ts
const canDelete = !isSelf && (role === 'Super Admin' || ... || ((role === 'Org Admin' || role === 'org_admin' || role === 'admin') && ...));
```
**CORRECT** - Team Leader cannot delete users.

**Change 5 - `canActivateDeactivate` logic (line 783-790):**
```ts
(role === 'Team Leader' && isTargetSubordinate && user.role === 'Sales Executive')
```
**CORRECT** - Team Leader can activate/deactivate Sales Executives under them.

**Change 6 - Bulk action toolbar (line 655):**
```tsx
{selectedUsers.length > 0 && role !== "Team Leader" && (
```
**REVIEW NEEDED** - Currently Team Leader is EXCLUDED from bulk actions. Per the role definition, Team Leader can activate/deactivate Sales Executives. Consider allowing bulk activate/deactivate for Team Leader but NOT bulk delete/assign_department/assign_role.

**Recommended change:**
```tsx
{selectedUsers.length > 0 && (
  <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-200 w-full flex-wrap">
    <span className="text-sm font-medium text-indigo-700">{selectedUsers.length} users selected</span>
    <select ...>
      <option value="">Select Action</option>
      <option value="activate">Activate</option>
      <option value="deactivate">Deactivate</option>
      {isAdmin && <option value="delete">Delete</option>}
      {isAdmin && <option value="assign_department">Assign Department</option>}
      {isAdmin && <option value="assign_role">Assign Role</option>}
    </select>
    ...
  </div>
)}
```

**Why:** Team Leader should be able to bulk activate/deactivate their Sales Executives, but NOT bulk delete, assign department, or assign role (those are admin-only).

**Change 7 - Bulk action delete option (line 666):**
```tsx
{isAdmin && <option value="delete">Delete</option>}
```
**CORRECT** - Team Leader cannot bulk delete.

**Change 8 - Subscriptions tab (line 582-591):**
```tsx
{isAdmin && (
  <button onClick={() => { setActiveTab("subscriptions" as any); fetchSubscriptions(); }}>
```
**CORRECT** - Team Leader cannot see subscriptions tab.

**Change 9 - "Manage Subscription" button (line 482-489):**
```tsx
{isAdmin && (
  <button onClick={() => navigate("/subscription")}>
```
**CORRECT** - Team Leader cannot manage subscriptions.

**Change 10 - Stats label (line 511-514):**
```tsx
role === "Team Leader" ? "Team Members" :
```
**CORRECT** - Shows "Team Members" for Team Leader.

**Change 11 - `availableRoles` (line 206-210):**
```ts
const userRole = userProfile?.role || 'Sales Executive';
const roles = ROLE_CREATION_RULES[userRole] || ['Sales Executive'];
```
**CORRECT** - Team Leader sees only Sales Executive option.

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
**CORRECT** - Team Leader can access Admin Panel.

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

**Why:** Team Leader has `team` scope for leads → can see all team leads, assign leads to Sales Executives, but cannot delete (only `full` scope can delete).

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

**Why:** The backend already scopes `/deals` via `getScopedQueryFilters` (team scope for Team Leader). Re-filtering on the frontend double-restricts data.

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

**Why:** Team Leader has `team` scope for deals → can edit team deals but should not delete (only `full` scope can delete).

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

**Why:** Team Leader has `billing: 'none'` → cannot access billing/pricing pages.

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

**Why:** Team Leader has access to contacts, tasks, and calendar per the role definition.

**Change 2 - Admin Panel link (line 206-236):**
```tsx
{canOpenAdminPanel && (
```
**CORRECT** - Team Leader can see Admin Panel link.

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
**CORRECT** - Uses `canOpenAdminPanel` which includes team_leader.

---

### B10. Update `src/app/pages/SettingsPage.tsx`

**Change 1 - Restrict to own profile only for Team Leader:**
```ts
const canAccessCompanySettings = hasModuleAccess(permissions, 'settings', ['full']);
// Team Leader: settings = 'none' → only show personal settings
```

**Why:** Team Leader can only update own profile, change password, enable 2FA, configure personal notifications. Cannot modify company settings.

---

### B11. Update `src/app/pages/BillingPage.tsx`

**Change 1 - Restrict access:**
```ts
const canAccessBilling = hasModuleAccess(permissions, 'billing', ['full']);
if (!canAccessBilling) {
  return <AccessRestricted />;
}
```

**Why:** Team Leader has `billing: 'none'` → completely restricted.

---

### B12. Update `src/app/pages/SupportPage.tsx`

**Change 1 - Restrict to team tickets:**
```ts
const canViewAllTickets = hasModuleAccess(permissions, 'tickets', ['full', 'dept', 'team']);
// Team Leader: tickets = 'team' → can view team tickets
```

**Why:** Team Leader can create support tickets and view team-related tickets, but cannot manage company-wide support requests.

---

## Part C - Summary Table

| # | File | Location | Change Description |
|---|------|----------|--------------------|
| A1 | server.js | `getPermissionScope()` (L512-527) | Add `contacts` module to Team Leader entry |
| A2 | server.js | `seedPermissions()` (L241-247) | Add contacts, tickets, activities, tasks, calendar for Team Leader |
| A3 | server.js | Contact routes | Add `checkPermission('contacts')` middleware |
| B1 | usePermissions.ts | `moduleAccessMap` (L57-69) | Add `tasks`, `calendar` to team_leader |
| B2 | utils/permissions.ts | `hasModuleAccess`, `canWrite` | Add scope-aware permission helpers |
| B3 | AppContext.tsx | `loadUsers` (L860), effect (L820) | Include Team Leader in admin gates |
| B4 | AdminPage.tsx | Bulk action toolbar (L655) | Allow Team Leader bulk activate/deactivate, restrict delete/assign |
| B5 | LeadsPage.tsx | L675, L712, L812, L931, L1077, L1220, L1633 | Replace `role === "admin"` with permission flags |
| B6 | SalesPage.tsx | L78-92, Edit/Delete buttons | Remove client filter, gate buttons with `canWrite` |
| B7 | PriceListPage.tsx | L220-241 | Replace static role gate with `hasModuleAccess` |
| B8 | Layout.tsx | navItems (L15-22) | Add Contacts, Tasks, Calendar nav items |
| B9 | routes.tsx | Route definitions | Add routes for Contacts, Tasks, Calendar pages |
| B10 | SettingsPage.tsx | Settings access | Restrict to own profile only for Team Leader |
| B11 | BillingPage.tsx | Billing access | Restrict completely for Team Leader |
| B12 | SupportPage.tsx | Ticket access | Restrict to team tickets |

---

## Part D - Post-Change Behavior Matrix for Team Leader

| Module | Backend Scope | Frontend Behavior | Delete/Edit |
|--------|---------------|-------------------|-------------|
| Dashboard | team | Team KPIs, lead count, deal progress, conversion rate | N/A |
| Leads | team | All team leads, create/edit/assign/import/export | Edit: ✅, Delete: ❌ |
| Contacts | team | All team contacts, create/edit/assign | Edit: ✅, Delete: ❌ |
| Deals | team | All team deals, create/edit/assign/kanban | Edit: ✅, Delete: ❌ |
| Reports | team | Team reports, Sales Executive performance, export | N/A |
| Users | team | Only Sales Executives under them | Edit: ✅, Delete: ❌ |
| Tasks | team | Team tasks | Edit: ✅, Delete: ❌ |
| Calendar | team | Team events | Edit: ✅, Delete: ❌ |
| Help & Support | team | Create tickets, view team tickets | N/A |
| AI Insights | team | Team-level AI insights | N/A |
| Settings | none | Own profile only | N/A |
| Billing | none | Completely restricted | N/A |
| Subscription | none | Completely restricted | N/A |
| Audit Logs | team | Team activities only | N/A |

---

## Part E - Files NOT Changed (Already Correct)

| File | Why No Change |
|------|---------------|
| `AdminPage.tsx` ROLE_CREATION_RULES | Team Leader can only create Sales Executive ✅ |
| `AdminPage.tsx` REPORTING_RULES | Team Leader reports to Sales Manager ✅ |
| `AdminPage.tsx` canEdit/canDelete/canActivateDeactivate | Correctly scoped to Sales Executives under them ✅ |
| `AdminPage.tsx` Subscriptions tab | Only for isAdmin ✅ |
| `AdminPage.tsx` Bulk delete option | Only for isAdmin ✅ |
| `AdminPage.tsx` "Manage Subscription" button | Only for isAdmin ✅ |
| `AdminPage.tsx` Stats label | Shows "Team Members" for Team Leader ✅ |
| `AdminPage.tsx` availableRoles | Team Leader sees only Sales Executive ✅ |
| `AdminPage.tsx` useEffect role gate | Team Leader can access Admin Panel ✅ |
| `routes.tsx` RequireAdmin | Uses canOpenAdminPanel which includes team_leader ✅ |
| `Layout.tsx` Admin Panel link | Uses canOpenAdminPanel ✅ |
| `server.js` checkUserManagementAccess | Team Leader can only manage Sales Executives ✅ |
| `server.js` getScopedQueryFilters | Correctly scopes team data ✅ |
| `server.js` requireRole | Uses exact role string matching ✅ |
| `usePermissions.ts` canOpenAdminPanel | Includes team_leader ✅ |
| `usePermissions.ts` roleCreationRules | Team Leader can only create sales_executive ✅ |