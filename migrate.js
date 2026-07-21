const { Pool } = require('pg');

const pool = new Pool({
    host: 'crm-database.cuvgaoqgsavc.us-east-1.rds.amazonaws.com',
    port: 5432,
    user: 'crmadmin',
    password: 'Vigozen2027',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    console.log('🔄 Running migration...');
    
    try {
        // Create payments table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                order_id VARCHAR(255) NOT NULL,
                payment_id VARCHAR(255),
                amount DECIMAL(15,2) NOT NULL,
                plan VARCHAR(100),
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Payments table created');

        // Create subscriptions table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id VARCHAR(255) PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                plan_id VARCHAR(100),
                amount DECIMAL(15,2),
                total_count INTEGER DEFAULT 12,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Subscriptions table created');

        // Create indexes
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`);
        console.log('✅ Indexes created');

        console.log('🎉 Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();