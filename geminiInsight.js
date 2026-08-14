const pool = require("./db");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateInsight(stats) {
    try {
        const totalLeads = stats?.total_leads || 0;
        const totalRevenue = stats?.total_revenue || 0;
        const topEmployees = stats?.top_employees || [];

        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const prompt = `You are a CRM analytics assistant. Write a short, 3-4 sentence business insight summary based on this team performance data:
- Total Leads: ${totalLeads}
- Total Revenue: $${totalRevenue.toLocaleString()}
- Top Performer: ${topEmployees[0]?.name || 'N/A'}

Be specific, actionable, and mention what stands out. Do not use markdown formatting.`;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (err) {
        console.error("Error generating insight:", err);
        return "Unable to generate insight at this time.";
    }
}

module.exports = { generateInsight };
