# Implementation Issues Report - Subscription & Billing System

## Summary
The frontend UI components have been created but are **non-functional** because critical backend APIs and database schema are missing or incomplete. This report details all issues by category.

---

## 🔴 CRITICAL ISSUES

### 1. DATABASE SCHEMA ISSUES

#### Issue #1: Companies Table Not Created
**File:** `server.js` (lines 57-200)
**Problem:** The `companies` table is referenced throughout the code but never created in the auto-migration section.
**Impact:** All company-based operations will fail with "relation 'companies' does not exist"
**Error:** `ERROR: relation "companies" does not exist`

**Missing SQL:**
```sql
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  subscription_status VARCHAR(50) DEFAULT 'trial',
  plan_type VARCHAR(100) DEFAULT 'trial',
  billing_period VARCHAR(50) DEFAULT 'monthly',
  active_users_count INTEGER DEFAULT 0,
  max_users INTEGER DEFAULT 10,
  subscription_start TIMESTAMP,
  subscription_end TIMESTAMP,
  auto_renew BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Issue #2: Subscriptions Table Wrong Schema
**File:** `server.js` (lines 85-94)
**Problem:** Table is user-based (`user_id`) but should be company-based (`company_id`)
**Current Schema:**
```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR(255) PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- ❌ WRONG
  plan_id VARCHAR(100),
  amount DECIMAL(15,2),
  total_count INTEGER DEFAULT 12,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Required Schema:**
```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,  -- ✅ CORRECT
  plan_type VARCHAR(100) NOT NULL,
  billing_period VARCHAR(50) NOT NULL DEFAULT 'monthly',
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(50) DEFAULT 'active',
  start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_date TIMESTAMP,
  auto_renew BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Issue #3: Invoices Table Missing
**File:** `server.js` (after line 132)
**Problem:** Table not created
**Impact:** Invoice history will not work, billing history will be empty
**Error:** `ERROR: relation "invoices" does not exist`

**Required SQL:**
```sql
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  gst_amount DECIMAL(15,2) NOT NULL,
  cgst DECIMAL(15,2) DEFAULT 0,
  sgst DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(50) DEFAULT 'pending',
  invoice_url VARCHAR(500),
  paid_at TIMESTAMP,
  due_date TIMESTAMP NOT NULL,
  billing_period_start TIMESTAMP NOT NULL,
  billing_period_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Issue #4: Payment Methods Table Missing
**File:** `server.js` (after invoices table)
**Problem:** Table not created
**Impact:** Cannot add/manage payment methods
**Error:** `ERROR: relation "payment_methods" does not exist`

**Required SQL:**
```sql
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  last4 VARCHAR(10) NOT NULL,
  brand VARCHAR(50) NOT NULL,
  expiry VARCHAR(10) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  payment_gateway_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Issue #5: Users Table Missing Role Field
**File:** `server.js` (lines 165-170)
**Problem:** No `role` column with proper enum values
**Current:** Only has `subscription_status`, `plan_type`, `payment_status`
**Impact:** Role-based access control will not work
**Error:** `ERROR: column "role" does not exist`

**Required SQL:**
```sql
-- Add role enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'manager', 'sales', 'viewer');
  END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'sales';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;
```

---

### 2. BACKEND API ISSUES

#### Issue #6: Missing Company Subscription API
**File:** `server.js` (after line 3300)
**Problem:** Routes `/api/company/subscription` (GET/PUT) not implemented
**Impact:** SubscriptionPage.tsx will fail to load subscription details
**Error:** `404 Not Found` or `Cannot read property 'company' of undefined`

**Required Routes:**
```javascript
// GET /api/company/subscription
app.get("/api/company/subscription", authenticateToken, requireRole(['super_admin']), async (req, res) => {
  // Implementation needed
});

