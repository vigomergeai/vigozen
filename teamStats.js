const pool = require("./db");

async function getTeamStats(companyId = null) {
    try {
        let leadsQuery = "SELECT COUNT(*) as total_leads FROM leads";
        let revenueQuery = "SELECT COALESCE(SUM(amount), 0) as total_revenue FROM payments WHERE status = 'success'";
        let convertedLeadsQuery = "SELECT COUNT(*) as converted_leads FROM leads WHERE converted_to_deal = true";
        let totalDealsQuery = "SELECT COUNT(*) as total_deals FROM deals";
        let wonDealsQuery = "SELECT COUNT(*) as won_deals FROM deals WHERE LOWER(stage::text) = 'won'";
        let activeDealsQuery = "SELECT COUNT(*) as active_deals FROM deals WHERE stage::text IN ('New','Contacted','Qualified','Proposal','Negotiation')";
        let pipelineValueQuery = "SELECT COALESCE(SUM(value), 0) as pipeline_value FROM deals";
        let activeDealsValueQuery = "SELECT COALESCE(SUM(value), 0) as active_deals_value FROM deals WHERE stage::text IN ('New','Contacted','Qualified','Proposal','Negotiation')";
        let dealRevenueQuery = "SELECT COALESCE(SUM(value), 0) as deal_revenue FROM deals WHERE LOWER(stage::text) = 'won'";
        let revenueMTDQuery = "SELECT COALESCE(SUM(value), 0) as revenue_mtd FROM deals WHERE LOWER(stage::text) = 'won' AND created_at >= DATE_TRUNC('month', NOW())";

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
        let convertedParams = [];
        let dealsParams = [];
        let wonParams = [];
        let activeParams = [];
        let pipelineParams = [];
        let activeValueParams = [];
        let dealRevenueParams = [];
        let mtdParams = [];
        let topParams = [];

        if (companyId) {
            leadsQuery = "SELECT COUNT(*) as total_leads FROM leads WHERE company_id = $1";
            leadsParams = [companyId];

            revenueQuery = "SELECT COALESCE(SUM(p.amount), 0) as total_revenue FROM payments p JOIN users u ON p.user_id = u.id WHERE p.status = 'success' AND u.company_id = $1";
            revenueParams = [companyId];

            convertedLeadsQuery = "SELECT COUNT(*) as converted_leads FROM leads WHERE converted_to_deal = true AND company_id = $1";
            convertedParams = [companyId];

            totalDealsQuery = "SELECT COUNT(*) as total_deals FROM deals WHERE company_id = $1";
            dealsParams = [companyId];

            wonDealsQuery = "SELECT COUNT(*) as won_deals FROM deals WHERE LOWER(stage::text) = 'won' AND company_id = $1";
            wonParams = [companyId];

            activeDealsQuery = "SELECT COUNT(*) as active_deals FROM deals WHERE stage::text IN ('New','Contacted','Qualified','Proposal','Negotiation') AND company_id = $1";
            activeParams = [companyId];

            pipelineValueQuery = "SELECT COALESCE(SUM(value), 0) as pipeline_value FROM deals WHERE company_id = $1";
            pipelineParams = [companyId];

            activeDealsValueQuery = "SELECT COALESCE(SUM(value), 0) as active_deals_value FROM deals WHERE stage::text IN ('New','Contacted','Qualified','Proposal','Negotiation') AND company_id = $1";
            activeValueParams = [companyId];

            dealRevenueQuery = "SELECT COALESCE(SUM(value), 0) as deal_revenue FROM deals WHERE LOWER(stage::text) = 'won' AND company_id = $1";
            dealRevenueParams = [companyId];

            revenueMTDQuery = "SELECT COALESCE(SUM(value), 0) as revenue_mtd FROM deals WHERE LOWER(stage::text) = 'won' AND created_at >= DATE_TRUNC('month', NOW()) AND company_id = $1";
            mtdParams = [companyId];

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

        const leadsResult = await pool.query(leadsQuery, leadsParams);
        const totalLeads = parseInt(leadsResult.rows[0]?.total_leads) || 0;

        const revenueResult = await pool.query(revenueQuery, revenueParams);
        const totalRevenue = parseFloat(revenueResult.rows[0]?.total_revenue) || 0;

        const convertedResult = await pool.query(convertedLeadsQuery, convertedParams);
        const convertedLeads = parseInt(convertedResult.rows[0]?.converted_leads) || 0;

        const totalDealsResult = await pool.query(totalDealsQuery, dealsParams);
        const totalDeals = parseInt(totalDealsResult.rows[0]?.total_deals) || 0;

        const wonDealsResult = await pool.query(wonDealsQuery, wonParams);
        const wonDeals = parseInt(wonDealsResult.rows[0]?.won_deals) || 0;

        const activeDealsResult = await pool.query(activeDealsQuery, activeParams);
        const activeDeals = parseInt(activeDealsResult.rows[0]?.active_deals) || 0;

        const pipelineValueResult = await pool.query(pipelineValueQuery, pipelineParams);
        const pipelineValue = parseFloat(pipelineValueResult.rows[0]?.pipeline_value) || 0;

        const activeDealsValueResult = await pool.query(activeDealsValueQuery, activeValueParams);
        const activeDealsValue = parseFloat(activeDealsValueResult.rows[0]?.active_deals_value) || 0;

        const dealRevenueResult = await pool.query(dealRevenueQuery, dealRevenueParams);
        const dealRevenue = parseFloat(dealRevenueResult.rows[0]?.deal_revenue) || 0;

        const revenueMTDResult = await pool.query(revenueMTDQuery, mtdParams);
        const revenueMTD = parseFloat(revenueMTDResult.rows[0]?.revenue_mtd) || 0;

        const winRate = totalDeals > 0 ? parseFloat(((wonDeals / totalDeals) * 100).toFixed(1)) : 0;
        const conversionRate = totalLeads > 0 ? parseFloat(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0;

        const topResult = await pool.query(topQuery, topParams);

        return {
            total_leads: totalLeads,
            total_revenue: totalRevenue,
            total_deals: totalDeals,
            won_deals: wonDeals,
            active_deals: activeDeals,
            win_rate: winRate,
            conversion_rate: conversionRate,
            pipeline_value: pipelineValue,
            active_deals_value: activeDealsValue,
            deal_revenue: dealRevenue,
            revenue_mtd: revenueMTD,
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
            total_deals: 0,
            won_deals: 0,
            active_deals: 0,
            win_rate: 0,
            conversion_rate: 0,
            pipeline_value: 0,
            active_deals_value: 0,
            deal_revenue: 0,
            revenue_mtd: 0,
            top_employees: []
        };
    }
}

module.exports = { getTeamStats };
