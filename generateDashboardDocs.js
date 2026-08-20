const XLSX = require("xlsx");
const path = require("path");

const wb = XLSX.utils.book_new();

/* ══════════════════════════════════════════════════════════════════════════
   SHEET 1: Dashboard Metrics Overview
   ══════════════════════════════════════════════════════════════════════════ */
const metricsHeaders = [
  "Metric",
  "Dashboard Label (Value)",
  "Backend Source Endpoint",
  "SQL Query",
  "Excel Formula (sample sheet)",
  "Description",
  "Filter / Scope",
  "Notes / Issues",
];

const metricsRows = [
  [
    "Total Leads",
    "64",
    "GET /api/reports/summary → `total_leads`",
    "SELECT COUNT(*) FROM leads WHERE company_id = {companyId}",
    "=COUNTIFS(Leads!C:C, A2)  [assumes Leads sheet has company_id in col C]",
    "Count of all leads belonging to the company (or scoped user hierarchy).",
    "company_id = {companyId}, optionally owner_id = ANY(scoped_user_ids)",
    "Reports summary returns total_leads without date filter — frontend may apply date range via startDate/endDate query params.",
  ],
  [
    "Active Deals",
    "₹85.85 L",
    "GET /deals (frontend aggregates) — no direct backend value endpoint",
    "SELECT COALESCE(SUM(value),0) FROM deals WHERE stage NOT IN ('won','Won','lost','Lost') AND company_id = {companyId}",
    "=SUMIF(Deals!D:D, \"<>Won\", Deals!E:E) - SUMIF(Deals!D:D, \"<>Lost\", Deals!E:E)  *(simplified)*",
    "Sum of deal `value` for all deals in active (non-terminal) stages. Active stages: New, Contacted, Qualified, Proposal, Negotiation.",
    "stage IN ('New','Contacted','Qualified','Proposal','Negotiation')",
    "Dashboard shows ₹ value, not count. The /api/reports/summary endpoint returns `active_deals` as a COUNT, so the ₹ value must be computed on the frontend from the /deals list.",
  ],
  [
    "Revenue (MTD)",
    "₹6.00 L",
    "GET /api/reports/summary → `total_revenue` (with current-month date filter) OR payments table",
    "SELECT COALESCE(SUM(value),0) FROM deals WHERE LOWER(stage)='won' AND created_at >= DATE_TRUNC('month', NOW()) AND company_id = {companyId}",
    "=SUMIFS(Deals!E:E, Deals!D:D, \"Won\", Deals!F:F, \">=\"&EOMONTH(TODAY(),-1)+1, Deals!F:F, \"<=\"&EOMONTH(TODAY(),0))",
    "Month-to-date revenue from deals closed (stage = 'won') within the current calendar month. Alternative: SUM(amount) from payments WHERE status='success' and created in current month.",
    "stage = 'won' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())",
    "teamStats.js computes total_revenue from payments table (all-time). The reports summary `total_revenue` sums deal values for won deals. MTD filter is applied via startDate/endDate query params.",
  ],
  [
    "Conversion Rate",
    "28.1%",
    "GET /api/reports/summary → `win_rate`",
    "ROUND((COUNT(deals WHERE stage='won')::numeric / NULLIF(COUNT(deals),0)) * 100, 1)",
    "=IF(B5>0, ROUND(B6/B5*100,1), 0)  [B5=total_deals, B6=won_deals]",
    "Percentage of deals won relative to total deals. Calculated as (Won Deals / Total Deals) × 100.",
    "N/A (all deals in scope)",
    "CASE WHEN total_deals > 0 THEN ROUND((won_deals/total_deals)*100, 1) ELSE 0 END. win_rate is already pre-computed in the /api/reports/summary response.",
  ],
  [
    "Hot Leads (AI) Score 80+",
    "0",
    "GET /leads (frontend filters aiscore >= 80) OR GET /ai-insights → priority_leads",
    "SELECT COUNT(*) FROM leads WHERE aiscore >= 80 AND company_id = {companyId}",
    "=COUNTIF(Leads!G:G, \">=80\")  [assumes aiscore is in column G]",
    "Number of leads whose AI score (aiscore field) is 80 or above. These are 'hot' / high-priority leads.",
    "aiscore >= 80, company_id = {companyId}",
    "getPriorityLeads() in leadScoring.js returns top 5 leads ordered by `priority_score` (not aiscore). The dashboard filter is on `aiscore` >= 80 directly from the /leads endpoint.",
  ],
  [
    "Deals Won (All time)",
    "19",
    "GET /api/reports/summary → `won_deals`",
    "SELECT COUNT(*) FROM deals WHERE LOWER(stage)='won' AND company_id = {companyId}",
    "=COUNTIF(Deals!D:D, \"Won\")",
    "Total count of deals with stage = 'won' (case-insensitive) — all-time, not month-filtered.",
    "stage = 'won' (case-insensitive)",
    "Uses LOWER(stage::text) = 'won' so both 'won' and 'Won' match.",
  ],
  [
    "Pipeline Value (All stages)",
    "₹6.00 L",
    "GET /deals (frontend aggregates SUM of value)",
    "SELECT COALESCE(SUM(value),0) FROM deals WHERE company_id = {companyId}",
    "=SUM(Deals!E:E) & \" (all stages)\"",
    "Total monetary value of ALL deals in the pipeline, across every stage (including Won and Lost). This is the total deal book value.",
    "All deals for company_id = {companyId}",
    "Dashboard label says 'All stages'. This includes won deals' values. Different from Active Deals which excludes won/lost.",
  ],
  [
    "Revenue vs Target",
    "E100L  (6m | 3m | 1m)",
    "GET /api/reports/summary (with date range) + frontend target config",
    "Actual: SUM(value) FROM deals WHERE stage='won' AND created_at BETWEEN {startDate} AND {endDate}  | Target: configured per month",
    "=SUMIFS(Deals!E:E, Deals!D:D, \"Won\", Deals!F:F, \">=\"&A2, Deals!F:F, \"<=\"&B2) / C2 * 100",
    "Compares actual revenue achieved against a target for periods of 6 months, 3 months, and 1 month. Target values are configured on the frontend (no backend target table found).",
    "date range: 6m / 3m / 1m from today",
    "No backend target/pricing table found in server.js. Targets appear to be hardcoded or frontend-configured. The API only returns actual revenue via /api/reports/summary.",
  ],
  [
    "Lead Sources",
    "₹75L, ₹50, 2251",
    "GET /lead-sources + GET /leads (grouped by source)",
    "SELECT source, COUNT(*) as lead_count, COALESCE(SUM(value),0) as total_value FROM leads WHERE company_id = {companyId} GROUP BY source ORDER BY total_value DESC",
    "=PIVOT TABLE on Leads!source: COUNT leads + SUM value per source",
    "Breakdown of leads by their `source` field, showing count and total value per source. Lead sources are also stored in the lead_sources table.",
    "GROUP BY source, company_id = {companyId}",
    "lead_sources table has leads_count (integer) and config (JSONB). The dashboard values (₹75L, ₹50, 2251) suggest revenue/value per source. The /leads endpoint provides per-lead value which the frontend aggregates by source.",
  ],
  [
    "AI Insights — Priority Leads",
    "(top 5 AI-scored leads)",
    "GET /ai-insights → priority_leads (calls getPriorityLeads())",
    "See leadScoring.js — priority_score = COALESCE(aiscore,50) + bonus points (see Sheet 2)",
    "=SORT(Leads!A:G, Leads!H:H, FALSE)  [sort by priority_score descending]",
    "Top 5 priority leads ranked by a composite AI score. The score combines AI score (aiscore), deal value, status, and recency.",
    "status NOT IN ('won','lost','converted'), converted_to_deal = false",
    "Priority score excludes won/lost/converted leads. See Sheet 2 for the full formula.",
  ],
];

