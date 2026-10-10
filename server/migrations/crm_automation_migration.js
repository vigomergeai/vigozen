// server/migrations/crm_automation_migration.js
// Migration for CRM automation features:
// - activities table enhancements (lead_id)
// - leads table tracking columns for follow-up reminders, inactivity, customer waiting, and new lead alerts
// - customer_messages table for inbound replies & waiting tracking

const pool = require('../../db');

async function runMigration() {
  console.log('🚀 Running CRM Automation Migration...');
  try {
    // 1. Add lead_id and user_id to activities if missing
    await pool.query('ALTER TABLE activities ADD COLUMN IF NOT EXISTS lead_id UUID;');
    await pool.query('ALTER TABLE activities ADD COLUMN IF NOT EXISTS user_id UUID;');
    console.log('✅ Added lead_id and user_id to activities (if not exists)');

    // 2. Add tracking columns to leads
    await pool.query(`
      ALTER TABLE leads 
        ADD COLUMN IF NOT EXISTS followup_reminder_count INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_followup_reminder_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_inactive_notified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS customer_waiting BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS customer_waiting_since TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS new_lead_notified BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS last_new_lead_notified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS customer_waiting_escalated BOOLEAN DEFAULT false;
    `);
    console.log('✅ Added tracking columns to leads table');

    // 3. Create customer_messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
        deal_id UUID,
        company_id UUID,
        sender_type VARCHAR(50) NOT NULL,
        sender_name TEXT,
        sender_email TEXT,
        sender_phone TEXT,
        channel VARCHAR(50) DEFAULT 'email',
        subject TEXT,
        message TEXT NOT NULL,
        direction VARCHAR(20) DEFAULT 'inbound',
        read_by_salesperson BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Created customer_messages table (if not exists)');

    // 4. Update activities_type_check constraint to allow all CRM activities (call, email, whatsapp, meeting, note, status_change, followup, etc.)
    await pool.query(`
      ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check;
      ALTER TABLE activities ADD CONSTRAINT activities_type_check 
        CHECK (type = ANY (ARRAY['call'::text, 'meeting'::text, 'email'::text, 'task'::text, 'note'::text, 'status_change'::text, 'system'::text, 'message'::text, 'outreach'::text, 'whatsapp'::text, 'followup'::text]));
    `);
    console.log('✅ Updated activities_type_check constraint with whatsapp and followup');

    // 4b. Create/replace lead_activities view
    await pool.query(`
      CREATE OR REPLACE VIEW lead_activities AS
      SELECT 
        id, 
        lead_id, 
        user_id, 
        type AS activity_type, 
        note AS description, 
        "user" AS user_name,
        action,
        target,
        status,
        created_at,
        updated_at
      FROM activities
      WHERE lead_id IS NOT NULL;
    `);
    console.log('✅ Created lead_activities view');

    // 5. Create index on customer_messages and leads tracking columns
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_messages_lead_id ON customer_messages(lead_id);
      CREATE INDEX IF NOT EXISTS idx_customer_messages_created_at ON customer_messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_leads_customer_waiting ON leads(customer_waiting);
      CREATE INDEX IF NOT EXISTS idx_leads_next_followup ON leads(next_followup);
      CREATE INDEX IF NOT EXISTS idx_leads_last_activity_date ON leads(last_activity_date);
    `);
    console.log('✅ Created helpful indexes for CRM automation');

    console.log('🎉 CRM Automation Migration finished successfully!');
    return true;
  } catch (err) {
    console.error('❌ CRM Automation Migration failed:', err);
    throw err;
  }
}

// Auto-run if executed directly
if (require.main === module) {
  runMigration()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = runMigration;
