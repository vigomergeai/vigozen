# Hierarchy Visibility & Team Reports — Implementation Report

**Date:** 11-Aug-2026  
**Purpose:** Implement role-based hierarchy visibility and scoped team reports  
**Current State:** Partial implementation exists; needs completion

---

## 1. Current State Analysis

### ✅ Already Implemented

| Component | Location | Status |
|-----------|----------|--------|
| `reportingHierarchy.js` shared module | `c:\Users\91798\OneDrive\.122\vigozen\server\reportingHierarchy.js` | ✅ Created |
| `getSubordinateUserIds()` recursive query | `reportingHierarchy.js` line 56 | ✅ Works via `manager_id` |
| `getVisibleUsers()` function | `reportingHierarchy.js` line 118 | ✅ Exists but not exported to routes |
| `getValidManagers()` function | `reportingHierarchy.js` line 152 | ✅ Exists but not exported to routes |
| `REPORTING_RULES` | `reportingHierarchy.js` line 4 | ✅ Defines valid manager→report relationships |
| Frontend `api.ts` methods | `src/app/lib/api.ts` line 204-212 | ✅ `visibleUsers()` and `availableManagers()` added |
| Frontend `AnalysisPage.tsx` | `src/app/pages/AnalysisPage.tsx` | ✅ Fetches reports via `api.reports.getSummary()`, etc. |
| Backend `/users/my-subordinates` | `server.js` line 2302 | ✅ Returns subordinates for current user |
| Backend `/users/:managerId/subordinates` | `server.js` line 2314 | ✅ Returns subordinates for specific manager |
| Backend `/users/my-team-stats` | `server.js` line 2302 | ✅ Returns team statistics |

### ❌ Missing / Not Yet Implemented

| Component | Location | Issue |
|-----------|----------|-------|
| `GET /users/visible` endpoint | `server.js` | ❌ **NOT CREATED** — `getVisibleUsers()` exists in `reportingHierarchy.js` but not wired to a route |
| `GET /users/available-managers` endpoint | `server.js` | ❌ **NOT CREATED** — `getValidManagers()` exists but not wired to a route |
| Reports scoping by hierarchy | Backend | ❌ **MISSING** — Reports currently return company-wide data, not scoped to user's team |
| Frontend `loadUsers()` using `/users/visible` | `AppContext.tsx` | ❌ **NOT UPDATED** — still uses `GET /users` |
| Frontend `getAvailableManagers()` using backend | `AdminPage.tsx` | ❌ **NOT UPDATED** — still client-side filtering |
| Reports API endpoints | Backend | ❌ **MISSING** — No `/reports/summary`, `/reports/employee-wise`, etc. found in `server.js` |

---

## 2. PHASE 1 — Backend: Expose Hierarchy Endpoints

### 🔴 Fix 1.1: Add `GET /users/visible` endpoint

**File:** `c:\Users\91798\OneDrive\.122\vigozen\server.js`  
**Location:** After line 2311 (after `/users/my-subordinates`)  
**Purpose:** Return only users visible to the current user based on their role and hierarchy

**Implementation:**
```javascript
// Get all users visible to the current user based on hierarchy
app.get("/users/visible", authenticateToken, async (req, res) => {
  try {
    const { getVisibleUsers } = require("./reportingHierarchy");
    const visibleUsers = await getVisibleUsers(req.user);
    res.json(visibleUsers);
  } catch (err) {
    console.error("GET VISIBLE USERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
```

**Why this is needed:**  
- Super Admin → sees all users across all companies  
- Org Admin → sees all users in their company  
- Sales Manager / Lead Manager / Team Leader → sees only their subordinates (recursive via `manager_id`)  
- Sales Executive → sees only themselves

---

### 🔴 Fix 1.2: Add `GET /users/available-managers` endpoint

**File:** `c:\Users\91798\OneDrive\.122\vigozen\server.js`  
**Location:** After line 2311 (after `/users/my-subordinates`)  
**Purpose:** Return valid managers for a given role, scoped by company

**Implementation:**
```javascript
// Get available managers for a specific role
app.get("/users/available-managers", authenticateToken, async (req, res) => {
  try {
    const { role: targetRole, company_id } = req.query;
    
    if (!targetRole) {
      return res.status(400).json({ error: "role query parameter is required" });
    }

    const { getValidManagers } = require("./reportingHierarchy");
    
    // Super Admin can specify company_id, others use their own company
    const companyId = req.user.role === 'Super Admin' || req.user.role === 'super_admin'
      ? (company_id || req.user.company_id)
      : req.user.company_id;
    
    const managers = await getValidManagers(targetRole, companyId, req.user.id);
    res.json(managers);
  } catch (err) {
    console.error("GET AVAILABLE MANAGERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
```

