const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const cors = require("cors");
const PDFDocument = require("pdfkit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("./db");
const { getPriorityLeads } = require("./leadScoring");
const { generateInsight } = require("./geminiInsight");
const { getTeamStats } = require("./teamStats");
const notificationQueue = require("./server/notificationQueue");
const notificationService = require("./server/notificationService");
const { startNotificationWorker } = require("./server/notificationWorker");
const path = require("path");

require("dotenv").config();



// Create uploads folder if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads/avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter - only images
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) {
    return cb(null, true);
  }
  cb(new Error('Only image files are allowed'));
};

// Multer middleware
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter
});

// Auto-migrate tables
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255),
        type VARCHAR(100),
        description TEXT,
        icon VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        leads INTEGER DEFAULT 0,
        last_sync VARCHAR(255),
        config JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        order_id VARCHAR(255) NOT NULL,
        payment_id VARCHAR(255),
        amount DECIMAL(15,2) NOT NULL,
        plan VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS subscriptions (
        id VARCHAR(255) PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        plan_id VARCHAR(100),
        amount DECIMAL(15,2),
        total_count INTEGER DEFAULT 12,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS lead_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL,
        user_id UUID,
        user_name VARCHAR(255),
        user_avatar VARCHAR(10),
        comment TEXT NOT NULL,
        parent_comment_id UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        company_id UUID,
        type VARCHAR(100),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        link VARCHAR(255),
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'sent',
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMP,
        metadata JSONB DEFAULT '{}'::jsonb,
        scheduled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        user_name VARCHAR(255),
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID,
        changes JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`).catch(() => { });

    // ── user_settings table for ad preferences ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ad_auto_sync BOOLEAN DEFAULT false,
        ad_auto_create BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      );
    `).catch(() => { });
    await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS config JSONB;`).catch(() => { });
    await pool.query(`ALTER TABLE guides ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id UUID;`).catch(() => { });
    // Add missing columns to notifications table if they don't exist
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';`).catch(() => { });
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent';`).catch(() => { });
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS company_id UUID;`).catch(() => { });
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_to_deal BOOLEAN DEFAULT false;`).catch(() => { });
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_id UUID;`).catch(() => { });
    await pool.query(`UPDATE leads SET converted_to_deal = false WHERE converted_to_deal IS NULL;`).catch(() => { });
    await pool.query(`ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;`).catch(() => { });
    await pool.query(`ALTER TABLE lead_comments ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);`).catch(() => { });
    await pool.query(`ALTER TABLE lead_comments ADD COLUMN IF NOT EXISTS user_avatar VARCHAR(10);`).catch(() => { });
    await pool.query(`ALTER TABLE lead_comments ADD COLUMN IF NOT EXISTS parent_comment_id UUID;`).catch(() => { });

    // ── Add subscription columns to users table ──
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_start TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'trialing';`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_type VARCHAR(100) DEFAULT 'trial';`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid';`).catch(() => { });

    // ── Company subscription columns ──
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_type VARCHAR(100) DEFAULT 'professional';`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS billing_period VARCHAR(50) DEFAULT 'monthly';`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'trial';`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS active_users_count INTEGER DEFAULT 0;`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 50;`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS purchased_users INTEGER DEFAULT 10;`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS allowed_users INT DEFAULT 10;`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_start TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_end TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_trial_active BOOLEAN DEFAULT true;`).catch(() => { });
    await pool.query(`UPDATE companies SET trial_start = NOW() WHERE trial_start IS NULL;`).catch(() => { });
    await pool.query(`UPDATE companies SET trial_end = NOW() + INTERVAL '3 days' WHERE trial_end IS NULL;`).catch(() => { });
    await pool.query(`UPDATE companies SET allowed_users = COALESCE(purchased_users, 10) WHERE allowed_users IS NULL OR allowed_users = 0;`).catch(() => { });
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`).catch(() => { });

    // ── RBAC Schema Migration ──
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id);`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id UUID;`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token VARCHAR(255);`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(50) DEFAULT 'Sales';`).catch(() => { });
    await pool.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'Sales Executive';`).catch(() => { });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        team_name VARCHAR(255) NOT NULL,
        team_leader_id UUID REFERENCES users(id),
        manager_id UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `).catch(() => { });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        module VARCHAR(50) NOT NULL,
        permission VARCHAR(20) NOT NULL
      );
    `).catch(() => { });

    await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id UUID;`).catch(() => { });
    await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_role VARCHAR(50);`).catch(() => { });

    // Seed default role permissions
    const seedPermissions = async (compId) => {
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
        // Sales Manager
        { role: 'Sales Manager', module: 'leads', permission: 'dept' },
        { role: 'Sales Manager', module: 'deals', permission: 'dept' },
        { role: 'Sales Manager', module: 'users', permission: 'team' },
        { role: 'Sales Manager', module: 'reports', permission: 'dept' },
        { role: 'Sales Manager', module: 'settings', permission: 'none' },
        { role: 'Sales Manager', module: 'billing', permission: 'none' },
        { role: 'Sales Manager', module: 'tickets', permission: 'dept' },
        { role: 'Sales Manager', module: 'activities', permission: 'dept' },
        // Team Leader
        { role: 'Team Leader', module: 'leads', permission: 'team' },
        { role: 'Team Leader', module: 'deals', permission: 'team' },
        { role: 'Team Leader', module: 'users', permission: 'team' },
        { role: 'Team Leader', module: 'reports', permission: 'team' },
        { role: 'Team Leader', module: 'settings', permission: 'none' },
        { role: 'Team Leader', module: 'billing', permission: 'none' },
        { role: 'Team Leader', module: 'tickets', permission: 'team' },
        { role: 'Team Leader', module: 'activities', permission: 'team' },
        // Sales Executive
        { role: 'Sales Executive', module: 'leads', permission: 'own' },
        { role: 'Sales Executive', module: 'deals', permission: 'own' },
        { role: 'Sales Executive', module: 'users', permission: 'none' },
        { role: 'Sales Executive', module: 'reports', permission: 'own' },
        { role: 'Sales Executive', module: 'settings', permission: 'none' },
        { role: 'Sales Executive', module: 'billing', permission: 'none' },
        // Lead Manager
        { role: 'Lead Manager', module: 'leads', permission: 'dept' },
        { role: 'Lead Manager', module: 'deals', permission: 'dept' },
        { role: 'Lead Manager', module: 'reports', permission: 'dept' },
        { role: 'Lead Manager', module: 'users', permission: 'team' },
        { role: 'Lead Manager', module: 'settings', permission: 'none' },
        { role: 'Lead Manager', module: 'billing', permission: 'none' }
      ];

      for (const p of permissions) {
        if (compId) {
          const check = await pool.query(
            "SELECT 1 FROM role_permissions WHERE company_id = $1 AND role = $2 AND module = $3",
            [compId, p.role, p.module]
          );
          if (check.rows.length === 0) {
            await pool.query(
              "INSERT INTO role_permissions (company_id, role, module, permission) VALUES ($1, $2, $3, $4)",
              [compId, p.role, p.module, p.permission]
            ).catch(() => { });
          }
        } else {
          const check = await pool.query(
            "SELECT 1 FROM role_permissions WHERE company_id IS NULL AND role = $1 AND module = $2",
            [p.role, p.module]
          );
          if (check.rows.length === 0) {
            await pool.query(
              "INSERT INTO role_permissions (role, module, permission) VALUES ($1, $2, $3)",
              [p.role, p.module, p.permission]
            ).catch(() => { });
          }
        }
      }
    };

    await seedPermissions(null);
    const existingCompanies = await pool.query("SELECT id FROM companies");
    for (const company of existingCompanies.rows) {
      await seedPermissions(company.id);
    }

    // ── Pricing config table ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pricing_config (
        id SERIAL PRIMARY KEY,
        starter_price_per_user INT DEFAULT 600,
        gst_rate INT DEFAULT 18,
        monthly_discount INT DEFAULT 0,
        quarterly_discount INT DEFAULT 5,
        half_yearly_discount INT DEFAULT 10,
        yearly_discount INT DEFAULT 15,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `).catch(() => { });
    await pool.query(`
      INSERT INTO pricing_config (starter_price_per_user, gst_rate, monthly_discount, quarterly_discount, half_yearly_discount, yearly_discount)
      SELECT 600, 18, 0, 5, 10, 15 WHERE NOT EXISTS (SELECT 1 FROM pricing_config);
    `).catch(() => { });

    // ── Payment methods table ──
    await pool.query(`
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
    `).catch(() => { });

    // ── Invoices table (with user_id for backward compatibility) ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        company_id UUID,
        subscription_id UUID,
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
        due_date TIMESTAMP,
        billing_period_start TIMESTAMP,
        billing_period_end TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });

    // ── Add missing columns to invoices table if it already existed ──
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS user_id UUID;`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_id UUID;`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subscription_id UUID;`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount DECIMAL(15,2);`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(15,2);`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cgst DECIMAL(15,2) DEFAULT 0;`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sgst DECIMAL(15,2) DEFAULT 0;`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2);`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_url VARCHAR(500);`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMP;`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS purchased_users INTEGER;`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS plan VARCHAR(100);`).catch(() => { });
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`).catch(() => { });

    // ── Set trial for existing users ──
    await pool.query(`
      UPDATE users SET 
        trial_start = created_at,
        trial_end = created_at + INTERVAL '3 days',
        subscription_status = 'trialing',
        plan_type = 'trial'
      WHERE trial_start IS NULL
    `).catch(() => { });

    // Auto-extend crm_status enum values if it exists
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_status') THEN
          ALTER TYPE crm_status ADD VALUE IF NOT EXISTS 'won';
          ALTER TYPE crm_status ADD VALUE IF NOT EXISTS 'Won';
          ALTER TYPE crm_status ADD VALUE IF NOT EXISTS 'converted';
          ALTER TYPE crm_status ADD VALUE IF NOT EXISTS 'lost';
          ALTER TYPE crm_status ADD VALUE IF NOT EXISTS 'Lost';
        END IF;
      END $$;
    `).catch(() => { });

    // ── AD CONNECTIONS TABLE UPDATES ──
    await pool.query(`
      ALTER TABLE ad_connections 
      ADD COLUMN IF NOT EXISTS access_token TEXT,
      ADD COLUMN IF NOT EXISTS refresh_token TEXT,
      ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS platform_account_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS platform_account_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(50) DEFAULT 'never',
      ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
      ADD COLUMN IF NOT EXISTS sync_logs JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS last_sync_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS api_key TEXT,
      ADD COLUMN IF NOT EXISTS webhook_url TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT
    `).catch(() => { });

    // ── AD SYNC LOGS TABLE ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ad_sync_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id UUID REFERENCES ad_connections(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL,
        leads_imported INTEGER DEFAULT 0,
        errors JSONB DEFAULT '[]',
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => { });

    console.log("✅ Auto-migration: DB tables ready");
  } catch (err) {
    console.error("Auto-migration warning:", err.message);
  }
})();

// Global error handlers to prevent crash
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Helper: Audit Logging
const logAudit = async (userId, userName, action, entityType, entityId, changes = null, ipAddress = null) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, changes, ip_address, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())`,
      [userId || null, userName || 'System', action, entityType, entityId || null, changes ? JSON.stringify(changes) : null, ipAddress || null]
    );
  } catch (err) {
    console.error("Audit log error:", err);
  }
};
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

// ── Helper: Create Notification (direct DB insert) ──


const app = express();

// ── CORS CONFIGURATION ──
// Allow requests from frontend origins. Supports crm.vigomerge.com, admin.vigomerge.com, localhost dev servers.
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (server-to-server, mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    const allowedStaticOrigins = [
      "https://crm.vigomerge.com",
      "https://admin.vigomerge.com",
      "https://api.vigomerge.com",
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:5000",
      "http://127.0.0.1:5173"
    ];

    if (
      allowedStaticOrigins.includes(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin) ||
      origin.endsWith(".vigomerge.com")
    ) {
      return callback(null, true);
    }

    // Fallback: allow all (for development flexibility)
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// ── Explicit OPTIONS handler for preflight requests ──
// Express 5 + path-to-regexp 8.x requires '{*splat}' instead of '*' or '/*'
// This ensures preflight responses are handled even without the cors middleware.
app.options('{*splat}', cors());
app.options('{*splat}', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(204);
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: "Access token required"
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || "your-super-secret-key-change-this-later-12345", (err, user) => {
    if (err) {
      console.log("JWT ERROR:", err);
      return res.status(403).json({
        error: "Invalid token",
        details: err.message
      });
    }

    console.log("Decoded JWT:", user);

    req.user = user;

    next();
  });
};

// ── ROLE-BASED ACCESS CONTROL ──
const normalizeRole = (role) => {
  if (!role) return '';
  return role.toLowerCase().replace(/[\s_]+/g, '_').trim();
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userRole = req.user.role || 'sales';
    const normalizedUserRole = normalizeRole(userRole);
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);
    if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        required_roles: allowedRoles,
        current_role: userRole
      });
    }
    next();
  };
};

// Determine user's scope for a specific module (Static Fallback)
const isAdminRole = (role) => {
  const norm = normalizeRole(role);
  return norm === 'super_admin' || norm === 'org_admin' || norm === 'admin';
};

const getPermissionScope = (role, module) => {
  if (!role) return 'none';
  const norm = normalizeRole(role);
  if (norm === 'super_admin' || norm === 'org_admin' || norm === 'admin') return 'full';

  const hierarchy = {
    'org_admin': { leads: 'full', deals: 'full', users: 'full', reports: 'full', settings: 'full', billing: 'full', tickets: 'full', activities: 'full' },
    'sales_manager': { leads: 'dept', deals: 'dept', users: 'team', reports: 'dept', settings: 'none', billing: 'none', tickets: 'dept', activities: 'dept' },
    'team_leader': { leads: 'team', deals: 'team', users: 'team', reports: 'team', settings: 'none', billing: 'none', tickets: 'team', activities: 'team' },
    'sales_executive': { leads: 'own', deals: 'own', users: 'own', reports: 'own', settings: 'none', billing: 'none', tickets: 'own', activities: 'own' },
    'lead_manager': { leads: 'dept', deals: 'dept', users: 'team', reports: 'dept', settings: 'none', billing: 'none', tickets: 'dept', activities: 'dept' },
    'lead_executive': { leads: 'own', deals: 'own', users: 'own', reports: 'own', settings: 'none', billing: 'none', tickets: 'own', activities: 'own' },
    'telecaller': { leads: 'own', deals: 'none', users: 'own', reports: 'own', settings: 'none', billing: 'none', tickets: 'own', activities: 'own' },
    'lead_qualifier': { leads: 'own', deals: 'none', users: 'own', reports: 'own', settings: 'none', billing: 'none', tickets: 'own', activities: 'own' }
  };

  return hierarchy[norm]?.[module] || 'none';
};

const checkUserManagementAccess = async (currentUser, targetUserId, reqTeamId) => {
  const { role, id: currentUserId, company_id } = currentUser;

  // Fetch target user details
  const targetUserRes = await pool.query("SELECT role, company_id, manager_id, is_active FROM users WHERE id = $1", [targetUserId]);
  if (targetUserRes.rows.length === 0) {
    return { allowed: false, error: "User not found" };
  }
  const targetUser = targetUserRes.rows[0];

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

  // Sales Manager, Lead Manager, Team Leader can only manage their subordinates
  const subIds = await getSubordinateUserIds(currentUserId, reqTeamId);
  const isSub = subIds.includes(targetUserId);

  if (!isSub || currentUserId === targetUserId) {
    return { allowed: false, error: "You can only manage users who report to you" };
  }

  const targetRoleLower = targetUser.role.toLowerCase();
  const currentRoleLower = role.toLowerCase();

  // - Sales Manager can edit/manage Team Leaders and Sales Executives under them
  if (currentRoleLower === 'sales manager' || currentRoleLower === 'sales_manager') {
    if (!['team leader', 'team_leader', 'sales executive', 'sales_executive'].includes(targetRoleLower)) {
      return { allowed: false, error: "Sales Manager can only manage Team Leaders and Sales Executives" };
    }
  }
  // - Lead Manager can edit/manage Lead Executives, Telecallers, and Lead Qualifiers under them
  else if (currentRoleLower === 'lead manager' || currentRoleLower === 'lead_manager') {
    if (!['lead executive', 'lead_executive', 'telecaller', 'lead qualifier', 'lead_qualifier'].includes(targetRoleLower)) {
      return { allowed: false, error: "Lead Manager can only manage Lead Executives, Telecallers, and Lead Qualifiers" };
    }
  }
  else {
    return { allowed: false, error: "Insufficient permissions to manage users" };
  }

  return { allowed: true, targetUser };
};