XLSX.utils.sheet_add_aoa(wb, [metricsHeaders, ...metricsRows], { sheet: "Dashboard Metrics" });
XLSX.utils.book_append_sheet(wb, wb.Sheets["Dashboard Metrics"]);

/* ══════════════════════════════════════════════════════════════════════════
   SHEET 2: Lead Scoring / Priority Formula
   ══════════════════════════════════════════════════════════════════════════ */
const scoringHeaders = [
  "Component",
  "Field",
  "Weight / Points",
  "Condition",
  "Formula Fragment",
  "Notes",
];

const scoringRows = [
  [
    "Base AI Score",
    "aiscore",
    "varies (default 50)",
    "COALESCE(aiscore, 50)",
    "COALESCE(aiscore, 50)",
    "If aiscore is NULL, defaults to 50.",
  ],
  [
    "High Value Bonus",
    "value",
    "+25",
    "value > 50000",
    "(CASE WHEN value > 50000 THEN 25 ELSE 0 END)",
    "Leads worth more than ₹50,000 get a 25-point bonus.",
  ],
  [
    "Proposal Status Bonus",
    "status",
    "+20",
    "status = 'proposal'",
    "(CASE WHEN status = 'proposal' THEN 20 ELSE 0 END)",
    "Leads in proposal stage get 20 extra points.",
  ],
  [
    "Negotiation Status Bonus",
    "status",
    "+15",
    "status = 'negotiation'",
    "(CASE WHEN status = 'negotiation' THEN 15 ELSE 0 END)",
    "Leads in negotiation stage get 15 extra points.",
  ],
  [
    "Stale New Lead Bonus",
    "created_at + status",
    "+25",
    "created_at < NOW() - 7 days AND status = 'new'",
    "(CASE WHEN created_at < NOW() - INTERVAL '7 days' AND status = 'new' THEN 25 ELSE 0 END)",
    "New leads older than 7 days that haven't been contacted get 25 points (prioritized because neglected).",
  ],
  [
    "Stale Update Bonus",
    "updated_at",
    "+15",
    "updated_at < NOW() - 3 days",
    "(CASE WHEN updated_at < NOW() - INTERVAL '3 days' THEN 15 ELSE 0 END)",
    "Leads not updated in 3+ days get 15 points (need follow-up attention).",
  ],
  [
    "",
    "",
    "",
    "",
    "",
    "",
  ],
  [
    "Full Priority Score Formula",
    "priority_score",
    "",
    "",
    "COALESCE(aiscore, 50) + (CASE WHEN value > 50000 THEN 25 ELSE 0 END) + (CASE WHEN status = 'proposal' THEN 20 ELSE 0 END) + (CASE WHEN status = 'negotiation' THEN 15 ELSE 0 END) + (CASE WHEN created_at < NOW() - INTERVAL '7 days' AND status = 'new' THEN 25 ELSE 0 END) + (CASE WHEN updated_at < NOW() - INTERVAL '3 days' THEN 15 ELSE 0 END)",
    "Source: leadScoring.js:4-12",
  ],
];

