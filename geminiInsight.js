const pool = require("./db");

async function generateInsight(stats) {
    try {
        // Generate a simple insight based on team stats
        const totalLeads = stats?.total_leads || 0;
        const totalRevenue = stats?.total_revenue || 0;
        const topEmployees = stats?.top_employees || [];

        let insight = `Team Performance Summary:\n`;
        insight += `- Total Leads: ${totalLeads}\n`;
        insight += `- Total Revenue: $${totalRevenue.toLocaleString()}\n`;
        if (topEmployees.length > 0) {
            insight += `- Top Performer: ${topEmployees[0].name || 'N/A'}\n`;
        }
        insight += `\nAI-generated insight based on current data.`;

        return insight;
    } catch (err) {
        console.error("Error generating insight:", err);
        return "Unable to generate insight at this time.";
    }
}

module.exports = { generateInsight };