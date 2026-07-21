require('dotenv').config();
const pool = require('./db');

async function runMigration() {
  console.log('🔄 Running database schema migration for Lead-to-Deal integration...');
  try {
    // 1. Add lead_id column to deals table
    await pool.query(`
      ALTER TABLE deals 
      ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
    `);
    console.log('✅ Added lead_id column to deals table');

    // 2. Add performance index on deals
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deals_lead_id ON deals(lead_id);
    `);
    console.log('✅ Created index idx_deals_lead_id on deals table');

    // 3. Add converted_to_deal and deal_id columns to leads table
    await pool.query(`
      ALTER TABLE leads 
      ADD COLUMN IF NOT EXISTS converted_to_deal BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS deal_id UUID;
    `);
    console.log('✅ Added converted_to_deal and deal_id columns to leads table');

    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
