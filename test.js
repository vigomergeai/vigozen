require('dotenv').config();
const {Pool} = require('pg');
const p = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {rejectUnauthorized: false}
});
p.query('SELECT 1')
  .then(() => console.log('CONNECTED!'))
  .catch(e => console.log('ERROR:', e.message));
