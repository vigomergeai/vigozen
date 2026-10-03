// server/followupReminder.js
// Checks periodically for leads whose next_followup has passed,
// and sends overdue reminders to the assigned salesperson and sales managers.

const cron = require('node-cron');
const pool = require('../db');
const notificationService = require('./notificationService');

// Run every minute to detect overdue follow-ups
const CHECK_INTERVAL = '* * * * *';

cron.schedule(CHECK_INTERVAL, async () => {
    try {
        // Query active leads where next_followup is past, not yet notified, and lead is active
        const overdueLeads = await pool.query(
            `SELECT id, name, company, value, owner_id, company_id, next_followup, status
             FROM leads
             WHERE next_followup IS NOT NULL
               AND next_followup <= NOW()
               AND (followup_notified IS NULL OR followup_notified = false)
               AND LOWER(status::text) NOT IN ('won', 'booking done', 'token done', 'lost', 'unqualified')`
        );

        for (const lead of overdueLeads.rows) {
            const formattedTime = new Date(lead.next_followup).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            // 1. Notify assigned salesperson
            if (lead.owner_id) {
                await notificationService.createNotification(
                    lead.owner_id,
                    'followup_due',
                    "⏰ Follow-up Overdue",
                    `Follow-up overdue for "${lead.name}" (Scheduled: ${formattedTime})`,
                    `/leads`,
                    'high',
                    { lead_id: lead.id, lead_name: lead.name, next_followup: lead.next_followup }
                ).catch(err => console.error("Salesperson follow-up notification error:", err));
            }

            // 2. Mark as notified in database
            await pool.query(
                `UPDATE leads SET followup_notified = true WHERE id = $1`,
                [lead.id]
            ).catch(err => console.error("Followup notified flag update error:", err));
        }

        if (overdueLeads.rows.length > 0) {
            console.log(`⏰ Sent ${overdueLeads.rows.length} overdue follow-up reminder(s)`);
        }
    } catch (error) {
        console.error('Follow-up reminder cron error:', error);
    }
});

console.log('⏰ Follow-up reminder cron job started');

module.exports = {};
