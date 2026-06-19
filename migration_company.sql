BEGIN;

-- 1. Create the one real company
INSERT INTO companies (name, industry)
VALUES ('Vigozen', 'Technology')
ON CONFLICT DO NOTHING;

-- 2. Add company_id to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 3. Add company_id to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 4. Backfill: everyone existing belongs to the one company
UPDATE users SET company_id = (SELECT id FROM companies WHERE name = 'Vigozen' LIMIT 1) WHERE company_id IS NULL;
UPDATE leads SET company_id = (SELECT id FROM companies WHERE name = 'Vigozen' LIMIT 1) WHERE company_id IS NULL;
UPDATE deals SET company_id = (SELECT id FROM companies WHERE name = 'Vigozen' LIMIT 1) WHERE company_id IS NULL;

-- 5. Clean up leads' broken owner columns: drop the dead profiles FK, drop the duplicate text owner,
--    keep one real owner_id pointing at users
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_assigned_fkey;
ALTER TABLE leads DROP COLUMN IF EXISTS "ownerId";
ALTER TABLE leads DROP COLUMN IF EXISTS owner;
ALTER TABLE leads ADD CONSTRAINT leads_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
