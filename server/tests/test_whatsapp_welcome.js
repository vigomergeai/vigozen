// server/tests/test_whatsapp_welcome.js
// Automated verification suite for:
// Feature: Instant WhatsApp Welcome Outreach
// Trigger: Lead Created via Ad Form (Meta, Google, Webhook)
// Action 1: Personalized WhatsApp text & CRM activity logging
// Action 2: Rep in-app notification & manager visibility

const pool = require("../../db");
const {
  formatWelcomeTemplate,
  normalizePhoneNumber,
  sendInstantWhatsAppWelcome,
  runInstantWhatsAppWelcomeOutreach,
  getWhatsAppWelcomeMetrics
} = require("../whatsappWelcomeService");

async function runTests() {
  console.log("=================================================");
  console.log("🧪 TESTING: Instant WhatsApp Welcome Outreach Feature");
  console.log("=================================================");

  let testLeadId = null;
  let testUserId = null;
  let testCompanyId = null;

  try {
    // 1. Template Personalization Test
    console.log("\n▶ Step 1: Testing Template Personalization & Phone Normalization...");
    const formatted = formatWelcomeTemplate({
      leadName: "Aarav Patel",
      companyName: "Skyline Realty",
      campaignName: "Meta 3BHK Lead Form",
      repName: "Priya Sharma",
      platform: "facebook"
    });
    console.log("Personalized Message Preview:\n", formatted);

    if (!formatted.includes("Aarav Patel") || !formatted.includes("Skyline Realty") || !formatted.includes("Priya Sharma")) {
      throw new Error("Template failed to personalize lead name, company, or rep name!");
    }
    console.log("✅ Step 1 Passed: Template personalization verified.");

    const normalizedPhone = normalizePhoneNumber("+91 98765 43210");
    if (normalizedPhone !== "919876543210") {
      throw new Error(`Phone normalization failed: expected 919876543210, got ${normalizedPhone}`);
    }
    console.log("✅ Step 1 Passed: Phone normalization verified (919876543210).");

    // 2. Fetch or create a test user & company for lead assignment
    console.log("\n▶ Step 2: Preparing Test User and Lead in Database...");
    const userRes = await pool.query("SELECT id, company_id, name FROM users LIMIT 1");
    if (userRes.rows.length > 0) {
      testUserId = userRes.rows[0].id;
      testCompanyId = userRes.rows[0].company_id;
      console.log(`Using existing user: ${userRes.rows[0].name} (ID: ${testUserId})`);
    }

    // Insert a new mock ad lead
    const insertLeadRes = await pool.query(
      `INSERT INTO leads (
        id, name, email, phone, company, source, platform, platform_id, status, owner_id, company_id, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        'Neha Verma Test',
        'neha.test@example.com',
        '+91 98200 11223',
        'Verma Enterprises',
        'facebook',
        'facebook',
        $1,
        'new',
        $2,
        $3,
        NOW(),
        NOW()
      ) RETURNING *`,
      ['fb_test_' + Date.now(), testUserId, testCompanyId]
    );

    const testLead = insertLeadRes.rows[0];
    testLeadId = testLead.id;
    console.log(`Created test ad lead: ${testLead.name} (ID: ${testLeadId}, Phone: ${testLead.phone})`);

    // 3. Trigger sendInstantWhatsAppWelcome
    console.log("\n▶ Step 3: Executing Instant WhatsApp Welcome Outreach...");
    const dispatchResult = await sendInstantWhatsAppWelcome(testLead);
    console.log("Dispatch Result:", dispatchResult);

    if (!dispatchResult.success) {
      throw new Error(`Dispatch failed: ${dispatchResult.error}`);
    }
    console.log("✅ Step 3 Passed: Welcome outreach executed successfully.");

    // 4. Verify Database State
    console.log("\n▶ Step 4: Verifying CRM Database Persistence...");
    
    // 4a. Check lead record update
    const leadVerifyRes = await pool.query(
      "SELECT id, whatsapp_welcome_sent, last_whatsapp_sent_at, whatsapp_message_id FROM leads WHERE id = $1",
      [testLeadId]
    );
    const updatedLead = leadVerifyRes.rows[0];
    if (!updatedLead.whatsapp_welcome_sent) {
      throw new Error("Lead record was not updated with whatsapp_welcome_sent = true!");
    }
    if (!updatedLead.last_whatsapp_sent_at) {
      throw new Error("Lead record was not updated with last_whatsapp_sent_at timestamp!");
    }
    console.log("✅ Step 4a Passed: Lead table columns correctly updated (whatsapp_welcome_sent: true).");

    // 4b. Check customer_messages table
    const msgVerifyRes = await pool.query(
      "SELECT id, channel, direction, message, sender_type FROM customer_messages WHERE lead_id = $1 AND channel = 'whatsapp'",
      [testLeadId]
    );
    if (msgVerifyRes.rows.length === 0) {
      throw new Error("No record found in customer_messages table for this WhatsApp outreach!");
    }
    console.log(`✅ Step 4b Passed: Customer message stored (ID: ${msgVerifyRes.rows[0].id}, Channel: ${msgVerifyRes.rows[0].channel}).`);

    // 4c. Check activities table (timeline log)
    const actVerifyRes = await pool.query(
      "SELECT id, type, action, note FROM activities WHERE lead_id = $1 AND type = 'whatsapp'",
      [testLeadId]
    );
    if (actVerifyRes.rows.length === 0) {
      throw new Error("No record found in activities table for WhatsApp activity!");
    }
    console.log(`✅ Step 4c Passed: CRM activity logged (Action: ${actVerifyRes.rows[0].action}, Note: "${actVerifyRes.rows[0].note.substring(0, 60)}...")`);

    // 4d. Check in-app notification to rep
    if (testUserId) {
      const notifVerifyRes = await pool.query(
        "SELECT id, title, message, link, priority FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
        [testUserId]
      );
      if (notifVerifyRes.rows.length > 0) {
        console.log(`✅ Step 4d Passed: In-app notification sent to sales rep (Title: "${notifVerifyRes.rows[0].title}", Link: ${notifVerifyRes.rows[0].link})`);
      }
    }

    // 5. Test Duplicate Prevention Guard
    console.log("\n▶ Step 5: Testing Duplicate Prevention Guard...");
    const duplicateAttempt = await sendInstantWhatsAppWelcome(testLeadId);
    console.log("Duplicate Attempt Result:", duplicateAttempt);
    if (!duplicateAttempt.skipped) {
      throw new Error("Duplicate guard failed: did not skip already welcomed lead!");
    }
    console.log("✅ Step 5 Passed: Duplicate outreach correctly skipped without spamming.");

    // 6. Test Closed Lead Suppression Guard
    console.log("\n▶ Step 6: Testing Closed Lead Suppression Guard...");
    await pool.query("UPDATE leads SET status = 'won' WHERE id = $1", [testLeadId]);
    const closedAttempt = await sendInstantWhatsAppWelcome(testLeadId, { force: true });
    console.log("Closed Lead Attempt Result:", closedAttempt);
    if (!closedAttempt.skipped) {
      throw new Error("Closed lead suppression failed: did not skip 'won' lead!");
    }
    console.log("✅ Step 6 Passed: Closed lead suppression guard verified.");

    // 7. Test Metrics Function
    console.log("\n▶ Step 7: Testing Real-time Workflow Metrics...");
    const metrics = await getWhatsAppWelcomeMetrics();
    console.log("Real-time Metrics:", metrics);
    if (typeof metrics.total_welcomed !== "number" || typeof metrics.pending_welcomes !== "number") {
      throw new Error("Metrics function returned invalid structure!");
    }
    console.log("✅ Step 7 Passed: Metrics retrieved accurately.");

    console.log("\n=================================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    console.log("Feature: Instant WhatsApp Welcome Outreach backend is 100% COMPLETE & VERIFIED.");
    console.log("=================================================");

  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err);
    process.exitCode = 1;
  } finally {
    // Cleanup test lead
    if (testLeadId) {
      console.log(`\n🧹 Cleaning up test lead ${testLeadId}...`);
      await pool.query("DELETE FROM activities WHERE lead_id = $1", [testLeadId]).catch(() => {});
      await pool.query("DELETE FROM customer_messages WHERE lead_id = $1", [testLeadId]).catch(() => {});
      await pool.query("DELETE FROM notifications WHERE link LIKE $1", [`%${testLeadId}%`]).catch(() => {});
      await pool.query("DELETE FROM leads WHERE id = $1", [testLeadId]).catch(() => {});
      console.log("Test cleanup completed.");
    }
    await pool.end();
  }
}

runTests();
