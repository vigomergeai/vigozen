# VigoZen CRM - UI Change Report

## Overview
This report identifies all components, functions, and sections that need to be modified based on the current UI screenshots and codebase analysis.

---

## 1. LAYOUT COMPONENT (`src/app/components/Layout.tsx`)

### 1.1 Sidebar User Section (Lines 236-265)
**Current State:**
- Shows user avatar, name, department, and logout button
- Displays subscription badge when available

**Required Changes:**
- **Function:** Update user info display to show "Admin · Admin" format (duplicate role display)
- **Lines to modify:** 244-245
- **Change needed:** 
  ```typescript
  // Current:
  <div className="text-xs font-medium text-white truncate">{currentUser.name}</div>
  <div className="text-[10px] text-slate-400 truncate capitalize">{currentUser.department}</div>
  
  // Required: Show role twice as shown in screenshot
  <div className="text-xs font-medium text-white truncate">{currentUser.name}</div>
  <div className="text-[10px] text-slate-400 truncate capitalize">{role} · {role}</div>
  ```

### 1.2 Header User Menu (Lines 331-406)
**Current State:**
- Shows user avatar, name, and role in dropdown
- Displays subscription and database status badges

**Required Changes:**
- **Function:** Update user menu header to match screenshot format
- **Lines to modify:** 339-341
- **Change needed:**
  ```typescript
  // Current:
  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-tight">{currentUser.name}</div>
  <div className="text-[10px] text-slate-400 capitalize">{role}</div>
  
  // Required: Show "Admin · Admin" format
  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-tight">{currentUser.name}</div>
  <div className="text-[10px] text-slate-400 capitalize">{role} · {role}</div>
  ```

---

## 2. SETTINGS PAGE (`src/app/pages/SettingsPage.tsx`)

### 2.1 Settings Sidebar Profile Card (Lines 732-743)
**Current State:**
- Shows avatar, name, and role in format "role · department"

**Required Changes:**
- **Function:** Update profile card to show "Admin · Admin" format
- **Lines to modify:** 739-740
- **Change needed:**
  ```typescript
  // Current:
  <div className="text-sm font-semibold text-slate-800 truncate">{profile.name || currentUser.name}</div>
  <div className="text-[10px] text-slate-500 capitalize">{role} · {profile.role || currentUser.department}</div>
  
  // Required: Show role twice
  <div className="text-sm font-semibold text-slate-800 truncate">{profile.name || currentUser.name}</div>
  <div className="text-[10px] text-slate-500 capitalize">{role} · {role}</div>
  ```

### 2.2 Personal Information Section (Lines 764-845)
**Current State:**
- Shows avatar with upload/delete buttons
- Displays "Change photo" text button
- Form fields for name, email, phone, company, role, timezone

**Required Changes:**
- **Function:** Add "Remove" button next to "Change Photo" button
- **Lines to modify:** 807-818
- **Change needed:**
  ```typescript
  // Current:
  <label className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer">
    <Camera size={11} />
    {uploadingAvatar ? "Uploading..." : "Change photo"}
    <input type="file" ... />
  </label>
  
  // Required: Add Remove button
  <div className="mt-2 flex items-center gap-3">
    <label className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer">
      <Camera size={11} />
      {uploadingAvatar ? "Uploading..." : "Change Photo"}
      <input type="file" ... />
    </label>
    {userProfile?.avatar_url && (
      <button 
        onClick={handleDeleteAvatar}
        className="text-xs text-slate-500 hover:text-red-600 transition-colors"
      >
        Remove
      </button>
    )}
  </div>
  ```

### 2.3 Settings Navigation Tabs (Lines 710-717)
**Current State:**
- Tabs: Profile, Notifications, Lead Integrations, Price List, Security, System

**Required Changes:**
- **No changes needed** - Already matches screenshot

---

## 3. SALES PAGE (`src/app/pages/SalesPage.tsx`)

### 3.1 Sales Page Header (Lines 199-220)
**Current State:**
- Shows "Sales Pipeline" title
- Displays active deals count and pipeline value
- Has view toggle (Kanban/Forecast) and New Deal button

