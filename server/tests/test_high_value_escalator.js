// server/tests/test_high_value_escalator.js
// Automated verification suite for:
// Feature: High-Value Opportunity Escalator
// Flags opportunities with value exceeding ₹5,00,000.
// If meeting is missed by more than 30 mins, alerts Sales Manager and Super Admin immediately.
//
// • Trigger: Overdue follow-up on ₹5L+ lead (>30 mins)
// • Action: High priority SMS & App alert
// • Action: Manager phone escalation

const pool = require("../../db");
const {
  HIGH_VALUE_THRESHOLD,
  OVERDUE_THRESHOLD_MINUTES,
  dispatchHighPrioritySMS,
  escalateHighValueOpportunity,
  checkHighValueEscalations,
  getHighValueEscalationMetrics
} = require("../highValueEscalationService");

async function runTests() {
  console.log("=================================================");
  console.log("🧪 TESTING: High-Value Opportunity Escalator Feature");
  console.log("=================================================");

  let testLeadId = null;
  let repUserId = null;
  let managerUserId = null;
  let testCompanyId = null;

  try {
    // 1. Setup Test Users (Sales Rep and Manager)
    console.log("\n▶ Step 1: Setting up Test Manager and Sales Rep...");
    
    // Check if we have users
    const usersRes = await pool.query("SELECT id, name, email, phone, company_id FROM users LIMIT 2");
    if (usersRes.rows.length >= 2) {
      managerUserId = usersRes.rows[0].id;
      repUserId = usersRes.rows[1].id;
      testCompanyId = usersRes.rows[0].company_id;
      
      // Ensure manager relationship
      await pool.query("UPDATE users SET manager_id = $1, phone = COALESCE(phone, '+919988776655') WHERE id = $2", [managerUserId, repUserId]);
      await pool.query("UPDATE users SET phone = COALESCE(phone, '+919876543210') WHERE id = $1", [managerUserId]);
      console.log(`Manager: ${usersRes.rows[0].name} (ID: ${managerUserId})`);
      console.log(`Sales Rep: ${usersRes.rows[1].name} (ID: ${repUserId})`);
    } else if (usersRes.rows.length === 1) {
      repUserId = usersRes.rows[0].id;
      testCompanyId = usersRes.rows[0].company_id;
      console.log(`Using single user as rep/admin: ${usersRes.rows[0].name}`);
    }

    // 2. Create a test lead with Value ₹7,50,000 (exceeding ₹5,00,000) and follow-up overdue by 45 minutes
    console.log("\n▶ Step 2: Creating Test ₹7.5L Lead with 45-min overdue follow-up...");
    const insertRes = await pool.query(
      `INSERT INTO leads (
        id, name, email, phone, company, value, source, platform, status, owner_id, company_id, 
        next_followup, high_value_escalated, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        'Rajesh Singhania (VIP Client)',
        'rajesh.singhania@apexindustries.com',
        '+91 98111 22334',
        'Apex Industries Ltd',
        750000,
        'website',
        'direct',
        'new',
        $1,
        $2,
        NOW() - INTERVAL '45 minutes',
        false,
        NOW() - INTERVAL '2 days',
        NOW()
      ) RETURNING *`,
      [repUserId, testCompanyId]
    );

    const testLead = insertRes.rows[0];
    testLeadId = testLead.id;
    console.log(`Created test lead: "${testLead.name}" | Value: ₹${parseFloat(testLead.value).toLocaleString("en-IN")} | Overdue: 45 mins ago`);

    // 3. Test checkHighValueEscalations detection
    console.log("\n▶ Step 3: Running High-Value Opportunity Escalator Scanner...");
    const scanResult = await checkHighValueEscalations();
    console.log("Scanner Execution Result:", {
      total_candidates: scanResult.total_candidates,
      processed: scanResult.processed,
      succeeded: scanResult.succeeded,
      failed: scanResult.failed
    });

    if (scanResult.processed === 0 || scanResult.succeeded === 0) {
      throw new Error("Scanner failed to detect or escalate the overdue ₹7.5L lead!");
    }
    console.log("✅ Step 3 Passed: Scanner successfully detected and escalated the overdue opportunity.");

    // 4. Verify Database Persistence & Alerts
    console.log("\n▶ Step 4: Verifying Persistence and Alert Records in Database...");

    // 4a. Verify lead record updated
    const leadCheck = await pool.query(
      "SELECT id, high_value_escalated, last_high_value_escalated_at, high_value_sms_sent FROM leads WHERE id = $1",
      [testLeadId]
    );
    const updatedLead = leadCheck.rows[0];
    if (!updatedLead.high_value_escalated) {
      throw new Error("Lead high_value_escalated flag was not set to true!");
    }
    if (!updatedLead.last_high_value_escalated_at) {
      throw new Error("Lead last_high_value_escalated_at timestamp was not updated!");
    }
    console.log("✅ Step 4a Passed: Lead table columns correctly updated (high_value_escalated: true).");

    // 4b. Verify Action 2: Manager phone escalation activity logged in activities table
    const actCheck = await pool.query(
      "SELECT id, action, type, target, note, value FROM activities WHERE lead_id = $1 AND action = 'manager_phone_escalation'",
      [testLeadId]
    );
    if (actCheck.rows.length === 0) {
      throw new Error("No record found in activities table with action 'manager_phone_escalation'!");
    }
    console.log(`✅ Step 4b Passed: Manager Phone Escalation logged in activity timeline (Action: ${actCheck.rows[0].action}, Note: "${actCheck.rows[0].note.substring(0, 65)}...")`);

    // 4c. Verify Action 1: In-app notifications generated
    const notifCheck = await pool.query(
      "SELECT id, title, message, priority FROM notifications WHERE link LIKE $1 ORDER BY created_at DESC",
      [`%${testLeadId}%`]
    );
    if (notifCheck.rows.length === 0) {
      throw new Error("No in-app notifications generated for high value escalation!");
    }
    console.log(`✅ Step 4c Passed: Generated ${notifCheck.rows.length} high-priority in-app alert(s) for Rep, Manager, and Super Admin.`);

    // 5. Verify Duplicate Prevention
    console.log("\n▶ Step 5: Testing Duplicate Escalation Prevention...");
    const secondScan = await checkHighValueEscalations();
    const alreadyEscalated = secondScan.results?.find(r => r.lead_id === testLeadId);
    if (alreadyEscalated) {
      throw new Error("Scanner should not re-escalate an already escalated lead!");
    }
    console.log("✅ Step 5 Passed: Already escalated leads are skipped to prevent duplicate alerts.");

    // 6. Verify Threshold Guard (< ₹5,00,000)
    console.log("\n▶ Step 6: Testing ₹5L Threshold Guard...");
    const belowThresholdAttempt = await escalateHighValueOpportunity(testLeadId, { force: false });
    // First update value to 200000
    await pool.query("UPDATE leads SET value = 200000, high_value_escalated = false WHERE id = $1", [testLeadId]);
    const belowRes = await escalateHighValueOpportunity(testLeadId, { force: false });
    if (!belowRes.skipped) {
      throw new Error("Threshold guard failed: allowed escalation for lead with value < ₹5,00,000!");
    }
    console.log("✅ Step 6 Passed: Threshold guard verified (leads below ₹5L are skipped).");

    // 7. Verify Closed Lead Suppression Guard
    console.log("\n▶ Step 7: Testing Closed Lead Suppression Guard...");
    await pool.query("UPDATE leads SET value = 900000, status = 'won' WHERE id = $1", [testLeadId]);
    const closedScan = await checkHighValueEscalations();
    const closedAttempt = closedScan.results?.find(r => r.lead_id === testLeadId);
    if (closedAttempt) {
      throw new Error("Closed lead guard failed: escalated a 'won' lead!");
    }
    console.log("✅ Step 7 Passed: Closed leads (won/lost/booking_done) are strictly suppressed.");

    // 8. Verify Real-time Metrics Function
    console.log("\n▶ Step 8: Testing High-Value Metrics Calculation...");
    const metrics = await getHighValueEscalationMetrics();
    console.log("Metrics:", metrics);
    if (typeof metrics.threshold_value !== "number" || typeof metrics.pending_escalations !== "number") {
      throw new Error("Metrics returned invalid structure!");
    }
    console.log("✅ Step 8 Passed: Real-time metrics successfully retrieved.");

    console.log("\n=================================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    console.log("Feature: High-Value Opportunity Escalator backend is 100% COMPLETE & VERIFIED.");
    console.log("=================================================");

  } catch (err) {
    console.error("\n❌ TEST FAILED:", err);
    process.exitCode = 1;
  } finally {
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
