# Reporting Manager Feature — Gap Analysis & 3-Phase Fix Report

**Date:** 11-Aug-2026  
**Status:** Analysis Complete  
**Related Bug:** Lead update 500 error when Super Admin edits leads  

---

## 1. Current State Overview

The feature already exists in **partial form**. The database uses `manager_id` on the `users` table (not `reporting_manager_id` — but this is functionally the same thing). Below is exactly what works today and what's broken/missing.

### What Already Works ✅

| Area | Location | Status |
|------|----------|--------|
| `users.manager_id` column created | `server.js` line ~194 | ✅ Auto-migrated |
| Backend recursive subordinate query | `getSubordinateUserIds()` in `server.js` line ~728 | ✅ Uses `manager_id` |
| Backend subordinate endpoints | `GET /users/my-subordinates`, `GET /users/:managerId/subordinates` | ✅ Exist |
| Backend role creation validation | `POST /users` in `server.js` (REPORTING_RULES maps) | ✅ Partially |
| Backend role update validation | `PUT /users/:id` in `server.js` | ✅ Partially |
| Frontend role creation rules | `ROLE_CREATION_RULES` in `AdminPage.tsx` line ~31 | ✅ Exists |
| Frontend reporting rules | `REPORTING_RULES` in `AdminPage.tsx` line ~47 | ✅ Exists |
| Frontend manager dropdown | `getAvailableManagers()` in `AdminPage.tsx` line ~371 | ✅ Filters by role |
| Frontend `manager_id` in user form | `AdminPage.tsx` — UserForm interface line ~189 | ✅ Present |

### What's Missing / Broken ❌

| Area | Location | Status |
|------|----------|--------|
| `GET /users/visible` endpoint | `server.js` | ❌ **MISSING** — frontend uses generic `GET /users` |
| `GET /users/available-managers?role=X` endpoint | `server.js` | ❌ **MISSING** — frontend filters client-side only |
| Team Leader backend authorization | `checkUserManagementAccess()` `server.js` line ~653 | ❌ **BROKEN** — `Team Leader` hits the `else` branch and gets `"Insufficient permissions"` |
| Assigning manager vs transferring data separation | `employeeTransfer.js` | ⚠️ **PARTIAL** — `transferEmployeeData()` deliberately transfers leads/deals as a separate action; `PUT /users/:id` only changes `manager_id` (correct behavior) |
| Reporting Manager rename | DB schema | ⚠️ **Optional** — current field is `manager_id`; your spec says `reporting_manager_id`. Functional equivalent. |

---

## 2. PHASE 1 — Backend Critical Fixes

### 🔴 Fix 1.1: `checkUserManagementAccess()` — Team Leader gets denied

**File:** `c:\Users\91798\OneDrive\.122\vigozen\server.js`  
**Function:** `checkUserManagementAccess` (starts ~line 604)  
**Problem:** A `Team Leader` role is allowed on the frontend (AdminPage allows: `['Super Admin', 'super_admin', 'admin', 'Sales Manager', 'Lead Manager', 'Team Leader']`) and `GET /users` includes them in the users module scope, but when a Team Leader tries to manage a Sales Executive, the function falls through to the `else` block at line 653 and returns **"Insufficient permissions"**.

**What needs to change:** Add a `Team Leader` case before the `else`:

```javascript
// Add after the Lead Manager block (line ~651):
else if (currentRoleLower === 'team leader' || currentRoleLower === 'team_leader') {
    if (!['sales executive', 'sales_executive'].includes(targetRoleLower)) {
      return { allowed: false, error: "Team Leader can only manage Sales Executives" };
    }
}
```

---

### 🔴 Fix 1.2: Add `GET /users/available-managers?role=X` endpoint

**File:** `c:\Users\91798\OneDrive\.122\vigozen\server.js` (place near other user endpoints, ~line 2270)

**Problem:** The frontend `getAvailableManagers()` in `AdminPage.tsx` filters candidates **client-side** using already-loaded `users` array. Two problems:
1. It can list managers from **other companies** if the user list isn't properly scoped.
2. Anyone can call `/users` directly to see all users — the manager list isn't enforced server-side.

**What needs to change:** Add a new endpoint with **server-side validation**:

