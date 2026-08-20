const cron = require("node-cron");
const pool = require("./db");
const { generateInsight } = require("./geminiInsight");
const { getTeamStats } = require("./teamStats");

const startInsightCron = () => {
  console.log("⏰ Insight cron job initialized");

  // Run on startup
  setTimeout(async () => {
    try {
      console.log("🔄 Generating startup AI insights...");
      await runInsightSync();
    } catch (e) {
      console.error("Error generating startup insights:", e);
    }
  }, 5000);

  // Schedule to run every hour
  cron.schedule("0 * * * *", async () => {
    try {
      console.log("🔄 Running scheduled AI insights generation...");
      await runInsightSync();
    } catch (e) {
      console.error("Error running insight cron:", e);
    }
  });
};

async function runInsightSync() {
  // Get all companies
  const compRes = await pool.query("SELECT id FROM companies");
  for (const company of compRes.rows) {
    try {
      console.log(`Generating insights for company ${company.id}...`);
      const stats = await getTeamStats(company.id);
      const insightText = await generateInsight(stats);
      await pool.query(
        `INSERT INTO ai_insights_cache (company_id, insight_text, priority_leads)
         VALUES ($1, $2, $3)`,
        [company.id, insightText, JSON.stringify(stats.top_employees)]
      );
    } catch (err) {
      console.error(`Failed to generate/save insight cache for company ${company.id}:`, err);
    }
  }

  // Also generate global insights cache (for Super Admin / NULL company_id)
  try {
    console.log("Generating global insights...");
    const globalStats = await getTeamStats(null);
    const globalInsightText = await generateInsight(globalStats);
    await pool.query(
      `INSERT INTO ai_insights_cache (company_id, insight_text, priority_leads)
       VALUES (NULL, $1, $2)`,
      [globalInsightText, JSON.stringify(globalStats.top_employees)]
    );
  } catch (err) {
    console.error("Failed to generate/save global insight cache:", err);
  }
}

module.exports = { startInsightCron };
