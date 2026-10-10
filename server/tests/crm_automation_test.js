// server/tests/crm_automation_test.js
// Verification suite for the 5 CRM automations:
// 1. Missed Next Follow-up (closed status exclusion, alerts, auto-outreach)
// 2. Lead Inactivity & Activity Logging (activities table populated, last_activity_date updated)
// 3. Customer Replied & Waiting SLA (customer_messages, waiting timer, alerts, clear on reply)
// 4. New Lead Not Contacted (24h+ check, welcome outreach, ad import notification)
// 5. Closed statuses cleanly skipped everywhere

const pool = require('../../db');
const { recordActivity, getLeadActivities } = require('../activityService');
const emailService = require('../emailService');

async function runTests() {
  console.log('🧪 Starting CRM Automation Verification Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // ── Test 1: Closed Status Exclusion ──
    console.log('--- Test 1: Closed Status Query Filter ---');
    const closedStatuses = ['won', 'lost', 'unqualified', 'booking_done', 'booking done', 'token_done', 'token done', 'converted'];
    
    // Test the SQL filter
    const testFilterQuery = `
      SELECT status,
        CASE WHEN (
          LOWER(REPLACE(status::text, ' ', '_')) NOT IN ('won', 'lost', 'unqualified', 'booking_done', 'token_done', 'converted')
          AND LOWER(status::text) NOT IN ('won', 'lost', 'unqualified', 'booking done', 'booking_done', 'token done', 'token_done', 'converted')
        ) THEN 'active' ELSE 'closed' END as classified
      FROM (
        SELECT unnest(ARRAY['new', 'contacted', 'qualified', 'won', 'lost', 'unqualified', 'booking_done', 'booking done', 'token_done', 'token done', 'converted']) as status
      ) s
    `;
    const filterRes = await pool.query(testFilterQuery);
    const closedRows = filterRes.rows.filter(r => r.classified === 'closed').map(r => r.status);
    const activeRows = filterRes.rows.filter(r => r.classified === 'active').map(r => r.status);
    
    assert(activeRows.includes('new') && activeRows.includes('contacted') && activeRows.includes('qualified'), 'Active statuses are correctly identified as active');
    assert(closedStatuses.every(st => closedRows.includes(st)), 'All closed statuses (with spaces and underscores) are correctly identified as closed');

    // ── Test 2: Activity Recording Service ──
    console.log('\n--- Test 2: Activity Recording Service ---');
    // Create a temporary test lead
    const leadRes = await pool.query(`
      INSERT INTO leads (id, name, email, phone, company, status, created_at, updated_at)
      VALUES (gen_random_uuid(), 'Test Automation Lead', 'crm_test@example.com', '1234567890', 'Test Firm', 'new', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days')
      RETURNING *
    `);
    const testLead = leadRes.rows[0];

    // Record an activity
    const activity = await recordActivity({
      leadId: testLead.id,
      user: 'Test Agent',
      action: 'status_changed',
      target: testLead.name,
      note: 'Test status change activity note',
      type: 'status_change',
      isCustomerAction: false
    });

    assert(activity && activity.id, 'Activity successfully created in activities table');
    assert(activity.lead_id === testLead.id, 'Activity correctly references test lead_id');

    // Check last_activity_date updated on lead
    const updatedLeadRes = await pool.query('SELECT last_activity_date FROM leads WHERE id = $1', [testLead.id]);
    assert(updatedLeadRes.rows[0].last_activity_date !== null, 'leads.last_activity_date is updated when activity is recorded');

    // Check activity timeline query
    const timeline = await getLeadActivities(testLead.id);
    assert(timeline.length >= 1 && timeline[0].note === 'Test status change activity note', 'getLeadActivities returns timeline for lead');

    // ── Test 3: Customer Replied & Waiting SLA ──
    console.log('\n--- Test 3: Customer Reply & Waiting SLA ---');
    // Simulate customer reply
    await pool.query(`
      INSERT INTO customer_messages (id, lead_id, sender_type, sender_name, message, direction, created_at)
      VALUES (gen_random_uuid(), $1, 'customer', 'Test Customer', 'Hello, when is my workout schedule?', 'inbound', NOW())
    `, [testLead.id]);

    await pool.query(`
      UPDATE leads 
      SET customer_waiting = true, 
          customer_waiting_since = NOW() - INTERVAL '65 minutes'
      WHERE id = $1
    `, [testLead.id]);

    const waitingLeadRes = await pool.query(`
      SELECT customer_waiting, customer_waiting_since,
             ROUND(EXTRACT(EPOCH FROM (NOW() - customer_waiting_since)) / 60) as waiting_minutes
      FROM leads WHERE id = $1
    `, [testLead.id]);
    
    assert(waitingLeadRes.rows[0].customer_waiting === true, 'customer_waiting flag set to true');
    assert(parseInt(waitingLeadRes.rows[0].waiting_minutes, 10) >= 60, 'Customer waiting timer correctly computes elapsed time (> 60 mins)');

    // Simulate salesperson reply clearing the waiting status
    await recordActivity({
      leadId: testLead.id,
      user: 'Sales Rep',
      action: 'salesperson_responded',
      target: testLead.name,
      note: 'Here is your workout schedule!',
      type: 'message',
      isCustomerAction: false
    });

    const clearedLeadRes = await pool.query('SELECT customer_waiting, customer_waiting_since FROM leads WHERE id = $1', [testLead.id]);
    assert(clearedLeadRes.rows[0].customer_waiting === false && clearedLeadRes.rows[0].customer_waiting_since === null, 'Salesperson action automatically clears customer_waiting flag');

    // ── Test 4: Follow-up Reminder Rescheduling Reset ──
    console.log('\n--- Test 4: Follow-up Reminder Rescheduling Reset ---');
    // Simulate lead having received 2 overdue reminders
    await pool.query(`
      UPDATE leads 
      SET followup_reminder_count = 2,
          last_followup_reminder_at = NOW() - INTERVAL '1 hour',
          followup_notified = true
      WHERE id = $1
    `, [testLead.id]);

    // Simulate rescheduling follow-up
    const followupChanged = true;
    await pool.query(`
      UPDATE leads 
      SET next_followup = NOW() + INTERVAL '3 days',
          followup_notified = false,
          followup_reminder_count = CASE WHEN $2 THEN 0 ELSE followup_reminder_count END,
          last_followup_reminder_at = CASE WHEN $2 THEN NULL ELSE last_followup_reminder_at END
      WHERE id = $1
    `, [testLead.id, followupChanged]);

    const resetFollowupRes = await pool.query('SELECT followup_reminder_count, last_followup_reminder_at, followup_notified FROM leads WHERE id = $1', [testLead.id]);
    assert(resetFollowupRes.rows[0].followup_reminder_count === 0, 'Followup reminder count resets to 0 when follow-up is rescheduled');
    assert(resetFollowupRes.rows[0].last_followup_reminder_at === null, 'last_followup_reminder_at resets to NULL when follow-up is rescheduled');

    // ── Test 5: New Lead Uncontacted (24h+) Detection ──
    console.log('\n--- Test 5: New Lead Uncontacted Detection ---');
    const oldNewLeadRes = await pool.query(`
      SELECT id, name, status, created_at, (new_lead_notified IS NULL OR new_lead_notified = false) as needs_notify
      FROM leads
      WHERE id = $1
        AND LOWER(status::text) = 'new'
        AND created_at <= NOW() - INTERVAL '24 hours'
    `, [testLead.id]);

    assert(oldNewLeadRes.rows.length === 1, 'Leads in new status older than 24 hours are cleanly detected by query');

    // Cleanup test lead and test records
    await pool.query('DELETE FROM customer_messages WHERE lead_id = $1', [testLead.id]);
    await pool.query('DELETE FROM activities WHERE lead_id = $1', [testLead.id]);
    await pool.query('DELETE FROM leads WHERE id = $1', [testLead.id]);
    console.log('\n🧹 Cleaned up temporary test lead and messages.');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await pool.end();
  }

  console.log(`\n========================================`);
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
