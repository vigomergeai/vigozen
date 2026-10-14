// server/tests/test_automation_rules_1_and_2.js
// Automated verification suite for Automations 1 & 2 + Common Execution Pipeline

const crypto = require("crypto");
const automationService = require("../automationRulesService");

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING AUTOMATION RULES 1 & 2 VERIFICATION SUITE");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Test getAllRules
    console.log("--- 1. Testing Rule Retrieval & Defaults ---");
    const rules = await automationService.getAllRules();
    assert(Array.isArray(rules) && rules.length >= 5, "getAllRules returns at least 5 standard automation rules");
    
    const rule1 = rules.find(r => r.id === "rule_1");
    const rule2 = rules.find(r => r.id === "rule_2");
    assert(rule1 && rule1.name === "Instant lead assignment", "Rule 1 exists with correct name");
    assert(rule2 && rule2.name === "WhatsApp first response", "Rule 2 exists with correct name");
    assert(rule1.status === "active", "Rule 1 is active by default");
    assert(rule2.status === "active", "Rule 2 is active by default");

    // 2. Test Dry-Run Testing
    console.log("\n--- 2. Testing Dry-Run Testing Engine ---");
    const testResult1 = await automationService.testRule({
      name: "Test Rule",
      trigger_event: "New lead created",
      action_type: "Assign owner by source",
      message_template: "Route lead to rep"
    });
    assert(testResult1.success === true && testResult1.status === "passed", "Dry-run test passes with valid configuration");
    assert(testResult1.duplicate_protection === true, "Dry-run validates idempotency duplicate protection");

    const failTest = await automationService.testRule({ name: "", trigger_event: "", action_type: "" });
    assert(failTest.success === false && failTest.status === "failed", "Dry-run fails when required fields are missing");

    // 3. Test Automation 2 Validation (Closed statuses suppression)
    console.log("\n--- 3. Testing Automation 2: Closed Lead Suppression ---");
    const wonLead = {
      id: crypto.randomUUID(),
      name: "Acme Buyer",
      phone: "+919876543210",
      company: "Acme Corp",
      status: "won",
      owner_id: crypto.randomUUID()
    };
    const wonRes = await automationService.triggerWhatsAppFirstResponse(wonLead);
    assert(wonRes.skipped === true, "Won lead is suppressed from receiving WhatsApp first response");

    const lostLead = {
      id: crypto.randomUUID(),
      name: "Lost Buyer",
      phone: "+919876543210",
      company: "Lost Corp",
      status: "lost",
      owner_id: crypto.randomUUID()
    };
    const lostRes = await automationService.triggerWhatsAppFirstResponse(lostLead);
    assert(lostRes.skipped === true, "Lost lead is suppressed from receiving WhatsApp first response");

    // 4. Test Automation 2 Validation (Missing/Invalid phone suppression)
    console.log("\n--- 4. Testing Automation 2: Phone Validation ---");
    const invalidPhoneLead = {
      id: crypto.randomUUID(),
      name: "No Phone Buyer",
      phone: "123",
      company: "Test Co",
      status: "new",
      owner_id: crypto.randomUUID()
    };
    const phoneRes = await automationService.triggerWhatsAppFirstResponse(invalidPhoneLead);
    assert(phoneRes.skipped === true, "Lead with invalid phone number is safely skipped");

    // 5. Test Automation 2 Successful Execution + Idempotency
    console.log("\n--- 5. Testing Automation 2: Dispatch & Duplicate Suppression ---");
    const validLead = {
      id: crypto.randomUUID(),
      name: "Rahul Sharma",
      phone: "+919876543210",
      company: "Prestige Estates",
      status: "new",
      source: "Meta Ads",
      owner_id: crypto.randomUUID()
    };

    const firstSend = await automationService.triggerWhatsAppFirstResponse(validLead, { name: "Aditi Roy" });
    assert(firstSend.success === true, "First response WhatsApp triggered successfully");
    if (firstSend.actionDetails) {
      assert(firstSend.actionDetails.dispatched === true, "Action details record dispatched state");
    }

    // Duplicate send with exact same lead ID
    const duplicateSend = await automationService.triggerWhatsAppFirstResponse(validLead, { name: "Aditi Roy" });
    assert(duplicateSend.duplicate === true || duplicateSend.skipped === true, "Duplicate trigger with same lead ID is suppressed by idempotency guard");

    // 6. Test Automation 1: Instant Lead Assignment & Chained Trigger
    console.log("\n--- 6. Testing Automation 1: Instant Lead Assignment ---");
    const freshInboundLead = {
      id: crypto.randomUUID(),
      name: "Sunil Verma",
      phone: "+919123456789",
      company: "Apex Tech",
      status: "new",
      source: "Google Ads",
      owner_id: null
    };

    const assignRes = await automationService.triggerInstantLeadAssignment(freshInboundLead);
    assert(assignRes.success === true, "Instant Lead Assignment executed successfully");

    // Duplicate assignment event
    const dupAssign = await automationService.triggerInstantLeadAssignment(freshInboundLead);
    assert(dupAssign.duplicate === true || dupAssign.skipped === true, "Duplicate lead creation event suppressed by Rule 1 idempotency guard");

    // 7. Test Inactive Rule Behavior
    console.log("\n--- 7. Testing Inactive Rule Suppression (Diagram 6) ---");
    // Rule 5 (Deal won notification) is inactive by default
    const dealWonRes = await automationService.executePipeline({
      ruleId: "rule_5",
      triggerEvent: "Deal marked won",
      eventId: "deal_123",
      idempotencyKey: `rule_5:deal_123`
    });
    assert(dealWonRes.skipped === true && dealWonRes.reason.includes("inactive"), "Inactive rule execution is skipped and logged according to Diagram 6");

    // 8. Test Execution Audit Logs
    console.log("\n--- 8. Testing Execution Audit Logs ---");
    const logs = await automationService.getExecutionLogs({ limit: 10 });
    assert(Array.isArray(logs) && logs.length > 0, "Execution logs retrieved successfully");
    const hasRule2Log = logs.some(l => l.rule_id === "rule_2" || l.trigger_event === "Lead assigned");
    assert(hasRule2Log, "Execution log contains entry for WhatsApp first response (Rule 2)");

    console.log("\n=================================================");
    console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
    console.log("=================================================");

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("Test runner encountered error:", err);
    process.exit(1);
  }
}

runTests();
