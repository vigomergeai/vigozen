// server/customerWaitingReminder.js
// Monitors leads where a customer replied and is waiting for a response from the salesperson.
// Triggers 1-hour warning alert to salesperson, and escalates to managers on 4-hour SLA breach.

const cron = require('node-cron');
const pool = require('../db');
const notificationService = require('./notificationService');
const { recordActivity } = require('./activityService');

// Run every 5 minutes
const CHECK_INTERVAL = '*/5 * * * *';

// Standardized SQL condition to exclude closed statuses regardless of spaces or underscores
const CLOSED_STATUS_CONDITION = `
    LOWER(REPLACE(l.status::text, ' ', '_')) NOT IN ('won', 'lost', 'unqualified', 'booking_done', 'token_done', 'converted')
    AND LOWER(l.status::text) NOT IN ('won', 'lost', 'unqualified', 'booking done', 'booking_done', 'token done', 'token_done', 'converted')
`;

// Configurable SLA thresholds (in hours)
const WARN_HOURS = parseInt(process.env.CUSTOMER_WAITING_WARN_HOURS || '2', 10); // default 2 hours
const REMINDER_HOURS = parseInt(process.env.CUSTOMER_WAITING_REMINDER_HOURS || '4', 10); // default 4 hours
const ESCALATION_HOURS = parseInt(process.env.CUSTOMER_WAITING_ESCALATION_HOURS || '24', 10); // default 24 hours

async function checkCustomerWaitingSLA() {
    try {
        const query = `
            SELECT l.id, l.name, l.email, l.phone, l.owner_id, l.company_id, 
                   l.customer_waiting, l.customer_waiting_since, 
                   l.customer_waiting_warned, l.customer_waiting_reminded, l.customer_waiting_escalated,
                   u.name as owner_name, u.email as owner_email, u.manager_id,
                   c.name as company_name,
                   ROUND(EXTRACT(EPOCH FROM (NOW() - l.customer_waiting_since)) / 60) as waiting_minutes,
                   (
                       SELECT message FROM customer_messages 
                       WHERE lead_id = l.id AND sender_type = 'customer' 
                       ORDER BY created_at DESC LIMIT 1
                   ) as latest_customer_message
            FROM leads l
            LEFT JOIN users u ON l.owner_id = u.id
            LEFT JOIN companies c ON l.company_id = c.id
            WHERE l.customer_waiting = true
              AND l.customer_waiting_since IS NOT NULL
              AND ${CLOSED_STATUS_CONDITION}
        `;

        const waitingLeads = await pool.query(query);

        for (const lead of waitingLeads.rows) {
            const minutes = parseInt(lead.waiting_minutes, 10) || 0;
            const hours = Math.floor(minutes / 60);
            const msgSnippet = lead.latest_customer_message 
                ? (lead.latest_customer_message.length > 80 ? lead.latest_customer_message.substring(0, 77) + '...' : lead.latest_customer_message)
                : 'Customer is waiting for a reply';

            // Stage 3: Escalation Threshold (e.g. 24 Hours or configured)
            if (hours >= ESCALATION_HOURS && !lead.customer_waiting_escalated) {
                let escalated = false;
                if (lead.manager_id) {
                    await notificationService.createNotification(
                        lead.manager_id,
                        'followup_due',
                        `🚨 Manager Alert: Customer Waiting ${hours}+ Hours`,
                        `Customer "${lead.name}" has been waiting for ${hours} hours for a reply from ${lead.owner_name || 'assigned rep'}. Message: "${msgSnippet}"`,
                        `/leads/${lead.id}`,
                        'high',
                        { lead_id: lead.id, lead_name: lead.name, waiting_hours: hours, salesperson_id: lead.owner_id }
                    ).then(() => { escalated = true; })
                    .catch(err => console.error("Manager SLA breach notification error:", err));
                }

                if (!escalated) {
                    await notificationService.notifySuperAdmins(
                        'followup_due',
                        `🚨 SLA Breach: Customer Waiting ${hours}+ Hours`,
                        `Customer "${lead.name}" has been waiting for ${hours} hours without reply from ${lead.owner_name || 'unassigned'}. Message: "${msgSnippet}"`,
                        `/leads/${lead.id}`,
                        'high',
                        { lead_id: lead.id, waiting_hours: hours }
                    ).catch(err => console.error("Super Admin SLA breach notification error:", err));
                }

                await pool.query(
                    `UPDATE leads SET customer_waiting_escalated = true WHERE id = $1`,
                    [lead.id]
                );

                await recordActivity({
                    leadId: lead.id,
                    companyId: lead.company_id,
                    user: 'SLA Monitor',
                    action: 'sla_breach_escalation',
                    target: lead.name,
                    note: `Customer response SLA breached (${hours}+ hours waiting). Escalated to leadership.`,
                    type: 'system',
                    isCustomerAction: false
                });

            // Stage 2: Urgent Reminder (e.g. 4 Hours)
            } else if (hours >= REMINDER_HOURS && !lead.customer_waiting_reminded) {
                if (lead.owner_id) {
                    await notificationService.createNotification(
                        lead.owner_id,
                        'followup_due',
                        `🚨 URGENT: Customer Waiting ${hours}+ Hours`,
                        `Customer "${lead.name}" is still waiting for your reply (${hours} hours). Message: "${msgSnippet}". Please respond now!`,
                        `/leads/${lead.id}`,
                        'high',
                        { lead_id: lead.id, waiting_hours: hours }
                    ).catch(err => console.error("Salesperson urgent SLA notification error:", err));
                }

                await pool.query(
                    `UPDATE leads SET customer_waiting_reminded = true WHERE id = $1`,
                    [lead.id]
                );

            // Stage 1: Initial Warning (e.g. 2 Hours)
            } else if (hours >= WARN_HOURS && !lead.customer_waiting_warned) {
                if (lead.owner_id) {
                    await notificationService.createNotification(
                        lead.owner_id,
                        'followup_due',
                        `⚠️ Customer waiting for response`,
                        `${lead.name} replied ${hours} hour(s) ago: "${msgSnippet}". Click to reply.`,
                        `/leads/${lead.id}`,
                        'high',
                        { lead_id: lead.id, waiting_minutes: minutes }
                    ).catch(err => console.error("Salesperson waiting warning error:", err));
                } else {
                    await notificationService.notifySuperAdmins(
                        'followup_due',
                        `⚠️ Unassigned Customer Waiting`,
                        `Customer "${lead.name}" replied ${hours} hour(s) ago and has no assigned rep: "${msgSnippet}"`,
                        `/leads/${lead.id}`,
                        'medium',
                        { lead_id: lead.id }
                    ).catch(err => console.error("SuperAdmin unassigned waiting notification error:", err));
                }

                await pool.query(
                    `UPDATE leads SET customer_waiting_warned = true WHERE id = $1`,
                    [lead.id]
                );
            }
        }

        if (waitingLeads.rows.length > 0) {
            console.log(`💬 Monitored ${waitingLeads.rows.length} lead(s) with customer waiting`);
        }
        return { processed: waitingLeads.rows.length };
    } catch (error) {
        console.error('Customer waiting monitor cron error:', error);
        return { error: error.message };
    }
}

cron.schedule(CHECK_INTERVAL, checkCustomerWaitingSLA);

console.log('⏰ Customer waiting reminder cron job started');

module.exports = {
    checkCustomerWaitingSLA
};