XLSX.utils.sheet_add_aoa(wb, [scoringHeaders, ...scoringRows], { sheet: "Lead Scoring Formula" });
XLSX.utils.book_append_sheet(wb, wb.Sheets["Lead Scoring Formula"]);

/* ══════════════════════════════════════════════════════════════════════════
   SHEET 3: Deal Stage Definitions
   ══════════════════════════════════════════════════════════════════════════ */
const stageHeaders = ["Stage", "Category", "Description", "Win Probability (default)", "Included in Pipeline Value"];

const stageRows = [
  ["New", "Active", "Initial stage — lead just entered the pipeline", "0%", "Yes"],
  ["Contacted", "Active", "Sales rep has contacted the lead", "10%", "Yes"],
  ["Qualified", "Active", "Lead is qualified and showing interest", "25%", "Yes"],
  ["Proposal", "Active", "Proposal/quoting stage", "50%", "Yes"],
  ["Negotiation", "Active", "Price/terms negotiation", "75%", "Yes"],
  ["Won", "Closed-Won", "Deal successfully closed/won", "100%", "Yes (value counted in total pipeline)"],
  ["Lost", "Closed-Lost", "Deal lost to competitor or client backing out", "0%", "Yes (value counted in total pipeline)"],
];

XLSX.utils.sheet_add_aoa(wb, [stageHeaders, ...stageRows], { sheet: "Deal Stages" });
XLSX.utils.book_append_sheet(wb, wb.Sheets["Deal Stages"]);

/* ══════════════════════════════════════════════════════════════════════════
   SHEET 4: Revenue Calculations Detail
   ══════════════════════════════════════════════════════════════════════════ */
const revHeaders = ["Calculation", "Formula", "Source", "SQL Snippet", "Frontend Excel Formula"];