// PUT /api/company/subscription  
app.put("/api/company/subscription", authenticateToken, requireRole(['super_admin']), async (req, res) => {
  // Implementation needed
});
```

#### Issue #7: Missing Payment Methods API
**File:** `server.js` (after line 2717)
**Problem:** Routes `/api/payment-methods` (GET/POST/PUT/DELETE) not implemented
**Impact:** Cannot add/view/delete payment methods
**Error:** `404 Not Found`

**Required Routes:**
```javascript
GET /api/payment-methods
POST /api/payment-methods
PUT /api/payment-methods/:id
DELETE /api/payment-methods/:id
```

#### Issue #8: Missing Invoices API
**File:** `server.js` (after payment methods)
**Problem:** Route `/api/invoices` (GET) not implemented for company
**Impact:** Invoice history will be empty
**Error:** `404 Not Found` or empty array

**Required Route:**
```javascript
GET /api/invoices
```

#### Issue #9: Missing User Activation/Deactivation API
**File:** `server.js` (after line 857)
**Problem:** Routes `/api/users/:id/activate` and `/api/users/:id/deactivate` not implemented
**Impact:** Cannot activate/deactivate users from SubscriptionPage
**Error:** `404 Not Found`

**Required Routes:**
```javascript
PUT /api/users/:id/activate
PUT /api/users/:id/deactivate
```

#### Issue #10: Missing Role-Based Access Control Middleware
**File:** `server.js` (after line 252)
**Problem:** No `requireRole` middleware function
**Impact:** Cannot enforce role-based permissions
**Error:** `ReferenceError: requireRole is not defined`

**Required Code:**
```javascript
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userRole = req.user.role || 'sales';
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: "Insufficient permissions",
        required_roles: allowedRoles,
        current_role: userRole
      });
    }
    next();
  };
};
```

---

### 3. FRONTEND ISSUES

#### Issue #11: API Methods Calling Non-Existent Endpoints
**File:** `../../../Downloads/vigozen-src/src/app/lib/api.ts` (lines 342-391)
**Problem:** API methods defined but backend routes don't exist
**Impact:** All API calls will fail with 404

**Affected Methods:**
```typescript
// Line 347-348 - Endpoint doesn't exist
getSubscription: (token: string) =>
  request("GET", "/api/company/subscription", undefined, token),

// Line 353-354 - Endpoint doesn't exist
updateSubscription: (data: {...}, token: string) =>
  request("PUT", "/api/company/subscription", data, token),

// Line 359-360 - Endpoint doesn't exist
getInvoices: (token: string) =>
  request("GET", "/api/invoices", undefined, token),

// Line 371-372 - Endpoint doesn't exist
getPaymentMethods: (token: string) =>
  request("GET", "/api/payment-methods", undefined, token),

// Line 377-378 - Endpoint doesn't exist
addPaymentMethod: (data: {...}, token: string) =>
  request("POST", "/api/payment-methods", data, token),

// Line 383-384 - Endpoint doesn't exist
deletePaymentMethod: (id: string, token: string) =>
  request("DELETE", `/api/payment-methods/${id}`, undefined, token),

// Line 389-390 - Endpoint doesn't exist
setDefaultPaymentMethod: (id: string, token: string) =>
  request("PUT", `/api/payment-methods/${id}/default`, undefined, token),
```

#### Issue #12: User Activation/Deactivation Methods Not in API
**File:** `../../../Downloads/vigozen-src/src/app/lib/api.ts`
**Problem:** Methods defined (lines 175-182) but backend routes don't exist
**Impact:** Activate/deactivate buttons will fail

```typescript
// These exist in api.ts but backend routes are missing:
activate: (userId: string, token: string) =>
  request("PUT", `/users/${userId}/activate`, undefined, token),

deactivate: (userId: string, token: string) =>
  request("PUT", `/users/${userId}/deactivate`, undefined, token),
