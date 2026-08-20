const pool = require("./db");

async function getPriorityLeads(limit = 5, companyId = null) {
  let query = `SELECT id, name, company, status, value, probability, aiscore,
      (
        COALESCE(aiscore, 50) +
        (CASE WHEN value > 50000 THEN 25 ELSE 0 END) +
        (CASE WHEN status = 'proposal' THEN 20 ELSE 0 END) +
        (CASE WHEN status = 'negotiation' THEN 15 ELSE 0 END) +
        (CASE WHEN created_at < now() - interval '7 days' AND status = 'new' THEN 25 ELSE 0 END) +
        (CASE WHEN updated_at < now() - interval '3 days' THEN 15 ELSE 0 END)
      ) AS priority_score
    FROM leads
    WHERE status NOT IN ('won', 'Won', 'lost', 'Lost', 'converted')
      AND converted_to_deal = false`;
  
  const params = [];
  if (companyId) {
    query += ` AND company_id = $1`;
    params.push(companyId);
  }
  
  query += ` ORDER BY priority_score DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const { rows } = await pool.query(query, params);
  return rows;
}

module.exports = { getPriorityLeads };
