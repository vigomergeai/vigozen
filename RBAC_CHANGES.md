# RBAC & Permission Alignment - Implementation Change List

This document specifies every change required to align the static frontend role checks with the dynamic backend permission scopes, based on the audit report.

---

## Part A - Backend Changes (server.js)

### A1. Extend /auth/login response to include permissions

**File:** server.js
**Function:** app.post("/auth/login", ...) - response built at lines 2958-2968

**Why:** The frontend needs the user's permission matrix at login time so UI controls can be gated dynamically.

**Before:**
```js
res.json({
  token,
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    company_id: user.company_id,
    role: user.role,
    department: user.department
  }
});
```

**After:**
```js
// Query the role_permissions matrix (company-specific overrides take priority)
const permRes = await pool.query(
  `SELECT module, permission FROM role_permissions
   WHERE role = $1 AND (company_id = $2 OR company_id IS NULL)
   ORDER BY company_id DESC NULLS LAST`,
  [user.role, user.company_id]
);

// Build { module: scope } map, e.g. { leads: "dept", deals: "dept", ... }
const permissions = {};
for (const p of permRes.rows) permissions[p.module] = p.permission;

// Fallback to static hierarchy if DB has no entries
if (Object.keys(permissions).length === 0) {
  ['leads','deals','users','reports','settings','billing','tickets','activities','tasks','calendar']
    .forEach(m => { permissions[m] = getPermissionScope(user.role, m); });
}

res.json({
  token,
  user: { id, name, email, company_id, role, department },
  permissions                     // NEW FIELD
});
```

---

### A2. Extend /profile endpoint to include permissions

**File:** server.js
**Function:** app.get("/profile", ...) - lines 2977-2990

**Before:**
```js
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**After:**
```js
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, company_id, department,
              manager_id, team_id, avatar_url, phone
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = result.rows[0];

    // Same permissions merge as login (A1)
    const permRes = await pool.query(
      `SELECT module, permission FROM role_permissions
       WHERE role = $1 AND (company_id = $2 OR company_id IS NULL)
       ORDER BY company_id DESC NULLS LAST`,
      [user.role, user.company_id]
    );
    const permissions = {};
    for (const p of permRes.rows) permissions[p.module] = p.permission;
    if (Object.keys(permissions).length === 0) {
      ['leads','deals','users','reports','settings','billing','tickets','activities','tasks','calendar']
        .forEach(m => { permissions[m] = getPermissionScope(user.role, m); });
    }

    res.json({ ...user, permissions });    // permissions added
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

---

### A3. Add new endpoint GET /auth/permissions

**File:** server.js
**Placement:** Immediately after /profile handler (after line 2990)

**Purpose:** Dedicated lightweight endpoint so the frontend can refresh the permission matrix at any time (e.g., after role change).

