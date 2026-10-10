// server/newLeadReminder.js
// Detects leads remaining in 'new' status for > 24 hours without contact,
// sends automated welcome outreach to customer, alerts salesperson,
// and escalates to managers/super admins.

const cron = require('node-cron');
const pool = require('../db');
const notificationService = require('./notificationService');
const emailService = require('./emailService');
const { recordActivity } = require('./activityService');

// Run every hour (at minute 15)
const CHECK_INTERVAL = '15 * * * *';

// Standardized SQL condition to exclude closed statuses regardless of spaces or underscores
const CLOSED_STATUS_CONDITION = `
    LOWER(REPLACE(l.status::text, ' ', '_')) NOT IN ('won', 'lost', 'unqualified', 'booking_done', 'token_done', 'converted')
    AND LOWER(l.status::text) NOT IN ('won', 'lost', 'unqualified', 'booking done', 'booking_done', 'token done', 'token_done', 'converted')
`;

async function checkNewLeadsUncontacted() {
    try {
        const query = `
            SELECT l.id, l.name, l.email, l.phone, l.company, l.value, l.owner_id, l.company_id, 
                   l.status, l.created_at, l.new_lead_notified,
                   u.name as owner_name, u.email as owner_email, u.manager_id,
                   c.name as company_name
            FROM leads l
            LEFT JOIN users u ON l.owner_id = u.id
            LEFT JOIN companies c ON l.company_id = c.id
            WHERE LOWER(l.status::text) = 'new'
              AND l.created_at <= NOW() - INTERVAL '24 hours'
              AND (l.new_lead_notified IS NULL OR l.new_lead_notified = false)
              AND ${CLOSED_STATUS_CONDITION}
            LIMIT 50
        `;

        const uncontactedLeads = await pool.query(query);

        for (const lead of uncontactedLeads.rows) {
            // 1. Send automated welcome outreach email to customer if email is present
            if (lead.email) {
                await emailService.sendNewLeadWelcomeEmail({
                    leadEmail: lead.email,
                    leadName: lead.name,
                    companyName: lead.company_name || lead.company,
                    salespersonName: lead.owner_name
                }).catch(err => console.error(`Failed to send new lead welcome email to ${lead.id}:`, err.message));

                await recordActivity({
                    leadId: lead.id,
                    companyId: lead.company_id,
                    user: 'System Automation',
                    action: 'automated_welcome_sent',
                    target: lead.name,
                    note: `Automated welcome outreach email sent to uncontacted lead (${lead.email})`,
                    type: 'email',
                    isCustomerAction: false
                });
            }

            // 2. Alert the assigned salesperson
            if (lead.owner_id) {
                await notificationService.createNotification(
                    lead.owner_id,
                    'followup_due',
                    `⚠️ New Lead Not Contacted (24h+)`,
                    `Lead "${lead.name}" has been in 'New' status for over 24 hours. Please contact them right away.`,
                    `/leads/${lead.id}`,
                    'high',
                    { lead_id: lead.id, lead_name: lead.name }
                ).catch(err => console.error("Salesperson 24h uncontacted notification error:", err));

                // Escalate to manager
                if (lead.manager_id) {
                    await notificationService.createNotification(
                        lead.manager_id,
                        'followup_due',
                        `🚨 Lead Uncontacted for >24h: ${lead.owner_name || 'Rep'}`,
                        `Lead "${lead.name}" assigned to ${lead.owner_name || 'sales rep'} has not been contacted after 24 hours.`,
                        `/leads/${lead.id}`,
                        'medium',
                        { lead_id: lead.id, salesperson_id: lead.owner_id }
                    ).catch(err => console.error("Manager 24h uncontacted notification error:", err));
                }
            } else {
                // If lead has no assigned owner, alert Super Admins
                await notificationService.notifySuperAdmins(
                    'followup_due',
                    `🚨 Unassigned Lead Uncontacted (24h+)`,
                    `Lead "${lead.name}" has been in 'New' status with no owner for over 24 hours. Please assign a sales rep.`,
                    `/leads/${lead.id}`,
                    'high',
                    { lead_id: lead.id, lead_name: lead.name }
                ).catch(err => console.error("Super Admin uncontacted lead notification error:", err));
            }

            // 3. Mark as notified
            await pool.query(
                `UPDATE leads 
                 SET new_lead_notified = true, 
                     last_new_lead_notified_at = NOW(), 
                     updated_at = NOW() 
                 WHERE id = $1`,
                [lead.id]
            ).catch(err => console.error("Update new_lead_notified flag error:", err));

            // Log activity
            await recordActivity({
                leadId: lead.id,
                companyId: lead.company_id,
                user: 'System Automation',
                action: 'uncontacted_lead_alert',
                target: lead.name,
                note: `Lead was uncontacted for 24+ hours. Reminder and outreach dispatched.`,
                type: 'system',
                isCustomerAction: false
            });
        }

        if (uncontactedLeads.rows.length > 0) {
            console.log(`⏳ Processed ${uncontactedLeads.rows.length} uncontacted 24h+ lead(s)`);
        }
        return { processed: uncontactedLeads.rows.length };
    } catch (error) {
        console.error('New lead reminder cron error:', error);
        return { error: error.message };
    }
}

cron.schedule(CHECK_INTERVAL, checkNewLeadsUncontacted);

console.log('⏰ New lead uncontacted reminder cron job started');

module.exports = {
    checkNewLeadsUncontacted
};
