const pool = require("./db");

async function getTeamStats(companyId = null) {
    try {
        let leadsQuery = "SELECT COUNT(*) as total_leads FROM leads";
        let revenueQuery = "SELECT COALESCE(SUM(amount), 0) as total_revenue FROM payments WHERE status = 'success'";
        let topQuery = `
            SELECT u.id, u.name, u.email, COUNT(l.id) as lead_count
            FROM users u
            LEFT JOIN leads l ON l.owner_id = u.id
            GROUP BY u.id, u.name, u.email
            ORDER BY lead_count DESC
            LIMIT 5
        `;
        let leadsParams = [];
        let revenueParams = [];
        let topParams = [];

        if (companyId) {
            leadsQuery = "SELECT COUNT(*) as total_leads FROM leads WHERE company_id = $1";
            leadsParams = [companyId];

            revenueQuery = "SELECT COALESCE(SUM(p.amount), 0) as total_revenue FROM payments p JOIN users u ON p.user_id = u.id WHERE p.status = 'success' AND u.company_id = $1";
            revenueParams = [companyId];

            topQuery = `
                SELECT u.id, u.name, u.email, COUNT(l.id) as lead_count
                FROM users u
                LEFT JOIN leads l ON l.owner_id = u.id AND l.company_id = $1
                WHERE u.company_id = $1
                GROUP BY u.id, u.name, u.email
                ORDER BY lead_count DESC
                LIMIT 5
            `;
            topParams = [companyId];
        }

        // Get total leads count
        const leadsResult = await pool.query(leadsQuery, leadsParams);
        const totalLeads = parseInt(leadsResult.rows[0]?.total_leads) || 0;

        // Get total revenue from payments
        const revenueResult = await pool.query(revenueQuery, revenueParams);
        const totalRevenue = parseFloat(revenueResult.rows[0]?.total_revenue) || 0;

        // Get top employees (users with most leads)
        const topResult = await pool.query(topQuery, topParams);

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