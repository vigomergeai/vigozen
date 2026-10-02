const pool = require("./db");
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generateInsight(stats) {
    const totalLeads = stats?.total_leads || 0;
    const totalRevenue = stats?.total_revenue || 0;
    const topEmployees = stats?.top_employees || [];
    const topPerformer = topEmployees[0]?.name || null;

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === "your_gemini_api_key" || apiKey.trim() === "") {
            throw new Error("GEMINI_API_KEY not configured");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `You are a CRM analytics assistant. Write a short, 3-4 sentence business insight summary based on this team performance data:
- Total Leads: ${totalLeads}
- Total Revenue: ₹${totalRevenue.toLocaleString('en-IN')}
- Top Performer: ${topPerformer || 'N/A'}

Be specific, actionable, and mention what stands out. Do not use markdown formatting.`;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (err) {
        console.error("Insight generation fallback note:", err.message);
        const topPerformerText = topPerformer
          ? `Our top performer is ${topPerformer}.`
          : "There are no recorded top performers yet.";
        return `Based on current analytics, you have managed a total of ${totalLeads} leads generating ₹${(totalRevenue/100000).toFixed(2)}L in revenue. ${topPerformerText} Focus on converting the remaining open pipeline to boost revenue.`;
    }
}

module.exports = { generateInsight };
