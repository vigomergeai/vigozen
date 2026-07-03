const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");
require("dotenv").config();
// Global error handlers to prevent crash
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});
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
      return res.status(403).json({
        error: "Invalid token"
      });
    }

    req.user = user;

    next();
  });
};
app.use(cors({
  origin: [
    "https://crm.vigomerge.com",
    "https://admin.vigomerge.com",
    "http://localhost:5173",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
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
app.get("/leads", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM leads ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete leads with UUID validation
app.delete("/leads", async (req, res) => {
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
app.delete("/leads/:id", async (req, res) => {
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
app.get("/deals", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM deals ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contacts
app.get("/contacts", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM contacts ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tickets
app.get("/tickets", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tickets ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/tickets", async (req, res) => {
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error("CREATE TICKET ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
// Activities
app.get("/activities", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM activities ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users
app.get("/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users");
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error("CREATE USER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete (deactivate) user
app.delete("/users/:id", authenticateToken, async (req, res) => {
  try {
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
app.post("/leads", async (req, res) => {
  try {
    const { name, email, phone, company, value, status, source, industry, notes } = req.body;
    const result = await pool.query(
      "INSERT INTO leads (id, name, email, phone, company, value, status, source, industry, notes, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *",
      [name, email, phone, company, value, status, source, industry, notes]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leads PUT
app.put("/leads/:id", async (req, res) => {
  try {
    const { name, email, phone, company, value, status, source, industry, notes } = req.body;
    const result = await pool.query(
      "UPDATE leads SET name=$1, email=$2, phone=$3, company=$4, value=$5, status=$6, source=$7, industry=$8, notes=$9, updated_at=NOW() WHERE id=$10 RETURNING *",
      [name, email, phone, company, value, status, source, industry, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/deals", async (req, res) => {
  try {
    const { title, company, value, stage, owner, probability, expectedclose, daysinstage } = req.body;
    const result = await pool.query(
      "INSERT INTO deals (id, title, company, value, stage, owner, probability, expectedclose, daysinstage) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
      [title, company, value, stage, owner, probability, expectedclose, daysinstage]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.put("/deals/:id", async (req, res) => {
  try {
    console.log("Updating deal:", req.params.id);
    console.log("Body:", req.body);

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
        req.body.title,
        req.body.company,
        req.body.value,
        req.body.stage,
        req.body.owner,
        req.body.probability,
        req.body.expectedclose,
        req.body.daysinstage,
        req.params.id
      ]
    );

    console.log("Updated:", result.rows[0]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/deals/:id", async (req, res) => {
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
app.post("/leads/bulk", async (req, res) => {
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
app.post("/leads/import-excel", upload.single("file"), async (req, res) => {
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
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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

    const companyResult = await pool.query("SELECT id FROM companies ORDER BY created_at ASC LIMIT 1");
    const companyId = companyResult.rows[0] ? companyResult.rows[0].id : null;
const result = await pool.query(
      `INSERT INTO users
      (name, email, password, role, company_id)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id,name,email,role,company_id,department`,
      [name, email, hashedPassword, role, companyId]
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
      user
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
        company_id: user.company_id,
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
app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000");
});
