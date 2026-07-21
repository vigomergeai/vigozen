-- Migration: Update notifications table for company-wide support
-- Run this SQL on your database

-- Add company_id column to notifications table
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES users(company_id) ON DELETE CASCADE;

-- Add index for faster company-wide queries
CREATE INDEX IF NOT EXISTS idx_notifications_company_id 
ON notifications(company_id, created_at DESC);

-- Add index for user-specific queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
ON notifications(user_id, created_at DESC);

-- Update existing notifications to have company_id based on user
UPDATE notifications n
SET company_id = u.company_id
FROM users u
WHERE n.user_id = u.id 
AND n.company_id IS NULL;

-- Verify the migration
SELECT 
    COUNT(*) as total_notifications,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT company_id) as unique_companies
FROM notifications;