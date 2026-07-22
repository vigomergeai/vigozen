const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const notificationQueue = require("./server/notificationQueue");
const notificationService = require("./server/notificationService");
const { startNotificationWorker } = require("./server/notificationWorker");

require("dotenv").config();

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
    `);
    await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`).catch(() => {});
    await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`).catch(() => {});
    // Add missing columns to notifications table if they don't exist
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';`).catch(() => {});
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent';`).catch(() => {});
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS company_id UUID;`).catch(() => {});
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;`).catch(() => {});
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_to_deal BOOLEAN DEFAULT false;`).catch(() => {});
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_id UUID;`).catch(() => {});
    await pool.query(`UPDATE leads SET converted_to_deal = false WHERE converted_to_deal IS NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;`).catch(() => {});
    await pool.query(`ALTER TABLE lead_comments ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);`).catch(() => {});
    await pool.query(`ALTER TABLE lead_comments ADD COLUMN IF NOT EXISTS user_avatar VARCHAR(10);`).catch(() => {});
    await pool.query(`ALTER TABLE lead_comments ADD COLUMN IF NOT EXISTS parent_comment_id UUID;`).catch(() => {});
    
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
    `).catch(() => {});

    console.log("✅ Auto-migration: DB tables ready");
  } catch (err) {
    console.error("Auto-migration warning:", err.message);
  }
})();

// Global error handlers to prevent crash
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

// ── Helper: Create Notification (direct DB insert) ──


const app = express();
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: "Access token required"
    });
  }

 jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
  if (err) {
    console.log("JWT ERROR:", err);
    return res.status(403).json({
      error: "Invalid token"
    });
  }

  console.log("Decoded JWT:", user);

  req.user = user;

  next();
});
};
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowedStaticOrigins = [
      "https://crm.vigomerge.com",
      "https://admin.vigomerge.com",
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:5000",
      "http://127.0.0.1:5173"
    ];
    if (
      allowedStaticOrigins.includes(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin) ||
      origin.endsWith(".vigomerge.com")
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
}));


app.use(express.json());
const upload = multer({
  dest: "uploads/"
});
// Test route
app.get("/", (req, res) => {
  res.send("Vigozen API Running");
});

// Leads
app.get("/leads", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM leads ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete leads with UUID validation
app.delete("/leads", authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: "ids array required" });
    }

    // ✅ Validate UUIDs with regex
    const validIds = ids.filter(id =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    );

    if (validIds.length !== ids.length) {
      return res.status(400).json({ error: "One or more IDs are not valid UUIDs" });
    }

    await pool.query("DELETE FROM leads WHERE id = ANY($1)", [validIds]);

    res.json({ success: true, deleted: validIds.length });
  } catch (err) {
    console.error("Bulk delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Single delete lead
app.delete("/leads/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Validate single UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: "Invalid UUID format" });
    }

    await pool.query("DELETE FROM leads WHERE id = $1", [id]);
    res.json({ success: true, deleted: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// Deals
app.get("/deals", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM deals ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contacts
app.get("/contacts", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM contacts ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tickets
app.get("/tickets", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tickets ORDER BY created_at DESC");
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

    const result = await pool.query(
      `
      INSERT INTO tickets (
        id,
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
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        NOW(),
        NOW()
      )
      RETURNING *;
      `,
      [
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
    const companyId = req.user?.company_id || null;

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
app.get("/activities", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM activities ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users
app.get("/users", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE is_active = true;");
    res.json(result.rows);
  } catch (err) {
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

// Update user (settings save)
app.put("/users/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, company, department, timezone, language } = req.body;

    const result = await pool.query(
      `UPDATE users
       SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         phone = COALESCE($3, phone),
         company = COALESCE($4, company),
         department = COALESCE($5, department),
         timezone = COALESCE($6, timezone),
         language = COALESCE($7, language)
       WHERE id = $8
       RETURNING id, name, email, phone, company, department, timezone, language, role`,
      [name, email, phone, company, department, timezone, language, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
// Create new user (admin only)
app.post("/users", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { name, email, password, role, employeeId, department } = req.body;

    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, employee_id, department, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
       RETURNING id, name, email, role, employee_id AS "employeeId", department, is_active AS "isActive", created_at AS "createdAt"`,
      [name, email, hashedPassword, role || "user", employeeId || null, department || "sales"]
    );

    const newUser = result.rows[0];
    const companyId = req.user?.company_id;

    // Company-wide notification for new user
    if (companyId) {
      await notificationService.createCompanyNotification(
        companyId,
        'user_added',
        "👤 New Team Member",
        `${name} has joined the team as ${role || 'user'}`,
        `/users/${newUser.id}`,
        'medium',
        { user_role: role, user_email: email }
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("CREATE USER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete (deactivate) user
app.delete("/users/:id", authenticateToken, async (req, res) => {
  try {
    console.log("===== DELETE USER =====");
console.log("Role:", req.user.role);
console.log("User:", req.user);
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const result = await pool.query(
      "UPDATE users SET is_active = false WHERE id = $1 RETURNING id",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE USER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Toggle user active/inactive
app.put("/users/:id/toggle-access", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
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

// Reset user password (admin only)
app.put("/users/:id/password", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
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
// Settings
app.get("/settings/:userId", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM settings WHERE user_id = $1", [req.params.userId]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Leads POST
app.post("/leads", authenticateToken, async (req, res) => {
  try {
    const { name, email, phone, company, value, status, source, industry, notes } = req.body;
    
    // Get owner_id from request body or logged-in user
    const ownerId = req.body.owner_id || req.user?.id || null;
    
    // ✅ FIXED: Complete INSERT statement
    const result = await pool.query(
      `INSERT INTO leads (id, name, email, phone, company, value, status, source, industry, notes, owner_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [name, email, phone, company, value, status, source, industry, notes, ownerId]
    );

    // ── Notification Trigger ──
    try {
      const lead = result.rows[0];
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
    const { name, email, phone, company, value, status, source, industry, notes, converted_to_deal, deal_id } = req.body;
    
    // Fetch existing lead first to preserve missing fields
    const existingRes = await pool.query("SELECT * FROM leads WHERE id = $1", [req.params.id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }
    const existing = existingRes.rows[0];

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

    const result = await pool.query(
      `UPDATE leads 
       SET name=$1, email=$2, phone=$3, company=$4, value=$5, status=$6, source=$7, industry=$8, notes=$9, converted_to_deal=$10, deal_id=$11, updated_at=NOW() 
       WHERE id=$12 RETURNING *`,
      [finalName, finalEmail, finalPhone, finalCompany, finalValue, finalStatus, finalSource, finalIndustry, finalNotes, finalConverted, finalDealId, req.params.id]
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

app.post("/deals", authenticateToken, async (req, res) => {
  try {
    let { title, company, value, stage, owner, probability, expectedclose, daysinstage } = req.body;
    
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

    const result = await pool.query(
      "INSERT INTO deals (id, title, company, value, stage, owner, probability, expectedclose, daysinstage) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
      [title, company, value, dbStage, owner, probability, expectedclose, daysinstage]
    );
    
    const deal = result.rows[0];
    const companyId = req.user?.company_id || null;
    const isWon = String(deal.stage).toLowerCase() === 'won';
    
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
        const user_id = req.user.id;
        
        const checkResult = await pool.query(
            `SELECT user_id FROM lead_comments WHERE id = $1 AND lead_id = $2`,
            [commentId, id]
        );
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: "Comment not found" });
        }
        
        if (checkResult.rows[0].user_id && checkResult.rows[0].user_id !== user_id) {
            return res.status(403).json({ error: "You can only edit your own comments" });
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
        const user_id = req.user.id;
        
        const checkResult = await pool.query(
            `SELECT user_id FROM lead_comments WHERE id = $1 AND lead_id = $2`,
            [commentId, id]
        );
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: "Comment not found" });
        }
        
        if (checkResult.rows[0].user_id && checkResult.rows[0].user_id !== user_id) {
            return res.status(403).json({ error: "You can only delete your own comments" });
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
    console.log("Updating deal:", req.params.id);
    console.log("Body:", req.body);

    const existingRes = await pool.query("SELECT * FROM deals WHERE id = $1", [req.params.id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: "Deal not found" });
    }
    const existing = existingRes.rows[0];

    const title = req.body.title !== undefined ? req.body.title : existing.title;
    const company = req.body.company !== undefined ? req.body.company : existing.company;
    const value = req.body.value !== undefined ? req.body.value : existing.value;
    const stage = req.body.stage !== undefined ? String(req.body.stage) : existing.stage;
    const owner = req.body.owner !== undefined ? req.body.owner : existing.owner;
    const probability = req.body.probability !== undefined ? req.body.probability : existing.probability;
    const expectedclose = req.body.expectedclose !== undefined ? req.body.expectedclose : existing.expectedclose;
    const daysinstage = req.body.daysinstage !== undefined ? req.body.daysinstage : existing.daysinstage;

    const result = await pool.query(
      `UPDATE deals
       SET
         title = $1,
         company = $2,
         value = $3,
         stage = $4,
         owner = $5,
         probability = $6,
         expectedclose = $7,
         daysinstage = $8
       WHERE id = $9
       RETURNING *`,
      [
        title,
        company,
        value,
        stage,
        owner,
        probability,
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

    console.log("Updated:", deal);
    res.json(deal);
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/deals/:id", authenticateToken, async (req, res) => {
  try {
    console.log("Deleting deal:", req.params.id);
    const result = await pool.query(
      "DELETE FROM deals WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Deal not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error("DELETE DEAL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
app.delete("/admin/reset-database", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
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
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
      "SELECT created_at FROM profiles WHERE id = $1",
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ active: false, daysLeft: 0 });
    }

    const createdAt = new Date(result.rows[0].created_at);
    const now = new Date();

    const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    const active = diffDays <= 7;
    const daysLeft = Math.max(0, 7 - diffDays);

    res.json({
      active,
      daysLeft
    });

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

    // Check if admin signup
    const isAdmin = adminKey === process.env.ADMIN_KEY;
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

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        company_id: user.company_id,
        role: user.role
      },
      process.env.JWT_SECRET,
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
        role: user.role
      },
      process.env.JWT_SECRET,
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
    const { platform, platform_name, account_id, account_name } = req.body;
    if (!platform || !platform_name) {
      return res.status(400).json({ error: "Platform and platform name are required" });
    }

    const result = await pool.query(
      `INSERT INTO ad_connections
        (user_id, platform, platform_name, connected, account_id, account_name, leads_imported, cost_spent, created_at, updated_at)
       VALUES ($1, $2, $3, true, $4, $5, 0, 0, NOW(), NOW())
       ON CONFLICT (user_id, platform)
       DO UPDATE SET
         platform_name = EXCLUDED.platform_name,
         connected = true,
         account_id = EXCLUDED.account_id,
         account_name = EXCLUDED.account_name,
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, platform, platform_name, account_id, account_name]
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
    const mockNewLeads = Math.floor(Math.random() * 10) + 1;
    const mockNewCost = Math.floor(Math.random() * 500) + 50;

    const result = await pool.query(
      `UPDATE ad_connections
       SET leads_imported = leads_imported + $1,
           cost_spent = cost_spent + $2,
           last_sync = NOW(),
           updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [mockNewLeads, mockNewCost, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ad connection not found" });
    }
    res.json(result.rows[0]);
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

//const speakeasy = require("speakeasy");
const speakeasy = require("speakeasy");

// ── 2FA Setup ──────────────────────────────────────────────
app.post("/auth/2fa/setup", authenticateToken, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `VigozenCRM (${req.user.email})`,
      issuer: "VigozenCRM",
    });

    await pool.query(
      "UPDATE users SET two_fa_secret = $1 WHERE id = $2",
      [secret.base32, req.user.id]
    );

    res.json({ otpauth_url: secret.otpauth_url, secret: secret.base32 });
  } catch (err) {
    console.error("2FA SETUP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── 2FA Enable (verify code) ──────────────────────────────
app.post("/auth/2fa/verify", authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;

    const result = await pool.query(
      "SELECT two_fa_secret FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0 || !result.rows[0].two_fa_secret) {
      return res.status(400).json({ error: "2FA setup not started" });
    }

    const verified = speakeasy.totp.verify({
      secret: result.rows[0].two_fa_secret,
      encoding: "base32",
      token,
      window: 1,
    });

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
    const { avatar_url } = req.body; // null to delete, or a URL string

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
    const result = await pool.query(
      "UPDATE users SET subscription_status = $1 WHERE id = $2 RETURNING id, subscription_status",
      [subscription_status, req.params.id]
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
// ──────────────────────────────────────────────────────────────
// NOTIFICATION ROUTES
// ──────────────────────────────────────────────────────────────


app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000");
  startNotificationWorker();
});