```javascript
app.get("/users/available-managers", authenticateToken, async (req, res) => {
  try {
    const { role: targetRole, company_id } = req.query;
    if (!targetRole) return res.status(400).json({ error: "role query param required" });

    // 1. Determine valid manager roles for the target role
    const REPORTING_RULES = {
      'admin': ['Super Admin', 'super_admin', 'admin'],
      'Sales Manager': ['admin'],
      'sales_manager': ['admin'],
      'Lead Manager': ['admin'],
      'lead_manager': ['admin'],
      'Team Leader': ['Sales Manager', 'sales_manager', 'admin'],
      'team_leader': ['Sales Manager', 'sales_manager', 'admin'],
      'Sales Executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
      'sales_executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
      'Lead Executive': ['Lead Manager', 'lead_manager'],
      'Telecaller': ['Lead Manager', 'lead_manager'],
      'Lead Qualifier': ['Lead Manager', 'lead_manager']
    };

    const validManagerRoles = REPORTING_RULES[targetRole] || [];
    if (validManagerRoles.length === 0) {
      return res.json([]); // e.g. Sales Executive cannot be a manager of anyone
    }

    // 2. Scope by company (admin sees own company; super_admin sees all if company_id passed)
    const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'super_admin';
    let companyClause = ' AND company_id=$2';
    let params = [validManagerRoles, req.query.company_id || req.user.company_id];

    if (isSuperAdmin && !req.query.company_id) {
      companyClause = ''; // super_admin with no company gets everyone
      params = [validManagerRoles];
    }

    const result = await pool.query(
      `SELECT id, name, email, role, department
       FROM users
       WHERE role = ANY($1::text[]) AND is_active = true AND status = 'Active' ${companyClause}
       ORDER BY role, name ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET AVAILABLE MANAGERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