**Why this is needed:**  
- Enforces server-side validation of reporting relationships  
- Prevents cross-company manager assignments  
- Returns only active users with valid roles per `REPORTING_RULES`

---

## 3. PHASE 2 — Frontend: Use New Hierarchy Endpoints

### 🔴 Fix 2.1: Update `loadUsers()` in `AppContext.tsx`

**File:** `src/app/context/AppContext.tsx`  
**Function:** `loadUsers()` (around line 900-930)  
**Current behavior:** Calls `GET /users` which returns all users (backend does scope, but not via hierarchy)  
**Required change:** Call `GET /users/visible` instead

**Current code:**
```typescript
const res = await fetch(
  `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/users`,
  { headers: { Authorization: `Bearer ${token}` } }
);
```

**Change to:**
```typescript
const res = await fetch(
  `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/users/visible`,
  { headers: { Authorization: `Bearer ${token}` } }
);
```

**Impact:**  
- Team Leader will now see only their Sales Executives  
- Sales Manager will see their entire hierarchy (Team Leaders + Sales Executives)  
- Super Admin still sees everyone  
- No cross-company leakage

---

### 🔴 Fix 2.2: Update `getAvailableManagers()` in `AdminPage.tsx`

**File:** `src/app/pages/AdminPage.tsx`  
**Function:** `getAvailableManagers()` (around line 371)  
**Current behavior:** Client-side filtering using `users` array  
**Required change:** Call backend `GET /users/available-managers?role=X`

**Current code:**
```typescript
const getAvailableManagers = (selectedRole: string, targetUserId?: string) => {
  const allowedManagerRoles = REPORTING_RULES[selectedRole] || [];
  return users.filter(u =>
    u.id !== targetUserId &&
    allowedManagerRoles.includes(u.role) &&
    u.isActive
  );
};
```

**Change to:**
```typescript
const getAvailableManagers = async (selectedRole: string, targetUserId?: string) => {
  const token = localStorage.getItem('token');
  if (!token) return [];
  
  try {
    const res = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/users/available-managers?role=${encodeURIComponent(selectedRole)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (!res.ok) return [];
    
    const managers = await res.json();
    return targetUserId 
      ? managers.filter((m: any) => m.id !== targetUserId)
      : managers;
  } catch (error) {
    console.error("Failed to fetch available managers:", error);
    return [];
  }
};
```

**Then update the JSX to use state:**
```typescript
// Add state
const [availableManagers, setAvailableManagers] = useState<any[]>([]);

// Add useEffect to fetch managers when role changes
useEffect(() => {
  if (form.role) {
    getAvailableManagers(form.role, editUser?.id).then(setAvailableManagers);
  }
}, [form.role, editUser?.id]);

// Update JSX select options from:
{getAvailableManagers(form.role).map((manager) => ( ... ))}

// To:
{availableManagers.map((manager) => ( ... ))}
```

**Impact:**  
- Manager dropdown is now server-validated  
- Company-scoped (no cross-company managers)  
- Only active users with valid roles appear

---

## 4. PHASE 3 — Reports Scoping by Hierarchy

### 🔴 Fix 3.1: Add Reports API endpoints with hierarchy scoping

**File:** Create new `c:\Users\91798\OneDrive\.122\vigozen\server\reports.js`  
**Purpose:** Scope all reports to the current user's visible team

