const pool = require("./db");
async function main() {
  try {
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public'
    `);
    console.log("Database Tables:");
    console.dir(tablesRes.rows.map(r => r.table_name));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
main();