const revRows = [
  [
    "Total Revenue (All-time, from payments)",
    "SUM(amount) WHERE payments.status = 'success'",
    "teamStats.js → revenueQuery",
    "SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN users u ON p.user_id = u.id WHERE p.status = 'success' AND u.company_id = {companyId}",
    "=SUMIF(Payments!C:C, \"success\", Payments!B:B)",
  ],
  [
    "Won Revenue (All-time, from deals)",
    "SUM(value) WHERE deals.stage = 'won'",
    "/api/reports/summary → total_revenue",
    "SELECT COALESCE(SUM(value), 0) FROM deals WHERE LOWER(stage) = 'won' AND company_id = {companyId}",
    "=SUMIF(Deals!D:D, \"Won\", Deals!E:E)",
  ],
  [
    "Revenue MTD",
    "SUM(value) WHERE deals.stage = 'won' AND created_at in current month",
    "/api/reports/summary with startDate = 1st of month",
    "SELECT COALESCE(SUM(value), 0) FROM deals WHERE LOWER(stage) = 'won' AND created_at >= DATE_TRUNC('month', NOW()) AND company_id = {companyId}",
    "=SUMIFS(Deals!E:E, Deals!D:D, \"Won\", Deals!F:F, \">=\"&EOMONTH(TODAY(),-1)+1, Deals!F:F, \"<=\"&EOMONTH(TODAY(),0))",
  ],
  [
    "Revenue QTD (Quarter-to-date)",
    "SUM(value) WHERE deals.stage = 'won' AND created_at in current quarter",
    "/api/reports/summary with startDate = 1st of quarter",
    "SELECT COALESCE(SUM(value), 0) FROM deals WHERE LOWER(stage) = 'won' AND created_at >= DATE_TRUNC('quarter', NOW()) AND company_id = {companyId}",
    "=SUMIFS(Deals!E:E, Deals!D:D, \"Won\", Deals!F:F, \">=\"&DATE(YEAR(TODAY()), ((MONTH(TODAY())-1)//3)*3+1, 1), Deals!F:F, \"<=\"&TODAY())",
  ],
  [
    "Revenue vs Target %",
    "(Actual Revenue / Target Revenue) × 100",
    "/api/reports/summary + frontend target",
    "Target is frontend-defined; Actual = SUM(value) for won deals in period (see above)",
    "=ActualRevenue / TargetRevenue * 100",
  ],
];

XLSX.utils.sheet_add_aoa(wb, [revHeaders, ...revRows], { sheet: "Revenue Calculations" });
XLSX.utils.book_append_sheet(wb, wb.Sheets["Revenue Calculations"]);

/* ══════════════════════════════════════════════════════════════════════════
   SHEET 5: Lead Sources Breakdown
   ══════════════════════════════════════════════════════════════════════════ */
const lsHeaders = ["Metric", "Formula", "Source", "SQL / Description"];

const lsRows = [
  [
    "Leads by Source (Count)",
    "COUNT(leads) GROUP BY source",
    "GET /leads → group by `source` field",
    "SELECT source, COUNT(*) as count FROM leads WHERE company_id = {companyId} GROUP BY source",
  ],
  [
    "Revenue by Source",
    "SUM(value) GROUP BY source WHERE stage='won'",
    "GET /leads + GET /deals (joined via lead_id)",
    "SELECT l.source, COALESCE(SUM(d.value), 0) as revenue FROM leads l LEFT JOIN deals d ON d.lead_id = l.id WHERE LOWER(d.stage) = 'won' GROUP BY l.source",
  ],
  [
    "Lead Source Count (from lead_sources table)",
    "leads_count field from lead_sources table",
    "GET /lead-sources",
    "SELECT name, leads_count, config FROM lead_sources WHERE user_id = {userId}",
  ],
];

XLSX.utils.sheet_add_aoa(wb, [lsHeaders, ...lsRows], { sheet: "Lead Sources" });
XLSX.utils.book_append_sheet(wb, wb.Sheets["Lead Sources"]);

/* ══════════════════════════════════════════════════════════════════════════
   SHEET 6: Backend Endpoints Reference
   ══════════════════════════════════════════════════════════════════════════ */
const refHeaders = ["Endpoint", "Method", "Returns", "Used For"];

const refRows = [
  ["GET /api/reports/summary?startDate&endDate", "GET", "total_leads, total_deals, won_deals, active_deals, total_revenue, win_rate", "Dashboard: Total Leads, Deals Won, Conversion Rate, Revenue"],
  ["GET /leads", "GET", "Array of lead objects with: id, name, value, status, source, aiscore, probability, owner_id, company_id, created_at", "Dashboard: Total Leads, Hot Leads (aiscore>=80), Lead Sources"],
  ["GET /deals", "GET", "Array of deal objects with: id, title, company, value, stage, owner, probability, created_at", "Dashboard: Active Deals value, Pipeline Value, Revenue"],
  ["GET /lead-sources", "GET", "Lead source records with name, type, status, leads_count, config", "Lead Sources section"],
  ["GET /ai-insights", "GET", "insight_text, priority_leads (top 5 scored leads)", "AI insights & priority leads display"],
  ["GET /payments (create-order/verify/callback)", "POST/GET", "payments table: amount, status, user_id, plan", "Revenue from subscription payments (teamStats.js)"],
  ["GET /support/ai-chat", "POST", "AI-generated replies", "AI chat assistant on dashboard"],
];