```

---

### 🔴 Fix 1.3: Add `GET /users/visible` endpoint

**File:** `c:\Users\91798\OneDrive\.122\vigozen\server.js`

**Problem:** Currently `GET /users` does implement per-role scope (super_admin → all, org_admin → company, managers → subordinates via `getSubordinateUserIds`). However:
1. It doesn't support a dedicated "visible users" contract for the frontend.
2. It doesn't reuse `checkUserManagementAccess` consistently.
3. A Team Leader's scope currently falls into `permissionScope === 'full' || 'dept' || 'team'` branch and works, but it's unclear.

**What needs to change:** Add a new endpoint that unambiguously returns only what the requester can see based on `manager_id` hierarchy:

```javascript
app.get("/users/visible", authenticateToken, async (req, res) => {
  try {
    const roleNorm = normalizeRole(req.user.role);
    let query = "";
    let params = [];

    if (roleNorm === 'super_admin') {
      // All organizations
      query = "SELECT id, name, email, role, department, manager_id, team_id, is_active, status FROM users ORDER BY role, name";
    } else if (roleNorm === 'org_admin' || roleNorm === 'admin') {
      // Entire own company
      query = "SELECT id, name, email, role, department, manager_id, team_id, is_active, status FROM users WHERE company_id = $1 ORDER BY role, name";
      params.push(req.user.company_id);
    } else {
      // Managers/Team Leaders: entire hierarchy below them
      const subIds = await getSubordinateUserIds(req.user.id, req.user.team_id);
      query = "SELECT id, name, email, role, department, manager_id, team_id, is_active, status FROM users WHERE id = ANY($1::uuid[]) ORDER BY role, name";
      params.push(subIds);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("GET VISIBLE USERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
```

---

### 🟡 Fix 1.4: Fix `getSubordinateUserIds()` fallback when `team_id` is NULL

**File:** `c:\Users\91798\OneDrive\.122\vigozen\server.js`  
**Function:** `getSubordinateUserIds` (line ~728)

**Problem:** The function does `SELECT team_id FROM users WHERE id = $1` — if `team_id` is `NULL`, it uses the query without a team clause, which only traverses `manager_id` relationships. That's the correct hierarchy behavior. ✅ **BUT** the version in `employeeTransfer.js` (line ~229) works the same way. **No critical bug here** — just confirm both stay in sync. The main issue is that `getSubordinates` in `employeeTransfer.js` doesn't export `getSubordinateUserIds` to avoid duplication.

---

### 🟡 Fix 1.5: `PUT /users/:id` — bypass `manager_id` if new manager is under the user themselves (cycle prevention)

**File:** `c:\Users\91798\OneDrive\.122\vigozen\server.js`  
**Route:** `PUT /users/:id` (starts ~line 1819)

**Problem:** Currently, the backend validates that the new `manager_id`'s role is valid per `REPORTING_RULES`, but it does **not** prevent a hierarchy cycle. Example: If `Rahul` (manager_id = `Amit`) tries to set his own manager to `Sonu` who is actually *under* Rahul, no error is raised.

**What needs to change:** In the `PUT /users/:id` handler, before applying `finalManagerId`, check the new manager is not a subordinate of the target user:

```javascript
// Before setting finalManagerId
if (finalManagerId && finalManagerId !== existingUser.manager_id) {
  // Prevent cycle: ensure target user is not the manager of the new manager
  const subIds = await getSubordinateUserIds(finalManagerId, null);
  if (subIds.includes(id)) {
    return res.status(400).json({ error: "Cannot assign a subordinate as your manager (hierarchy cycle)" });
  }
}
```

---

## 3. PHASE 2 — Frontend Fixes

### 🔴 Fix 2.1: Replace client-side `getAvailableManagers()` with backend call

**File:** `src/app/pages/AdminPage.tsx`  
**Function:** `getAvailableManagers()` (line ~371)

**Problem:** Client-side filtering uses the already-loaded `users` array. This is incomplete because:
1. Manager filters by `REPORTING_RULES` but **does not** consider `company_id` scoping.
2. `/users` may not return all managers if the current user's GET scope is limited.
3. No server-side enforcement.

**What needs to change:** Make `getAvailableManagers` async and call `GET /users/available-managers?role=X`:

```typescript
// Change from:
const getAvailableManagers = (selectedRole: string, targetUserId?: string) => {
  const allowedManagerRoles = REPORTING_RULES[selectedRole] || [];
  return users.filter(u =>
    u.id !== targetUserId &&
    allowedManagerRoles.includes(u.role) &&
    u.isActive
  );
};

// Change to:
const getAvailableManagers = async (selectedRole: string, targetUserId?: string) => {
  const token = localStorage.getItem('token');
  if (!token) return [];
  try {
    const res = await fetch(`${getApiBaseUrl()}/users/available-managers?role=${encodeURIComponent(selectedRole)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return targetUserId ? data.filter((m: any) => m.id !== targetUserId) : data;
  } catch (e) {
    console.error("Failed to fetch available managers:", e);
    return [];
  }
};
```

Then update the `useEffect` that loads managers when role changes, or convert the JSX `<select>` to use state:

```typescript
const [availableManagers, setAvailableManagers] = useState<any[]>([]);

// When form.role changes:
useEffect(() => {
  if (form.role) {
    getAvailableManagers(form.role, editUser?.id).then(setAvailableManagers);
  }
}, [form.role, editUser?.id]);

// In JSX:
{availableManagers.map((manager) => (
  <option key={manager.id} value={manager.id}>
    {manager.name} ({manager.role})
  </option>
))}
```

---

### 🔴 Fix 2.2: Add `visibleUsers` to AppContext and use `GET /users/visible`

**File:** `src/app/context/AppContext.tsx` (and potentially `src/app/lib/api.ts`)

**Problem:** `loadUsers()` currently calls `GET /users` which **already** has scope logic on the backend (super_admin → all, org_admin → company, manager → subordinates). However, the frontend shows whatever is returned. If your intention is to have a dedicated endpoint, you should switch to `/users/visible`.

**What needs to change:**

1. **In `src/app/lib/api.ts`**, add:
```typescript
visibleUsers: (token: string) => request("GET", "/users/visible", undefined, token),
availableManagers: (role: string, token: string) => request("GET", `/users/available-managers?role=${encodeURIComponent(role)}`, undefined, token),
```

2. **In `src/app/context/AppContext.tsx`**, update `loadUsers()`:
```typescript
// Change line ~910:
const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/users/visible`, {
  headers: { Authorization: `Bearer ${token}` }
});
```

This ensures the "My Team" view for managers shows only their hierarchy as computed by the backend.

---

### 🟡 Fix 2.3: Rename `manager_id` display label to "Reporting Manager"

**File:** `src/app/pages/AdminPage.tsx`  
**Problem:** The UI should reflect the concept of "Reporting Manager" to avoid confusion with lead/deal ownership.

**What needs to change:** Update the form label and column header text from "Manager" / "Manager ID" to **"Reporting Manager"** and **"Reports To"** respectively.

---

### 🟡 Fix 2.4: Prevent manager assignment to sales executives who cannot be managers

**File:** `src/app/pages/AdminPage.tsx`  
**Function:** `handleSubmit` (Create/Edit user submit)

**Problem:** The form allows the user to select "No manager" (`<option value="">— No manager —</option>`), which is fine for top-level roles, but there's no role-based restriction preventing a Sales Executive from being assigned as a manager of anyone else (they shouldn't appear in the dropdown anyway — the filtering handles this). **However**, the form also allows a manager to be assigned when creating an `admin` role — the backend REPORTING_RULES should reject this. **Verify the backend rejects this properly.**

**What needs to change:** Ensure `POST /users` and `PUT /users/:id` properly reject invalid manager assignments server-side (already partially done — confirm the `REPORTING_RULES` validation runs for **all** role changes).

---

## 4. PHASE 3 — Feature Completeness

### 🟢 Fix 3.1: Backend function library (recommended refactor)

**File:** Create new: `c:\Users\91798\OneDrive\.122\vigozen\server\reportingHierarchy.js`

Currently `getSubordinateUserIds`, `checkUserManagementAccess`, and `REPORTING_RULES` are duplicated between `server.js` and `employeeTransfer.js`. Extract them into a shared module:

```javascript
const pool = require("../db");

const REPORTING_RULES = {
  'admin': ['Super Admin', 'super_admin', 'admin'],
  'Sales Manager': ['admin'],
  'sales_manager': ['admin'],
  'Lead Manager': ['admin'],
  'lead_manager': ['admin'],
  'Team Leader': ['Sales Manager', 'sales_manager', 'admin'],
  'team_leader': ['Sales Manager', 'sales_manager', 'admin'],
  'Sales Executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
  'sales_executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
  'Lead Executive': ['Lead Manager', 'lead_manager'],
  'Telecaller': ['Lead Manager', 'lead_manager'],
  'Lead Qualifier': ['Lead Manager', 'lead_manager']
};

// 1. Get all subordinate IDs (recursive via manager_id)
const getSubordinateUserIds = async (userId, teamId = null) => { /* ... */ };

// 2. Validate if a manager can manage a target role
const validateReportingManager = (targetRole, managerRole) => {
  const allowed = REPORTING_RULES[targetRole] || [];
  return allowed.includes(managerRole);
};

// 3. Get visible users for a current user
const getVisibleUsers = async (currentUser) => { /* ... */ };

// 4. Get valid managers for a role within a company
const getValidManagers = async (targetRole, companyId) => { /* ... */ };

module.exports = { REPORTING_RULES, getSubordinateUserIds, validateReportingManager, getVisibleUsers, getValidManagers };
```

Then import this module in both `server.js` and `employeeTransfer.js` to avoid drift.

---

### 🟢 Fix 3.2: `GET /users/:managerId/subordinates` — restrict to hierarchy members only

**File:** `server.js` line ~2283

**Problem:** The endpoint currently allows **any admin** to view any manager's subordinates. Only Super Admin and Org Admin should view users outside their own hierarchy.

**Current code:**
```javascript
app.get("/users/:managerId/subordinates", authenticateToken, async (req, res) => {
  if (!isAdminRole(req.user.role) && req.user.id !== managerId) {
    return res.status(403).json({ error: "Only admins can view other managers' subordinates" });
  }
  ...
});
```

**What needs to change:** The current check `isAdminRole` allows `Org Admin` to view **any** manager's subordinates, even from another company. Add a company scope check:

```javascript
// If Org Admin, verify manager is in same company
if (isAdminRole(req.user.role) && !isSuperAdmin) {
  const mgrRes = await pool.query("SELECT company_id FROM users WHERE id = $1", [managerId]);
  if (mgrRes.rows[0]?.company_id !== req.user.company_id) {
    return res.status(403).json({ error: "Cannot view subordinates from another company" });
  }
}
```

---

### 🟢 Fix 3.3: Add "My Team" view to frontend

**File:** `src/app/pages/AdminPage.tsx`

**Problem:** When a Team Leader logs in, `loadUsers()` returns their hierarchy via `GET /users` (backend `getSubordinateUserIds`), but there's no explicit "My Team" tab/heading that communicates this.

**What needs to change:** Add a section heading or tab label:
- For `Team Leader`: Show "My Team" heading
- For `Sales Manager` / `Lead Manager`: Show "My Team & Hierarchy"
- For `admin` / `Super Admin`: Show "All Users"

This is purely UI polish; the data already comes from the backend scoped query.

---

### 🟢 Fix 3.4: Access log & audit for manager reassignment

**File:** `server.js` — `PUT /users/:id`

**Problem:** When an admin reassigns a user's `manager_id`, there's no dedicated audit trail entry beyond the generic `UPDATE` log.

**What needs to change:** In the `PUT /users/:id` handler, after a successful update, add a specific audit entry:

```javascript
if (finalManagerId !== existingUser.manager_id) {
  await logAudit(
    req.user?.id || null,
    req.user?.name || 'System',
    'REASSIGN_MANAGER',
    'user',
    id,
    { old_manager_id: existingUser.manager_id, new_manager_id: finalManagerId },
    req.ip
  );
}
```

---

## 5. Critical Note: Lead Update Bug (already fixed ✅)

The original bug you reported — **"Lead is not getting updated by the super admin"** with error `invalid input syntax for type uuid: ""` — has already been fixed in this session:

| File | Location | Fix |
|------|----------|-----|
| `c:\Users\91798\OneDrive\.122\vigozen\server.js` | `PUT /leads/:id` (~line 2464-2471) | Empty string `""` for `deal_id` and `owner_id` now converts to `null`/existing value |
| `src/app/context/AppContext.tsx` | `updateLead()` (~line 1192) | Sanitizes empty/null/undefined UUID fields from payload before sending |

**This is unrelated to the reporting manager feature** — it was caused by `ownerId: ""` from the super admin's empty `employeeId`, which was passed directly to the PostgreSQL `owner_id` UUID column.

---

## 6. Summary Table

| # | Phase | File | Function / Endpoint | Issue | Priority |
|---|-------|------|---------------------|-------|----------|
| 1.1 | 1 | `server.js` | `checkUserManagementAccess()` | Team Leader gets `"Insufficient permissions"` when managing Sales Executives | 🔴 Critical |
| 1.2 | 1 | `server.js` | **NEW** `GET /users/available-managers` | Missing server-side manager candidate validation | 🔴 Critical |
| 1.3 | 1 | `server.js` | **NEW** `GET /users/visible` | Missing frontend contract for scoped user list | 🔴 Critical |
| 1.4 | 1 | `server.js` + `employeeTransfer.js` | `getSubordinateUserIds()` | Duplicated code — should be shared module | 🟡 Medium |
| 1.5 | 1 | `server.js` | `PUT /users/:id` | No hierarchy cycle prevention | 🟡 Medium |
| 2.1 | 2 | `AdminPage.tsx` | `getAvailableManagers()` | Client-side only; must call backend endpoint | 🔴 Critical |
| 2.2 | 2 | `AppContext.tsx` + `api.ts` | `loadUsers()` | Should switch to `GET /users/visible` | 🔴 Critical |
| 2.3 | 2 | `AdminPage.tsx` | UI labels | Rename to "Reporting Manager" / "Reports To" | 🟢 Low |
| 2.4 | 2 | `AdminPage.tsx` | `handleSubmit()` | Verify backend rejects invalid manager assignments for all roles | 🟡 Medium |
| 3.1 | 3 | **NEW** `server/reportingHierarchy.js` | Shared module | Extract duplicated hierarchy logic | 🟢 Low |
| 3.2 | 3 | `server.js` | `GET /users/:managerId/subordinates` | Org Admin could view other companies' subordinates | 🟡 Medium |
| 3.3 | 3 | `AdminPage.tsx` | UI | Add "My Team" heading for Team Leaders | 🟢 Low |
| 3.4 | 3 | `server.js` | `PUT /users/:id` | Add `REASSIGN_MANAGER` audit log | 🟢 Low |

---

## 7. What Does NOT Need To Change

Your spec said **"Don't automatically transfer leads/deals when reassigning a manager"** — this is already correct:

- ✅ `PUT /users/:id` only changes the `manager_id` column — it does NOT touch `leads.owner_id` or `deals.owner_id`.
- ✅ `transferEmployeeData()` in `employeeTransfer.js` is a **separate explicit action** (only when a user leaves) — it correctly transfers leads/deals as a deliberate data-transfer operation.
- ✅ The separation is already correct: **Reporting Manager ≠ Lead/Deal Owner**.