// GET /auth/permissions endpoint
app.get("/auth/permissions", authenticateToken, async (req, res) => {
  try {
    const role = req.user.role;
    const modules = ['leads', 'deals', 'users', 'reports', 'settings', 'billing', 'tickets', 'activities'];
    const permissions = {};
    for (const m of modules) {
      permissions[m] = getPermissionScope(role, m);
    }
    res.json({ permissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Middleware to attach permission scope to request
const checkPermission = (module) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const { role, company_id, team_id, id: userId } = req.user;

    req.teamId = team_id || null;
    req.userId = userId;
    req.companyId = company_id;

    if (isAdminRole(role)) {
      req.permissionScope = 'full';
      return next();
    }

    let permissionScope = 'none';

    try {
      const result = await pool.query(
        `SELECT permission FROM role_permissions 
         WHERE role = $1 AND module = $2 AND (company_id = $3 OR company_id IS NULL)
         ORDER BY company_id DESC NULLS LAST LIMIT 1`,
        [role, module, company_id]
      );
      if (result.rows.length > 0) {
        permissionScope = result.rows[0].permission;
        // If DB says 'none' but static hierarchy grants access, use static
        // This fixes stale/incorrect DB permissions that block manager roles
        const staticScope = getPermissionScope(role, module);
        if (permissionScope === 'none' && staticScope !== 'none') {
          permissionScope = staticScope;
        }
      } else {
        permissionScope = getPermissionScope(role, module);
      }
    } catch (err) {
      console.warn("DB permission check fallback:", err.message);
      permissionScope = getPermissionScope(role, module);
    }

    req.permissionScope = permissionScope;

    if (permissionScope === 'none') {
      return res.status(403).json({ error: `Access denied to the ${module} module.` });
    }

    next();
  };
};

// Get all subordinate user IDs (including the user themselves)
const getSubordinateUserIds = async (userId, teamId) => {
  // If teamId not provided, fetch it from user record
  if (!teamId) {
    try {
      const userRes = await pool.query("SELECT team_id FROM users WHERE id = $1", [userId]);
      if (userRes.rows.length > 0) {
        teamId = userRes.rows[0].team_id;
      }
    } catch (err) {
      console.error("Error fetching user team_id:", err);
    }
  }

  const params = [userId];
  let query = '';
  if (teamId) {
    query = `
      WITH RECURSIVE subordinates AS (
         -- 1. Non-recursive starting set: the user and all team members
         SELECT id FROM users WHERE id = $1
         UNION
         SELECT id FROM users WHERE team_id = $2
         
         UNION ALL
         
         -- 2. Recursive part: anyone reporting to any found subordinates
         SELECT u.id FROM users u
         INNER JOIN subordinates s ON u.manager_id = s.id
      )
      SELECT DISTINCT id FROM subordinates
    `;
    params.push(teamId);
  } else {
    query = `
      WITH RECURSIVE subordinates AS (
         -- 1. Non-recursive starting set: the user
         SELECT id FROM users WHERE id = $1
         
         UNION ALL
         
         -- 2. Recursive part: anyone reporting to any found subordinates
         SELECT u.id FROM users u
         INNER JOIN subordinates s ON u.manager_id = s.id
      )
      SELECT DISTINCT id FROM subordinates
    `;
  }

  try {
    const result = await pool.query(query, params);
    const ids = result.rows.map(r => r.id);

    // Always ensure the user themselves is included
    if (!ids.includes(userId)) {
      ids.push(userId);
    }

    return ids;
  } catch (err) {
    console.error("getSubordinateUserIds error:", err);
    return [userId];
  }
};

// Generate dynamic multi-tenant hierarchical query filters
const getScopedQueryFilters = async (table, req) => {
  const { role, company_id, id: userId, team_id } = req.user;
  const scope = req.permissionScope;

  // ── SUPER ADMIN: No filters ──
  if (role === 'Super Admin' || role === 'super_admin') {
    return { joinClause: '', whereClause: '', params: [] };
  }

  let joinClause = '';
  let clauses = [];
  let params = [company_id];

  // ── ACTIVITIES ──
  if (table === 'activities') {
    joinClause = 'INNER JOIN deals d ON a.deal_id = d.id';
    clauses.push('d.company_id = $1');
    if (scope === 'own') {
      clauses.push(`d.owner_id = $2`);
      params.push(userId);
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(userId, team_id);
      clauses.push(`d.owner_id = ANY($2)`);
      params.push(subIds);
    }
  }

  // ── CONTACTS ──
  else if (table === 'contacts') {
    clauses.push('company_id = $1');
    if (scope === 'own') {
      clauses.push(`owner_id = $2`);
      params.push(userId);
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(userId, team_id);
      clauses.push(`owner_id = ANY($2)`);
      params.push(subIds);
    }
  }

  // ── LEADS ── ✅ ADD THIS CASE
  else if (table === 'leads') {
    clauses.push('company_id = $1');
    if (scope === 'own') {
      clauses.push(`owner_id = $2`);
      params.push(userId);
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(userId, team_id);
      clauses.push(`owner_id = ANY($2)`);
      params.push(subIds);
    }
  }

  // ── DEALS ──
  else if (table === 'deals') {
    clauses.push('company_id = $1');
    if (scope === 'own') {
      clauses.push(`owner_id = $2`);
      params.push(userId);
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(userId, team_id);
      clauses.push(`owner_id = ANY($2)`);
      params.push(subIds);
    }
  }

  // ── TICKETS ──
  else if (table === 'tickets') {
    clauses.push('company_id = $1');
    if (scope === 'own') {
      clauses.push(`(owner_id = $2 OR assigned_to = $2)`);
      params.push(userId);
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(userId, team_id);
      clauses.push(`(owner_id = ANY($2) OR assigned_to = ANY($2))`);
      params.push(subIds);
    }
  }

  // ── USERS ──
  else if (table === 'users') {
    clauses.push('company_id = $1');
    if (scope === 'own') {
      clauses.push(`id = $2`);
      params.push(userId);
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(userId, team_id);
      clauses.push(`id = ANY($2)`);
      params.push(subIds);
    }
  }

  // ── TASKS ──
  else if (table === 'tasks') {
    clauses.push('company_id = $1');
    if (scope === 'own') {
      clauses.push(`(assigned_to = $2 OR assigned_by = $2)`);
      params.push(userId);
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(userId, team_id);
      clauses.push(`(assigned_to = ANY($2) OR assigned_by = ANY($2))`);
      params.push(subIds);
    }
  }

  // ── CALENDAR ──
  else if (table === 'calendar') {
    clauses.push('company_id = $1');
    if (scope === 'own') {
      clauses.push(`created_by = $2`);
      params.push(userId);
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(userId, team_id);
      clauses.push(`created_by = ANY($2)`);
      params.push(subIds);
    }
  }

  // ── REPORTS ──
  else if (table === 'reports') {
    clauses.push('company_id = $1');
    if (scope === 'own') {
      clauses.push(`owner_id = $2`);
      params.push(userId);
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(userId, team_id);
      clauses.push(`owner_id = ANY($2)`);
      params.push(subIds);
    }
  }

  // ── GENERIC FALLBACK ──
  else {
    clauses.push('company_id = $1');
    if (scope === 'own') {
      clauses.push(`owner_id = $2`);
      params.push(userId);
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(userId, team_id);
      clauses.push(`owner_id = ANY($2)`);
      params.push(subIds);
    }
  }

  return {
    joinClause,
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
};



app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Import OAuth handlers
const oauthHandlers = require('./server/oauthHandlers');
app.use('/api/oauth', oauthHandlers);

// Conditional upload helper: applies multer only if the request has multipart/form-data
const conditionalUpload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return upload.single('avatar')(req, res, next);
  }
  next();
};
// Test route
app.get("/", (req, res) => {
  res.send("Vigozen API Running");
});

// Leads
app.get("/leads", authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const { whereClause, params } = await getScopedQueryFilters('leads', req);
    const result = await pool.query(`SELECT *, (SELECT name FROM users WHERE id = owner_id) as owner FROM leads ${whereClause} ORDER BY created_at DESC`, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deals
app.get("/deals", authenticateToken, checkPermission('deals'), async (req, res) => {
  try {
    const { whereClause, params } = await getScopedQueryFilters('deals', req);
    const result = await pool.query(`SELECT * FROM deals ${whereClause} ORDER BY created_at DESC`, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contacts
app.get("/contacts", authenticateToken, checkPermission('contacts'), async (req, res) => {
  try {
    const { whereClause, params } = await getScopedQueryFilters('contacts', req);
    const result = await pool.query(`SELECT * FROM contacts ${whereClause} ORDER BY created_at DESC`, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tickets
app.get("/tickets", authenticateToken, checkPermission('tickets'), async (req, res) => {
  try {
    const { whereClause, params } = await getScopedQueryFilters('tickets', req);
    const result = await pool.query(`SELECT * FROM tickets ${whereClause} ORDER BY created_at DESC`, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/tickets", authenticateToken, async (req, res) => {
  try {
    const {
      title,
      category,
      priority,
      status,
      description,
      owner_id,
      owner_name,
      created_by,
      assigned_to,
      assigned_to_name,
    } = req.body;

    const companyId = req.user?.company_id || null;

    const result = await pool.query(
      `
      INSERT INTO tickets (
        id,
        company_id,
        title,
        category,
        priority,
        status,
        description,
        owner_id,
        owner_name,
        created_by,
        assigned_to,
        assigned_to_name,
        created_at,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        NOW(),
        NOW()
      )
      RETURNING *;
      `,
      [
        companyId,
        title,
        category,
        priority,
        status,
        description,
        owner_id,
        owner_name,
        created_by,
        assigned_to,
        assigned_to_name,
      ]
    );

    const ticket = result.rows[0];

    // Company-wide notification for new ticket
    await notificationService.createCompanyNotification(
      companyId,
      'ticket_created',
      "🎫 New Support Ticket",
      `New ticket "${ticket.title}" has been created`,
      `/tickets/${ticket.id}`,
      'medium',
      { ticket_priority: ticket.priority, ticket_category: ticket.category }
    ).catch(err => console.error("Ticket notification error:", err));

    res.json(result.rows[0]);
  } catch (err) {
    console.error("CREATE TICKET ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
app.put("/tickets/:id", authenticateToken, async (req, res) => {
  try {
    const { title, category, priority, status, description, assigned_to, assigned_to_name } = req.body;

    // Fetch existing ticket to check status change
    const existingRes = await pool.query("SELECT * FROM tickets WHERE id = $1", [req.params.id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    const existing = existingRes.rows[0];

    const result = await pool.query(
      `UPDATE tickets
       SET title = COALESCE($1, title),
           category = COALESCE($2, category),
           priority = COALESCE($3, priority),
           status = COALESCE($4, status),
           description = COALESCE($5, description),
           assigned_to = COALESCE($6, assigned_to),
           assigned_to_name = COALESCE($7, assigned_to_name),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [title, category, priority, status, description, assigned_to, assigned_to_name, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const ticket = result.rows[0];
    const companyId = req.user?.company_id || null;

    // ── Notification: Ticket closed ──
    if (status && existing.status !== status && (String(status).toLowerCase() === 'closed')) {
      await notificationService.createCompanyNotification(
        companyId,
        'ticket_closed',
        "Ticket Closed",
        `Ticket "${ticket.title}" has been closed`,
        `/tickets/${ticket.id}`,
        'medium',
        { ticket_category: ticket.category, ticket_priority: ticket.priority }
      ).catch(err => console.error("Ticket closed notification error:", err));
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE TICKET ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/tickets/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM tickets WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error("DELETE TICKET ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
// Activities
app.get("/activities", authenticateToken, checkPermission('activities'), async (req, res) => {
  try {
    const { joinClause, whereClause, params } = await getScopedQueryFilters('activities', req);
    const result = await pool.query(
      `SELECT a.* FROM activities a ${joinClause} ${whereClause} ORDER BY a.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── TASKS CRUD OPERATIONS ──

// GET all tasks (with scoping)
app.get("/tasks", authenticateToken, checkPermission('tasks'), async (req, res) => {
  try {
    const { whereClause, params } = await getScopedQueryFilters('tasks', req);
    const result = await pool.query(
      `SELECT t.*, 
        assigned_to_user.name as assigned_to_name,
        assigned_by_user.name as assigned_by_name
       FROM tasks t
       LEFT JOIN users assigned_to_user ON t.assigned_to = assigned_to_user.id
       LEFT JOIN users assigned_by_user ON t.assigned_by = assigned_by_user.id
       ${whereClause} 
       ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET TASKS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET a single task
app.get("/tasks/:id", authenticateToken, checkPermission('tasks'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT t.*, 
        assigned_to_user.name as assigned_to_name,
        assigned_by_user.name as assigned_by_name
       FROM tasks t
       LEFT JOIN users assigned_to_user ON t.assigned_to = assigned_to_user.id
       LEFT JOIN users assigned_by_user ON t.assigned_by = assigned_by_user.id
       WHERE t.id = $1 AND t.company_id = $2`,
      [id, req.user.company_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET TASK ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST create task
app.post("/tasks", authenticateToken, async (req, res) => {
  try {
    const { title, description, assigned_to, due_date, priority, status } = req.body;
    const companyId = req.user.company_id;
    const assignedBy = req.user.id;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const result = await pool.query(
      `INSERT INTO tasks (
        id, company_id, title, description, assigned_to, assigned_by,
        due_date, priority, status, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
      ) RETURNING *`,
      [companyId, title, description, assigned_to || null, assignedBy, due_date || null, priority || 'medium', status || 'pending']
    );

    // ── Notification for assigned user ──
    if (assigned_to) {
      await notificationService.createNotification(
        assigned_to,
        'task_assigned',
        "New Task Assigned",
        `You have been assigned: "${title}"`,
        `/tasks/${result.rows[0].id}`,
        'medium',
        { task_title: title, task_priority: priority }
      ).catch(err => console.error("Task notification error:", err));
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("CREATE TASK ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update task
app.put("/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, assigned_to, due_date, priority, status } = req.body;
    const companyId = req.user.company_id;

    // Check if task exists and belongs to company
    const existing = await pool.query(
      "SELECT * FROM tasks WHERE id = $1 AND company_id = $2",
      [id, companyId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const result = await pool.query(
      `UPDATE tasks 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           assigned_to = COALESCE($3, assigned_to),
           due_date = COALESCE($4, due_date),
           priority = COALESCE($5, priority),
           status = COALESCE($6, status),
           updated_at = NOW()
       WHERE id = $7 AND company_id = $8
       RETURNING *`,
      [title, description, assigned_to, due_date, priority, status, id, companyId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE TASK ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE task
app.delete("/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.company_id;

    const result = await pool.query(
      "DELETE FROM tasks WHERE id = $1 AND company_id = $2 RETURNING *",
      [id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error("DELETE TASK ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── CALENDAR CRUD OPERATIONS ──

// GET all calendar events (with scoping)
app.get("/calendar", authenticateToken, checkPermission('calendar'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { whereClause, params } = await getScopedQueryFilters('calendar', req);

    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = ` AND event_date BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(startDate, endDate);
    }

    const result = await pool.query(
      `SELECT c.*, 
        u.name as created_by_name
       FROM calendar_events c
       LEFT JOIN users u ON c.created_by = u.id
       ${whereClause} ${dateFilter}
       ORDER BY c.event_date ASC, c.start_time ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET CALENDAR EVENTS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET a single calendar event
app.get("/calendar/:id", authenticateToken, checkPermission('calendar'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT c.*, 
        u.name as created_by_name
       FROM calendar_events c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = $1 AND c.company_id = $2`,
      [id, req.user.company_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Calendar event not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET CALENDAR EVENT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST create calendar event
app.post("/calendar", authenticateToken, async (req, res) => {
  try {
    const {
      title, description, event_date, start_time, end_time,
      location, attendees, all_day, color
    } = req.body;
    const companyId = req.user.company_id;
    const createdBy = req.user.id;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }
    if (!event_date) {
      return res.status(400).json({ error: "Event date is required" });
    }

    const result = await pool.query(
      `INSERT INTO calendar_events (
        id, company_id, title, description, event_date, start_time, end_time,
        created_by, location, attendees, all_day, color, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
      ) RETURNING *`,
      [
        companyId,
        title,
        description || null,
        event_date,
        start_time || null,
        end_time || null,
        createdBy,
        location || null,
        attendees || [],
        all_day || false,
        color || '#4F46E5'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("CREATE CALENDAR EVENT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update calendar event
app.put("/calendar/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, event_date, start_time, end_time,
      location, attendees, all_day, color
    } = req.body;
    const companyId = req.user.company_id;

    const existing = await pool.query(
      "SELECT * FROM calendar_events WHERE id = $1 AND company_id = $2",
      [id, companyId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Calendar event not found" });
    }

    const result = await pool.query(
      `UPDATE calendar_events 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           event_date = COALESCE($3, event_date),
           start_time = COALESCE($4, start_time),
           end_time = COALESCE($5, end_time),
           location = COALESCE($6, location),
           attendees = COALESCE($7, attendees),
           all_day = COALESCE($8, all_day),
           color = COALESCE($9, color),
           updated_at = NOW()
       WHERE id = $10 AND company_id = $11
       RETURNING *`,
      [title, description, event_date, start_time, end_time, location, attendees, all_day, color, id, companyId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE CALENDAR EVENT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE calendar event
app.delete("/calendar/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.company_id;

    const result = await pool.query(
      "DELETE FROM calendar_events WHERE id = $1 AND company_id = $2 RETURNING *",
      [id, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Calendar event not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error("DELETE CALENDAR EVENT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Users - Hierarchy-based access
app.get("/users", authenticateToken, checkPermission('users'), async (req, res) => {
  try {
    const { permissionScope, companyId, userId, teamId } = req;
    const roleNorm = normalizeRole(req.user.role);

    let query = "";
    let params = [];
    let paramIndex = 1;

    if (roleNorm === 'super_admin') {
      // Super Administrator: Everyone across all organizations
      query = "SELECT id, name, email, role, department, manager_id, team_id, is_active, status, created_at, trial_start, trial_end, subscription_status, plan_type, payment_status FROM users ORDER BY name ASC";
    }
    else if (roleNorm === 'org_admin' || roleNorm === 'admin') {
      // Organization Admin: Everyone inside their organization
      if (companyId) {
        query = "SELECT id, name, email, role, department, manager_id, team_id, is_active, status, created_at, trial_start, trial_end, subscription_status, plan_type, payment_status FROM users WHERE company_id = $1 ORDER BY name ASC";
        params.push(companyId);
        paramIndex++;
      } else {
        query = "SELECT id, name, email, role, department, manager_id, team_id, is_active, status, created_at, trial_start, trial_end, subscription_status, plan_type, payment_status FROM users WHERE company_id IS NULL ORDER BY name ASC";
      }
    }
    else if (permissionScope === 'full' || permissionScope === 'dept' || permissionScope === 'team') {
      // Managers: Only users in their hierarchy + users specifically assigned to them
      // Get subordinate user IDs (includes the user themselves)
      const subIds = await getSubordinateUserIds(userId, teamId);

      // Also get users who are specifically assigned to this user via manager_id
      // This is already covered by getSubordinateUserIds which includes the recursive hierarchy

      if (companyId) {
        query = "SELECT id, name, email, role, department, manager_id, team_id, is_active, status, created_at, trial_start, trial_end, subscription_status, plan_type, payment_status FROM users WHERE company_id = $1 AND id = ANY($2) ORDER BY name ASC";
        params.push(companyId, subIds);
      } else {
        query = "SELECT id, name, email, role, department, manager_id, team_id, is_active, status, created_at, trial_start, trial_end, subscription_status, plan_type, payment_status FROM users WHERE id = ANY($1) ORDER BY name ASC";
        params.push(subIds);
      }
    }
    else {
      return res.status(403).json({ error: "Access denied to users module" });
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("GET USERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// Employees (for admin dropdown assignment)
app.get("/employees", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, department FROM employees ORDER BY name ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET EMPLOYEES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// ── Integrations ──
app.get("/integrations", authenticateToken, async (req, res) => {
  try {
    let result;
    try {
      result = await pool.query(
        "SELECT * FROM integrations WHERE user_id = $1 ORDER BY updated_at DESC",
        [req.user.id]
      );
    } catch (queryErr) {
      result = await pool.query(
        "SELECT * FROM integrations WHERE user_id = $1",
        [req.user.id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error("GET INTEGRATIONS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Create Integration ──
app.post("/integrations", authenticateToken, async (req, res) => {
  try {
    const { name, type, description, icon, status, leads, lastSync, config } = req.body;
    const result = await pool.query(
      `INSERT INTO integrations (id, user_id, name, type, description, icon, status, leads, last_sync, config, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [req.user.id, name, type, description, icon, status || 'pending', leads || 0, lastSync || 'Never', config || {}]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("CREATE INTEGRATION ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Update Integration ──
app.put("/integrations/:id", authenticateToken, async (req, res) => {
  try {
    const { name, type, description, icon, status, leads, lastSync, config } = req.body;
    const result = await pool.query(
      `UPDATE integrations
       SET name = COALESCE($1, name),
           type = COALESCE($2, type),
           description = COALESCE($3, description),
           icon = COALESCE($4, icon),
           status = COALESCE($5, status),
           leads = COALESCE($6, leads),
           last_sync = COALESCE($7, last_sync),
           config = COALESCE($8, config),
           updated_at = NOW()
       WHERE id = $9 AND user_id = $10
       RETURNING *`,
      [name, type, description, icon, status, leads, lastSync, config, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Integration not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE INTEGRATION ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Delete Integration ──
app.delete("/integrations/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM integrations WHERE id = $1 AND user_id = $2 RETURNING *",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Integration not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error("DELETE INTEGRATION ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get user by ID (for profile loading)
app.get("/users/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.user.id;
    const isSelf = requestingUserId === id;

    // Fetch user details from DB
    const userRes = await pool.query(
      `SELECT id, name, email, role, department, manager_id, team_id, is_active, status, 
              created_at, trial_start, trial_end, subscription_status, plan_type, 
              payment_status, phone, company, timezone, language, employee_id, avatar_url, company_id 
       FROM users WHERE id = $1`,
      [id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const targetUser = userRes.rows[0];

    // If it's not self, verify the user has access to view this user's profile
    if (!isSelf) {
      const isAdmin = isAdminRole(req.user.role);
      if (!isAdmin) {
        // If not admin, check if targetUser is a subordinate of requesting user
        const subIds = await getSubordinateUserIds(requestingUserId, req.user.team_id || null);
        if (!subIds.includes(id)) {
          return res.status(403).json({ error: "Access denied to view this user's profile" });
        }
      }
    }

    res.json(targetUser);
  } catch (err) {
    console.error("GET USER BY ID ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update user (settings save)
app.put("/users/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, company, department, timezone, language, role, employee_id, manager_id } = req.body;

    // Fetch existing user before update for validation and audit trail
    const existingUserRes = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    if (existingUserRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const existingUser = existingUserRes.rows[0];

    const isSelf = req.user.id === id;

    if (isSelf) {
      // Self update: cannot change role or manager
      if (role && role !== existingUser.role) {
        return res.status(403).json({ error: "Cannot change your own role" });
      }
      if (manager_id !== undefined && manager_id !== existingUser.manager_id) {
        return res.status(403).json({ error: "Cannot change your own manager" });
      }
    } else {
      // Management update: check if current user is authorized to manage target user
      const access = await checkUserManagementAccess(req.user, id, req.teamId);
      if (!access.allowed) {
        return res.status(403).json({ error: access.error });
      }

      // If updating role, verify creator can assign the new role
      if (role && role !== existingUser.role) {
        const creatorRole = req.user.role;
        const canCreate = {
          'Super Admin': ['Org Admin', 'admin'],
          'super_admin': ['Org Admin', 'admin'],
          'Org Admin': ['Org Admin', 'admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
          'org_admin': ['Org Admin', 'admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
          'admin': ['Org Admin', 'admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
          'Sales Manager': ['Team Leader', 'Sales Executive'],
          'sales_manager': ['Team Leader', 'Sales Executive'],
          'Lead Manager': ['Lead Executive', 'Telecaller', 'Lead Qualifier'],
          'lead_manager': ['Lead Executive', 'Telecaller', 'Lead Qualifier']
        };
        const allowedRoles = canCreate[creatorRole] || [];
        if (!allowedRoles.includes(role)) {
          return res.status(403).json({ error: `You are not authorized to assign role "${role}"` });
        }
      }

      // If updating manager_id, verify reporting rules
      if (manager_id && manager_id !== existingUser.manager_id) {
        const REPORTING_RULES = {
          'Org Admin': ['Super Admin', 'super_admin', 'Org Admin', 'org_admin', 'admin'],
          'org_admin': ['Super Admin', 'super_admin', 'Org Admin', 'org_admin', 'admin'],
          'admin': ['Super Admin', 'super_admin', 'Org Admin', 'org_admin', 'admin'],
          'Sales Manager': ['Org Admin', 'org_admin', 'admin'],
          'sales_manager': ['Org Admin', 'org_admin', 'admin'],
          'Lead Manager': ['Org Admin', 'org_admin', 'admin'],
          'lead_manager': ['Org Admin', 'org_admin', 'admin'],
          'Team Leader': ['Sales Manager', 'sales_manager', 'Org Admin', 'org_admin', 'admin'],
          'team_leader': ['Sales Manager', 'sales_manager', 'Org Admin', 'org_admin', 'admin'],
          'Sales Executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
          'sales_executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
          'Lead Executive': ['Lead Manager', 'lead_manager'],
          'lead_executive': ['Lead Manager', 'lead_manager'],
          'Telecaller': ['Lead Manager', 'lead_manager'],
          'telecaller': ['Lead Manager', 'lead_manager'],
          'Lead Qualifier': ['Lead Manager', 'lead_manager'],
          'lead_qualifier': ['Lead Manager', 'lead_manager']
        };
        const targetRole = role || existingUser.role;
        const managerRes = await pool.query("SELECT role FROM users WHERE id = $1", [manager_id]);
        if (managerRes.rows.length > 0) {
          const managerRole = managerRes.rows[0].role;
          const allowedManagers = REPORTING_RULES[targetRole] || [];
          if (!allowedManagers.includes(managerRole)) {
            return res.status(403).json({
              error: `${targetRole} cannot report to ${managerRole}`,
              allowed: allowedManagers
            });
          }
        }
      }
    }

    let finalManagerId = existingUser.manager_id;
    if (req.body.hasOwnProperty('manager_id')) {
      // Handle empty string, "null", or null values
      if (manager_id === '' || manager_id === 'null' || manager_id === null || manager_id === undefined) {
        finalManagerId = null;
      } else {
        finalManagerId = manager_id;
      }
    }

    const result = await pool.query(
      `UPDATE users
       SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         phone = COALESCE($3, phone),
         company = COALESCE($4, company),
         department = COALESCE($5, department),
         timezone = COALESCE($6, timezone),
         language = COALESCE($7, language),
         role = COALESCE($8, role),
         employee_id = COALESCE($9, employee_id),
         manager_id = $10
       WHERE id = $11
       RETURNING id, name, email, phone, company, department, timezone, language, role, employee_id, manager_id`,
      [name, email, phone, company, department, timezone, language, role, employee_id, finalManagerId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Audit log
    await logAudit(
      req.user?.id || null,
      req.user?.name || 'System',
      'UPDATE',
      'user',
      id,
      { old: existingUser, new: result.rows[0] },
      req.ip
    );

    // ── Change 6: Save ad auto-sync/auto-create preferences ──
    if (req.body.ad_auto_sync !== undefined || req.body.ad_auto_create !== undefined) {
      await pool.query(`
        INSERT INTO user_settings (user_id, ad_auto_sync, ad_auto_create, updated_at)
        VALUES ($1, COALESCE($2, false), COALESCE($3, true), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          ad_auto_sync = COALESCE(EXCLUDED.ad_auto_sync, user_settings.ad_auto_sync),
          ad_auto_create = COALESCE(EXCLUDED.ad_auto_create, user_settings.ad_auto_create),
          updated_at = NOW()
      `, [
        id,
        req.body.ad_auto_sync,
        req.body.ad_auto_create
      ]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
// Simulated Invitation Email helper
const sendInviteEmail = async (email, inviteToken) => {
  console.log("-----------------------------------------");
  console.log(`✉ INVITATION EMAIL SENT TO: ${email}`);
  console.log(`Invite URL: http://localhost:5173/accept-invite?token=${inviteToken}`);
  console.log("-----------------------------------------");
};

// Create new user (Hierarchical RBAC + Invitation based)
app.post("/users", authenticateToken, async (req, res) => {
  try {
    const creatorRole = req.user.role || 'Sales Executive';
    const creatorId = req.user.id;
    const companyId = req.user.company_id || null;

    // 1. Define Hierarchical Creation Rules (handling both camelCase and lowercase roles)
    const canCreate = {
      'Super Admin': ['Org Admin', 'admin'],
      'super_admin': ['Org Admin', 'admin'],
      'Org Admin': ['Org Admin', 'admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
      'org_admin': ['Org Admin', 'admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
      'admin': ['Org Admin', 'admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
      'Sales Manager': ['Team Leader', 'Sales Executive'],
      'sales_manager': ['Team Leader', 'Sales Executive'],
      'Lead Manager': ['Lead Executive', 'Telecaller', 'Lead Qualifier'],
      'lead_manager': ['Lead Executive', 'Telecaller', 'Lead Qualifier']
    };

    const { name, email, role, employeeId, department, team_id, manager_id: bodyManagerId } = req.body;
    const targetRole = role || 'Sales Executive';

    // 2. Validate Creator Permissions
    if (!canCreate[creatorRole] || !canCreate[creatorRole].includes(targetRole)) {
      return res.status(403).json({ error: `You are not authorized to create a user with role "${targetRole}"` });
    }

    // 2.5 Validate reporting manager against REPORTING_RULES
    const REPORTING_RULES = {
      'Org Admin': ['Super Admin', 'super_admin', 'Org Admin', 'org_admin', 'admin'],
      'org_admin': ['Super Admin', 'super_admin', 'Org Admin', 'org_admin', 'admin'],
      'admin': ['Super Admin', 'super_admin', 'Org Admin', 'org_admin', 'admin'],
      'Sales Manager': ['Org Admin', 'org_admin', 'admin'],
      'sales_manager': ['Org Admin', 'org_admin', 'admin'],
      'Lead Manager': ['Org Admin', 'org_admin', 'admin'],
      'lead_manager': ['Org Admin', 'org_admin', 'admin'],
      'Team Leader': ['Sales Manager', 'sales_manager', 'Org Admin', 'org_admin', 'admin'],
      'team_leader': ['Sales Manager', 'sales_manager', 'Org Admin', 'org_admin', 'admin'],
      'Sales Executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
      'sales_executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
      'Lead Executive': ['Lead Manager', 'lead_manager'],
      'lead_executive': ['Lead Manager', 'lead_manager'],
      'Telecaller': ['Lead Manager', 'lead_manager'],
      'telecaller': ['Lead Manager', 'lead_manager'],
      'Lead Qualifier': ['Lead Manager', 'lead_manager'],
      'lead_qualifier': ['Lead Manager', 'lead_manager']
    };

    if (bodyManagerId) {
      const managerRes = await pool.query("SELECT role FROM users WHERE id = $1", [bodyManagerId]);
      if (managerRes.rows.length > 0) {
        const managerRole = managerRes.rows[0].role;
        const allowedManagers = REPORTING_RULES[targetRole] || [];
        if (!allowedManagers.includes(managerRole)) {
          return res.status(403).json({
            error: `${targetRole} cannot report to ${managerRole}`,
            allowed: allowedManagers
          });
        }
      }
    }

    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // 3. Resolve reporting manager
    let manager_id = bodyManagerId || creatorId;
    if (creatorRole === 'Super Admin') {
      manager_id = null; // Top level has no manager
    }

    // 4. Handle auto-creation of team if role is 'Team Leader'
    let newTeamId = team_id || null;
    if (targetRole === 'Team Leader') {
      // Get team_name from request body, fallback to default
      const { team_name } = req.body;
      const finalTeamName = team_name || `${name}'s Team`;

      const teamResult = await pool.query(
        `INSERT INTO teams (company_id, team_name, team_leader_id, manager_id) 
        VALUES ($1, $2, $3, $4) RETURNING id`,
        [companyId, finalTeamName, null, manager_id]
      );
      newTeamId = teamResult.rows[0].id;
    }

    // 5. Generate Invitation Token (Commented out for Testing Mode)
    // const inviteToken = crypto.randomBytes(32).toString('hex');

    // Hashed default password for testing mode ('password123')
    const defaultPasswordHash = await bcrypt.hash('password123', 10);

    // 6. Insert new user directly as active with default password (Testing Mode)
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, company_id, manager_id, team_id, is_active, status, employee_id, department, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'active', $8, $9, NOW())
       RETURNING id, name, email, role, employee_id AS "employeeId", department, is_active AS "isActive", status, company_id AS "companyId", created_at AS "createdAt"`,
      [name, email, defaultPasswordHash, targetRole, companyId, manager_id, newTeamId, employeeId || null, department || "Sales"]
    );

    /* Original code for invitation-based user creation (Commented out for testing):
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const result = await pool.query(
      `INSERT INTO users (name, email, role, company_id, manager_id, team_id, is_active, status, invite_token, employee_id, department, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, 'invited', $7, $8, $9, NOW())
       RETURNING id, name, email, role, employee_id AS "employeeId", department, is_active AS "isActive", status, company_id AS "companyId", created_at AS "createdAt"`,
      [name, email, targetRole, companyId, manager_id, newTeamId, inviteToken, employeeId || null, department || "Sales"]
    );
    */

    const newUser = result.rows[0];

    // If Team Leader was created, update the team to set team_leader_id = newUser.id
    if (targetRole === 'Team Leader' && newTeamId) {
      await pool.query(
        "UPDATE teams SET team_leader_id = $1 WHERE id = $2",
        [newUser.id, newTeamId]
      ).catch(err => console.error("Update team leader error:", err));
    }

    // 7. Trigger simulated invitation email (Commented out for Testing Mode)
    // await sendInviteEmail(email, inviteToken);

    // Company-wide notification for new user
    if (companyId) {
      await notificationService.createCompanyNotification(
        companyId,
        'user_added',
        "👤 Team Member Joined",
        `${name} has joined the team as ${targetRole}`,
        `/users/${newUser.id}`,
        'medium',
        { user_role: targetRole, user_email: email }
      ).catch(err => console.error("Notification error:", err));
    }

    // Log administrative action to Audit Logs
    await logAudit(
      creatorId,
      req.user.name || 'Admin',
      'INVITE_USER',
      'user',
      newUser.id,
      { email, role: targetRole, company_id: companyId }
    );

    res.json(newUser);
  } catch (err) {
    console.error("CREATE USER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete (deactivate) user
// Delete user - Hard delete (permanently remove)
app.delete("/users/:id", authenticateToken, async (req, res) => {
  try {
    console.log("===== DELETE USER (HARD DELETE) =====");
    console.log("Role:", req.user.role);
    console.log("User:", req.user);

    // Only admins can delete users

    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions. Only admins can delete users." });
    }

    const userId = req.params.id;
    const companyId = req.user.company_id;

    // Check if user exists - admins can delete users from any company or no company
    let userCheck;
    if (isAdminRole(req.user.role)) {
      // Super Admin and Org Admin can delete any user
      userCheck = await pool.query(
        "SELECT id, name, email, company_id FROM users WHERE id = $1",
        [userId]
      );
    } else {
      // Regular admin can only delete users from same company
      if (companyId) {
        userCheck = await pool.query(
          "SELECT id, name, email FROM users WHERE id = $1 AND company_id = $2",
          [userId, companyId]
        );
      } else {
        userCheck = await pool.query(
          "SELECT id, name, email FROM users WHERE id = $1 AND company_id IS NULL",
          [userId]
        );
      }
    }

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User not found or unauthorized" });
    }

    const userToDelete = userCheck.rows[0];

    // Prevent admin from deleting themselves
    if (userId === req.user.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // ✅ HARD DELETE - Actually remove the record
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id, name, email",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Log the action in audit_logs
    await logAudit(
      req.user.id,
      req.user.name || 'System',
      'DELETE',
      'user',
      userId,
      { deleted_user: userToDelete },
      req.ip
    );

    // Log audit for company notification
    try {
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, changes, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'DELETE', 'user', $3, $4, NOW())`,
        [req.user.id, req.user.name || 'System', userId, JSON.stringify({ deleted_user: userToDelete })]
      );
    } catch (auditErr) {
      console.error("Audit log error:", auditErr);
    }

    res.json({
      success: true,
      message: `User "${userToDelete.name}" permanently deleted`,
      deleted: result.rows[0]
    });
  } catch (err) {
    console.error("DELETE USER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Toggle user active/inactive
app.put("/users/:id/toggle-access", authenticateToken, requireRole(['admin', 'super_admin', 'org_admin', 'Sales Manager', 'sales_manager']), async (req, res) => {
  try {
    const access = await checkUserManagementAccess(req.user, req.params.id, req.teamId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.error });
    }

    const { isActive } = req.body;

    const result = await pool.query(
      "UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, is_active AS \"isActive\"",
      [isActive, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("TOGGLE ACCESS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Reset user password (admin/manager allowed for subordinates)
app.put("/users/:id/password", authenticateToken, requireRole(['admin', 'super_admin', 'org_admin', 'Sales Manager', 'sales_manager', 'Lead Manager', 'lead_manager']), async (req, res) => {
  try {
    const access = await checkUserManagementAccess(req.user, req.params.id, req.teamId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.error });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: "Password required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "UPDATE users SET password = $1 WHERE id = $2 RETURNING id",
      [hashedPassword, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── USER ACTIVATION/DEACTIVATION ──

// Activate user
app.put("/users/:id/activate", authenticateToken, requireRole(['admin', 'super_admin', 'org_admin', 'Sales Manager', 'sales_manager']), async (req, res) => {
  try {
    const userId = req.params.id;
    const companyId = req.user.company_id;

    const access = await checkUserManagementAccess(req.user, userId, req.teamId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.error });
    }

    if (access.targetUser.is_active) {
      return res.status(400).json({ error: "User is already active" });
    }

    // Check if activating would exceed the allowed seat limit
    const activeUsersResult = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE company_id = $1 AND is_active = true AND status = 'Active'",
      [companyId]
    );
    const activeUsersCount = parseInt(activeUsersResult.rows[0].count);

    const companyRes = await pool.query(
      "SELECT allowed_users, purchased_users FROM companies WHERE id = $1",
      [companyId]
    );
    if (companyRes.rows.length > 0) {
      const company = companyRes.rows[0];
      const allowedUsers = company.allowed_users || company.purchased_users || 10;
      if (activeUsersCount >= allowedUsers) {
        return res.status(400).json({ error: `User Limit Reached. Upgrade subscription to allow more than ${allowedUsers} active users.` });
      }
    }

    // Activate user
    const result = await pool.query(
      `UPDATE users 
       SET is_active = true, 
           activated_at = NOW(),
           deactivated_at = NULL,
           updated_at = NOW()
       WHERE id = $1 
       RETURNING id, is_active, activated_at`,
      [userId]
    );

    res.json({
      success: true,
      message: "User activated successfully",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("Activate user error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Deactivate user
app.put("/users/:id/deactivate", authenticateToken, requireRole(['admin', 'super_admin', 'org_admin', 'Sales Manager', 'sales_manager']), async (req, res) => {
  try {
    const userId = req.params.id;

    const access = await checkUserManagementAccess(req.user, userId, req.teamId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.error });
    }

    if (!access.targetUser.is_active) {
      return res.status(400).json({ error: "User is already inactive" });
    }

    // Deactivate user
    const result = await pool.query(
      `UPDATE users 
       SET is_active = false, 
           deactivated_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 
       RETURNING id, is_active, deactivated_at`,
      [userId]
    );

    res.json({
      success: true,
      message: "User deactivated successfully",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("Deactivate user error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── EMPLOYEE DATA TRANSFER ──

// Transfer employee data when leaving
app.post("/users/transfer-data", authenticateToken, requireRole(['admin', 'super_admin', 'org_admin', 'Sales Manager', 'sales_manager', 'Lead Manager', 'lead_manager']), async (req, res) => {
  try {
    const { leaving_user_id, target_user_id } = req.body;

    if (!leaving_user_id || !target_user_id) {
      return res.status(400).json({ error: "leaving_user_id and target_user_id are required" });
    }

    if (leaving_user_id === target_user_id) {
      return res.status(400).json({ error: "Cannot transfer data to the same user" });
    }

    // Check if current user has permission to manage both users
    const leavingAccess = await checkUserManagementAccess(req.user, leaving_user_id, req.teamId);
    const targetAccess = await checkUserManagementAccess(req.user, target_user_id, req.teamId);

    if (!leavingAccess.allowed) {
      return res.status(403).json({ error: `Cannot access leaving user: ${leavingAccess.error}` });
    }

    if (!targetAccess.allowed) {
      return res.status(403).json({ error: `Cannot access target user: ${targetAccess.error}` });
    }

    // Perform the transfer
    const { transferEmployeeData } = require("./employeeTransfer");
    const result = await transferEmployeeData(leaving_user_id, target_user_id, req.user.id);

    res.json(result);
  } catch (err) {
    console.error("TRANSFER DATA ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── SUBORDINATES / USER PANEL ──

// Get all subordinates of the current user
app.get("/users/my-subordinates", authenticateToken, async (req, res) => {
  try {
    const { getSubordinates } = require("./employeeTransfer");
    const subordinates = await getSubordinates(req.user.id, req.user.team_id);
    res.json(subordinates);
  } catch (err) {
    console.error("GET SUBORDINATES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get subordinates of a specific manager (for admins)
app.get("/users/:managerId/subordinates", authenticateToken, async (req, res) => {
  try {
    const { managerId } = req.params;

    // Only admins can view other managers' subordinates
    if (!isAdminRole(req.user.role) && req.user.id !== managerId) {
      return res.status(403).json({ error: "Only admins can view other managers' subordinates" });
    }

    const { getSubordinates } = require("./employeeTransfer");
    const subordinates = await getSubordinates(managerId, req.user.team_id);
    res.json(subordinates);
  } catch (err) {
    console.error("GET SUBORDINATES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get team statistics for the current user
app.get("/users/my-team-stats", authenticateToken, async (req, res) => {
  try {
    const { getTeamStatistics } = require("./employeeTransfer");
    const stats = await getTeamStatistics(req.user.id);
    res.json(stats);
  } catch (err) {
    console.error("GET TEAM STATS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get team statistics for a specific manager (for admins)
app.get("/users/:managerId/team-stats", authenticateToken, async (req, res) => {
  try {
    const { managerId } = req.params;

    // Only admins can view other managers' team stats
    if (!isAdminRole(req.user.role) && req.user.id !== managerId) {
      return res.status(403).json({ error: "Only admins can view other managers' team statistics" });
    }

    const { getTeamStatistics } = require("./employeeTransfer");
    const stats = await getTeamStatistics(managerId);
    res.json(stats);
  } catch (err) {
    console.error("GET TEAM STATS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Settings
app.get("/settings/:userId", authenticateToken, async (req, res) => {
  const userId = req.params.userId;
  const requestingUserId = req.user.id;
  const isAdmin = isAdminRole(req.user.role);

  if (userId !== requestingUserId && !isAdmin) {
    return res.status(403).json({ error: "Access denied" });
  }

  const result = await pool.query("SELECT * FROM settings WHERE user_id = $1", [userId]);
  res.json(result.rows[0]);
});
// Leads POST
app.post("/leads", authenticateToken, async (req, res) => {
  try {
    // ── Permission check ──
    const scope = getPermissionScope(req.user.role, 'leads');
    if (scope === 'none') {
      return res.status(403).json({ error: "You are not permitted to create leads." });
    }
    const { name, email, phone, company, value, status, source, industry, notes, probability, aiscore } = req.body;

    // Get owner_id and company_id
    const ownerId = req.body.owner_id || req.user?.id || null;
    const companyId = req.user?.company_id || null;
    const result = await pool.query(
      `INSERT INTO leads (id, name, email, phone, company, value, status, source, industry, notes, owner_id, company_id, probability, aiscore, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
       RETURNING *`,
      [name, email, phone, company, value, status, source, industry, notes, ownerId, companyId, probability || 50, aiscore || 50]
    );

    const lead = result.rows[0];

    // Audit log inside route
    await logAudit(
      req.user?.id || null,
      req.user?.name || 'System',
      'CREATE',
      'lead',
      lead.id,
      lead,
      req.ip
    );

    // ── Notification Trigger ──
    try {
      const userId = req.body.userId || lead.owner_id || req.user?.id;
      const companyId = req.user?.company_id || null;
      const leadValue = parseFloat(lead.value) || 0;

      // Notify assigned user
      if (userId) {
        await notificationService.createNotification(
          userId,
          'lead_created',
          "New Lead Assigned",
          `You have been assigned to ${lead.name}`,
          `/leads/${lead.id}`,
          'high'
        ).catch(err => console.error("Assigned user notification error:", err));
      }

      // Company-wide notification for all new leads
      await notificationService.createCompanyNotification(
        companyId,
        leadValue >= 50000 ? 'high_value_lead' : 'lead_created',
        leadValue >= 50000 ? "⭐ High Value Lead Created" : "🆕 New Lead Created",
        `New lead "${lead.name}" ${leadValue > 0 ? `worth ₹${leadValue.toLocaleString()}` : ''} has been created`,
        `/leads/${lead.id}`,
        leadValue >= 50000 ? 'high' : 'medium',
        { lead_value: leadValue, lead_name: lead.name }
      ).catch(err => console.error("Company lead notification error:", err));
    } catch (notifErr) {
      console.error("Notification error:", notifErr);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("POST LEAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// Leads PUT
app.put("/leads/:id", authenticateToken, async (req, res) => {
  try {
    const scope = getPermissionScope(req.user.role, 'leads');
    if (scope === 'none') {
      return res.status(403).json({ error: "You are not permitted to edit leads." });
    }

    const { name, email, phone, company, value, status, source, industry, notes, converted_to_deal, deal_id } = req.body;

    // Fetch existing lead first to preserve missing fields
    const existingRes = await pool.query("SELECT * FROM leads WHERE id = $1", [req.params.id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }
    const existing = existingRes.rows[0];

    // Enforce scope check
    if (scope === 'own') {
      if (existing.owner_id && existing.owner_id !== req.user.id) {
        return res.status(403).json({ error: "You can only edit your own leads." });
      }
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(req.user.id, req.user.team_id);
      if (existing.owner_id && !subIds.includes(existing.owner_id)) {
        return res.status(403).json({ error: "You can only edit leads belonging to your team." });
      }
    }

    const finalName = name !== undefined ? name : existing.name;
    const finalEmail = email !== undefined ? email : existing.email;
    const finalPhone = phone !== undefined ? phone : existing.phone;
    const finalCompany = (company !== undefined && company !== null && company !== "") ? company : (existing.company || "Unknown");
    const finalValue = value !== undefined ? value : existing.value;
    let finalStatus = status !== undefined ? status : existing.status;
    if (typeof finalStatus === "string") {
      const statusMap = { Won: "won", Lost: "lost", New: "new", Contacted: "contacted", Qualified: "qualified", Proposal: "proposal", Negotiation: "negotiation" };
      if (statusMap[finalStatus]) {
        finalStatus = statusMap[finalStatus];
      }
    }
    const finalSource = source !== undefined ? source : existing.source;
    const finalIndustry = industry !== undefined ? industry : existing.industry;
    const finalNotes = notes !== undefined ? notes : existing.notes;

    const finalConverted = converted_to_deal !== undefined ? converted_to_deal : (existing.converted_to_deal || false);
    const finalDealId = deal_id !== undefined ? deal_id : (existing.deal_id || null);

    const ownerId = req.body.owner_id !== undefined ? req.body.owner_id : (req.body.ownerId !== undefined ? req.body.ownerId : existing.owner_id);

    const result = await pool.query(
      `UPDATE leads 
       SET name=$1, email=$2, phone=$3, company=$4, value=$5, status=$6, source=$7, industry=$8, notes=$9, converted_to_deal=$10, deal_id=$11, owner_id=$12, updated_at=NOW() 
       WHERE id=$13 RETURNING *`,
      [finalName, finalEmail, finalPhone, finalCompany, finalValue, finalStatus, finalSource, finalIndustry, finalNotes, finalConverted, finalDealId, ownerId, req.params.id]
    );

    // ── Notification: Lead status changed / converted ──
    try {
      const lead = result.rows[0];
      const companyId = req.user?.company_id || null;

      // Notify if status changed
      if (status && existing.status !== finalStatus) {
        await notificationService.createCompanyNotification(
          companyId,
          'lead_status_changed',
          "Lead Status Updated",
          `Lead "${lead.name}" status changed from ${existing.status} to ${finalStatus}`,
          `/leads/${lead.id}`,
          'medium',
          { old_status: existing.status, new_status: finalStatus, lead_name: lead.name }
        ).catch(err => console.error("Status notification error:", err));
      }

      // Notify if converted to deal
      if (finalConverted && !existing.converted_to_deal) {
        await notificationService.createCompanyNotification(
          companyId,
          'lead_converted',
          "🎉 Lead Converted to Deal",
          `Lead "${lead.name}" has been converted to a deal`,
          finalDealId ? `/deals/${finalDealId}` : `/leads/${lead.id}`,
          'high',
          { lead_name: lead.name, deal_id: finalDealId }
        ).catch(err => console.error("Lead conversion notification error:", err));
      }
    } catch (notifErr) {
      console.error("Status change notification error:", notifErr);
    }

    // Audit log inside route
    await logAudit(
      req.user?.id || null,
      req.user?.name || 'System',
      'UPDATE',
      'lead',
      req.params.id,
      { old: existing, new: result.rows[0] },
      req.ip
    );

    res.json({
      ...result.rows[0],
      converted_to_deal: result.rows[0].converted_to_deal || false,
      deal_id: result.rows[0].deal_id || null
    });
  } catch (err) {
    console.error("PUT LEAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete leads
app.delete("/leads", authenticateToken, async (req, res) => {
  try {
    const scope = getPermissionScope(req.user.role, 'leads');
    if (scope !== 'full') {
      return res.status(403).json({ error: "Only administrators are permitted to delete leads." });
    }

    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: "ids array required" });
    }
    const validIds = ids.filter(id =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    );
    if (validIds.length !== ids.length) {
      return res.status(400).json({ error: "One or more IDs are not valid UUIDs" });
    }
    await pool.query("DELETE FROM leads WHERE id = ANY($1)", [validIds]);
    await logAudit(
      req.user?.id || null,
      req.user?.name || 'System',
      'BULK_DELETE',
      'lead',
      null,
      { ids: validIds },
      req.ip
    );
    res.json({ success: true, deleted: validIds.length });
  } catch (err) {
    console.error("Bulk delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Single lead delete
app.delete("/leads/:id", authenticateToken, async (req, res) => {
  try {
    const scope = getPermissionScope(req.user.role, 'leads');
    if (scope !== 'full') {
      return res.status(403).json({ error: "Only administrators are permitted to delete leads." });
    }

    const { id } = req.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    // Verify the lead exists and belongs to the same company (Super Admin bypasses)
    const existingRes = await pool.query("SELECT id, company_id FROM leads WHERE id = $1", [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }
    const existing = existingRes.rows[0];

    const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'super_admin';
    if (!isSuperAdmin && existing.company_id !== req.user.company_id) {
      return res.status(403).json({ error: "You can only delete leads within your company." });
    }

    await pool.query("DELETE FROM leads WHERE id = $1", [id]);

    await logAudit(
      req.user?.id || null,
      req.user?.name || 'System',
      'DELETE',
      'lead',
      id,
      { id },
      req.ip
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Delete lead error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/deals", authenticateToken, async (req, res) => {
  try {
    // ── Permission check ──
    const scope = getPermissionScope(req.user.role, 'deals');
    if (scope === 'none') {
      return res.status(403).json({ error: "You are not permitted to create deals." });
    }
    let { title, company, value, stage, owner, ownerId, owner_id, probability, expectedclose, daysinstage, lead_id } = req.body;

    // Normalize stage
    const validStages = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
    let dbStage = "New";
    if (stage) {
      const found = validStages.find(s => s.toLowerCase() === String(stage).toLowerCase());
      if (found) {
        dbStage = found;
      } else {
        dbStage = String(stage);
      }
    }

    // Resolve owner_id
    const dbOwnerId = owner_id || ownerId || req.user?.id || null;

    // Resolve owner name
    let dbOwnerName = owner || null;
    if (dbOwnerId && !dbOwnerName) {
      const userRes = await pool.query("SELECT name FROM users WHERE id = $1", [dbOwnerId]);
      if (userRes.rows.length > 0) {
        dbOwnerName = userRes.rows[0].name;
      }
    }

    const companyId = req.user?.company_id || null;

    const result = await pool.query(
      `INSERT INTO deals (id, title, company, company_id, value, stage, owner, owner_id, probability, expectedclose, expected_close, daysinstage, lead_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [title, company, companyId, value, dbStage, dbOwnerName, dbOwnerId, probability || 50, expectedclose || null, expectedclose || null, daysinstage || 0, lead_id || null]
    );

    const deal = result.rows[0];
    const isWon = String(deal.stage).toLowerCase() === 'won';

    // Audit log
    await logAudit(
      req.user?.id || null,
      req.user?.name || 'System',
      'CREATE',
      'deal',
      deal.id,
      deal,
      req.ip
    );

    // Notify company about new deal
    if (isWon) {
      await notificationService.createCompanyNotification(
        companyId,
        'deal_won',
        "🎉 Deal Won!",
        `Deal "${deal.title}" worth ₹${parseFloat(deal.value || 0).toLocaleString()} has been closed`,
        `/deals/${deal.id}`,
        'high',
        { deal_value: deal.value, deal_title: deal.title }
      ).catch(err => console.error("Deal won notification error:", err));
    } else {
      await notificationService.createCompanyNotification(
        companyId,
        'deal_created',
        "💼 New Deal Created",
        `New deal "${deal.title}" for ${deal.company || 'client'} has been created`,
        `/deals/${deal.id}`,
        'medium',
        { deal_stage: deal.stage, deal_value: deal.value }
      ).catch(err => console.error("Deal creation notification error:", err));
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("POST DEALS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Lead Comments Routes ──
app.get("/leads/:id/comments", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
                lc.id,
                lc.lead_id,
                lc.user_id,
                lc.comment,
                lc.parent_comment_id,
                lc.created_at,
                lc.updated_at,
                COALESCE(u.name, lc.user_name, 'User') as user_name,
                COALESCE(u.email, 'user@example.com') as user_email,
                u.role as user_role
            FROM lead_comments lc
            LEFT JOIN users u ON lc.user_id = u.id
            WHERE lc.lead_id = $1
            ORDER BY lc.created_at ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching lead comments:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/leads/:id/comments", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment, parent_comment_id } = req.body;
    const user_id = req.user.id;

    if (!comment || comment.trim() === '') {
      return res.status(400).json({ error: "Comment cannot be empty" });
    }

    const userName = req.user?.name || req.user?.email || "User";
    const userAvatar = userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

    const result = await pool.query(
      `INSERT INTO lead_comments (lead_id, user_id, user_name, user_avatar, comment, parent_comment_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
      [id, user_id, userName, userAvatar, comment, parent_comment_id || null]
    );

    // ✅ KEEP THIS ONE
    try {
      const leadRes = await pool.query(`SELECT owner_id, name FROM leads WHERE id = $1`, [id]);
      const lead = leadRes.rows[0];

      if (lead && lead.owner_id) {
        await notificationService.createNotification(
          lead.owner_id,
          'comment_added',
          'New Comment on Lead',
          `${userName || 'Someone'} commented on "${lead.name}"`,
          `/leads/${id}`,
          'medium',
          { lead_name: lead.name, commenter: userName }
        );
      }
    } catch (notifErr) {
      console.error('Comment notification error:', notifErr);
    }


    const commentWithUser = await pool.query(
      `SELECT 
                lc.*,
                COALESCE(u.name, lc.user_name, 'User') as user_name,
                u.email as user_email,
                u.role as user_role
            FROM lead_comments lc
            LEFT JOIN users u ON lc.user_id = u.id
            WHERE lc.id = $1`,
      [result.rows[0].id]
    );



    res.status(201).json(commentWithUser.rows[0]);
  } catch (error) {
    console.error("Error creating lead comment:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/leads/:id/comments/:commentId", authenticateToken, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { comment } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins are allowed to edit comments" });
    }

    const checkResult = await pool.query(
      `SELECT user_id FROM lead_comments WHERE id = $1 AND lead_id = $2`,
      [commentId, id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const result = await pool.query(
      `UPDATE lead_comments 
             SET comment = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND lead_id = $3
             RETURNING *`,
      [comment, commentId, id]
    );

    const commentWithUser = await pool.query(
      `SELECT 
                lc.*,
                COALESCE(u.name, lc.user_name, 'User') as user_name,
                u.email as user_email,
                u.role as user_role
            FROM lead_comments lc
            LEFT JOIN users u ON lc.user_id = u.id
            WHERE lc.id = $1`,
      [result.rows[0].id]
    );

    res.json(commentWithUser.rows[0]);
  } catch (error) {
    console.error("Error updating lead comment:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/leads/:id/comments/:commentId", authenticateToken, async (req, res) => {
  try {
    const { id, commentId } = req.params;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins are allowed to delete comments" });
    }

    const checkResult = await pool.query(
      `SELECT user_id FROM lead_comments WHERE id = $1 AND lead_id = $2`,
      [commentId, id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    await pool.query(
      `DELETE FROM lead_comments WHERE id = $1 AND lead_id = $2`,
      [commentId, id]
    );

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting lead comment:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── Notification Routes ──

// GET all notifications (user-specific + company-wide for all users with SQL deduplication)
app.get("/notifications", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.company_id || null;

    // Fetch notifications deduplicated by title, message, and minute timestamp
    const result = await pool.query(
      `SELECT id, user_id, company_id, type, title, message, link, priority, status, is_read, read_at, metadata, scheduled_at, created_at
       FROM (
         SELECT *, ROW_NUMBER() OVER (
           PARTITION BY title, message, DATE_TRUNC('minute', created_at)
           ORDER BY created_at DESC
         ) as rn
         FROM notifications
         WHERE user_id = $1 OR (user_id IS NULL AND (company_id = $2 OR company_id IS NULL OR $2 IS NULL))
       ) sub
       WHERE rn = 1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId, companyId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET unread count (deduplicated unread count)
app.get("/notifications/unread-count", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.company_id || null;

    const result = await pool.query(
      `SELECT COUNT(*) FROM (
         SELECT DISTINCT ON (title, message, DATE_TRUNC('minute', created_at)) id
         FROM notifications 
         WHERE (user_id = $1 OR (user_id IS NULL AND (company_id = $2 OR company_id IS NULL OR $2 IS NULL))) 
           AND is_read = false
         ORDER BY title, message, DATE_TRUNC('minute', created_at), created_at DESC
       ) sub`,
      [userId, companyId]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error("Error getting unread count:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST mark as read
app.post("/notifications/:id/read", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const companyId = req.user.company_id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE notifications 
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND (user_id = $2 OR company_id = $3)
       RETURNING *`,
      [id, userId, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST mark all as read
app.post("/notifications/read-all", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.company_id;

    await pool.query(
      `UPDATE notifications 
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE (user_id = $1 OR company_id = $2) AND is_read = false`,
      [userId, companyId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all as read:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE notification
app.delete("/notifications/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const companyId = req.user.company_id;

    const result = await pool.query(
      `DELETE FROM notifications 
       WHERE id = $1 AND (user_id = $2 OR company_id = $3)
       RETURNING id`,
      [id, userId, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ error: error.message });
  }
});


app.put("/deals/:id", authenticateToken, async (req, res) => {
  try {
    const scope = getPermissionScope(req.user.role, 'deals');
    if (scope === 'view' || scope === 'none') {
      return res.status(403).json({ error: "You are not permitted to edit deals." });
    }

    console.log("Updating deal:", req.params.id);
    console.log("Body:", req.body);

    const existingRes = await pool.query("SELECT * FROM deals WHERE id = $1", [req.params.id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: "Deal not found" });
    }
    const existing = existingRes.rows[0];

    // Enforce scope check
    if (scope === 'own') {
      if (existing.owner_id && existing.owner_id !== req.user.id) {
        return res.status(403).json({ error: "You can only edit your own deals." });
      }
    } else if (scope === 'team') {
      const subIds = await getSubordinateUserIds(req.user.id, req.user.team_id);
      if (existing.owner_id && !subIds.includes(existing.owner_id)) {
        return res.status(403).json({ error: "You can only edit deals belonging to your team." });
      }
    }

    const title = req.body.title !== undefined ? req.body.title : existing.title;
    const company = req.body.company !== undefined ? req.body.company : existing.company;
    const value = req.body.value !== undefined ? req.body.value : existing.value;
    const stage = req.body.stage !== undefined ? String(req.body.stage) : existing.stage;
    const probability = req.body.probability !== undefined ? req.body.probability : existing.probability;

    let expectedclose = req.body.expectedclose !== undefined
      ? req.body.expectedclose
      : (req.body.expected_close !== undefined ? req.body.expected_close : existing.expectedclose);
    if (expectedclose === "") {
      expectedclose = null;
    }

    const daysinstage = req.body.daysinstage !== undefined ? req.body.daysinstage : existing.daysinstage;

    const ownerId = req.body.owner_id !== undefined ? req.body.owner_id : (req.body.ownerId !== undefined ? req.body.ownerId : existing.owner_id);
    let owner = req.body.owner !== undefined ? req.body.owner : existing.owner;

    if (ownerId !== existing.owner_id && !req.body.owner) {
      if (ownerId) {
        const userRes = await pool.query("SELECT name FROM users WHERE id = $1", [ownerId]);
        if (userRes.rows.length > 0) {
          owner = userRes.rows[0].name;
        }
      } else {
        owner = null;
      }
    }

    const result = await pool.query(
      `UPDATE deals
       SET
         title = $1,
         company = $2,
         value = $3,
         stage = $4,
         owner = $5,
         owner_id = $6,
         probability = $7,
         expectedclose = $8,
         expected_close = $9,
         daysinstage = $10
       WHERE id = $11
       RETURNING *`,
      [
        title,
        company,
        value,
        stage,
        owner,
        ownerId,
        probability,
        expectedclose,
        expectedclose,
        daysinstage,
        req.params.id
      ]
    );

    const deal = result.rows[0];
    const companyId = req.user?.company_id || null;

    // Check for stage changes
    if (stage && existing.stage !== deal.stage) {
      const lowerStage = String(deal.stage).toLowerCase();
      if (lowerStage === 'won') {
        // Deal won notification
        await notificationService.createCompanyNotification(
          companyId,
          'deal_won',
          "🎉 Deal Won!",
          `Deal "${deal.title}" worth ₹${parseFloat(deal.value || 0).toLocaleString()} has been won`,
          `/deals/${deal.id}`,
          'high',
          { deal_value: deal.value, deal_title: deal.title }
        ).catch(err => console.error("Company deal won notification error:", err));
      } else if (lowerStage === 'lost') {
        // Deal lost notification
        await notificationService.createCompanyNotification(
          companyId,
          'deal_lost',
          "Deal Lost",
          `Deal "${deal.title}" has been marked as lost`,
          `/deals/${deal.id}`,
          'high',
          { deal_value: deal.value, deal_title: deal.title }
        ).catch(err => console.error("Deal lost notification error:", err));
      } else {
        // Stage changed notification
        await notificationService.createCompanyNotification(
          companyId,
          'deal_status_changed',
          "Deal Stage Updated",
          `Deal "${deal.title}" moved from ${existing.stage} to ${deal.stage}`,
          `/deals/${deal.id}`,
          'medium',
          { old_stage: existing.stage, new_stage: deal.stage, deal_title: deal.title }
        ).catch(err => console.error("Deal stage change notification error:", err));
      }
    }

    // Audit log
    await logAudit(
      req.user?.id || null,
      req.user?.name || 'System',
      'UPDATE',
      'deal',
      req.params.id,
      { old: existing, new: deal },
      req.ip
    );

    console.log("Updated:", deal);
    res.json(deal);
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Single deal delete
app.delete("/deals/:id", authenticateToken, async (req, res) => {
  try {
    const scope = getPermissionScope(req.user.role, 'deals');
    if (scope !== 'full') {
      return res.status(403).json({ error: "Only administrators are permitted to delete deals." });
    }

    const { id } = req.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: "Invalid deal ID" });
    }

    const existingRes = await pool.query("SELECT id, company_id FROM deals WHERE id = $1", [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: "Deal not found" });
    }
    const existing = existingRes.rows[0];

    const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'super_admin';
    if (!isSuperAdmin && existing.company_id !== req.user.company_id) {
      return res.status(403).json({ error: "You can only delete deals within your company." });
    }

    await pool.query("DELETE FROM deals WHERE id = $1", [id]);

    await logAudit(
      req.user?.id || null,
      req.user?.name || 'System',
      'DELETE',
      'deal',
      id,
      { id },
      req.ip
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Delete deal error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/admin/reset-database", authenticateToken, requireRole(['admin', 'super_admin', 'org_admin']), async (req, res) => {

  try {
    await pool.query("DELETE FROM leads");
    await pool.query("DELETE FROM deals");
    await pool.query("DELETE FROM tickets");
    await pool.query("DELETE FROM activities");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/leads/bulk", authenticateToken, async (req, res) => {
  try {
    console.log("BODY RECEIVED:", req.body);

    const { leads } = req.body;

    for (const lead of leads) {
      await pool.query(
        `INSERT INTO leads
        (id, name, email, phone, company, source, status, industry,
         value, probability,  owner_id, notes, aiscore)
        VALUES
        (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          lead.name,
          lead.email,
          lead.phone,
          lead.company,
          lead.source,
          lead.status,
          lead.industry,
          lead.value,
          lead.probability,

          lead.owner_id,
          lead.notes,
          lead.aiscore,
        ]
      );
    }

    res.json({
      success: true,
      imported: leads.length,
    });

  } catch (err) {
    console.error("BULK IMPORT ERROR:", err);
    res.status(500).json({
      error: err.message,
    });
  }
});
app.post("/leads/import-excel", authenticateToken, upload.single("file"), async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded"
      });
    }

    const workbook = XLSX.readFile(req.file.path);

    const sheetName = workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log("Excel rows:", rows);

    for (const row of rows) {

      // FIX EMPTY VALUES
      Object.keys(row).forEach(key => {
        if (row[key] === "") {
          row[key] = null;
        }
      });

      await pool.query(
        `
        INSERT INTO leads
        (
          name,
          email,
          phone,
          company,
          source,
          status,
          industry,
          value,
          notes,
          owner_id,
          aiscore,
          created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())
        `,
        [
          row.name || "",
          row.email || "",
          row.phone || "",
          row.company || "",
          row.source || "website",
          row.status || "new",
          row.industry || "technology",
          row.value || 0,
          row.notes || "",
          row.owner_id || null,
          row.aiscore || 50
        ]
      );
    }

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      imported: rows.length
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: error.message
    });

  }
});
app.get("/trial/:userId", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT trial_start, trial_end, subscription_status FROM users WHERE id = $1",
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ active: false, daysLeft: 0 });
    }

    const user = result.rows[0];
    const now = new Date();
    const trialEnd = user.trial_end ? new Date(user.trial_end) : null;

    const active = trialEnd ? now < trialEnd : false;
    const daysLeft = trialEnd ? Math.max(0, Math.floor((trialEnd - now) / (1000 * 60 * 60 * 24))) : 0;

    res.json({ active, daysLeft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Signup
app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password, adminKey } = req.body;

    const existing = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: "User already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if admin signup (ensure process.env.ADMIN_KEY is defined and matches)
    const isAdmin = !!(process.env.ADMIN_KEY && adminKey === process.env.ADMIN_KEY);
    const role = isAdmin ? "admin" : "sales";
    const department = isAdmin ? "Admin" : "Sales"; // ← ADD THIS
    const companyResult = await pool.query("SELECT id FROM companies ORDER BY created_at ASC LIMIT 1");
    const companyId = companyResult.rows[0] ? companyResult.rows[0].id : null;
    const result = await pool.query(
      `INSERT INTO users
      (name, email, password, role, company_id)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id,name,email,role,company_id,department`,
      [name, email, hashedPassword, role, companyId]
      //departmentalso added to the insert query if user in login left side showing general 
    );

    const user = result.rows[0];

    // ── Auto-create trial subscription ──
    await pool.query(`
      UPDATE users SET 
        trial_start = NOW(),
        trial_end = NOW() + INTERVAL '3 days',
        subscription_status = 'trialing',
        plan_type = 'trial',
        payment_status = 'unpaid'
      WHERE id = $1
    `, [user.id]);

    console.log(`✅ Trial started for user ${user.id} (3 days)`);

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        company_id: user.company_id,
        role: user.role
      },
      process.env.JWT_SECRET || "your-super-secret-key-change-this-later-12345",
      {
        expiresIn: "7d"
      }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        company_id: user.company_id,  // ← ADD THIS
        role: user.role,
        department: user.department
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});

// Validate invitation token
app.get("/auth/invite/validate", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const result = await pool.query(
      "SELECT id, name, email, role, company_id FROM users WHERE invite_token = $1 AND status = 'invited'",
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired invitation token" });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error("Validate invite error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Accept invitation (set password)
app.post("/auth/invite/accept", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: "Token and password are required" });
    }

    const check = await pool.query(
      "SELECT id FROM users WHERE invite_token = $1 AND status = 'invited'",
      [token]
    );

    if (check.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired invitation token" });
    }

    const userId = check.rows[0].id;
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `UPDATE users 
       SET password = $1, 
           is_active = true, 
           status = 'Active', 
           invite_token = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, userId]
    );

    res.json({ success: true, message: "Invitation accepted. Your account is now active!" });
  } catch (err) {
    console.error("Accept invite error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: "User not found"
      });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(400).json({
        error: "Invalid password"
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        company_id: user.company_id,
        role: user.role || 'Sales Executive',
        team_id: user.team_id || null,
        manager_id: user.manager_id || null
      },
      process.env.JWT_SECRET || "your-super-secret-key-change-this-later-12345",
      {
        expiresIn: "7d"
      }
    );
    // Mark previous sessions as inactive
    await pool.query(
      `UPDATE user_sessions
   SET is_current = false
   WHERE user_id = $1`,
      [user.id]
    );

    // Insert new session
    await pool.query(
      `INSERT INTO user_sessions
   (id, user_id, device, location, last_active, is_current, created_at, updated_at)
   VALUES (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      NOW(),
      true,
      NOW(),
      NOW()
   )`,
      [
        user.id,
        req.headers["user-agent"] || "Unknown Device",
        req.ip || "Unknown Location"
      ]
    );
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        company_id: user.company_id,  // ← ADD THIS
        role: user.role,
        department: user.department
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// Lead Sources
app.get("/lead-sources", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM lead_sources WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET LEAD SOURCES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/lead-sources", authenticateToken, async (req, res) => {
  try {
    const { name, type, status, config } = req.body;
    const result = await pool.query(
      `INSERT INTO lead_sources (user_id, name, type, status, leads_count, config)
       VALUES ($1, $2, $3, $4, 0, $5)
       RETURNING *`,
      [req.user.id, name, type, status || "pending", config || {}]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("ADD LEAD SOURCE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/lead-sources/:id", authenticateToken, async (req, res) => {
  try {
    const { name, type, status, config, leads_count } = req.body;
    const result = await pool.query(
      `UPDATE lead_sources
       SET name = COALESCE($1, name),
           type = COALESCE($2, type),
           status = COALESCE($3, status),
           config = COALESCE($4, config),
           leads_count = COALESCE($5, leads_count),
           updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [name, type, status, config, leads_count, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead source not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE LEAD SOURCE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Lead Pages
app.get("/lead-pages", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM lead_pages WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET LEAD PAGES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/lead-pages", authenticateToken, async (req, res) => {
  try {
    const { name, slug, description, status, webhook_url, redirect_url } = req.body;
    const result = await pool.query(
      `INSERT INTO lead_pages (user_id, name, slug, description, status, webhook_url, redirect_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, name, slug, description, status || "active", webhook_url, redirect_url]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("ADD LEAD PAGE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/lead-pages/:id", authenticateToken, async (req, res) => {
  try {
    const { name, slug, description, status, webhook_url, redirect_url } = req.body;
    const result = await pool.query(
      `UPDATE lead_pages
       SET name = COALESCE($1, name),
           slug = COALESCE($2, slug),
           description = COALESCE($3, description),
           status = COALESCE($4, status),
           webhook_url = COALESCE($5, webhook_url),
           redirect_url = COALESCE($6, redirect_url),
           updated_at = NOW()
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [name, slug, description, status, webhook_url, redirect_url, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead page not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE LEAD PAGE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/lead-pages/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM lead_pages WHERE id = $1 AND user_id = $2 RETURNING *",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead page not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error("DELETE LEAD PAGE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/faqs", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM faqs
      WHERE is_active = true
      ORDER BY sort_order ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET FAQS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/guides", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM guides ORDER BY sort_order ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET GUIDES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/guides", authenticateToken, async (req, res) => {
  try {
    const { title, read_time, icon, type, url, file_url, is_downloadable, sort_order } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });

    const result = await pool.query(
      `INSERT INTO guides (title, read_time, icon, type, url, file_url, is_downloadable, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, read_time || "5 min", icon || "📘", type || "Guide", url || null, file_url || null, is_downloadable || false, sort_order || 0]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("ADD GUIDE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/guides/:id", authenticateToken, async (req, res) => {
  try {
    const { title, read_time, icon, type, url, file_url, is_downloadable, sort_order } = req.body;
    const result = await pool.query(
      `UPDATE guides
       SET title = COALESCE($1, title), read_time = COALESCE($2, read_time),
           icon = COALESCE($3, icon), type = COALESCE($4, type),
           url = COALESCE($5, url), file_url = COALESCE($6, file_url),
           is_downloadable = COALESCE($7, is_downloadable), sort_order = COALESCE($8, sort_order),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [title, read_time, icon, type, url, file_url, is_downloadable, sort_order, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Guide not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE GUIDE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/guides/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM guides WHERE id = $1 RETURNING *", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Guide not found" });
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error("DELETE GUIDE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/ad-connections", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM ad_connections WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET AD CONNECTIONS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/ad-connections", authenticateToken, async (req, res) => {
  try {
    const { platform, platform_name, account_id, account_name, name, api_key, webhook_url, description } = req.body;
    if (!platform || !platform_name) {
      return res.status(400).json({ error: "Platform and platform name are required" });
    }

    const result = await pool.query(
      `INSERT INTO ad_connections
        (user_id, platform, platform_name, connected, account_id, account_name, leads_imported, cost_spent, created_at, updated_at, name, api_key, webhook_url, description)
       VALUES ($1, $2, $3, true, $4, $5, 0, 0, NOW(), NOW(), $6, $7, $8, $9)
       ON CONFLICT (user_id, platform)
       DO UPDATE SET
         platform_name = EXCLUDED.platform_name,
         connected = true,
         account_id = EXCLUDED.account_id,
         account_name = EXCLUDED.account_name,
         name = EXCLUDED.name,
         api_key = EXCLUDED.api_key,
         webhook_url = EXCLUDED.webhook_url,
         description = EXCLUDED.description,
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, platform, platform_name, account_id || null, account_name || null, name || null, api_key || null, webhook_url || null, description || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("ADD AD CONNECTION ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/ad-connections/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM ad_connections WHERE id = $1 AND user_id = $2 RETURNING *",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ad connection not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error("DISCONNECT AD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/ad-connections/:id/sync", authenticateToken, async (req, res) => {
  try {
    const connectionId = req.params.id;
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT * FROM ad_connections WHERE id = $1 AND user_id = $2",
      [connectionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Connection not found" });
    }

    // Use the syncConnection helper
    const syncResult = await syncConnection(result.rows[0]);

    res.json({
      success: true,
      leads_imported: syncResult.leads_fetched,
      connection: result.rows[0]
    });

  } catch (err) {
    console.error("SYNC AD LEADS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/ad-connections/update-count", authenticateToken, async (req, res) => {
  try {
    const { platform, leadsCount, cost } = req.body;
    if (!platform) {
      return res.status(400).json({ error: "Platform is required" });
    }

    const result = await pool.query(
      `UPDATE ad_connections
       SET leads_imported = leads_imported + $1,
           cost_spent = cost_spent + $2,
           updated_at = NOW()
       WHERE platform = $3 AND user_id = $4
       RETURNING *`,
      [leadsCount || 0, cost || 0, platform, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ad connection not found for this platform" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE LEADS COUNT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── OAUTH CONFIG AND ROUTES ──
const OAUTH_CONFIG = {
  facebook: {
    name: 'Facebook',  // ← ADD THIS
    authorizeUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scope: 'ads_management,leads_retrieval,pages_read_engagement,pages_manage_ads',
    clientId: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    redirectUri: process.env.FACEBOOK_REDIRECT_URI || `${process.env.APP_URL}/api/ad-connections/oauth/facebook/callback`
  },
  google: {
    name: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/adwords',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/api/ad-connections/oauth/google/callback`
  },
  linkedin: {
    name: 'LinkedIn',
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scope: 'r_ads_leadgen,marketing_ads,marketplace_analytics',
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: process.env.LINKEDIN_REDIRECT_URI || `${process.env.APP_URL}/api/ad-connections/oauth/linkedin/callback`
  },
  instagram: {
    name: 'Instagram',
    authorizeUrl: 'https://api.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    scope: 'instagram_basic,pages_read_engagement,leads_retrieval',
    clientId: process.env.INSTAGRAM_APP_ID,
    clientSecret: process.env.INSTAGRAM_APP_SECRET,
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI || `${process.env.APP_URL}/api/ad-connections/oauth/instagram/callback`
  }
};



// ── SYNC CONNECTION HELPER ──
// Add this after all OAuth routes (around line 1850-1900)

async function syncConnection(connection) {
  try {
    console.log(`🔄 Syncing ${connection.platform}...`);

    const credentials = {
      accessToken: connection.access_token,
      refreshToken: connection.refresh_token,
      clientId: connection.client_id,
      clientSecret: connection.client_secret
    };

    const integration = createPlatformIntegration(connection.platform, credentials);
    const since = connection.last_sync || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let rawLeads = [];
    switch (connection.platform) {
      case 'facebook':
        rawLeads = await integration.fetchAllLeads(connection.account_id, since);
        break;
      case 'google':
      case 'linkedin':
      case 'instagram':
        // For now return empty array for other platforms
        rawLeads = [];
        break;
      default:
        throw new Error(`Unsupported platform: ${connection.platform}`);
    }

    const mappedLeads = mapMultipleLeadsToCRM(connection.platform, rawLeads);
    let importedCount = 0;

    const settingsResult = await pool.query(
      "SELECT ad_auto_create FROM user_settings WHERE user_id = $1",
      [connection.user_id]
    );
    const autoCreate = settingsResult.rows[0]?.ad_auto_create || false;

    if (autoCreate && mappedLeads.length > 0) {
      for (const lead of mappedLeads) {
        try {
          const existing = await pool.query(
            "SELECT id FROM leads WHERE platform_id = $1 AND company_id = $2",
            [lead.platform_id, connection.company_id]
          );
          if (existing.rows.length === 0) {
            await pool.query(
              `INSERT INTO leads (id, name, email, phone, company, source, platform, platform_id, status, owner_id, company_id)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'new', $8, $9)`,
              [lead.name, lead.email, lead.phone, lead.company, lead.source, lead.platform, lead.platform_id, connection.user_id, connection.company_id]
            );
            importedCount++;
          }
        } catch (err) {
          console.error('Import lead error:', err);
        }
      }
    }

    await pool.query(
      `UPDATE ad_connections 
       SET leads_imported = leads_imported + $1, last_sync = NOW(), last_sync_status = 'success', last_sync_error = NULL
       WHERE id = $2`,
      [rawLeads.length, connection.id]
    );

    await pool.query(
      `INSERT INTO ad_sync_logs (connection_id, status, leads_imported, started_at, completed_at)
       VALUES ($1, 'success', $2, NOW(), NOW())`,
      [connection.id, importedCount]
    );

    return { success: true, leads_fetched: rawLeads.length, leads_imported: importedCount, platform: connection.platform };

  } catch (error) {
    console.error('Sync error:', error);
    await pool.query(
      `UPDATE ad_connections SET last_sync_status = 'failed', last_sync_error = $1, last_sync = NOW() WHERE id = $2`,
      [error.message, connection.id]
    );
    await pool.query(
      `INSERT INTO ad_sync_logs (connection_id, status, errors, started_at, completed_at)
       VALUES ($1, 'failed', $2::jsonb, NOW(), NOW())`,
      [connection.id, JSON.stringify([error.message])]
    );
    throw error;
  }
}

// ── MANUAL SYNC ENDPOINTS ──
// Add after OAuth callback routes

app.post("/api/ad-connections/:id/sync-manual", authenticateToken, async (req, res) => {
  try {
    const connectionId = req.params.id;
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT * FROM ad_connections WHERE id = $1 AND user_id = $2",
      [connectionId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Connection not found" });
    }

    const syncResult = await syncConnection(result.rows[0]);
    res.json({ success: true, ...syncResult });
  } catch (error) {
    console.error("Manual sync error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ad-connections/sync-all", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const connections = await pool.query(
      "SELECT * FROM ad_connections WHERE user_id = $1 AND connected = true",
      [userId]
    );

    const results = [];
    for (const connection of connections.rows) {
      try {
        const syncResult = await syncConnection(connection);
        results.push({ connection_id: connection.id, platform: connection.platform, ...syncResult });
      } catch (error) {
        results.push({ connection_id: connection.id, platform: connection.platform, success: false, error: error.message });
      }
    }

    res.json({ success: true, total: connections.rows.length, results });
  } catch (error) {
    console.error("Sync all error:", error);
    res.status(500).json({ error: error.message });
  }
});

// OAuth Authorize Redirect
app.get("/api/ad-connections/oauth/:platform/authorize", authenticateToken, async (req, res) => {
  try {
    const { platform } = req.params;
    const config = OAUTH_CONFIG[platform];

    if (!config) {
      return res.status(400).json({ error: "Unsupported platform" });
    }

    const state = Buffer.from(JSON.stringify({ userId: req.user.id, platform })).toString('base64');

    const authUrl = `${config.authorizeUrl}?client_id=${config.clientId}&redirect_uri=${config.redirectUri}&scope=${config.scope}&response_type=code&state=${state}`;

    res.json({ authUrl });
  } catch (error) {
    console.error("OAuth authorize error:", error);
    res.status(500).json({ error: error.message });
  }
});

// OAuth Callback
app.get("/api/ad-connections/oauth/:platform/callback", async (req, res) => {
  try {
    const { platform } = req.params;
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: "Authorization code required" });
    }

    const config = OAUTH_CONFIG[platform];
    if (!config) {
      return res.status(400).json({ error: "Unsupported platform" });
    }

    // Exchange code for access token
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code: code,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(tokenData.error_description || 'Failed to get access token');
    }

    // Get platform account info
    let accountId = null;
    let accountName = null;

    if (platform === 'facebook') {
      const accountRes = await fetch(`https://graph.facebook.com/v18.0/me/adaccounts?access_token=${tokenData.access_token}`);
      const accountData = await accountRes.json();
      if (accountData.data && accountData.data.length > 0) {
        accountId = accountData.data[0].id;
        accountName = accountData.data[0].name;
      }
    } else if (platform === 'google') {
      // Google Ads account info
      const accountRes = await fetch(`https://googleads.googleapis.com/v12/customers:listAccessibleCustomers`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const accountData = await accountRes.json();
      if (accountData.resourceNames && accountData.resourceNames.length > 0) {
        accountId = accountData.resourceNames[0];
        accountName = 'Google Ads Account';
      }
    } else if (platform === 'linkedin') {
      const accountRes = await fetch('https://api.linkedin.com/v2/adAccounts?q=search&start=0&count=10', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const accountData = await accountRes.json();
      if (accountData.elements && accountData.elements.length > 0) {
        accountId = accountData.elements[0].id;
        accountName = accountData.elements[0].name;
      }
    } else if (platform === 'instagram') {
      const accountRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${tokenData.access_token}`);
      const accountData = await accountRes.json();
      if (accountData.data && accountData.data.length > 0) {
        accountId = accountData.data[0].id;
        accountName = accountData.data[0].name;
      }
    }

    // Store connection in database
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());

    const result = await pool.query(`
      INSERT INTO ad_connections 
        (user_id, platform, platform_name, connected, account_id, account_name, access_token, refresh_token, token_expires_at, leads_imported, cost_spent, created_at, updated_at)
      VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, 0, 0, NOW(), NOW())
      ON CONFLICT (user_id, platform) DO UPDATE SET
        platform_name = EXCLUDED.platform_name,
        connected = true,
        account_id = EXCLUDED.account_id,
        account_name = EXCLUDED.account_name,
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, ad_connections.refresh_token),
        token_expires_at = COALESCE(EXCLUDED.token_expires_at, NOW() + INTERVAL '1 day'),
        updated_at = NOW()
      RETURNING *
    `, [
      stateData.userId,
      platform,
      config.name || platform,
      accountId,
      accountName || `${platform} Account`,
      tokenData.access_token,
      tokenData.refresh_token || null,
      tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000)
    ]);

    // Redirect back to frontend
    const FRONTEND_URL = process.env.APP_URL || 'http://localhost:5173';
    res.redirect(`${FRONTEND_URL}/settings?tab=integrations&connected=${platform}`);

  } catch (error) {
    console.error("OAuth callback error:", error);
    const FRONTEND_URL = process.env.APP_URL || 'http://localhost:5173';
    res.redirect(`${FRONTEND_URL}/settings?tab=integrations&error=${encodeURIComponent(error.message)}`);
  }
});

//const speakeasy = require("speakeasy");
const speakeasy = require("speakeasy");
app.post("/auth/2fa/setup", authenticateToken, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `VigoMerge (${req.user.email})`,
    });

    await pool.query(
      "UPDATE users SET two_fa_secret = $1 WHERE id = $2",
      [secret.base32, req.user.id]
    );

    res.json({
      secret: secret.base32,
      otpauth_url: secret.otpauth_url,
    });
  } catch (err) {
    console.error("2FA SETUP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
// ── 2FA Setup ──────────────────────────────────────────────
app.post("/auth/2fa/verify", authenticateToken, async (req, res) => {
  try {
    const rawToken = req.body.token;
    const token = typeof rawToken === "string" ? rawToken.trim() : String(rawToken || "").trim();

    const result = await pool.query(
      "SELECT two_fa_secret FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0 || !result.rows[0].two_fa_secret) {
      return res.status(400).json({ error: "2FA setup not started" });
    }

    const secret = result.rows[0].two_fa_secret.trim();

    console.log("DEBUG userId:", req.user.id);
    console.log("DEBUG secret from DB: [" + secret + "]");
    console.log("DEBUG token received: [" + token + "]");

    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: "base32",
      token: token,
      window: 2,
    });

    console.log("DEBUG verified result:", verified);

    if (!verified) {
      return res.status(400).json({ error: "Invalid code" });
    }

    await pool.query(
      "UPDATE users SET two_fa_enabled = true WHERE id = $1",
      [req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("2FA VERIFY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// ── Change Password (logged-in user, needs current password) ──
app.put("/users/:id/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const result = await pool.query("SELECT password FROM users WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!valid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, req.params.id]);

    res.json({ success: true });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Delete Avatar ──────────────────────────────────────────
app.put("/users/:id/avatar", authenticateToken, async (req, res) => {
  try {
    const { avatar_url } = req.body;
    const result = await pool.query(
      "UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, avatar_url",
      [avatar_url, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("AVATAR UPDATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── UPLOAD AVATAR FILE ────────────────────────────────────
app.post("/users/:id/avatar/upload", authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded. Please select an image file."
      });
    }

    const userId = req.params.id;
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // Verify user exists and belongs to the same company
    const userCheck = await pool.query(
      "SELECT id, company_id FROM users WHERE id = $1",
      [userId]
    );

    if (userCheck.rows.length === 0) {
      // Delete uploaded file if user not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Verify user has permission (own profile or admin)
    if (userId !== req.user.id && req.user.role !== 'admin') {
      // Delete uploaded file if unauthorized
      fs.unlinkSync(req.file.path);
      return res.status(403).json({
        success: false,
        error: "Unauthorized to update this user's avatar"
      });
    }

    // Update user's avatar_url in database
    const result = await pool.query(
      "UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, avatar_url",
      [avatarUrl, userId]
    );

    if (result.rows.length === 0) {
      // Delete uploaded file if update failed
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        error: "Failed to update avatar"
      });
    }

    // Log the action
    await logAudit(
      req.user.id,
      req.user.name || 'System',
      'avatar_upload',
      'user',
      userId,
      { avatar_url: avatarUrl },
      req.ip
    );

    res.json({
      success: true,
      avatar_url: avatarUrl,
      message: "Avatar uploaded successfully"
    });

  } catch (error) {
    console.error("Avatar upload error:", error);

    // Clean up uploaded file if error occurred
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error("Failed to delete uploaded file:", unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to upload avatar"
    });
  }
});

// ── DELETE AVATAR ──────────────────────────────────────────
app.delete("/users/:id/avatar", authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;

    // Verify user exists
    const userCheck = await pool.query(
      "SELECT avatar_url FROM users WHERE id = $1",
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Verify user has permission
    if (userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: "Unauthorized to remove this user's avatar"
      });
    }

    // Delete the file from disk if it exists
    const avatarUrl = userCheck.rows[0].avatar_url;
    if (avatarUrl) {
      const filePath = path.join(__dirname, avatarUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Update user record
    await pool.query(
      "UPDATE users SET avatar_url = NULL WHERE id = $1",
      [userId]
    );

    // Log the action
    await logAudit(
      req.user.id,
      req.user.name || 'System',
      'avatar_removed',
      'user',
      userId,
      null,
      req.ip
    );

    res.json({
      success: true,
      message: "Avatar removed successfully"
    });

  } catch (error) {
    console.error("Avatar delete error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to remove avatar"
    });
  }
});

// ── Billing History ────────────────────────────────────────
app.get("/invoices/:userId", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC",
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET INVOICES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Active Sessions ────────────────────────────────────────
app.get("/user-sessions/:userId", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM user_sessions WHERE user_id = $1 ORDER BY last_active DESC",
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET SESSIONS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/user-sessions/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM user_sessions WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("REVOKE SESSION ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Cancel Subscription ────────────────────────────────────
app.put("/users/:id/subscription", authenticateToken, async (req, res) => {
  try {
    const { subscription_status } = req.body;

    // Update subscription_status and sync is_active field
    // User is active if subscription is 'active' or 'trialing'
    const isActive = subscription_status === 'active' || subscription_status === 'trialing';

    const result = await pool.query(
      `UPDATE users 
       SET subscription_status = $1, 
           is_active = $2,
           updated_at = NOW()
       WHERE id = $3 
       RETURNING id, subscription_status, is_active`,
      [subscription_status, isActive, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("SUBSCRIPTION UPDATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Remove Payment Method ──────────────────────────────────
app.put("/users/:id/payment-method", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET payment_last4 = NULL, payment_brand = NULL, payment_expiry = NULL
       WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    res.json({ success: true, id: result.rows[0]?.id });
  } catch (err) {
    console.error("PAYMENT REMOVE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── PayU: Create Order ─────────────────────────────────────
app.post("/payments/create-order", authenticateToken, async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const PAYU_KEY = process.env.PAYU_MERCHANT_KEY;
    const PAYU_SALT = process.env.PAYU_MERCHANT_SALT;
    const PAYU_BASE_URL =
      process.env.PAYU_ENV === "LIVE"
        ? "https://secure.payu.in/_payment"
        : "https://test.payu.in/_payment";

    if (!PAYU_KEY || !PAYU_SALT) {
      console.error("PAYU credentials missing in .env");
      return res.status(500).json({ error: "Payment gateway not configured" });
    }

    const txnid = "TXN" + Date.now() + Math.floor(Math.random() * 1000);
    const formattedAmount = Number(amount).toFixed(2);
    const productinfo = receipt || "Vigozen CRM Payment";
    const firstname = req.user.name || "Customer";
    const email = req.user.email || "customer@example.com";
    const phone = req.user.phone || "9999999999";

    // exact PayU hash sequence
    const hashString = `${PAYU_KEY}|${txnid}|${formattedAmount}|${productinfo}|${firstname}|${email}|||||||||||${PAYU_SALT}`;
    const hash = crypto.createHash("sha512").update(hashString).digest("hex");

    await pool.query(
      `INSERT INTO payments (user_id, order_id, amount, plan, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())`,
      [req.user.id, txnid, formattedAmount, productinfo]
    );

    const APP_URL = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

    res.json({
      success: true,
      txnid,
      payuUrl: PAYU_BASE_URL,
      payuData: {
        key: PAYU_KEY,
        txnid,
        amount: formattedAmount,
        productinfo,
        firstname,
        email,
        phone,
        hash,
        surl: `${APP_URL}/payments/callback`,
        furl: `${APP_URL}/payments/callback`,
      },
    });
  } catch (err) {
    console.error("PAYU CREATE ORDER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── PayU: Server-side callback (surl/furl land here first) ──
app.post("/payments/callback", async (req, res) => {
  try {
    const { status, txnid, hash: receivedHash, email, firstname, amount, productinfo, mihpayid } = req.body;

    const PAYU_KEY = process.env.PAYU_MERCHANT_KEY;
    const PAYU_SALT = process.env.PAYU_MERCHANT_SALT;

    const reverseHashString = `${PAYU_SALT}|${status}|||||||||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${PAYU_KEY}`;
    const expectedHash = crypto.createHash("sha512").update(reverseHashString).digest("hex");

    const hashValid = expectedHash === receivedHash;
    const finalStatus = hashValid && status === "success" ? "success" : "failed";

    await pool.query(
      `UPDATE payments SET status = $1, payment_id = $2, updated_at = NOW() WHERE order_id = $3`,
      [finalStatus, mihpayid || null, txnid]
    );

    const FRONTEND_URL = process.env.APP_URL || "http://localhost:5173";

    const redirectPath = finalStatus === "success" ? "/payment-success" : "/payment-failure";
    const params = new URLSearchParams({ txnid, status: finalStatus, mihpayid: mihpayid || "" });

    res.redirect(`${FRONTEND_URL}${redirectPath}?${params.toString()}`);
  } catch (err) {
    console.error("PAYU CALLBACK ERROR:", err);
    res.redirect("https://vigomerge.com/payment-failure");
  }
});

// ── PayU: Verify (called by frontend after redirect) ────────
app.post("/payments/verify", authenticateToken, async (req, res) => {
  try {
    const { txnid, status, plan } = req.body;

    const result = await pool.query(
      "SELECT * FROM payments WHERE order_id = $1 AND user_id = $2",
      [txnid, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const payment = result.rows[0];

    // Update user account on successful payment
    if (payment.status === 'success' || status === 'success') {
      const selectedPlan = plan || payment.plan || 'professional';
      await pool.query(
        `UPDATE users 
         SET subscription_status = 'active', 
             payment_status = 'paid', 
             plan_type = $1 
         WHERE id = $2`,
        [selectedPlan, req.user.id]
      );
    }

    res.json({
      success: payment.status === "success",
      status: payment.status,
      subscription_activated: payment.status === "success" || status === "success"
    });
  } catch (err) {
    console.error("PAYU VERIFY ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ──────────────────────────────────────────────────────────────
// NOTIFICATION ROUTES
// ──────────────────────────────────────────────────────────────

// GET /api/audit-logs (Admin & managers allowed with dynamic filtering)
// ── GET /api/audit-logs (Updated for Team Leader) ──
app.get("/api/audit-logs", authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, action, entity_type, user_id } = req.query;
    const companyId = req.user.company_id;
    const { role } = req.user;

    const isSuperAdmin = role === 'Super Admin' || role === 'super_admin';
    const isOrgAdmin = role === 'Org Admin' || role === 'org_admin' || role === 'admin';
    const isManager = ['Sales Manager', 'sales_manager', 'Lead Manager', 'lead_manager', 'Team Leader', 'team_leader'].includes(role);
    const isExecutive = ['Sales Executive', 'sales_executive', 'Lead Executive', 'lead_executive', 'Telecaller', 'telecaller', 'Lead Qualifier', 'lead_qualifier'].includes(role);

    // Team Leader and above can view audit logs (with restrictions)
    if (!isSuperAdmin && !isOrgAdmin && !isManager && !isExecutive) {
      return res.status(403).json({ error: "Access denied to audit logs" });
    }

    let query = `SELECT * FROM audit_logs `;
    const params = [];
    let paramIndex = 1;
    const conditions = [];

    if (isSuperAdmin) {
      // Super Admin: All logs (no filter)
    } else if (isOrgAdmin) {
      // Org Admin: Company logs only
      if (companyId) {
        conditions.push(`user_id IN (SELECT id FROM users WHERE company_id = $${paramIndex})`);
        params.push(companyId);
        paramIndex++;
      }
    } else if (isManager) {
      // Manager: Subordinate logs only
      const subIds = await getSubordinateUserIds(req.user.id, req.teamId);
      conditions.push(`user_id = ANY($${paramIndex})`);
      params.push(subIds);
      paramIndex++;
    } else {
      // Executive: Own logs only
      conditions.push(`user_id = $${paramIndex}`);
      params.push(req.user.id);
      paramIndex++;
    }

    // ... rest of filters and pagination
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /users/bulk/action (Admin only)
// POST /users/bulk/action (Admin & managers allowed on subordinates)
app.post("/users/bulk/action", authenticateToken, requireRole(['admin', 'super_admin', 'org_admin', 'Sales Manager', 'sales_manager']), async (req, res) => {
  try {
    const { userIds, action, value } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "User IDs required" });
    }

    const { role } = req.user;
    const isSuperAdmin = role === 'Super Admin' || role === 'super_admin';
    const isOrgAdmin = role === 'Org Admin' || role === 'org_admin' || role === 'admin';
    const isManager = ['Sales Manager', 'sales_manager'].includes(role);

    const companyId = req.user.company_id;

    if (isSuperAdmin) {
      // Super Admin can manage anyone
    } else if (isOrgAdmin) {
      // Verify all users belong to the same company
      let verify;
      if (companyId) {
        verify = await pool.query(
          "SELECT id FROM users WHERE id = ANY($1) AND company_id = $2",
          [userIds, companyId]
        );
      } else {
        verify = await pool.query(
          "SELECT id FROM users WHERE id = ANY($1) AND company_id IS NULL",
          [userIds]
        );
      }
      if (verify.rows.length !== userIds.length) {
        return res.status(403).json({ error: "Some users don't belong to your company" });
      }
    } else if (isManager) {
      // Sales/Lead Managers can only perform actions on subordinates and cannot delete
      if (action === 'delete') {
        return res.status(403).json({ error: "Managers are not authorized to delete users" });
      }

      const subIds = await getSubordinateUserIds(req.user.id, req.teamId);
      const allSubordinates = userIds.every(id => subIds.includes(id));
      if (!allSubordinates) {
        return res.status(403).json({ error: "You can only manage your subordinates" });
      }

      // Role assignment constraints
      if (action === 'assign_role') {
        const roleLower = role.toLowerCase();
        const valueLower = value?.toLowerCase();
        if (roleLower === 'sales manager' || roleLower === 'sales_manager') {
          if (!['team leader', 'team_leader', 'sales executive', 'sales_executive'].includes(valueLower)) {
            return res.status(403).json({ error: "Sales Manager can only assign Team Leader or Sales Executive roles" });
          }
        } else if (roleLower === 'lead manager' || roleLower === 'lead_manager') {
          if (!['lead executive', 'lead_executive', 'telecaller', 'lead qualifier', 'lead_qualifier'].includes(valueLower)) {
            return res.status(403).json({ error: "Lead Manager can only assign Lead Executive, Telecaller, or Lead Qualifier roles" });
          }
        }
      }
    } else {
      return res.status(403).json({ error: "Bulk actions are restricted" });
    }

    let result;

    switch (action) {
      case 'activate':
        result = await pool.query(
          "UPDATE users SET is_active = true, status = 'Active', updated_at = NOW() WHERE id = ANY($1) RETURNING id, name",
          [userIds]
        );
        break;

      case 'deactivate':
        result = await pool.query(
          "UPDATE users SET is_active = false, status = 'Inactive', updated_at = NOW() WHERE id = ANY($1) RETURNING id, name",
          [userIds]
        );
        break;

      case 'delete':
        result = await pool.query(
          "UPDATE users SET is_active = false, status = 'Inactive', updated_at = NOW() WHERE id = ANY($1) RETURNING id, name",
          [userIds]
        );
        break;

      case 'assign_department':
        if (!value) {
          return res.status(400).json({ error: "Department value required" });
        }
        result = await pool.query(
          "UPDATE users SET department = $1, updated_at = NOW() WHERE id = ANY($2) RETURNING id, name",
          [value, userIds]
        );
        break;

      case 'assign_role':
        const allowedDisplayRoles = ['Super Admin', 'Org Admin', 'admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'];
        const matchedRole = allowedDisplayRoles.find(r => r.toLowerCase() === value.toLowerCase());
        if (!value || !matchedRole) {
          return res.status(400).json({ error: "Invalid role" });
        }
        result = await pool.query(
          "UPDATE users SET role = $1, updated_at = NOW() WHERE id = ANY($2) RETURNING id, name",
          [matchedRole, userIds]
        );
        break;

      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    // Log audit
    await logAudit(
      req.user.id,
      req.user.name,
      'BULK_' + action.toUpperCase(),
      'user',
      null,
      { userIds, action, value, affected: result.rows.length },
      req.ip
    );

    res.json({
      success: true,
      action,
      affected: result.rows.length,
      users: result.rows
    });
  } catch (error) {
    console.error("Error performing bulk action:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── Reports API ──
app.get("/api/reports/summary", authenticateToken, checkPermission('reports'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { permissionScope, companyId, userId, teamId } = req;
    const params = [];
    let paramIndex = 1;

    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = ` AND created_at::date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(startDate, endDate);
      paramIndex += 2;
    }

    let companyFilter = '';
    if (companyId) {
      companyFilter = ` AND company_id = $${paramIndex}`;
      params.push(companyId);
      paramIndex++;
    } else {
      companyFilter = ` AND company_id IS NULL`;
    }

    let hierarchyFilter = '';
    if (permissionScope !== 'full') {
      const subIds = await getSubordinateUserIds(userId, teamId);
      hierarchyFilter = ` AND owner_id = ANY($${paramIndex})`;
      params.push(subIds);
      paramIndex++;
    }

    const query = `
      SELECT 
        (SELECT COUNT(*) FROM leads WHERE 1=1 ${dateFilter} ${companyFilter} ${hierarchyFilter}) as total_leads,
        (SELECT COUNT(*) FROM deals WHERE 1=1 ${dateFilter} ${companyFilter} ${hierarchyFilter}) as total_deals,
        (SELECT COUNT(*) FROM deals WHERE LOWER(stage::text) = 'won' ${dateFilter} ${companyFilter} ${hierarchyFilter}) as won_deals,
        (SELECT COUNT(*) FROM deals WHERE stage::text IN ('New','Contacted','Qualified','Proposal','Negotiation') ${dateFilter} ${companyFilter} ${hierarchyFilter}) as active_deals,
        (SELECT COALESCE(SUM(value), 0) FROM deals WHERE LOWER(stage::text) = 'won' ${dateFilter} ${companyFilter} ${hierarchyFilter}) as total_revenue,
        CASE 
          WHEN (SELECT COUNT(*) FROM deals WHERE 1=1 ${dateFilter} ${companyFilter} ${hierarchyFilter}) > 0 
          THEN ROUND(((SELECT COUNT(*) FROM deals WHERE LOWER(stage::text) = 'won' ${dateFilter} ${companyFilter} ${hierarchyFilter})::numeric / 
                     (SELECT COUNT(*) FROM deals WHERE 1=1 ${dateFilter} ${companyFilter} ${hierarchyFilter})::numeric * 100), 1)
          ELSE 0 
        END as win_rate
    `;
    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Reports Summary Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/reports/employee-wise", authenticateToken, checkPermission('reports'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { permissionScope, companyId, userId, teamId } = req;
    const params = [];
    let paramIndex = 1;

    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = ` l.created_at::date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(startDate, endDate);
      paramIndex += 2;
    }

    let companyFilter = '';
    if (companyId) {
      companyFilter = ` l.company_id = $${paramIndex}`;
      params.push(companyId);
      paramIndex++;
    } else {
      companyFilter = ` l.company_id IS NULL`;
    }

    let hierarchyFilter = '';
    if (permissionScope !== 'full') {
      const subIds = await getSubordinateUserIds(userId, teamId);
      hierarchyFilter = ` l.owner_id = ANY($${paramIndex})`;
      params.push(subIds);
      paramIndex++;
    }

    let clauses = [];
    if (dateFilter) clauses.push(dateFilter);
    if (companyFilter) clauses.push(companyFilter);
    if (hierarchyFilter) clauses.push(hierarchyFilter);

    const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';

    const query = `
      SELECT 
        COALESCE(u.name, 'Unassigned') as employee_name,
        COUNT(DISTINCT l.id) as total_leads,
        COUNT(DISTINCT l.id) FILTER (WHERE LOWER(l.status::text) = 'new') as new_leads,
        COUNT(DISTINCT l.id) FILTER (WHERE LOWER(l.status::text) = 'contacted') as contacted_leads,
        COUNT(DISTINCT l.id) FILTER (WHERE LOWER(l.status::text) = 'qualified') as qualified_leads,
        COUNT(DISTINCT l.id) FILTER (WHERE LOWER(l.status::text) = 'proposal') as proposal_leads,
        COUNT(DISTINCT l.id) FILTER (WHERE LOWER(l.status::text) = 'negotiation') as negotiation_leads,
        COUNT(DISTINCT l.id) FILTER (WHERE LOWER(l.status::text) = 'won') as won_deals,
        COUNT(DISTINCT l.id) FILTER (WHERE LOWER(l.status::text) = 'lost') as lost_leads,
        COALESCE(SUM(l.value) FILTER (WHERE LOWER(l.status::text) = 'won'), 0) as total_value
      FROM leads l
      LEFT JOIN users u ON l.owner_id = u.id
      ${whereClause}
      GROUP BY COALESCE(u.name, 'Unassigned')
      ORDER BY won_deals DESC
    `;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Employee-wise report error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/reports/status-wise", authenticateToken, checkPermission('reports'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { permissionScope, companyId, userId, teamId } = req;
    const params = [];
    let paramIndex = 1;

    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = ` created_at::date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(startDate, endDate);
      paramIndex += 2;
    }

    let companyFilter = '';
    if (companyId) {
      companyFilter = ` company_id = $${paramIndex}`;
      params.push(companyId);
      paramIndex++;
    } else {
      companyFilter = ` company_id IS NULL`;
    }

    let hierarchyFilter = '';
    if (permissionScope !== 'full') {
      const subIds = await getSubordinateUserIds(userId, teamId);
      hierarchyFilter = ` owner_id = ANY($${paramIndex})`;
      params.push(subIds);
      paramIndex++;
    }

    let clauses = [];
    if (dateFilter) clauses.push(dateFilter);
    if (companyFilter) clauses.push(companyFilter);
    if (hierarchyFilter) clauses.push(hierarchyFilter);

    const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';

    const query = `
      SELECT stage, COUNT(*) as count, COALESCE(SUM(value), 0) as total_value
      FROM deals
      ${whereClause}
      GROUP BY stage
      ORDER BY count DESC
    `;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Reports Status Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/reports/sales-wise", authenticateToken, checkPermission('reports'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { permissionScope, companyId, userId, teamId } = req;
    const params = [];
    let paramIndex = 1;

    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = ` AND created_at::date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(startDate, endDate);
      paramIndex += 2;
    }

    let companyFilter = '';
    if (companyId) {
      companyFilter = ` AND company_id = $${paramIndex}`;
      params.push(companyId);
      paramIndex++;
    } else {
      companyFilter = ` AND company_id IS NULL`;
    }

    let hierarchyFilter = '';
    if (permissionScope !== 'full') {
      const subIds = await getSubordinateUserIds(userId, teamId);
      hierarchyFilter = ` AND owner_id = ANY($${paramIndex})`;
      params.push(subIds);
      paramIndex++;
    }

    const query = `
      SELECT TO_CHAR(created_at, 'YYYY-"W"IW') as week,
             COUNT(*) as deals_count,
             COALESCE(SUM(value), 0) as total_value,
             COALESCE(AVG(value), 0) as avg_value
      FROM deals
      WHERE LOWER(stage::text) = 'won' ${dateFilter} ${companyFilter} ${hierarchyFilter}
      GROUP BY TO_CHAR(created_at, 'YYYY-"W"IW')
      ORDER BY week ASC
    `;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Reports Sales Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── CSV Export Endpoint ──
app.get("/api/reports/export/csv", authenticateToken, async (req, res) => {
  try {
    const leadsResult = await pool.query("SELECT name, company, email, phone, status, value, created_at FROM leads ORDER BY created_at DESC");
    const dealsResult = await pool.query("SELECT title, company, stage, value, owner, created_at FROM deals ORDER BY created_at DESC");

    const csvRows = [];
    csvRows.push("Section,Title/Name,Company,Status/Stage,Value (₹),Owner/Contact,Created Date");

    leadsResult.rows.forEach(l => {
      csvRows.push(`Lead,"${(l.name || '').replace(/"/g, '""')}","${(l.company || '').replace(/"/g, '""')}","${l.status || ''}",${l.value || 0},"${(l.email || '').replace(/"/g, '""')}",${l.created_at ? new Date(l.created_at).toISOString().split('T')[0] : ''}`);
    });

    dealsResult.rows.forEach(d => {
      csvRows.push(`Deal,"${(d.title || '').replace(/"/g, '""')}","${(d.company || '').replace(/"/g, '""')}","${d.stage || ''}",${d.value || 0},"${(d.owner || '').replace(/"/g, '""')}",${d.created_at ? new Date(d.created_at).toISOString().split('T')[0] : ''}`);
    });

    const csv = csvRows.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=crm_report_${new Date().toISOString().split("T")[0]}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PDF Export Endpoint ──
app.get("/api/reports/export/pdf", authenticateToken, async (req, res) => {
  try {
    const leadsRes = await pool.query("SELECT COUNT(*) as total FROM leads");
    const dealsRes = await pool.query("SELECT COUNT(*) as total, COALESCE(SUM(value) FILTER (WHERE LOWER(stage) = 'won'), 0) as revenue FROM deals");

    const doc = new PDFDocument({ margin: 50 });
    const filename = `report_${new Date().toISOString().split("T")[0]}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    doc.pipe(res);

    doc.fontSize(24).fillColor('#4F46E5').text("VigoZen CRM Report", { align: "center" });
    doc.fontSize(10).fillColor('#64748B').text(`Generated on: ${new Date().toLocaleString()}`, { align: "center" });
    doc.moveDown(2);

    doc.fontSize(16).fillColor('#1E293B').text("Executive Summary");
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#334155').text(`Total Leads: ${leadsRes.rows[0].total || 0}`);
    doc.fontSize(12).fillColor('#334155').text(`Total Deals: ${dealsRes.rows[0].total || 0}`);
    doc.fontSize(12).fillColor('#334155').text(`Total Won Revenue: ₹${parseFloat(dealsRes.rows[0].revenue || 0).toLocaleString('en-IN')}`);

    doc.end();
  } catch (error) {
    console.error("PDF Export Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── Get Subscription Status ──
app.get("/subscription/status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const userRes = await pool.query(`
      SELECT 
        trial_start, trial_end, subscription_status, 
        plan_type, payment_status, created_at
      FROM users WHERE id = $1
    `, [userId]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userRes.rows[0];
    const now = new Date();
    const trialEnd = user.trial_end ? new Date(user.trial_end) : null;
    const trialStart = user.trial_start ? new Date(user.trial_start) : null;

    const daysRemaining = trialEnd ? Math.max(0, Math.floor((trialEnd - now) / (1000 * 60 * 60 * 24))) : 0;
    const isTrialActive = (user.subscription_status === 'trialing' || user.subscription_status === 'trial') && trialEnd && now < trialEnd;
    const isSubActive = user.subscription_status === 'active' || user.subscription_status === 'paid';

    res.json({
      trial_start: trialStart ? trialStart.toISOString() : null,
      trial_end: trialEnd ? trialEnd.toISOString() : null,
      days_remaining: daysRemaining,
      subscription_status: user.subscription_status || 'expired',
      payment_status: user.payment_status || 'unpaid',
      plan_type: user.plan_type || 'trial',
      is_trial_active: isTrialActive,
      is_subscription_active: isSubActive
    });
  } catch (err) {
    console.error("Subscription status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Get Plans ──
app.get("/api/plans", authenticateToken, async (req, res) => {
  try {
    // In production, fetch from database
    const plans = [
      {
        id: "starter",
        name: "Starter",
        price: 600,
        description: "For growing teams and small businesses.",
        users: "1–50 Users",
        features: ["Per Users", "15,000 contacts", "AI sales forecasting", "Workflow automation", "All integrations", "Custom dashboards", "Priority support", "SSO & RBAC"],
        popular: false
      },
      {
        id: "custom",
        name: "Custom",
        price: null,
        description: "Contact Sales for custom pricing based on your business requirements.",
        users: "50+ Users",
        features: ["Unlimited users", "Unlimited contacts", "Dedicated infrastructure", "Custom AI models", "On-premise option", "SLA guarantee", "Dedicated CSM", "Custom integrations"],
        popular: false
      }
    ];
    res.json(plans);
  } catch (err) {
    console.error("Plans error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ai/insight", authenticateToken, async (req, res) => {
  try {
    const { reportType, dateFilter, data } = req.body;

    // Default insights
    const fallbackInsights = {
      employee: {
        daily: "🔥 Sneha Gupta leads today with 3 new qualifications. Arjun Sharma's follow-up rate is 94% — highest in the team. AI recommends assigning incoming Facebook leads to Priya Patel who has capacity.",
        weekly: "📊 Sneha Gupta and Arjun Sharma together account for 45% of all won deals this week. Rahul Verma's conversion rate dropped 8% — suggest targeted coaching. Overall team is 12% above last week's performance.",
        custom: "📈 Over the selected period, the team achieved 127% of target. Top performer: Sneha Gupta (₹4.6L revenue). AI recommends territory rebalancing — Karan Mehta is underutilized at current lead volume.",
      },
      status: {
        daily: "⚡ New leads spike detected today (+23% vs average). 8 leads moved to Qualified stage. 2 deals at Negotiation stage are at risk (>7 days without activity). AI suggests immediate follow-up.",
        weekly: "📉 Qualification rate improved to 44% (up from 38%). However, Proposal-to-Negotiation conversion dropped to 56%. AI identifies pricing objections as primary drop-off reason. Recommend sharing ROI calculator.",
        custom: "🎯 Pipeline health: Strong at New and Qualified stages. Bottleneck detected at Proposal stage — 28% of proposals stall for 5+ days. AI recommends automated nudge emails after 3 days of no response.",
      },
      sales: {
        daily: "💰 Today's closed revenue: ₹1.2L (above daily target of ₹95K). Win rate: 67% (excellent). Average deal size trending up +15% MoM. FinServe type enterprise deals showing highest ROI.",
        weekly: "🚀 Week W4 was the best week this month — ₹1.15L achieved vs ₹1L target. 9 deals closed. AI forecasts W5 at ₹98K based on current pipeline velocity. Recommend accelerating 3 high-probability deals.",
        custom: "📊 Total revenue in period: ₹4.65L vs target ₹4.5L (+3.3% above target). AI identifies Q2 as high-growth opportunity — 34 qualified leads in pipeline with ₹8.5L combined value. Success probability: 62%.",
      },
    };

    let insight = "";
    if (fallbackInsights[reportType] && fallbackInsights[reportType][dateFilter]) {
      insight = fallbackInsights[reportType][dateFilter];
    } else {
      insight = `AI analysis completed for report type "${reportType || 'general'}" and period "${dateFilter || 'custom'}".`;
    }

    // Add dynamic details if data is present
    if (data && Object.keys(data).length > 0) {
      if (reportType === "sales" && Array.isArray(data)) {
        const total = data.reduce((acc, curr) => acc + (curr.achieved || 0), 0);
        if (total > 0) {
          insight += ` Total registered revenue is ₹${total.toLocaleString('en-IN')}.`;
        }
      } else if (reportType === "employee" && Array.isArray(data)) {
        const activeEmps = data.filter(e => e.won > 0);
        if (activeEmps.length > 0) {
          insight += ` Active performers: ${activeEmps.map(e => e.name).join(", ")}.`;
        }
      }
    }

    res.json({ insight });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Subscription Endpoints ──
// 1. Create Subscription
app.post("/subscription/create", authenticateToken, async (req, res) => {
  try {
    const { plan_type, payment_method } = req.body;
    const userId = req.user.id;

    let subscription = null;
    try {
      const result = await pool.query(
        `INSERT INTO subscriptions (user_id, plan_type, payment_method, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', NOW(), NOW())
         RETURNING *`,
        [userId, plan_type, payment_method]
      );
      subscription = result.rows[0];
    } catch (e) {
      console.warn("subscriptions table might not exist, skipping insert:", e.message);
    }

    await pool.query(
      `UPDATE users SET plan_type = $1, subscription_status = 'active' WHERE id = $2`,
      [plan_type, userId]
    );

    res.json({ success: true, subscription });
  } catch (error) {
    console.error("Subscription creation failed:", error);
    res.status(500).json({ error: "Failed to create subscription" });
  }
});

// 2. Start Trial
app.post("/subscription/trial/start", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 3);

    await pool.query(
      `UPDATE users 
       SET trial_start = $1, trial_end = $2, subscription_status = 'trialing' 
       WHERE id = $3`,
      [trialStart, trialEnd, userId]
    );

    res.json({
      success: true,
      trial_start: trialStart,
      trial_end: trialEnd,
      message: "3-day trial started"
    });
  } catch (error) {
    console.error("Trial start failed:", error);
    res.status(500).json({ error: "Failed to start trial" });
  }
});

// 3. Cancel Subscription
app.post("/subscription/cancel", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    await pool.query(
      `UPDATE users SET subscription_status = 'cancelled', plan_type = NULL WHERE id = $1`,
      [userId]
    );

    res.json({ success: true, message: "Subscription cancelled" });
  } catch (error) {
    console.error("Subscription cancellation failed:", error);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

// 4. Payment Success
app.post("/subscription/payment-success", authenticateToken, async (req, res) => {
  try {
    const { plan_type } = req.body;
    const userId = req.user.id;

    await pool.query(
      `UPDATE users 
       SET subscription_status = 'active', payment_status = 'paid', plan_type = $1 
       WHERE id = $2`,
      [plan_type, userId]
    );

    try {
      await pool.query(
        `INSERT INTO payment_logs (user_id, status, plan_type, created_at)
         VALUES ($1, 'success', $2, NOW())`,
        [userId, plan_type]
      );
    } catch (e) {
      console.warn("payment_logs table might not exist, skipping log insert:", e.message);
    }

    res.json({ success: true, message: "Payment successful, subscription activated" });
  } catch (error) {
    console.error("Payment success update failed:", error);
    res.status(500).json({ error: "Failed to update payment status" });
  }
});

// 5. Check Trial Status
app.get("/subscription/trial/check", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT trial_start, trial_end, subscription_status, plan_type 
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];
    const now = new Date();

    let trialEnd;
    if (user.trial_end) {
      trialEnd = new Date(user.trial_end);
    } else if (user.trial_start) {
      trialEnd = new Date(user.trial_start);
      trialEnd.setDate(trialEnd.getDate() + 3);
    } else {
      trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 3);
    }

    const daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const isExpired = daysRemaining === 0 && now > trialEnd;

    res.json({
      is_trialing: user.subscription_status === 'trialing',
      days_remaining: daysRemaining,
      is_expired: isExpired,
      subscription_status: user.subscription_status,
      plan_type: user.plan_type
    });
  } catch (error) {
    console.error("Trial check failed:", error);
    res.status(500).json({ error: "Failed to check trial" });
  }
});
app.get("/ai-insights", authenticateToken, async (req, res) => {
  try {
    const priorityLeads = await getPriorityLeads(5);
    const cacheResult = await pool.query(
      `SELECT insight_text, generated_at FROM ai_insights_cache ORDER BY generated_at DESC LIMIT 1`
    );
    res.json({
      insight_text: cacheResult.rows[0]?.insight_text ?? null,
      priority_leads: priorityLeads,
    });
  } catch (err) {
    console.error("AI insights error:", err);
    res.status(500).json({ error: "Failed to fetch AI insights" });
  }
});
app.post("/ai-insights/generate", authenticateToken, async (req, res) => {
  try {
    const stats = await getTeamStats();
    const insightText = await generateInsight(stats);

    await pool.query(
      `INSERT INTO ai_insights_cache (company_id, insight_text, priority_leads)
       VALUES ($1, $2, $3)`,
      [req.user.company_id || null, insightText, JSON.stringify(stats.top_employees)]
    );

    res.json({ insight_text: insightText, stats });
  } catch (err) {
    console.error("Generate insight error:", err);
    res.status(500).json({ error: "Failed to generate insight" });
  }
});

// ── COMPANY SUBSCRIPTION MANAGEMENT ──

let globalPricingConfig = {
  starter_price_per_user: 600,
  gst_rate: 18,
  monthly_discount: 0,
  quarterly_discount: 5,
  half_yearly_discount: 10,
  yearly_discount: 15
};

// Initialize pricing config from DB
(async () => {
  try {
    const res = await pool.query('SELECT * FROM pricing_config LIMIT 1');
    if (res.rows.length > 0) {
      globalPricingConfig = res.rows[0];
    }
  } catch (err) {
    console.error('Failed to load pricing config from DB:', err);
  }
})();

// Pricing calculation helper
function calculatePricing({ planType, billingPeriod, activeUsers, pricePerUser }) {
  const basePricePerUser = planType === 'starter'
    ? (globalPricingConfig.starter_price_per_user || 600)
    : (pricePerUser || 600);

  const periodMonths = {
    'monthly': 1,
    'quarterly': 3,
    'half_yearly': 6,
    'yearly': 12
  };
  const months = periodMonths[billingPeriod] || 1;

  const discounts = {
    'monthly': globalPricingConfig.monthly_discount !== undefined ? globalPricingConfig.monthly_discount : 0,
    'quarterly': globalPricingConfig.quarterly_discount !== undefined ? globalPricingConfig.quarterly_discount : 5,
    'half_yearly': globalPricingConfig.half_yearly_discount !== undefined ? globalPricingConfig.half_yearly_discount : 10,
    'yearly': globalPricingConfig.yearly_discount !== undefined ? globalPricingConfig.yearly_discount : 15
  };
  const discountPercent = discounts[billingPeriod] || 0;

  const basePrice = activeUsers * basePricePerUser * months;
  const discountAmount = basePrice * (discountPercent / 100);
  const subtotal = basePrice - discountAmount;
  const gst = subtotal * ((globalPricingConfig.gst_rate || 18) / 100);
  const total = subtotal + gst;

  return {
    activeUsers,
    pricePerUser: basePricePerUser,
    months,
    basePrice: Math.round(basePrice * 100) / 100,
    discountPercent,
    discountAmount: Math.round(discountAmount * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    gst: Math.round(gst * 100) / 100,
    total: Math.round(total * 100) / 100,
    billingCycle: billingPeriod,
    planType,
    currency: 'INR'
  };
}

// GET company subscription details
app.get("/api/company/subscription", authenticateToken, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'super_admin';
    const isOrgAdmin = req.user.role === 'Org Admin' || req.user.role === 'org_admin' || req.user.role === 'admin';

    // Any authenticated company member can view their own company's subscription.
    // Only admins can modify it (PUT endpoint is still admin-gated).
    let companyId = req.user.company_id;
    if (!companyId) {
      return res.status(400).json({ error: "No company associated with this account" });
    }

    if (isSuperAdmin) {
      companyId = req.query.company_id || req.user.company_id;
      if (!companyId) {
        return res.status(400).json({ error: "Super Admin must specify company_id" });
      }
    } else {
      if (req.query.company_id && req.query.company_id !== req.user.company_id) {
        return res.status(403).json({ error: "Cannot access other companies" });
      }
    }

    // Get company details
    const companyRes = await pool.query(
      "SELECT id, name, plan_type, billing_period, subscription_status, subscription_start, subscription_end, auto_renew, price_per_user, active_users_count, last_billing_calculation, purchased_users, allowed_users, trial_start, trial_end FROM companies WHERE id = $1",
      [companyId]
    );

    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    const company = companyRes.rows[0];

    // Compute dynamic trial active states
    const now = new Date();
    const trialEnd = company.trial_end ? new Date(company.trial_end) : null;
    const trialStart = company.trial_start ? new Date(company.trial_start) : null;
    const daysRemaining = trialEnd ? Math.max(0, Math.floor((trialEnd - now) / (1000 * 60 * 60 * 24))) : 0;
    const isTrialActive = (company.subscription_status === 'trial' || company.subscription_status === 'trialing') && trialEnd && now < trialEnd;
    const isSubActive = company.subscription_status === 'active' || company.subscription_status === 'paid';

    // Count active users (both is_active = true and status = 'Active')
    const activeUsersResult = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE company_id = $1 AND is_active = true AND status = 'Active'",
      [companyId]
    );
    const activeUsers = parseInt(activeUsersResult.rows[0].count);

    // Count total and inactive users
    const totalUsersResult = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE company_id = $1",
      [companyId]
    );
    const totalUsers = parseInt(totalUsersResult.rows[0].count);
    const inactiveUsers = totalUsers - activeUsers;

    // Calculate pricing based on plan and billing period (using allowed_users/purchased_users if present)
    const pricing = calculatePricing({
      planType: company.plan_type,
      billingPeriod: company.billing_period,
      activeUsers: company.allowed_users || company.purchased_users || activeUsers || 10,
      pricePerUser: company.price_per_user || 600
    });

    // Update active users count in companies table
    await pool.query(
      "UPDATE companies SET active_users_count = $1, last_billing_calculation = NOW() WHERE id = $2",
      [activeUsers, companyId]
    );

    res.json({
      success: true,
      company: {
        plan_type: company.plan_type,
        billing_period: company.billing_period,
        subscription_status: company.subscription_status,
        subscription_start: company.subscription_start,
        subscription_end: company.subscription_end,
        auto_renew: company.auto_renew,
        price_per_user: company.price_per_user || 600,
        active_users_count: activeUsers,
        purchased_users: company.purchased_users || 10,
        allowed_users: company.allowed_users || company.purchased_users || 10,
        trial_start: company.trial_start,
        trial_end: company.trial_end,
        last_billing_calculation: company.last_billing_calculation
      },
      is_trial_active: isTrialActive,
      is_subscription_active: isSubActive,
      days_remaining: daysRemaining,
      trial_start: trialStart ? trialStart.toISOString() : null,
      trial_end: trialEnd ? trialEnd.toISOString() : null,
      allowed_users: company.allowed_users || company.purchased_users || 10,
      active_users: activeUsers,
      pricing: pricing,
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers
      }
    });
  } catch (error) {
    console.error("Company subscription error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET pricing calculation directly
app.get("/api/company/subscription/pricing", authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const companyRes = await pool.query(
      "SELECT plan_type, billing_period, price_per_user, purchased_users, allowed_users FROM companies WHERE id = $1",
      [companyId]
    );

    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    const company = companyRes.rows[0];

    const usersRes = await pool.query(
      "SELECT COUNT(*) as active_count FROM users WHERE company_id = $1 AND is_active = true AND status = 'Active'",
      [companyId]
    );
    const activeUsers = parseInt(usersRes.rows[0].active_count);

    const pricing = calculatePricing({
      planType: company.plan_type,
      billingPeriod: company.billing_period,
      activeUsers: company.allowed_users || company.purchased_users || activeUsers || 10,
      pricePerUser: company.price_per_user || 600
    });

    res.json({
      success: true,
      pricing
    });
  } catch (error) {
    console.error("Get pricing error:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update company subscription
app.put("/api/company/subscription", authenticateToken, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'super_admin';
    const isOrgAdmin = req.user.role === 'Org Admin' || req.user.role === 'org_admin' || req.user.role === 'admin';

    if (!isSuperAdmin && !isOrgAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    let companyId = req.user.company_id;
    if (isSuperAdmin) {
      companyId = req.body.company_id || req.query.company_id || req.user.company_id;
      if (!companyId) {
        return res.status(400).json({ error: "Super Admin must specify company_id" });
      }
    } else {
      if ((req.body.company_id && req.body.company_id !== req.user.company_id) || (req.query.company_id && req.query.company_id !== req.user.company_id)) {
        return res.status(403).json({ error: "Cannot access other companies" });
      }
    }

    const { plan_type, billing_period, auto_renew, purchased_users, allowed_users } = req.body;

    // Validate
    if (plan_type && !['starter', 'custom'].includes(plan_type)) {
      return res.status(400).json({ error: 'Invalid plan type' });
    }

    if (billing_period && !['monthly', 'quarterly', 'half_yearly', 'yearly'].includes(billing_period)) {
      return res.status(400).json({ error: 'Invalid billing period' });
    }

    // Count active users
    const usersRes = await pool.query(
      "SELECT COUNT(*) as active_count FROM users WHERE company_id = $1 AND is_active = true AND status = 'Active'",
      [companyId]
    );
    const activeUsers = parseInt(usersRes.rows[0].active_count);

    const result = await pool.query(
      `UPDATE companies 
       SET plan_type = COALESCE($1, plan_type),
           billing_period = COALESCE($2, billing_period),
           auto_renew = COALESCE($3, auto_renew),
           active_users_count = $5,
           purchased_users = COALESCE($6, purchased_users),
           allowed_users = COALESCE($7, allowed_users, $6, allowed_users),
           last_billing_calculation = NOW(),
           subscription_start = CASE WHEN $1 IS NOT NULL OR $2 IS NOT NULL THEN NOW() ELSE subscription_start END,
           subscription_end = CASE 
             WHEN $2 = 'monthly' THEN NOW() + INTERVAL '1 month'
             WHEN $2 = 'quarterly' THEN NOW() + INTERVAL '3 months'
             WHEN $2 = 'half_yearly' THEN NOW() + INTERVAL '6 months'
             WHEN $2 = 'yearly' THEN NOW() + INTERVAL '1 year'
             ELSE subscription_end
           END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [plan_type, billing_period, auto_renew, companyId, activeUsers, purchased_users, allowed_users]
    );

    const company = result.rows[0];

    // Calculate new pricing
    const pricing = calculatePricing({
      planType: company.plan_type,
      billingPeriod: company.billing_period,
      activeUsers: company.allowed_users || company.purchased_users || activeUsers || 10,
      pricePerUser: company.price_per_user || 600
    });

    res.json({
      success: true,
      message: "Subscription updated successfully",
      company,
      pricing,
      active_users: activeUsers
    });
  } catch (error) {
    console.error("Update subscription error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/subscription/activate-test-mode - Activate subscription in Dev Test Mode
app.post("/api/subscription/activate-test-mode", authenticateToken, async (req, res) => {
  try {
    const { invoice_id, plan, billing_cycle, allowed_users, status } = req.body;
    const companyId = req.user.company_id;

    // 1. Update the invoice to paid
    if (invoice_id) {
      await pool.query(
        "UPDATE invoices SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = $1 AND company_id = $2",
        [invoice_id, companyId]
      );
    }

    // 2. Determine end date duration
    let duration = '1 month';
    if (billing_cycle === 'quarterly') duration = '3 months';
    else if (billing_cycle === 'half_yearly') duration = '6 months';
    else if (billing_cycle === 'yearly') duration = '12 months';

    // 3. Update company plan, allowed users, status
    const result = await pool.query(
      `UPDATE companies 
       SET plan_type = $1, 
           billing_period = $2, 
           allowed_users = $3, 
           purchased_users = $3,
           subscription_status = $4, 
           subscription_start = NOW(), 
           subscription_end = NOW() + CAST($5 AS INTERVAL),
           is_trial_active = false,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [plan || 'starter', billing_cycle || 'monthly', allowed_users || 10, status || 'active', duration, companyId]
    );

    res.json({
      success: true,
      message: "Subscription activated successfully (Test Mode)",
      company: result.rows[0]
    });
  } catch (error) {
    console.error("Activate test mode subscription error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/pricing-config
app.get('/api/pricing-config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pricing_config LIMIT 1');
    res.json(result.rows[0] || {});
  } catch (error) {
    console.error("Get pricing config error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/pricing-config', authenticateToken, requireRole(['admin', 'super_admin', 'org_admin', 'Super Admin', 'Org Admin']), async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'super_admin';
    const isOrgAdmin = req.user.role === 'Org Admin' || req.user.role === 'org_admin' || req.user.role === 'admin';

    if (!isSuperAdmin && !isOrgAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Only Super Admin can modify pricing configuration' });
    }
    const { starter_price_per_user, gst_rate, monthly_discount, quarterly_discount, half_yearly_discount, yearly_discount } = req.body;
    const result = await pool.query(
      `UPDATE pricing_config 
       SET starter_price_per_user = COALESCE($1, starter_price_per_user),
           gst_rate = COALESCE($2, gst_rate),
           monthly_discount = COALESCE($3, monthly_discount),
           quarterly_discount = COALESCE($4, quarterly_discount),
           half_yearly_discount = COALESCE($5, half_yearly_discount),
           yearly_discount = COALESCE($6, yearly_discount),
           updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [starter_price_per_user, gst_rate, monthly_discount, quarterly_discount, half_yearly_discount, yearly_discount]
    );

    if (result.rows.length > 0) {
      globalPricingConfig = result.rows[0];
    }

    res.json({ success: true, config: globalPricingConfig });
  } catch (error) {
    console.error("Update pricing config error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET ALL ROLE PERMISSIONS ──
app.get("/api/role-permissions", authenticateToken, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'super_admin';
    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Super Admin access required" });
    }

    const result = await pool.query(
      `SELECT id, role, module, permission, company_id 
       FROM role_permissions 
       ORDER BY role, module`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get role permissions error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── UPDATE ROLE PERMISSION ──
app.put("/api/role-permissions/:id", authenticateToken, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'super_admin';
    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Super Admin access required" });
    }

    const { id } = req.params;
    const { permission } = req.body;

    if (!permission || !['none', 'view', 'own', 'team', 'dept', 'full'].includes(permission)) {
      return res.status(400).json({ error: "Invalid permission value" });
    }

    const result = await pool.query(
      `UPDATE role_permissions 
       SET permission = $1
       WHERE id = $2 
       RETURNING *`,
      [permission, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Permission entry not found" });
    }

    res.json({ success: true, updated: result.rows[0] });
  } catch (error) {
    console.error("Update role permission error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── CREATE ROLE PERMISSION ──
app.post("/api/role-permissions", authenticateToken, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'super_admin';
    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Super Admin access required" });
    }

    const { role, module, permission, company_id } = req.body;

    if (!role || !module || !permission) {
      return res.status(400).json({ error: "role, module, and permission are required" });
    }

    if (!['none', 'view', 'own', 'team', 'dept', 'full'].includes(permission)) {
      return res.status(400).json({ error: "Invalid permission value" });
    }

    // Check if entry exists
    const existing = await pool.query(
      `SELECT id FROM role_permissions 
       WHERE role = $1 AND module = $2 AND (company_id = $3 OR (company_id IS NULL AND $3 IS NULL))`,
      [role, module, company_id || null]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Permission entry already exists" });
    }

    const result = await pool.query(
      `INSERT INTO role_permissions (id, role, module, permission, company_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING *`,
      [role, module, permission, company_id || null]
    );

    res.status(201).json({ success: true, created: result.rows[0] });
  } catch (error) {
    console.error("Create role permission error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE ROLE PERMISSION ──
app.delete("/api/role-permissions/:id", authenticateToken, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'super_admin';
    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Super Admin access required" });
    }

    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM role_permissions WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Permission entry not found" });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error("Delete role permission error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/company/subscription/quote - Request custom quote
app.post("/api/company/subscription/quote", authenticateToken, requireRole(['admin', 'super_admin', 'org_admin']), async (req, res) => {
  try {
    const companyId = req.user.company_id;

    await pool.query(
      "INSERT INTO subscription_quotes (company_id, status, requested_at) VALUES ($1, 'pending', NOW())",
      [companyId]
    );

    res.json({
      success: true,
      message: "Quote requested successfully. Our sales team will contact you shortly."
    });
  } catch (error) {
    console.error("Request quote error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/company/subscription/quote-status - Check quote status
app.get("/api/company/subscription/quote-status", authenticateToken, requireRole(['admin', 'super_admin', 'org_admin']), async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const result = await pool.query(
      "SELECT status, requested_at FROM subscription_quotes WHERE company_id = $1 ORDER BY requested_at DESC LIMIT 1",
      [companyId]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, has_quote: false });
    }

    res.json({
      success: true,
      has_quote: true,
      status: result.rows[0].status,
      requested_at: result.rows[0].requested_at
    });
  } catch (error) {
    console.error("Get quote status error:", error);
    res.status(500).json({ error: error.message });
  }
});


// ── PAYMENT METHODS API ──

// GET /api/payment-methods - Get all payment methods for company
app.get("/api/payment-methods", authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const result = await pool.query(
      "SELECT * FROM payment_methods WHERE company_id = $1 ORDER BY is_default DESC, created_at DESC",
      [companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get payment methods error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payment-methods - Add a new payment method
app.post("/api/payment-methods", authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { last4, brand, expiry, is_default, payment_gateway_id } = req.body;

    if (!last4 || !brand || !expiry) {
      return res.status(400).json({ error: "last4, brand, and expiry are required" });
    }

    // If this is default, unset other defaults
    if (is_default) {
      await pool.query(
        "UPDATE payment_methods SET is_default = false WHERE company_id = $1",
        [companyId]
      );
    }

    const result = await pool.query(
      `INSERT INTO payment_methods (company_id, last4, brand, expiry, is_default, payment_gateway_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [companyId, last4, brand, expiry, is_default || false, payment_gateway_id || null]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Add payment method error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/payment-methods/:id - Delete a payment method
app.delete("/api/payment-methods/:id", authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const result = await pool.query(
      "DELETE FROM payment_methods WHERE id = $1 AND company_id = $2 RETURNING *",
      [req.params.id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Payment method not found" });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error("Delete payment method error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/payment-methods/:id/default - Set default payment method
app.put("/api/payment-methods/:id/default", authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.company_id;

    // Unset all other defaults
    await pool.query(
      "UPDATE payment_methods SET is_default = false WHERE company_id = $1",
      [companyId]
    );

    // Set the selected one as default
    const result = await pool.query(
      `UPDATE payment_methods 
       SET is_default = true, updated_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [req.params.id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Payment method not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Set default payment method error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── INVOICES API ──

// GET /api/invoices - Get all invoices for company
app.get("/api/invoices", authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const result = await pool.query(
      "SELECT * FROM invoices WHERE company_id = $1 ORDER BY created_at DESC",
      [companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get invoices error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Generate invoice
app.post("/api/invoices/generate", authenticateToken, async (req, res) => {
  try {
    const { subscription_id, billing_period_start, billing_period_end, amount: bodyAmount, active_users: bodyUsers, plan: bodyPlan } = req.body;
    const companyId = req.user.company_id;

    let amount = bodyAmount || 0;
    let purchasedUsers = bodyUsers || 10;
    let plan = bodyPlan || 'starter';

    if (subscription_id && subscription_id !== 'temp') {
      const subRes = await pool.query(
        "SELECT * FROM subscriptions WHERE id = $1 AND company_id = $2",
        [subscription_id, companyId]
      );
      if (subRes.rows.length > 0) {
        const subscription = subRes.rows[0];
        amount = subscription.amount || amount;
      }
    }

    const gst = amount * 0.18;
    const cgst = amount * 0.09;
    const sgst = amount * 0.09;
    const total = amount + gst;

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const result = await pool.query(`
      INSERT INTO invoices 
        (subscription_id, company_id, invoice_number, amount, gst_amount, cgst, sgst, total_amount, status, due_date, billing_period_start, billing_period_end, purchased_users, plan)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW() + INTERVAL '15 days', $9, $10, $11, $12)
      RETURNING *
    `, [
      subscription_id && subscription_id !== 'temp' ? subscription_id : null,
      companyId,
      invoiceNumber,
      amount,
      gst,
      cgst,
      sgst,
      total,
      billing_period_start || new Date().toISOString(),
      billing_period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      purchasedUsers,
      plan
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Generate invoice error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Download invoice PDF
app.get("/api/invoices/download/:id", authenticateToken, async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const companyId = req.user.company_id;

    const result = await pool.query(`
      SELECT i.*, c.name as company_name, c.plan_type 
      FROM invoices i
      JOIN companies c ON i.company_id = c.id
      WHERE i.id = $1 AND i.company_id = $2
    `, [invoiceId, companyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const invoice = result.rows[0];

    // Generate PDF using PDFDocument
    const doc = new PDFDocument({ margin: 50 });
    const filename = `invoice-${invoice.invoice_number}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    doc.pipe(res);

    // ── Invoice PDF Content ──
    doc.fontSize(24).fillColor('#4F46E5').text("VIGOZEN CRM", { align: "center" });
    doc.fontSize(10).fillColor('#64748B').text("Invoice", { align: "center" });
    doc.moveDown(2);

    doc.fontSize(12).fillColor('#1E293B').text(`Invoice #: ${invoice.invoice_number}`);
    doc.fontSize(10).fillColor('#64748B').text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`);
    doc.fontSize(10).fillColor('#64748B').text(`Due Date: ${new Date(invoice.due_date).toLocaleDateString()}`);
    doc.moveDown(2);

    doc.fontSize(12).fillColor('#1E293B').text("Company Details");
    doc.fontSize(10).fillColor('#64748B').text(`Name: ${invoice.company_name || 'Vigozen'}`);
    doc.text(`Plan: ${invoice.plan_type || 'Professional'}`);
    doc.moveDown(2);

    doc.fontSize(12).fillColor('#1E293B').text("Invoice Details");
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#475569');
    doc.text("Description", 50, tableTop);
    doc.text("Amount", 400, tableTop);
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(10).fillColor('#334155');
    doc.text(`Subscription (${invoice.plan_type || 'CRM'})`, 50, doc.y);
    doc.text(`₹${invoice.amount.toLocaleString()}`, 400, doc.y);
    doc.moveDown();

    doc.fontSize(10).fillColor('#64748B');
    doc.text(`GST (18%)`, 50, doc.y);
    doc.text(`₹${invoice.gst_amount.toLocaleString()}`, 400, doc.y);
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(12).fillColor('#1E293B').text("Total", 50, doc.y);
    doc.fontSize(14).fillColor('#4F46E5').text(`₹${invoice.total_amount.toLocaleString()}`, 400, doc.y);
    doc.moveDown(2);

    doc.fontSize(10).fillColor('#64748B').text("Status", 50, doc.y);
    const statusColor = invoice.status === 'paid' ? '#10B981' : '#F59E0B';
    doc.fillColor(statusColor).text(invoice.status.toUpperCase(), 400, doc.y);

    doc.end();
  } catch (error) {
    console.error("Invoice download error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mark invoice as paid
app.post("/api/invoices/:id/mark-paid", authenticateToken, async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const companyId = req.user.company_id;

    const result = await pool.query(`
      UPDATE invoices 
      SET status = 'paid', paid_at = NOW()
      WHERE id = $1 AND company_id = $2
      RETURNING *
    `, [invoiceId, companyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json({ success: true, invoice: result.rows[0] });
  } catch (error) {
    console.error("Mark paid error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── EMPLOYEE DATA TRANSFER ──
// Transfer only active leads and open deals. History stays with original employee.
app.post("/admin/users/:userId/transfer-data", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { transfer_to } = req.body;
    const currentUser = req.user;

    if (!transfer_to) {
      return res.status(400).json({ error: "transfer_to is required" });
    }

    // 1. Authorization – only Super Admin and Org Admin / admin
    const isSuperAdmin = currentUser.role === 'Super Admin' || currentUser.role === 'super_admin';
    const isOrgAdmin   = currentUser.role === 'Org Admin'   || currentUser.role === 'org_admin' || currentUser.role === 'admin';
    if (!isSuperAdmin && !isOrgAdmin) {
      return res.status(403).json({ error: "Only Super Admin or Org Admin can transfer employee data" });
    }

    // 2. Prevent self-transfer
    if (userId === currentUser.id) {
      return res.status(400).json({ error: "Cannot transfer data to yourself" });
    }

    // 3. Find the leaving employee
    const leavingRes = await pool.query(
      "SELECT id, name, email, role, company_id FROM users WHERE id = $1",
      [userId]
    );
    if (leavingRes.rows.length === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }
    const leaving = leavingRes.rows[0];

    // 4. Org Admin scope check
    if (isOrgAdmin && !isSuperAdmin && leaving.company_id !== currentUser.company_id) {
      return res.status(403).json({ error: "Cannot transfer data from another company" });
    }

    // 5. Find the receiving employee
    const receivingRes = await pool.query(
      "SELECT id, name, email, role, company_id FROM users WHERE id = $1",
      [transfer_to]
    );
    if (receivingRes.rows.length === 0) {
      return res.status(404).json({ error: "Receiving employee not found" });
    }
    const receiving = receivingRes.rows[0];

    // 6. Both must be in the same company
    if (leaving.company_id !== receiving.company_id) {
      return res.status(400).json({ error: "Both employees must be in the same company" });
    }

    // 7. Count & transfer active leads (change only owner_id, nothing else)
    const leadsRes = await pool.query(
      `UPDATE leads
         SET owner_id  = $1,
             updated_at = NOW()
       WHERE owner_id = $2
         AND LOWER(status) NOT IN ('won', 'lost')
       RETURNING id`,
      [transfer_to, userId]
    );
    const leadsCount = leadsRes.rowCount ?? 0;

    // 8. Count & transfer open deals (change only owner_id, nothing else)
    const dealsRes = await pool.query(
      `UPDATE deals
         SET owner_id  = $1,
             updated_at = NOW()
       WHERE owner_id = $2
         AND stage NOT IN ('Won', 'Lost')
       RETURNING id`,
      [transfer_to, userId]
    );
    const dealsCount = dealsRes.rowCount ?? 0;

    // 9. Create transfer log
    await pool.query(
      `INSERT INTO employee_transfer_logs
         (from_user_id, to_user_id, transferred_by, leads_transferred, deals_transferred, transferred_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, transfer_to, currentUser.id, leadsCount, dealsCount]
    );

    // 10. Deactivate the leaving employee
    await pool.query(
      `UPDATE users
         SET is_active      = false,
             status         = 'Inactive',
             deactivated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    // 11. Audit log
    await logAudit(
      currentUser.id,
      currentUser.name || 'System',
      'TRANSFER_EMPLOYEE_DATA',
      'user',
      userId,
      {
        from_user: leaving.name,
        to_user: receiving.name,
        leads_transferred: leadsCount,
        deals_transferred: dealsCount
      },
      req.ip
    );

    res.json({
      success: true,
      message: `Successfully transferred ${leadsCount} leads and ${dealsCount} deals from ${leaving.name} to ${receiving.name}`,
      transferred: {
        from: leaving.name,
        to: receiving.name,
        leads: leadsCount,
        deals: dealsCount
      }
    });

  } catch (error) {
    console.error("Employee data transfer error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(5000, "0.0.0.0", () => {

  console.log("Server running on port 5000");
  startNotificationWorker();
});

// Start cron job for background sync
require('./server/cronSync');
console.log('⏰ Cron sync job started');

// Nodemon trigger restart comment