```

#### Issue #13: AppContext Calls Non-Existent APIs
**File:** `../../../Downloads/vigozen-src/src/app/context/AppContext.tsx`
**Problem:** Functions call APIs that don't exist
**Impact:** Subscription page will crash on load

**Affected Functions:**
- `fetchCompanySubscription()` (line 384) - Calls `/api/company/subscription` ❌
- `updateCompanySubscription()` (line 400) - Calls `/api/company/subscription` ❌
- `fetchPaymentMethods()` (line 415) - Calls `/api/payment-methods` ❌
- `addPaymentMethod()` (line 426) - Calls `/api/payment-methods` ❌
- `deletePaymentMethod()` (line 440) - Calls `/api/payment-methods` ❌
- `fetchInvoices()` (line 454) - Calls `/api/invoices` ❌
- `activateUser()` (line 920) - Calls `/users/${userId}/activate` ❌
- `deactivateUser()` (line 934) - Calls `/users/${userId}/deactivate` ❌

#### Issue #14: SubscriptionPage Role Check Too Restrictive
**File:** `../../../Downloads/vigozen-src/src/app/pages/SubscriptionPage.tsx` (lines 98-102)
**Problem:** Only allows "admin" role, but should allow "super_admin" too
**Current Code:**
```typescript
if (role !== "admin") {
  navigate("/");
  return;
}
```

**Required Code:**
```typescript
if (role !== "admin" && role !== "super_admin") {
  navigate("/");
  return;
}
```

#### Issue #15: UserProfile Type Missing New Role Values
**File:** `../../../Downloads/vigozen-src/src/app/context/AppContext.tsx` (line 26)
**Problem:** Role type only has "admin" | "user", missing new roles
**Current:**
```typescript
role: "admin" | "user";
```

**Required:**
```typescript
role: "super_admin" | "admin" | "manager" | "sales" | "viewer";
```

---

### 4. LOGIC ISSUES

#### Issue #16: User Creation Creates Active Users by Default
**File:** `server.js` (line 722)
**Problem:** New users are created with `is_active = true`
**Current:**
```javascript
VALUES ($1, $2, $3, $4, $5, $6, true, $7, NOW())
```

**Required:**
```javascript
VALUES ($1, $2, $3, $4, $5, $6, false, $7, NOW())
```
**Impact:** New users are billed immediately without admin activation

#### Issue #17: No Company-Based Billing Calculation
**File:** `server.js`
**Problem:** No function to calculate billing based on active users
**Impact:** Pricing will be wrong or missing

**Required Logic:**
```javascript
function calculateBilling(companyId) {
  const activeUsers = await pool.query(
    "SELECT COUNT(*) FROM users WHERE company_id = $1 AND is_active = true",
    [companyId]
  );
  
  const company = await pool.query(
    "SELECT plan_type, billing_period FROM companies WHERE id = $1",
    [companyId]
  );
  
  const basePrice = getPlanPrice(company.plan_type);
  const subtotal = basePrice * activeUsers.count;
  const discount = getDiscount(company.billing_period);
  const discountedSubtotal = subtotal * (1 - discount / 100);
  const gst = discountedSubtotal * 0.18;
  const total = discountedSubtotal + gst;
  
  return { basePrice, activeUsers: activeUsers.count, subtotal, discount, gst, total };
}
```

---

## 🟡 MEDIUM PRIORITY ISSUES

#### Issue #18: No Migration Script for Existing Data
**Problem:** Existing users don't have company_id or role fields
**Impact:** Existing data will break
**Solution:** Create migration script to:
1. Create default company
2. Assign all existing users to that company
3. Set default roles
4. Initialize subscription_status

#### Issue #19: Hardcoded Plan Prices in Frontend
**File:** `SubscriptionPage.tsx` (lines 35-39)
**Problem:** Prices hardcoded in frontend instead of fetched from backend
**Impact:** Prices can get out of sync with backend

#### Issue #20: No Error Boundaries
**File:** All frontend components
**Problem:** No error handling for API failures
**Impact:** UI crashes on API errors

---

## 🟢 LOW PRIORITY ISSUES

#### Issue #21: Missing Loading States
**File:** Various frontend files
**Problem:** Some API calls don't show loading indicators
**Impact:** Poor UX

#### Issue #22: No Offline Support
**Problem:** App doesn't work offline
**Impact:** Users can't manage subscriptions without internet

---

## ISSUE SUMMARY TABLE

| # | Issue | File | Type | Severity | Status |
|---|-------|------|------|----------|--------|
| 1 | Companies table not created | server.js | Database | 🔴 Critical | ❌ Not Started |
| 2 | Subscriptions table wrong schema | server.js | Database | 🔴 Critical | ❌ Not Started |
| 3 | Invoices table missing | server.js | Database | 🔴 Critical | ❌ Not Started |
| 4 | Payment methods table missing | server.js | Database | 🔴 Critical | ❌ Not Started |
| 5 | Users table missing role field | server.js | Database | 🔴 Critical | ❌ Not Started |
| 6 | Company subscription API missing | server.js | Backend | 🔴 Critical | ❌ Not Started |
| 7 | Payment methods API missing | server.js | Backend | 🔴 Critical | ❌ Not Started |
| 8 | Invoices API missing | server.js | Backend | 🔴 Critical | ❌ Not Started |
| 9 | User activation API missing | server.js | Backend | 🔴 Critical | ❌ Not Started |
| 10 | Role middleware missing | server.js | Backend | 🔴 Critical | ❌ Not Started |
| 11 | API methods call non-existent endpoints | api.ts | Frontend | 🔴 Critical | ❌ Not Started |
| 12 | Activation methods missing backend | api.ts | Frontend | 🔴 Critical | ❌ Not Started |
| 13 | AppContext calls non-existent APIs | AppContext.tsx | Frontend | 🔴 Critical | ❌ Not Started |
| 14 | Role check too restrictive | SubscriptionPage.tsx | Frontend | 🟡 Medium | ❌ Not Started |
| 15 | UserProfile type incomplete | AppContext.tsx | Frontend | 🟡 Medium | ❌ Not Started |
| 16 | Users created as active by default | server.js | Backend | 🔴 Critical | ❌ Not Started |
| 17 | No billing calculation logic | server.js | Backend | 🔴 Critical | ❌ Not Started |
| 18 | No migration script | - | Database | 🟡 Medium | ❌ Not Started |
| 19 | Hardcoded prices | SubscriptionPage.tsx | Frontend | 🟡 Medium | ❌ Not Started |
| 20 | No error boundaries | Various | Frontend | 🟢 Low | ❌ Not Started |
| 21 | Missing loading states | Various | Frontend | 🟢 Low | ❌ Not Started |
| 22 | No offline support | - | Frontend | 🟢 Low | ❌ Not Started |

---

## DEPENDENCY CHAIN

```
Database Issues (1-5) 
    ↓
