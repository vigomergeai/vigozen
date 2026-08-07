/**
 * Script to create an Org Admin user directly in the database.
 * This bypasses the normal invitation flow and creates an active,
 * immediately-loginable Org Admin account.
 */
const pool = require("./db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

async function createOrgAdmin() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Get the first company (or create one if none exists)
        let companyRes = await client.query(
            "SELECT id FROM companies ORDER BY created_at ASC LIMIT 1"
        );

        let companyId;
        if (companyRes.rows.length === 0) {
            const companyResult = await client.query(
                `INSERT INTO companies (name, subscription_status, plan_type, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id`,
                ["Vigozen Platform", "active", "enterprise"]
            );
            companyId = companyResult.rows[0].id;
            console.log("✅ Created default company:", companyId);
        } else {
            companyId = companyRes.rows[0].id;
            console.log("✅ Using existing company:", companyId);
        }

        // 2. Check if Org Admin user already exists
        const existingUser = await client.query(
            "SELECT id FROM users WHERE email = $1",
            ["orgadmin@vigozen.com"]
        );

        if (existingUser.rows.length > 0) {
            console.log("⚠️  Org Admin user already exists with email orgadmin@vigozen.com");
            console.log("   User ID:", existingUser.rows[0].id);
            console.log("   Skipping creation.");
            await client.query("ROLLBACK");
            return;
        }

        // 3. Hash the password
        const password = "OrgAdmin@2024";
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. Generate invite token
        const inviteToken = crypto.randomBytes(32).toString("hex");

        // 5. Insert the Org Admin user
        const result = await client.query(
            `INSERT INTO users
       (name, email, password, role, company_id, manager_id, team_id,
        is_active, status, invite_token, employee_id, department, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       RETURNING id, name, email, role, company_id, is_active, status, created_at`,
            [
                "Org Admin",
                "orgadmin@vigozen.com",
                hashedPassword,
                "Org Admin",
                companyId,
                null,
                null,
                true,
                "active",
                inviteToken,
                "EMP001",
                "Administration",
            ]
        );

        const newUser = result.rows[0];
        console.log("✅ Org Admin user created successfully!");
        console.log("   User ID:", newUser.id);
        console.log("   Name:", newUser.name);
        console.log("   Email:", newUser.email);
        console.log("   Role:", newUser.role);
        console.log("   Company ID:", newUser.company_id);
        console.log("   Is Active:", newUser.is_active);
        console.log("   Status:", newUser.status);
        console.log("   Created At:", newUser.created_at);

        // 6. Seed role_permissions for Org Admin
        const permModules = [
            "leads", "deals", "users", "reports", "settings",
            "billing", "tickets", "activities"
        ];

        for (const module of permModules) {
            await client.query(
                `INSERT INTO role_permissions (id, role, module, permission, company_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
                ["Org Admin", module, "full", companyId]
            );
        }
        console.log("✅ Seeded role_permissions for Org Admin (8 modules, all 'full')");

        // 7. Set trial/subscription info
        await client.query(
            `UPDATE users SET
         trial_start = NOW(),
         trial_end = NOW() + INTERVAL '3 days',
         subscription_status = 'trialing',
         plan_type = 'trial',
         payment_status = 'unpaid'
       WHERE id = $1`,
            [newUser.id]
        );
        console.log("✅ Set trial subscription (3 days)");

        await client.query("COMMIT");

        console.log("\n========================================");
        console.log("🎉 Org Admin Creation Complete!");
        console.log("========================================");
        console.log("Email:    orgadmin@vigozen.com");
        console.log("Password: OrgAdmin@2024");
        console.log("Role:     Org Admin");
        console.log("========================================");

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Error creating Org Admin:", err.message);
        console.error(err.stack);
    } finally {
        client.release();
        await pool.end();
    }
}

createOrgAdmin();
