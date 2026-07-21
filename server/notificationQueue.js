// ──────────────────────────────────────────────────────────────
// NOTIFICATION QUEUE - Group and process notifications
// ──────────────────────────────────────────────────────────────

const pool = require("../db");

// ── CREATE NOTIFICATION ── (✅ FIXED)
async function createNotification(userId, type, title, message, link = null, priority = 'medium', metadata = {}) {
    try {
        // Get company_id from user
        const userResult = await pool.query(
            `SELECT company_id FROM users WHERE id = $1`,
            [userId]
        );
        const companyId = userResult.rows[0]?.company_id || null;

        const result = await pool.query(
            `INSERT INTO notifications 
             (id, user_id, company_id, title, message, type, priority, status, link, metadata, scheduled_at, created_at, is_read)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending', $7, $8, NULL, NOW(), false)
             RETURNING *`,
            [userId, companyId, title, message, type, priority, link, JSON.stringify(metadata)]
        );
        return result.rows[0];
    } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    }
}

// ── GET PENDING NOTIFICATIONS ──
async function getPendingNotifications() {
    const result = await pool.query(
        `SELECT * FROM notifications 
         WHERE status = 'pending' 
         AND (scheduled_at IS NULL OR scheduled_at <= NOW())
         ORDER BY 
           CASE priority 
             WHEN 'high' THEN 1 
             WHEN 'medium' THEN 2 
             ELSE 3 
           END ASC,
           created_at ASC
         LIMIT 100`
    );
    return result.rows;
}

// ── MARK AS QUEUED ──
async function markAsQueued(ids) {
    if (!ids || ids.length === 0) return;
    await pool.query(
        `UPDATE notifications 
         SET status = 'queued', updated_at = NOW()
         WHERE id = ANY($1)`,
        [ids]
    );
}

// ── MARK AS SENT ──
async function markAsSent(ids) {
    if (!ids || ids.length === 0) return;
    await pool.query(
        `UPDATE notifications 
         SET status = 'sent', updated_at = NOW()
         WHERE id = ANY($1)`,
        [ids]
    );
}

// ── MARK AS READ (using is_read field) ──
async function markAsRead(id, userId) {
    await pool.query(
        `UPDATE notifications 
         SET is_read = true, read_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [id, userId]
    );
}

// ── MARK ALL AS READ ──
async function markAllAsRead(userId) {
    await pool.query(
        `UPDATE notifications 
         SET is_read = true, read_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND is_read = false`,
        [userId]
    );
}

// ── DELETE NOTIFICATION ──
async function deleteNotification(id, userId) {
    await pool.query(
        `DELETE FROM notifications 
         WHERE id = $1 AND user_id = $2`,
        [id, userId]
    );
}

// ── GET NOTIFICATIONS ──
async function getNotifications(userId, limit = 20) {
    const result = await pool.query(
        `SELECT * FROM notifications 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [userId, limit]
    );
    return result.rows;
}

// ── GET UNREAD COUNT (using is_read) ──
async function getUnreadCount(userId) {
    const result = await pool.query(
        `SELECT COUNT(*) FROM notifications 
         WHERE user_id = $1 AND is_read = false`,
        [userId]
    );
    return parseInt(result.rows[0].count);
}

// ── GROUP SIMILAR NOTIFICATIONS ──
async function groupNotifications(userId) {
    const result = await pool.query(
        `SELECT type, COUNT(*) as count, MAX(created_at) as latest
         FROM notifications 
         WHERE user_id = $1 AND is_read = false
         GROUP BY type
         HAVING COUNT(*) > 1`,
        [userId]
    );
    return result.rows;
}

// ── GET NOTIFICATIONS BY TYPE ──
async function getNotificationsByType(userId, type, limit = 10) {
    const result = await pool.query(
        `SELECT * FROM notifications 
         WHERE user_id = $1 AND type = $2
         ORDER BY created_at DESC 
         LIMIT $3`,
        [userId, type, limit]
    );
    return result.rows;
}

// ── DELETE OLD NOTIFICATIONS (cleanup) ──
async function deleteOldNotifications(daysOld = 90) {
    const result = await pool.query(
        `DELETE FROM notifications 
         WHERE created_at < NOW() - INTERVAL '${daysOld} days'
         AND is_read = true
         RETURNING id`,
        []
    );
    return result.rows.length;
}

module.exports = {
    createNotification,
    getPendingNotifications,
    markAsQueued,
    markAsSent,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getNotifications,
    getUnreadCount,
    groupNotifications,
    getNotificationsByType,
    deleteOldNotifications,
};