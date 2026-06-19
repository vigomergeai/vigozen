const { Pool } = require("pg");

const pool = new Pool({
  host: "crm-database.cuvgaoqgsavc.us-east-1.rds.amazonaws.com",
  port: 5432,
   user: "crmadmin",
   password: "Vigozen2027",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
// Auto-reconnect on error
pool.on('error', (err) => {
  console.error('Database pool error:', err);
  // The pool will automatically attempt to reconnect on next query
});

// Keep-alive: send a simple query every 2 minutes to prevent RDS idle timeout
setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('Keep-alive query successful');
  } catch (err) {
    console.error('Keep-alive query failed:', err);
  }
}, 120000); // 2 minutes

module.exports = pool;