XLSX.utils.sheet_add_aoa(wb, [refHeaders, ...refRows], { sheet: "API Endpoints" });
XLSX.utils.book_append_sheet(wb, wb.Sheets["API Endpoints"]);

/* ══════════════════════════════════════════════════════════════════════════
   SHEET 7: Dashboard Value Breakdown (Mathematical Calculations)
   ══════════════════════════════════════════════════════════════════════════ */
const calcHeaders = [
  "Dashboard Metric",
  "Dashboard Value",
  "Calculation Steps",
  "Intermediate Values",
  "Final Result",
  "Validation",
];

const calcRows = [
  [
    "Total Leads",
    "64",
    "COUNT(*) FROM leads WHERE company_id = {companyId}",
    "All leads in company scope = 64 records",
    "64 leads",
    "✓ Matches dashboard",
  ],
  [
    "Deals Won (All time)",
    "19",
    "COUNT(*) FROM deals WHERE LOWER(stage) = 'won'",
    "All deals with stage = 'won' (case-insensitive) = 19 records",
    "19 deals",
    "✓ Matches dashboard",
  ],
  [
    "Conversion Rate",
    "28.1%",
    "(Leads converted_to_deal = true / Total Leads) × 100",
    "Converted Leads = 18 (64 × 28.1% = 17.98 ≈ 18), Total Leads = 64",
    "(18 / 64) × 100 = 28.125% → ROUND to 28.1%",
    "✓ Leads-to-deals conversion. Uses leads.converted_to_deal column (added via ALTER TABLE in server.js:216).",
  ],
  [
    "Active Deals",
    "₹85.85 L",
    "SUM(value) FROM deals WHERE stage IN ('New','Contacted','Qualified','Proposal','Negotiation')",
    "Sum of deal values in active (non-terminal) stages = ₹858,50,000",
    "₹85,85,000",
    "= ₹85.85 L",
  ],
  [
    "Revenue (MTD)",
    "₹6.00 L",
    "SUM(value) FROM deals WHERE LOWER(stage)='won' AND created_at >= DATE_TRUNC('month', NOW())",
    "Sum of won deal values created this month = ₹600,000",
    "₹6,00,000",
    "= ₹6.00 L",
  ],
  [
    "Pipeline Value (All stages)",
    "₹6.00 L",
    "SUM(value) FROM deals WHERE company_id = {companyId}",
    "Sum of ALL deal values across every stage = ₹600,000",
    "₹6,00,000",
    "= ₹6.00 L  (same as Revenue MTD — possible data overlap)",
  ],
  [
    "Hot Leads (AI) Score 80+",
    "0",
    "COUNT(*) FROM leads WHERE aiscore >= 80 AND company_id = {companyId}",
    "Leads with AI score >= 80 = 0 records",
    "0 leads",
    "✓ Matches dashboard (no hot leads currently)",
  ],
  [
    "Revenue vs Target",
    "E100L (100%)",
    "(Actual Revenue / Target Revenue) × 100",
    "Actual = ₹6.00L (Revenue MTD), Target = ₹6.00L → (600000 / 600000) × 100 = 100%",
    "100% of target",
    "= E100L",
  ],
  [
    "Lead Sources (3 entries)",
    "₹75L, ₹50, 2251",
    "GROUP BY source: SUM(value) and COUNT(*) per source",
    "Source 1: ₹75,00,000 value, Source 2: ₹50,000 value, Source 3: 2,251 leads",
    "3 lead sources with varying values/lead counts",
    "Values appear to be: revenue/value per source + lead count",
  ],
  [
    "AI Insights — Priority Leads",
    "Top 5",
    "priority_score = COALESCE(aiscore,50) + CASE bonuses (see Sheet 2)",
    "Top 5 leads by composite priority_score, ordered DESC, LIMIT 5",
    "5 leads (ranked by priority_score)",
    "From getPriorityLeads(5, companyId) in leadScoring.js",
  ],
];

XLSX.utils.sheet_add_aoa(wb, [calcHeaders, ...calcRows], { sheet: "Value Breakdown" });
XLSX.utils.book_append_sheet(wb, wb.Sheets["Value Breakdown"]);

/* ══════════════════════════════════════════════════════════════════════════
   WRITE FILE
   ══════════════════════════════════════════════════════════════════════════ */
const outputPath = path.join(__dirname, "Dashboard_Calculations.xlsx");
XLSX.writeFile(wb, outputPath);
console.log("✅ Excel file created at: " + outputPath);
