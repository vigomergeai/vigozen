// server/meetingReminder.js
// Checks every minute for leads whose next_meeting_at has just passed,
// and notifies the assigned owner exactly once.

const cron = require('node-cron');
const pool = require('../db');
const notificationService = require('./notificationService');

const CHECK_INTERVAL = '* * * * *'; // every minute

cron.schedule(CHECK_INTERVAL, async () => {
    try {
        const dueLeads = await pool.query(
            `SELECT id, name, owner_id, next_meeting_at
             FROM leads
             WHERE next_meeting_at IS NOT NULL
               AND next_meeting_at <= NOW()
               AND meeting_notified = false
               AND owner_id IS NOT NULL`
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
                `UPDATE leads SET meeting_notified = true WHERE id = $1`,
                [lead.id]
            ).catch(err => console.error("Meeting notified flag update error:", err));
        }

        if (dueLeads.rows.length > 0) {
            console.log(`📅 Sent ${dueLeads.rows.length} meeting reminder(s)`);
        }
    } catch (error) {
        console.error('Meeting reminder cron error:', error);
    }
});

console.log('⏰ Meeting reminder cron job started');