**Implementation:**
```javascript
const pool = require("../db");
const { getSubordinateUserIds, normalizeRole, isAdminRole } = require("./reportingHierarchy");

/**
 * Get reports summary scoped to user's hierarchy
 * Returns aggregate metrics for visible users only
 */
const getReportsSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const roleNorm = normalizeRole(req.user.role);
    
    // Determine which user IDs are visible to current user
    let userIdsClause = '';
    let params = [];
    
    if (roleNorm === 'super_admin') {
      // Super Admin sees all data
      userIdsClause = '1=1';
    } else if (roleNorm === 'org_admin' || roleNorm === 'admin') {
      // Org Admin sees their company
      userIdsClause = 'company_id = $1';
      params.push(req.user.company_id);
    } else {
      // Managers/Team Leaders: only their subordinates
      const subIds = await getSubordinateUserIds(req.user.id, req.user.team_id);
      userIdsClause = 'owner_id = ANY($1::uuid[])';
      params.push(subIds);
    }
    
    // Build date filter
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND created_at BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(startDate, endDate);
    }
    
    // Get leads summary
    const leadsQuery = `
      SELECT 
        COUNT(*) as total_leads,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
        COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted_leads,
        COUNT(CASE WHEN status = 'qualified' THEN 1 END) as qualified_leads,
        COUNT(CASE WHEN status = 'proposal' THEN 1 END) as proposal_leads,
        COUNT(CASE WHEN status = 'negotiation' THEN 1 END) as negotiation_leads
      FROM leads
      WHERE ${userIdsClause} ${dateFilter}
    `;
    
    // Get deals summary
    const dealsQuery = `
      SELECT 
        COUNT(*) as total_deals,
        COUNT(CASE WHEN stage = 'won' THEN 1 END) as won_deals,
        COUNT(CASE WHEN stage = 'lost' THEN 1 END) as lost_deals,
        SUM(CASE WHEN stage = 'won' THEN value ELSE 0 END) as total_revenue,
        COUNT(CASE WHEN stage IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation') THEN 1 END) as active_deals,
        ROUND(COUNT(CASE WHEN stage = 'won' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as win_rate
      FROM deals
      WHERE ${userIdsClause} ${dateFilter}
    `;
    
    const [leadsResult, dealsResult] = await Promise.all([
      pool.query(leadsQuery, params),
      pool.query(dealsQuery, params)
    ]);
    
    res.json({
      ...leadsResult.rows[0],
      ...dealsResult.rows[0]
    });
    
  } catch (err) {
    console.error("GET REPORTS SUMMARY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get employee-wise report scoped to user's hierarchy
 */
const getEmployeeWiseReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const roleNorm = normalizeRole(req.user.role);
    
    // Get visible user IDs
    let userIdsClause = '';
    let params = [];
    
    if (roleNorm === 'super_admin') {
      userIdsClause = '1=1';
    } else if (roleNorm === 'org_admin' || roleNorm === 'admin') {
      userIdsClause = 'u.company_id = $1';
      params.push(req.user.company_id);
    } else {
      const subIds = await getSubordinateUserIds(req.user.id, req.user.team_id);
      userIdsClause = 'u.id = ANY($1::uuid[])';
      params.push(subIds);
    }
    
    // Build date filter
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND l.created_at BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(startDate, endDate);
    }
    
    const query = `
      SELECT 
        u.name as employee_name,
        COUNT(l.id) as total_leads,
        COUNT(CASE WHEN l.status = 'new' THEN 1 END) as new_leads,
        COUNT(CASE WHEN l.status = 'contacted' THEN 1 END) as contacted_leads,
        COUNT(CASE WHEN l.status = 'qualified' THEN 1 END) as qualified_leads,
        COUNT(CASE WHEN l.status = 'proposal' THEN 1 END) as proposal_leads,
        COUNT(CASE WHEN l.status = 'negotiation' THEN 1 END) as negotiation_leads,
        COUNT(CASE WHEN l.status = 'won' THEN 1 END) as won_deals,
        COUNT(CASE WHEN l.status = 'lost' THEN 1 END) as lost_leads
      FROM users u
      LEFT JOIN leads l ON l.owner_id = u.id ${dateFilter}
      WHERE ${userIdsClause}
      GROUP BY u.id, u.name
      ORDER BY u.name ASC
    `;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (err) {
    console.error("GET EMPLOYEE WISE REPORT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get status-wise report scoped to user's hierarchy
 */
const getStatusWiseReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const roleNorm = normalizeRole(req.user.role);
    
    let userIdsClause = '';
    let params = [];
    
    if (roleNorm === 'super_admin') {
      userIdsClause = '1=1';
    } else if (roleNorm === 'org_admin' || roleNorm === 'admin') {
      userIdsClause = 'company_id = $1';
      params.push(req.user.company_id);
    } else {
      const subIds = await getSubordinateUserIds(req.user.id, req.user.team_id);
      userIdsClause = 'owner_id = ANY($1::uuid[])';
      params.push(subIds);
    }
    
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND created_at BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(startDate, endDate);
    }
    
    const query = `
      SELECT 
        status as stage,
        COUNT(*) as count,
        SUM(value) as total_value
      FROM leads
      WHERE ${userIdsClause} ${dateFilter}
      GROUP BY status
      ORDER BY count DESC
    `;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (err) {
    console.error("GET STATUS WISE REPORT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get sales-wise report scoped to user's hierarchy
 */
const getSalesWiseReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const roleNorm = normalizeRole(req.user.role);
    
    let userIdsClause = '';
    let params = [];
    
    if (roleNorm === 'super_admin') {
      userIdsClause = '1=1';
    } else if (roleNorm === 'org_admin' || roleNorm === 'admin') {
      userIdsClause = 'company_id = $1';
      params.push(req.user.company_id);
    } else {
      const subIds = await getSubordinateUserIds(req.user.id, req.user.team_id);
      userIdsClause = 'owner_id = ANY($1::uuid[])';
      params.push(subIds);
    }
    
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND created_at BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(startDate, endDate);
    }
    
    // Weekly aggregation
    const query = `
      SELECT 
        TO_CHAR(created_at, 'IYYY-IW') as week,
        COUNT(*) as total_deals,
        SUM(CASE WHEN stage = 'won' THEN value ELSE 0 END) as revenue,
        COUNT(CASE WHEN stage = 'won' THEN 1 END) as won_deals
      FROM deals
      WHERE ${userIdsClause} ${dateFilter}
      GROUP BY TO_CHAR(created_at, 'IYYY-IW')
      ORDER BY week DESC
    `;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (err) {
    console.error("GET SALES WISE REPORT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getReportsSummary,
  getEmployeeWiseReport,
  getStatusWiseReport,
  getSalesWiseReport
};
```

**Then register these routes in `server.js`** (after line 2320):
```javascript
const reportsRoutes = require("./reports");

// Reports endpoints (all require authentication)
app.get("/reports/summary", authenticateToken, reportsRoutes.getReportsSummary);
app.get("/reports/employee-wise", authenticateToken, reportsRoutes.getEmployeeWiseReport);
app.get("/reports/status-wise", authenticateToken, reportsRoutes.getStatusWiseReport);
app.get("/reports/sales-wise", authenticateToken, reportsRoutes.getSalesWiseReport);
```

**Why this is needed:**  
- Currently, reports show **company-wide** data for everyone  
- After this fix:  
  - **Team Leader** sees only their Sales Executives' data  
  - **Sales Manager** sees their entire hierarchy's data  
  - **Super Admin** still sees everything  
- This matches the user panel visibility logic

---

### 🟡 Fix 3.2: Update `api.ts` to use new reports endpoints

**File:** `src/app/lib/api.ts`  
**Current state:** `api.reports` methods exist but point to non-existent backend routes  
**Required change:** Ensure the routes match

**Current code (around line 260-280):**
```typescript
reports: {
  getSummary: (token: string, startDate?: string, endDate?: string) => {
    // Build query params
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return request("GET", `/reports/summary?${params.toString()}`, undefined, token);
  },
  getEmployeeWise: (token: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return request("GET", `/reports/employee-wise?${params.toString()}`, undefined, token);
  },
  getStatusWise: (token: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return request("GET", `/reports/status-wise?${params.toString()}`, undefined, token);
  },
  getSalesWise: (token: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return request("GET", `/reports/sales-wise?${params.toString()}`, undefined, token);
  },
},
```

**Status:** ✅ Already correct — just needs the backend routes to be created (Fix 3.1)

---

## 5. PHASE 4 — UI Enhancements for Hierarchy

### 🟢 Fix 4.1: Add "My Team" heading in AdminPage.tsx

**File:** `src/app/pages/AdminPage.tsx`  
**Purpose:** Show context-aware heading based on user role

**Implementation:**
```typescript
// Add before the users table
const getTeamHeading = () => {
  const roleLower = role.toLowerCase();
  if (['super_admin', 'admin'].includes(roleLower)) {
    return "All Users";
  } else if (['sales_manager', 'lead_manager'].includes(roleLower)) {
    return "My Team & Hierarchy";
  } else if (['team_leader'].includes(roleLower)) {
    return "My Team";
  } else {
    return "Users";
  }
};

// In JSX, before the table:
<h2 className="text-lg font-semibold text-slate-800 mb-4">
  {getTeamHeading()}
  <span className="text-sm text-slate-500 ml-2">
    ({filtered.length} {filtered.length === 1 ? 'person' : 'people'})
  </span>
</h2>
```

---

### 🟢 Fix 4.2: Add hierarchy breadcrumb in user detail view

**File:** `src/app/pages/AdminPage.tsx`  
**Purpose:** Show reporting chain when viewing/editing a user

**Implementation:**
```typescript
// Add function to get hierarchy path
const getUserHierarchyPath = async (userId: string) => {
  const { getHierarchyPath } = await import("../../../../OneDrive/.122/vigozen/server/reportingHierarchy");
  // Or call backend endpoint: GET /users/:id/hierarchy
  return [];
};

// In the edit modal, show breadcrumb:
{editUser && (
  <div className="mb-4 p-3 bg-slate-50 rounded-lg">
    <p className="text-xs text-slate-500 mb-1">Reports To:</p>
    {editUser.manager_id ? (
      <p className="text-sm font-medium text-slate-700">
        {users.find(u => u.id === editUser.manager_id)?.name || 'Unknown'} 
        <span className="text-xs text-slate-400 ml-2">
          ({users.find(u => u.id === editUser.manager_id)?.role || 'N/A'})
        </span>
      </p>
    ) : (
      <p className="text-sm text-slate-500">No manager (Top-level)</p>
    )}
  </div>
)}
```

---

## 6. Summary: What Needs to Be Done

### Phase 1 — Backend Critical (3 items)

| # | File | What to Add | Purpose |
|---|------|-------------|---------|
| 1.1 | `server.js` | `GET /users/visible` route | Return users based on hierarchy scope |
| 1.2 | `server.js` | `GET /users/available-managers` route | Server-side manager validation |
| 1.3 | **NEW** `server/reports.js` | 4 report endpoints with hierarchy scoping | Scope reports to user's team |

### Phase 2 — Frontend Critical (2 items)

| # | File | What to Change | Purpose |
|---|------|----------------|---------|
| 2.1 | `AppContext.tsx` | `loadUsers()` → use `/users/visible` | Proper hierarchy-scoped user list |
| 2.2 | `AdminPage.tsx` | `getAvailableManagers()` → call backend | Server-validated manager dropdown |

### Phase 3 — Reports Scoping (1 item)

| # | File | What to Add | Purpose |
|---|------|-------------|---------|
| 3.1 | `server.js` | Register reports routes from `reports.js` | Enable hierarchy-scoped reports |

### Phase 4 — UI Polish (2 items)

| # | File | What to Add | Purpose |
|---|------|-------------|---------|
| 4.1 | `AdminPage.tsx` | "My Team" / "All Users" heading | Context-aware UI |
| 4.2 | `AdminPage.tsx` | Hierarchy breadcrumb in edit modal | Show reporting chain |

---

## 7. Expected Behavior After Implementation

### User Panel Visibility

```
Super Admin logs in
  └── Sees: All users across all companies

Org Admin logs in
  └── Sees: All users in their company

Sales Manager (Sonu) logs in
  └── Sees: 
      ├── Sonu (self)
      ├── Amit (Team Leader under Sonu)
      ├── Ajay (Team Leader under Sonu)
      ├── Rahul (Sales Executive under Amit)
      ├── Rohit (Sales Executive under Amit)
      └── Karan (Sales Executive under Ajay)

Team Leader (Amit) logs in
  └── Sees:
      ├── Amit (self)
      ├── Rahul (Sales Executive)
      └── Rohit (Sales Executive)

Sales Executive (Rahul) logs in
  └── Sees: Only Rahul (self)
```

### Reports Scoping

```
Team Leader (Amit) views Reports
  └── Employee-wise report shows:
      ├── Amit (Team Leader)
      ├── Rahul (Sales Executive)
      └── Rohit (Sales Executive)
  └── Does NOT show: Sonu, Ajay, Karan, Arjun

Sales Manager (Sonu) views Reports
  └── Employee-wise report shows:
      ├── Sonu (Sales Manager)
      ├── Amit (Team Leader)
      ├── Ajay (Team Leader)
      ├── Rahul, Rohit, Vijay (under Amit)
      └── Karan, Arjun (under Ajay)
  └── Does NOT show: Users from other companies

Super Admin views Reports
  └── Shows: Everyone across all companies
```

---

## 8. Critical Notes

1. **`reportingHierarchy.js` already exists** — all helper functions are implemented, just need to wire them to routes
2. **`api.ts` already has method stubs** — `visibleUsers()` and `availableManagers()` are ready, just need backend routes
3. **Reports endpoints are completely missing** — need to create `server/reports.js` from scratch
4. **Frontend `AnalysisPage.tsx` already calls `api.reports.*`** — once backend routes exist, reports will automatically be scoped
5. **No changes needed to database schema** — `users.manager_id` already exists and is used correctly

---

## 9. Testing Checklist

After implementation, verify:

- [ ] Team Leader can see only their subordinates in Users page
- [ ] Team Leader can see only their team's reports
- [ ] Sales Manager can see their entire hierarchy in Users page
- [ ] Sales Manager can see their hierarchy's reports
- [ ] Super Admin still sees everything
- [ ] Manager dropdown only shows valid managers per role
- [ ] Manager dropdown respects company boundaries
- [ ] Creating a user with invalid manager assignment is rejected by backend
- [ ] Reports employee-wise chart shows only visible users
- [ ] Reports status-wise chart shows only visible users' data
- [ ] Reports sales-wise chart shows only visible users' deals