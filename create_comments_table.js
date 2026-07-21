require('dotenv').config();
const pool = require('./db');

async function runMigration() {
  console.log('🔄 Running database schema migration for Lead Comments...');
  try {
    // 1. Create lead_comments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        comment TEXT NOT NULL,
        parent_comment_id UUID REFERENCES lead_comments(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created lead_comments table');

    // 2. Create performance indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_comments_lead_id ON lead_comments(lead_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_comments_user_id ON lead_comments(user_id);
    `);
    console.log('✅ Created indexes for lead_comments');

    console.log('🎉 Comments table migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
