const pool = require("./db");

async function backfill() {
  console.log("🔍 Finding won leads without a linked deal...");
  const res = await pool.query(
    `SELECT * FROM leads WHERE LOWER(status::text) = 'won' AND deal_id IS NULL`
  );
  console.log(`Found ${res.rows.length} leads to backfill.`);

  let created = 0;
  for (const lead of res.rows) {
    try {
      let ownerName = null;
      if (lead.owner_id) {
        const ownerRes = await pool.query("SELECT name FROM users WHERE id = $1", [lead.owner_id]);
        if (ownerRes.rows.length > 0) ownerName = ownerRes.rows[0].name;
      }
      const dealResult = await pool.query(
        `INSERT INTO deals (id, title, company, company_id, value, stage, owner, owner_id, probability, expectedclose, expected_close, daysinstage, lead_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Won', $5, $6, 100, NOW(), NOW(), 0, $7)
         RETURNING *`,
        [lead.name, lead.company, lead.company_id, lead.value, ownerName, lead.owner_id, lead.id]
      );
      const newDeal = dealResult.rows[0];
      await pool.query("UPDATE leads SET deal_id = $1, converted_to_deal = true WHERE id = $2", [newDeal.id, lead.id]);
      console.log(`✅ Created deal for lead: ${lead.name} (₹${lead.value})`);
      created++;
    } catch (err) {
      console.error(`❌ Failed for lead ${lead.name}:`, err.message);
    }
  }

  console.log(`\n🎉 Done. Created ${created} deals out of ${res.rows.length} won leads.`);
  process.exit(0);
}

backfill().catch(err => {
  console.error("Backfill script failed:", err);
  process.exit(1);
});