**Required Changes:**
- **No changes needed** - Already matches screenshot

### 3.2 KPI Cards (Lines 223-242)
**Current State:**
- 4 KPI cards: Won (MTD), Pipeline Value, Active Deals, Avg Deal Size
- Each shows icon, value, label, and trend

**Required Changes:**
- **No changes needed** - Already matches screenshot

### 3.3 AI Revenue Forecast Component
**Current State:**
- Uses `RevenueForecast` component (Line 246)

**Required Changes:**
- **Component to review:** `src/app/components/RevenueForecast.tsx`
- **Action:** Verify the forecast display matches the purple gradient banner shown in screenshot

### 3.4 Kanban Board (Lines 255-317)
**Current State:**
- 7 stages: New, Contacted, Qualified, Proposal, Negotiation, Won, Lost
- Each stage shows count and total value
- Deals are draggable between stages

**Required Changes:**
- **No changes needed** - Already matches screenshot

---

## 4. NOTIFICATION DROPDOWN (`src/app/components/NotificationDropdown.tsx`)

### 4.1 Notification Badge (Lines 111-122)
**Current State:**
- Bell icon with red badge showing unread count
- Badge shows "99+" if over 99

**Required Changes:**
- **No changes needed** - Already matches screenshot

### 4.2 Dropdown Panel (Lines 125-211)
**Current State:**
- Shows "Notifications" header with "Mark all read" button
- Groups notifications by time (Today, Yesterday, This Week, Older)
- Each notification shows title, priority badge, message, and timestamp

**Required Changes:**
- **No changes needed** - Already matches screenshot

---

## 5. SUMMARY OF CHANGES REQUIRED

### High Priority Changes:
1. **Layout.tsx - Sidebar User Section** (Lines 244-245)
   - Change department display to show role twice: `{role} · {role}`

2. **Layout.tsx - Header User Menu** (Lines 339-341)
   - Change role display to show role twice: `{role} · {role}`

3. **SettingsPage.tsx - Profile Card** (Lines 739-740)
   - Change role display to show role twice: `{role} · {role}`

4. **SettingsPage.tsx - Change Photo Button** (Lines 807-818)
   - Add "Remove" button next to "Change Photo" button
   - Only show when avatar exists

### Medium Priority Changes:
5. **RevenueForecast.tsx** - Review and verify the AI Revenue Forecast banner matches the purple gradient design shown in screenshot

### Low Priority Changes:
6. **All Pages** - Verify dark mode compatibility for all new changes

---

## 6. FILES TO MODIFY

| File Path | Lines to Change | Priority | Description |
|-----------|----------------|----------|-------------|
| `src/app/components/Layout.tsx` | 244-245 | HIGH | Update sidebar user info display |
| `src/app/components/Layout.tsx` | 339-341 | HIGH | Update header user menu display |
| `src/app/pages/SettingsPage.tsx` | 739-740 | HIGH | Update settings profile card |
| `src/app/pages/SettingsPage.tsx` | 807-818 | HIGH | Add Remove button for avatar |
| `src/app/components/RevenueForecast.tsx` | Full file | MEDIUM | Verify forecast banner design |

---

## 7. TESTING CHECKLIST

- [ ] Verify sidebar shows "Admin · Admin" format
- [ ] Verify header user menu shows "Admin · Admin" format
- [ ] Verify settings profile card shows "Admin · Admin" format
- [ ] Verify "Remove" button appears next to "Change Photo" when avatar exists
- [ ] Verify "Remove" button is hidden when no avatar
- [ ] Test avatar upload functionality still works
- [ ] Test avatar delete functionality works with new button
- [ ] Verify dark mode compatibility for all changes
- [ ] Test on mobile responsive view
- [ ] Verify Sales page KPIs and Kanban board display correctly

---

## 8. NOTES

- All changes are UI/display only - no backend changes required
- Avatar upload/delete functionality already exists, just needs UI button addition
- Role display format change is consistent across all user-facing components
- No new dependencies or libraries required