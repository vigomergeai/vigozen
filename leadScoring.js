const pool = require("./db");

async function getPriorityLeads(limit = 5) {
  try {
    const result = await pool.query(
      `SELECT * FROM leads 
       ORDER BY aiscore DESC, probability DESC, created_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (err) {
    console.error("Error in getPriorityLeads:", err);
    return [];
  }
}

module.exports = { getPriorityLeads };
