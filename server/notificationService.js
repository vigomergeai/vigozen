// ──────────────────────────────────────────────────────────────
// NOTIFICATION SERVICE - Generate notification records
// ──────────────────────────────────────────────────────────────

const pool = require("../db");

const NOTIFICATION_TYPES = {
    LEAD_CREATED: 'lead_created',
    LEAD_ASSIGNED: 'lead_assigned',
    LEAD_STATUS_CHANGED: 'lead_status_changed',
    LEAD_CONVERTED: 'lead_converted',
    DEAL_WON: 'deal_won',
    DEAL_LOST: 'deal_lost',
    PROPOSAL_SENT: 'proposal_sent',
    FOLLOWUP_DUE: 'followup_due',
    REPORT_READY: 'report_ready',
    TRIAL_ENDING: 'trial_ending',
    TRIAL_EXPIRED: 'trial_expired',
    SUBSCRIPTION_ACTIVATED: 'subscription_activated',
    PAYMENT_FAILED: 'payment_failed',
    TICKET_CREATED: 'ticket_created',
    TICKET_CLOSED: 'ticket_closed',
    NEW_USER_ADDED: 'new_user_added',
    ROLE_UPDATED: 'role_updated',
    HIGH_VALUE_LEAD: 'high_value_lead',
    AI_SCORE_CHANGED: 'ai_score_changed',
    COMMENT_ADDED: 'comment_added',
    TASK_ASSIGNED: 'task_assigned',
    TASK_DUE: 'task_due',
    TASK_OVERDUE: 'task_overdue',
    TASK_COMPLETED: 'task_completed',
};

const PRIORITY_MAP = {
    high: ['payment_failed', 'trial_expired', 'deal_won', 'high_value_lead', 'deal_lost'],
    medium: ['lead_created', 'lead_assigned', 'report_ready', 'ticket_created', 'subscription_activated', 'lead_converted', 'ticket_closed'],
    low: ['followup_due', 'ai_score_changed', 'reminder', 'lead_status_changed', 'comment_added', 'task_assigned', 'task_due', 'task_overdue', 'task_completed'],
};

function getPriority(type) {
    if (PRIORITY_MAP.high.includes(type)) return 'high';
    if (PRIORITY_MAP.medium.includes(type)) return 'medium';
    return 'low';
}

function getDelay(priority) {
    return 0; // Immediate delivery for real-time popups
}

/**
 * Create notification for specific user
 */
async function createNotification(userId, type, title, message, link = null, priority = 'medium', metadata = {}) {
    try {
        let companyId = null;
        if (userId) {
            const userResult = await pool.query(
                `SELECT company_id FROM users WHERE id = $1`,
                [userId]
            );
            companyId = userResult.rows[0]?.company_id || null;
        }

        const scheduled_at = new Date();

        const result = await pool.query(
            `INSERT INTO notifications 
             (id, user_id, company_id, title, message, type, priority, status, link, metadata, scheduled_at, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'sent', $7, $8, $9, NOW())
             RETURNING *`,
            [userId, companyId, title, message, type, priority, link, JSON.stringify(metadata), scheduled_at]
        );

        console.log(`✅ Notification created: "${title}" for user ${userId || 'global'} (${priority} priority)`);
        return result.rows[0];
    } catch (error) {
        console.error('Failed to create notification:', error);
        return null;
    }
}

/**
 * Create company-wide notification for all users in a company
 */
async function createCompanyNotification(companyId, type, title, message, link = null, priority = 'medium', metadata = {}) {
    try {
        console.log(`📢 Creating single company notification for company ${companyId || 'global'}`);

        // Create a single company-level notification record (user_id NULL) visible to all company users
        const globalResult = await pool.query(
            `INSERT INTO notifications 
             (id, user_id, company_id, title, message, type, priority, status, link, metadata, scheduled_at, created_at)
             VALUES (gen_random_uuid(), NULL, $1, $2, $3, $4, $5, 'sent', $6, $7, NOW(), NOW())
             RETURNING *`,
            [companyId || null, title, message, type, priority, link, JSON.stringify(metadata)]
        );

        console.log(`✅ Created company notification ${globalResult.rows[0]?.id}`);
        return globalResult.rows;
    } catch (error) {
        console.error('Failed to create company notifications:', error);
        return [];
    }
}

/**
 * Create bulk notifications for multiple specific users
 */
async function createBulkNotifications(userIds, type, title, message, link = null, priority = 'medium', metadata = {}) {
    try {
        const results = [];
        for (const userId of userIds) {
            const notif = await createNotification(userId, type, title, message, link, priority, metadata);
            if (notif) results.push(notif);
        }
        console.log(`✅ Created ${results.length} bulk notifications`);
        return results;
    } catch (error) {
        console.error('Failed to create bulk notifications:', error);
        return [];
    }
}

// ── Helper function to get notification type label ──
function getTypeLabel(type) {
    const labels = {
        'lead_created': 'New Lead',
        'lead_assigned': 'Lead Assigned',
        'lead_status_changed': 'Status Changed',
        'lead_converted': 'Lead Converted',
        'deal_won': 'Deal Won 🎉',
        'deal_lost': 'Deal Lost',
        'proposal_sent': 'Proposal Sent',
        'followup_due': 'Follow-up Due',
        'report_ready': 'Report Ready',
        'trial_ending': 'Trial Ending',
        'trial_expired': 'Trial Expired',
        'subscription_activated': 'Subscription Activated',
        'payment_failed': 'Payment Failed ⚠️',
        'ticket_created': 'Ticket Created',
        'ticket_closed': 'Ticket Closed',
        'new_user_added': 'New User Added',
        'role_updated': 'Role Updated',
        'high_value_lead': 'High Value Lead ⭐',
        'ai_score_changed': 'AI Score Changed',
        'comment_added': 'New Comment',
        'task_assigned': 'Task Assigned',
        'task_due': 'Task Due Today',
        'task_overdue': 'Task Overdue',
        'task_completed': 'Task Completed',
    };
    return labels[type] || type;
}

module.exports = {
    createNotification,
    createCompanyNotification,
    createBulkNotifications,
    NOTIFICATION_TYPES,
    getPriority,
    getDelay,
    getTypeLabel,
};