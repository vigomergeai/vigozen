# 👑 Super Admin - Comprehensive Permissions & Limitations Report

This report outlines the platform-wide capabilities, module-level actions, administrative controls, and functional limitations for the **Super Admin** role in the CRM.

---

## 📋 Role Overview
The **Super Admin** represents the absolute highest authority on the platform. They are responsible for global system maintenance, platform-wide metrics, multi-tenant organization creation, billing configurations, and overall security enforcement.

- **Reports To**: None (Root / Platform Owner)
- **Directly Manages**: All Organizations, all Organization Admins, and the entire CRM database/platform.

---

## ✅ EVERYTHING A SUPER ADMIN CAN DO

### 1. Platform-wide Dashboard & Analytics
The Super Admin sees a fully aggregated view of the platform's activity, spanning all organizations:
* **Platform KPIs**: Total companies, active users, overall customer count, and platform health metrics.
* **Aggregated Revenue**: Cross-company monthly recurring revenue (MRR) and transaction history.
* **Subscription Stats**: Statistics on active plans, trial periods, upgrades, and churn.
* **Global AI Insights**: Platform-wide recommendations and aggregate AI models performance.
* **System Audit Logs**: Platform-wide system error rates, login locations, and access audits.

### 2. Multi-Tenant Lead Management
The Super Admin has absolute read/write/delete capabilities on all leads:
* **Global Scope**: View and query leads from **every single company** registered in the database.
* **Actions**: Create, edit details, assign, merge duplicate records, and permanently delete leads.
* **Bulk Operations**: Bulk import via CSV/Excel and bulk export lead datasets.
* **Pipeline Conversion**: Convert leads to deals for any company.
* **AI Scoring**: Access AI lead prediction lists and next-action recommendations.

### 3. Deal & Pipeline Management
* **Global Deal Access**: View, update, and manage sales deals for all organizations.
* **Sales Pipeline**: Drag and drop deals across custom pipeline stages, adjust probabilities, and close deals as Won/Lost.
* **Forecasts**: Access platform-wide revenue forecasts and pipeline velocity statistics.

### 4. Global User Management (Admin Panel)
* **Cross-Company User Visibility**: View every single user account on the system.
* **Org Admin Creation**: Create and bootstrap new **Organization Admin** accounts to manage newly onboarded companies.
* **Direct Moderation**: Edit user information, force password resets, activate/deactivate accounts, and adjust roles.
* **Reporting Structure**: Define and override reporting managers for any user.
* **Bulk User Controls**: Bulk import, bulk export, bulk delete, and mass role changes.

### 5. Platform Settings & Customization
* **System Settings**: Modify global variables, SMTP servers, notification templates, and system preferences.
* **AI Engine Configuration**: Define parameters and thresholds for the AI Lead Scorer and AI Assistant.
* **Integrations Registry**: Configure and enable global third-party APIs, OAuth providers, and social sync routes.
* **System Security**: Define system password complexity guidelines, session duration timeouts, and MFA settings.
* **White-Labeling**: Customize platform branding, logos, color themes, and domain configuration.

### 6. Billing & Pricing Matrix Configuration
* **Subscription Packages**: Define and modify billing tiers (e.g., Professional, Enterprise), plan limits, and pricing.
* **Company Subscription Management**: Manually upgrade/downgrade or activate/cancel any company's subscription.
* **GST & Taxation**: Set tax rules, payment methods, transaction gateways, and download platform-wide invoices.

### 7. Support & Documentation Desk
* **Universal Tickets**: View and respond to support tickets submitted by any user from any company.
* **Knowledge Base**: Author global help articles, documentation, and tutorials.

---

## 🚫 WHAT A SUPER ADMIN CANNOT DO (Limitations & Constraints)

Despite having unrestricted access to modules, there are a few strict architectural constraints and functional limitations:

| # | Action | Constraint | Reason / Solution |
|---|--------|------------|-------------------|
| **1** | Create another Super Admin | **Restricted** | Super Admin accounts cannot be created dynamically from the standard Admin Panel UI (by default) to prevent unauthorized escalation of platform-wide control. Additional Super Admins can only be created directly via database seeding or platform-owner command line tools. |
| **2** | Bypass system capacity limits | **Constrained** | Subject to hardware and database resources (e.g., CPU, RAM, IOPS limits). |
| **3** | Edit third-party payment profiles | **Restricted** | Cannot modify raw bank details or card details stored directly inside gateways (Stripe/Razorpay accounts) without logging into those specific vendor dashboards directly. |
| **4** | Delete logs in Audit History | **Restricted** | Audit logs are immutable records. Even a Super Admin cannot delete individual actions from the audit history table to preserve compliance integrity. |
