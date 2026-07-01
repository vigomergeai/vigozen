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
app.delete("/admin/reset-database", async (req, res) => {
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
        email: user.email
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
app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000");
});