Backend API Issues (6-10, 16-17)
    ↓
Frontend API Methods (11-13)
    ↓
UI Functionality (14-15)
    ↓
Polish Issues (18-22)
```

**All database issues must be fixed first, then backend APIs, then frontend will work.**

---

## ESTIMATED FIX TIME

| Category | Issues | Estimated Time |
|----------|--------|----------------|
| Database Schema | 5 | 4-6 hours |
| Backend APIs | 7 | 12-16 hours |
| Frontend Fixes | 5 | 4-6 hours |
| Testing | All | 4-6 hours |
| **Total** | **22** | **24-34 hours** |

---

## RECOMMENDED FIX ORDER

### Phase 1: Database (Must Fix First)
1. Issue #1: Create companies table
2. Issue #2: Fix subscriptions table schema
3. Issue #3: Create invoices table
4. Issue #4: Create payment_methods table
5. Issue #5: Add role field to users table
6. Issue #18: Create migration script for existing data

### Phase 2: Backend Core
7. Issue #10: Add role middleware
8. Issue #16: Fix user creation (inactive by default)
9. Issue #17: Add billing calculation logic
10. Issue #6: Implement company subscription API
11. Issue #7: Implement payment methods API
12. Issue #8: Implement invoices API
13. Issue #9: Implement user activation API

### Phase 3: Frontend
14. Issue #11: API methods already correct, just need backend
15. Issue #13: AppContext already correct, just need backend
16. Issue #14: Fix role check
17. Issue #15: Update UserProfile type

### Phase 4: Polish
18. Issue #19: Fetch prices from backend
19. Issue #20: Add error boundaries
20. Issue #21: Add loading states
21. Issue #22: Add offline support (optional)

---

## TESTING CHECKLIST

After fixing all issues, test:

- [ ] Companies table exists and has correct schema
- [ ] Subscriptions table is company-based
- [ ] Invoices table exists
- [ ] Payment methods table exists
- [ ] Users table has role field
- [ ] GET /api/company/subscription returns data
- [ ] PUT /api/company/subscription updates plan
- [ ] GET /api/payment-methods returns list
- [ ] POST /api/payment-methods adds card
- [ ] DELETE /api/payment-methods removes card
- [ ] GET /api/invoices returns invoices
- [ ] PUT /api/users/:id/activate works
- [ ] PUT /api/users/:id/deactivate works
- [ ] Role middleware blocks unauthorized access
- [ ] SubscriptionPage loads without errors
- [ ] Pricing calculates correctly
- [ ] User activation/deactivation works
- [ ] Payment methods can be added/deleted
- [ ] Invoice history displays
- [ ] Billing period discounts apply correctly
- [ ] GST calculation is correct (18%)

---

## CONCLUSION

**Current State:** Frontend UI is complete but completely non-functional due to missing backend APIs and database schema.

**Root Cause:** Database schema was not updated to support company-based subscriptions, and backend APIs were not implemented.

**Next Steps:**
1. Fix all database schema issues (Phase 1)
2. Implement all backend APIs (Phase 2)
3. Test frontend functionality (Phase 3)
4. Deploy and monitor (Phase 4)

**Estimated Total Time:** 24-34 hours of development work