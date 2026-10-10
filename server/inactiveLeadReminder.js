// server/inactiveLeadReminder.js
// Detects active leads that have had no CRM activity for a set period (default 7 days),
// sends re-engagement outreach to the customer, alerts the assigned salesperson,
// and notifies sales managers / admins.

const cron = require('node-cron');
const pool = require('../db');
const notificationService = require('./notificationService');
const emailService = require('./emailService');
const { recordActivity } = require('./activityService');

// Check every hour (at minute 30)
const CHECK_INTERVAL = '30 * * * *';
const INACTIVE_DAYS = 7;

// Standardized SQL condition to exclude closed statuses regardless of spaces or underscores
const CLOSED_STATUS_CONDITION = `
    LOWER(REPLACE(l.status::text, ' ', '_')) NOT IN ('won', 'lost', 'unqualified', 'booking_done', 'token_done', 'converted')
    AND LOWER(l.status::text) NOT IN ('won', 'lost', 'unqualified', 'booking done', 'booking_done', 'token done', 'token_done', 'converted')
`;

async function checkInactiveLeads() {
    try {
        const inactiveQuery = `
            SELECT l.id, l.name, l.email, l.phone, l.company, l.value, l.owner_id, l.company_id, 
                   l.status, l.last_activity_date, l.created_at, l.last_inactive_notified_at,
                   u.name as owner_name, u.email as owner_email, u.manager_id,
                   c.name as company_name
            FROM leads l
            LEFT JOIN users u ON l.owner_id = u.id
            LEFT JOIN companies c ON l.company_id = c.id
            WHERE COALESCE(l.last_activity_date, l.updated_at, l.created_at) <= NOW() - INTERVAL '${INACTIVE_DAYS} days'
              AND (
                  l.last_inactive_notified_at IS NULL 
                  OR l.last_inactive_notified_at <= NOW() - INTERVAL '${INACTIVE_DAYS} days'
              )
              AND ${CLOSED_STATUS_CONDITION}
            LIMIT 50
        `;

        const inactiveLeads = await pool.query(inactiveQuery);

        for (const lead of inactiveLeads.rows) {
            // 1. Send automated re-engagement email to the customer if email is available
            if (lead.email) {
                await emailService.sendLeadReengagementEmail({
                    leadEmail: lead.email,
                    leadName: lead.name,
                    companyName: lead.company_name || lead.company,
                    salespersonName: lead.owner_name
                }).catch(err => console.error(`Failed to send re-engagement email to lead ${lead.id}:`, err.message));

                await recordActivity({
                    leadId: lead.id,
                    companyId: lead.company_id,
                    user: 'System Automation',
                    action: 'reengagement_email_sent',
                    target: lead.name,
                    note: `Automated re-engagement email sent to inactive customer (${lead.email})`,
                    type: 'email',
                    isCustomerAction: false
                });
            }

            // 2. Alert the assigned salesperson
            if (lead.owner_id) {
                await notificationService.createNotification(
                    lead.owner_id,
                    'followup_due',
                    `⚠️ Lead Inactive for ${INACTIVE_DAYS}+ Days`,
                    `Lead "${lead.name}" has had no activity for over ${INACTIVE_DAYS} days. Please reconnect or update lead status.`,
                    `/leads/${lead.id}`,
                    'medium',
                    { lead_id: lead.id, lead_name: lead.name, inactive_days: INACTIVE_DAYS }
                ).catch(err => console.error("Inactive lead salesperson notification error:", err));

                // If lead has manager, inform them too
                if (lead.manager_id) {
                    await notificationService.createNotification(
                        lead.manager_id,
                        'followup_due',
                        `⚠️ Inactive Lead: ${lead.owner_name || 'Rep'}`,
                        `Lead "${lead.name}" assigned to ${lead.owner_name || 'rep'} has been inactive for ${INACTIVE_DAYS} days.`,
                        `/leads/${lead.id}`,
                        'low',
                        { lead_id: lead.id, salesperson_id: lead.owner_id }
                    ).catch(err => console.error("Inactive lead manager notification error:", err));
                }
            } else {
                // If unassigned, alert super admins
                await notificationService.notifySuperAdmins(
                    'followup_due',
                    `⚠️ Unassigned Lead Inactive for ${INACTIVE_DAYS}+ Days`,
                    `Unassigned lead "${lead.name}" has been inactive for ${INACTIVE_DAYS} days.`,
                    `/leads/${lead.id}`,
                    'low',
                    { lead_id: lead.id }
                ).catch(err => console.error("Unassigned inactive lead notification error:", err));
            }

            // 3. Mark last_inactive_notified_at
            await pool.query(
                `UPDATE leads SET last_inactive_notified_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [lead.id]
            ).catch(err => console.error("Update last_inactive_notified_at error:", err));

            // Log activity
            await recordActivity({
                leadId: lead.id,
                companyId: lead.company_id,
                user: 'System Automation',
                action: 'inactivity_check',
                target: lead.name,
                note: `Lead flagged as inactive (${INACTIVE_DAYS}+ days without touchpoints). Outreach and reminder triggered.`,
                type: 'system',
                isCustomerAction: false
            });
        }

        if (inactiveLeads.rows.length > 0) {
            console.log(`💤 Processed ${inactiveLeads.rows.length} inactive lead(s)`);
        }
        return inactiveLeads.rows;
    } catch (error) {
        console.error('Inactive lead cron error:', error);
        return [];
    }
}

cron.schedule(CHECK_INTERVAL, checkInactiveLeads);
console.log('⏰ Inactive lead reminder cron job started');

module.exports = { checkInactiveLeads };