```js
// Get Permission Matrix for Current User
app.get("/auth/permissions", authenticateToken, async (req, res) => {
  try {
    const { role, company_id } = req.user;
    const permRes = await pool.query(
      `SELECT module, permission FROM role_permissions
       WHERE role = $1 AND (company_id = $2 OR company_id IS NULL)
       ORDER BY company_id DESC NULLS LAST`,
      [role, company_id]
    );
    const permissions = {};
    for (const p of permRes.rows) permissions[p.module] = p.permission;
    if (Object.keys(permissions).length === 0) {
      ['leads','deals','users','reports','settings','billing','tickets','activities','tasks','calendar']
        .forEach(m => { permissions[m] = getPermissionScope(role, m); });
    }
    res.json({ role, permissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

---

### A4. Fix hardcoded admin checks in audit-logs and bulk-action

**File:** server.js
**Functions:**
- app.get("/api/audit-logs", ...) - line 4113 route, line 4115 inner check
- app.post("/users/bulk/action", ...) - line 4166 route, line 4168 inner check

**Change:** Both currently do `if (req.user.role !== 'admin')` which blocks Org Admin / org_admin. Replace with the centralized isAdminRole() helper (already defined at line 510).

**Before:**
```js
app.get("/api/audit-logs", authenticateToken, requireRole(['admin', 'super_admin', 'org_admin']), async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  ...
```

**After:**
```js
app.get("/api/audit-logs", authenticateToken, requireRole(['admin', 'super_admin', 'org_admin', 'Org Admin', 'Super Admin']), async (req, res) => {
  if (!isAdminRole(req.user.role)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  ...
```

(Apply the same two changes to /users/bulk/action.)

---

### A5. Fix comment edit/delete admin checks

**File:** server.js
**Functions:**
- app.put("/leads/:id/comments/:commentId", ...) - line 2236
- app.delete("/leads/:id/comments/:commentId", ...) - line 2280

**Before:**
```js
if (req.user.role !== 'admin') {
  return res.status(403).json({ error: "Only admins are allowed to edit comments" });
}
```

**After:**
```js
if (!isAdminRole(req.user.role)) {
  return res.status(403).json({ error: "Only admins are allowed to edit comments" });
}
```

---

## Part B - Frontend Changes (vigozen-src/src/app)

### B1. NEW FILE src/app/utils/permissions.ts

Create central permission/role helpers used by every page:

```ts
// Central Role Normalization
export function normalizeRole(role: string | null | undefined): string {
  const lower = String(role || '').toLowerCase().replace(/[_-\s]/g, '');
  switch (lower) {
    case 'superadmin':    return 'Super Admin';
    case 'orgadmin':      return 'Org Admin';
    case 'admin':         return 'admin';
    case 'salesmanager':  return 'Sales Manager';
    case 'teamleader':    return 'Team Leader';
    case 'salesexecutive': return 'Sales Executive';
    case 'leadmanager':   return 'Lead Manager';
    case 'leadexecutive': return 'Lead Executive';
    case 'telecaller':    return 'Telecaller';
    case 'leadqualifier': return 'Lead Qualifier';
    case 'user':
    case 'sales':         return 'Sales Executive';
    default:              return role || 'Sales Executive';
  }
}

// Single source of truth for admin checks
export function isAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = String(role).toLowerCase().replace(/[_-\s]/g, '');
  return ['superadmin', 'orgadmin', 'admin'].includes(normalized);
}

// Module-level access check using the backend permission matrix
export function hasModuleAccess(
  permissions: Record<string, string> | null | undefined,
  module: string,
  requiredScope: string[] = ['full', 'dept', 'team', 'own', 'view'],
): boolean {
  if (!permissions) return false;
  const scope = permissions[module];
  if (!scope || scope === 'none') return false;
  return requiredScope.includes(scope);
}

// Write access (create/edit/delete) for a module
export function canWrite(
  permissions: Record<string, string> | null | undefined,
  module: string,
): boolean {
  const scope = permissions?.[module];
  return scope === 'full' || scope === 'dept' || scope === 'team' || scope === 'own';
}
```

---

### B2. Update src/app/context/AppContext.tsx

**Change 1 - Import helpers and add type (top, after line 5):**
```ts
import { isAdminRole } from "../utils/permissions";
```
Add to AppContextType interface (near line 167):
```ts
permissions: Record<string, string>;
```

**Change 2 - Add state (near line 345):**
```ts
const [permissions, setPermissions] = useState<Record<string, string>>({});
```

**Change 3 - Add fetchPermissions() (after getToken, ~line 855):**
```ts
const fetchPermissions = async (): Promise<void> => {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/auth/permissions`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.permissions) {
        setPermissions(data.permissions);
        localStorage.setItem("permissions", JSON.stringify(data.permissions));
      }
    }
  } catch (e) {
    console.warn("fetchPermissions error:", e);
  }
};
```

**Change 4 - Load cached permissions on init (in initAuth, after line 543):**
```ts
const savedPerms = localStorage.getItem("permissions");
if (savedPerms) {
  try { setPermissions(JSON.parse(savedPerms)); } catch { /* ignore */ }
}
```

**Change 5 - Attach permissions on login (in login, after line 657):**
```ts
if (data.permissions) {
  setPermissions(data.permissions);
  localStorage.setItem("permissions", JSON.stringify(data.permissions));
} else {
  await fetchPermissions();
}
```

**Change 6 - Attach permissions on signup (in signup, similar to login).**

**Change 7 - Clear on logout (in logout, after line 729):**
```ts
localStorage.removeItem("permissions");
setPermissions({});
```

**Change 8 - Refresh after profile load (in loadUserProfile, after line 606):**
```ts
await fetchPermissions();
```

**Change 9 - Fix loadUsers admin gate (line 859):**
```ts
// Before
const isAdmin = role === 'Super Admin' || role === 'super_admin' || role === 'Org Admin' || role === 'admin';
// After
const isAdmin = isAdminRole(role);
```

**Change 10 - Fix company-subscription effect (line 820):**
```ts
// Before
if (userProfile?.id && role === "admin") { ... }
// After
if (userProfile?.id && isAdminRole(role)) { ... }
```

**Change 11 - Expose permissions in provider value object:**
```ts
permissions,
```

---

### B3. Update src/app/pages/SalesPage.tsx

**Change 1 - Import and context destructure (line 40):**
```ts
import { canWrite } from "../utils/permissions";
// ...
const { role, currentUser, deals, loading, addDeal, updateDeal, deleteDeal, refreshData, employees, importDeals, subscription, permissions } = useApp();
```

**Change 2 - REMOVE client-side filtering (lines 78-92):**

The backend already scopes /deals via getScopedQueryFilters (own/team/dept/full). Re-filtering on the frontend double-restricts data.

```ts
// BEFORE (WRONG - double filters backend data):
const visibleDeals = useMemo(() =>
  (role === "user"
    ? deals.filter(d => d.owner?.toLowerCase().trim() === currentUser.name?.toLowerCase().trim())
    : deals
  ).map(d => ({
    ...d,
    value: Number(d.value) || 0,
    probability: Number(d.probability) || 50,
    owner: d.owner || "Unknown"
  })),
  [deals, role, currentUser]);

// AFTER (CORRECT - display backend-scoped data as-is):
const visibleDeals = useMemo(() =>
  deals.map(d => ({
    ...d,
    value: Number(d.value) || 0,
    probability: Number(d.probability) || 50,
    owner: d.owner || "Unknown"
  })),
  [deals]);
```

**Change 3 - Gate Edit/Delete buttons by write permission (near line 48):**
```ts
const canManageDeals = canWrite(permissions, 'deals');
```
Wrap the Edit/Trash buttons at lines 305-310 (kanban cards) and 434-435 (table) in:
```tsx
{canManageDeals && (
  <>
    <button onClick={() => openEdit(deal)} ...><Edit size={11} /></button>
    <button onClick={() => setDeleteConfirm(deal)} ...><Trash2 size={11} /></button>
  </>
)}
```

---

### B4. Update src/app/pages/LeadsPage.tsx

**Change 1 - Import and context (lines 56-57):**
```ts
import { hasModuleAccess, canWrite, isAdminRole } from "../utils/permissions";
// add permissions to the useApp() destructure
```

**Change 2 - Add access flags after the hook:**
```ts
const canSeeAllEmployees = hasModuleAccess(permissions, 'leads', ['full', 'dept', 'team']);
const canDeleteLeadsSeq  = hasModuleAccess(permissions, 'leads', ['full']);
const canWriteLeads      = canWrite(permissions, 'leads');
const canAssignLeads     = hasModuleAccess(permissions, 'leads', ['full', 'dept']);
```

**Change 3 - Replace role === "admin" occurrences:**

| Line | Current Code | New Code |
|------|-------------|----------|
| 675 | {role === "admin" && (<select ...> employees ...)} | {canSeeAllEmployees && (<select ...> employees ...)} |
| 712 | {role === "admin" && selectedIds.length > 0 && (...)} | {canDeleteLeadsSeq && selectedIds.length > 0 && (...)} |
| 812 | {role === "admin" && visibleColumns.includes("owner") && (<th>)} | {canSeeAllEmployees && visibleColumns.includes("owner") && (<th>)} |
| 931 | {role === "admin" && visibleColumns.includes("owner") && (<td>)} | {canSeeAllEmployees && visibleColumns.includes("owner") && (<td>)} |
| 1077 | {role === "admin" && (<Delete button>)} | {canDeleteLeadsSeq && (<Delete button>)} |
| 1220 | const isAdmin = role === "admin"; | const isAdmin = isAdminRole(role); |
| 1633 | {role === "admin" && (<Assign To select>)} | {canAssignLeads && (<Assign To select>)} |

Note: myLeads (line 101) does NOT contain a scope filter, so it is already correct - it merely uses the backend-scoped leads array for search/status/sort filtering.

---

### B5. Update src/app/pages/PriceListPage.tsx

**Change 1 - Import and context (lines 103-116):**
```ts
import { hasModuleAccess } from "../utils/permissions";
// add permissions to useApp() destructure
```

**Change 2 - Replace static role gate (lines 220-241):**
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

---

### B6. Sweep remaining pages with static role checks

**Search patterns:** role === "admin", role !== "admin", role === "super_admin", role === "user", role === "Org Admin", isAdmin

| File | Change |
|------|--------|
| src/app/pages/AdminPage.tsx | Replace isAdmin-style strings with isAdminRole(role) or hasModuleAccess(permissions,'users',['full','dept']) |
| src/app/pages/BillingPage.tsx | Replace role === "admin" gates with hasModuleAccess(permissions,'billing',['full']) |
| src/app/pages/SettingsPage.tsx | Replace with hasModuleAccess(permissions,'settings',['full']) |
| src/app/pages/ReportsPage.tsx | Replace with hasModuleAccess(permissions,'reports',['full','dept','team','own','view']) |
| src/app/components/Sidebar.tsx | Gate nav links with hasModuleAccess(permissions, module) |
| Ticket / Task / Contact / Calendar components | Gate Edit/Delete buttons with canWrite(permissions, module) |

---

## Part C - Summary Table

| # | File | Function / Location | Change Description |
|---|------|--------------------|--------------------|
| A1 | server.js | app.post("/auth/login") (L2958-2968) | Add permissions object to login response |
| A2 | server.js | app.get("/profile") (L2977-2990) | Expand SELECT + add permissions |
| A3 | server.js | new app.get("/auth/permissions") | New endpoint returning { role, permissions } |
| A4 | server.js | audit-logs (L4115), bulk/action (L4168) | Replace role !== 'admin' with !isAdminRole(role) |
| A5 | server.js | comment PUT (L2236), DELETE (L2280) | Replace role !== 'admin' with !isAdminRole(role) |
| B1 | src/app/utils/permissions.ts | new file | Add normalizeRole, isAdminRole, hasModuleAccess, canWrite |
| B2 | AppContext.tsx | multiple (state, login, signup, logout, init, loadUsers, effects, provider) | Add permissions state + fetchPermissions() + wire into auth lifecycle |
| B3 | SalesPage.tsx | visibleDeals (L78-92), Edit/Delete buttons (L305-310, L434-435) | Remove client .filter(), gate buttons with canWrite(permissions,'deals') |
| B4 | LeadsPage.tsx | L675, L712, L812, L931, L1077, L1220, L1633 | Replace role === "admin" with permission-based flags |
| B5 | PriceListPage.tsx | L220-241 | Replace static role gate with hasModuleAccess(permissions,'billing') |
| B6 | Admin/Billing/Settings/Reports/Sidebar/ticket/task/contact components | all role-equality checks | Sweep with isAdminRole, hasModuleAccess, canWrite |

---

## Part D - Post-Change Behavior Matrix

| Role | Backend /leads, /deals scope | Frontend displays | Delete button |
|------|---------------------------------|-------------------|---------------|
| Org Admin | full | All company records | shown |
| Sales Manager | dept | Department records (as returned) | shown for dept scope |
| Team Leader | team | Team records (as returned) | shown for team scope |
| Sales Executive | own | Own records (as returned) | hidden (own scope, no delete in matrix) |
| Lead Manager | full (leads), view (deals) | All leads + view-only deals | leads shown, deals hidden |