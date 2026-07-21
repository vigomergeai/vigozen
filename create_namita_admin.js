const pool = require('./db');
const bcrypt = require('bcryptjs');

async function createAdminUser() {
  try {
    const email = 'Info@sculptandstrive.com';
    const pass = 'Namita!@2027';
    const name = 'Namita Lamba';
    const role = 'admin';

    console.log(`Checking user: ${email}...`);

    const existing = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const hashed = await bcrypt.hash(pass, 10);

    if (existing.rows.length > 0) {
      console.log('User already exists in database. Updating details to Admin...');
      const result = await pool.query(
        'UPDATE users SET password = $1, role = $2, name = $3, is_active = true WHERE id = $4 RETURNING id, name, email, role',
        [hashed, role, name, existing.rows[0].id]
      );
      console.log('✅ UPDATED USER:', result.rows[0]);
    } else {
      const companyIdRes = await pool.query('SELECT company_id FROM users WHERE company_id IS NOT NULL LIMIT 1');
      const companyId = companyIdRes.rows[0]?.company_id || 'ae65a05a-6230-475d-bd6a-d87878925bd4';

      const result = await pool.query(
        `INSERT INTO users (id, name, email, password, role, department, company_id, is_active, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'management', $5, true, NOW())
         RETURNING id, name, email, role, company_id`,
        [name, email, hashed, role, companyId]
      );
      console.log('✅ CREATED NEW ADMIN USER:', result.rows[0]);
    }
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    process.exit(0);
  }
}

createAdminUser();
