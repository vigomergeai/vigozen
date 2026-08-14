const pool = require("./db");

async function getTeamStats() {
    try {
        // Get total leads count
        const leadsResult = await pool.query("SELECT COUNT(*) as total_leads FROM leads");
        const totalLeads = parseInt(leadsResult.rows[0]?.total_leads) || 0;

        // Get total revenue from payments
        const revenueResult = await pool.query("SELECT COALESCE(SUM(amount), 0) as total_revenue FROM payments WHERE status = 'success'");
        const totalRevenue = parseFloat(revenueResult.rows[0]?.total_revenue) || 0;

        // Get top employees (users with most leads)
        const topResult = await pool.query(`
      SELECT u.id, u.name, u.email, COUNT(l.id) as lead_count
      FROM users u
      LEFT JOIN leads l ON l.owner_id = u.id
      GROUP BY u.id, u.name, u.email
      ORDER BY lead_count DESC
      LIMIT 5
    `);

        return {
            total_leads: totalLeads,
            total_revenue: totalRevenue,
            top_employees: topResult.rows.map(row => ({
                id: row.id,
                name: row.name,
                email: row.email,
                lead_count: parseInt(row.lead_count) || 0
            }))
        };
    } catch (err) {
        console.error("Error in getTeamStats:", err);
        return {
            total_leads: 0,
            total_revenue: 0,
            top_employees: []
        };
    }
}

module.exports = { getTeamStats };