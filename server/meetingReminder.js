// server/meetingReminder.js
// Checks every minute for leads whose next_meeting_at has just passed,
// and notifies the assigned owner exactly once, skipping closed/dead leads.

const cron = require('node-cron');
const pool = require('../db');
const notificationService = require('./notificationService');
const { recordActivity } = require('./activityService');

const CHECK_INTERVAL = '* * * * *'; // every minute

// Standardized SQL condition to exclude closed statuses regardless of spaces or underscores
const CLOSED_STATUS_CONDITION = `
    LOWER(REPLACE(status::text, ' ', '_')) NOT IN ('won', 'lost', 'unqualified', 'booking_done', 'token_done', 'converted')
    AND LOWER(status::text) NOT IN ('won', 'lost', 'unqualified', 'booking done', 'booking_done', 'token done', 'token_done', 'converted')
`;

async function checkMeetingReminders() {
    try {
        const dueLeads = await pool.query(
            `SELECT id, name, owner_id, company_id, next_meeting_at, status
             FROM leads
             WHERE next_meeting_at IS NOT NULL
               AND next_meeting_at <= NOW()
               AND meeting_notified = false
               AND owner_id IS NOT NULL
               AND ${CLOSED_STATUS_CONDITION}`
        );

        for (const lead of dueLeads.rows) {
            await notificationService.createNotification(
                lead.owner_id,
                'meeting_reminder',
                "📅 Meeting Time",
                `It's time for your meeting with "${lead.name}"`,
                `/leads/${lead.id}`,
                'high',
                { lead_name: lead.name, meeting_time: lead.next_meeting_at }
            ).catch(err => console.error("Meeting reminder notification error:", err));

            await pool.query(
                `UPDATE leads SET meeting_notified = true, updated_at = NOW() WHERE id = $1`,
                [lead.id]
            ).catch(err => console.error("Meeting notified flag update error:", err));

            await recordActivity({
                leadId: lead.id,
                companyId: lead.company_id,
                user: 'System Automation',
                action: 'meeting_reminder_sent',
                target: lead.name,
                note: `Meeting reminder triggered for assigned owner`,
                type: 'meeting',
                isCustomerAction: false
            });
        }

        if (dueLeads.rows.length > 0) {
            console.log(`📅 Sent ${dueLeads.rows.length} meeting reminder(s)`);
        }
        return { processed: dueLeads.rows.length };
    } catch (error) {
        console.error('Meeting reminder cron error:', error);
        return { error: error.message };
    }
}

cron.schedule(CHECK_INTERVAL, checkMeetingReminders);

console.log('⏰ Meeting reminder cron job started');

module.exports = {
    checkMeetingReminders
};
