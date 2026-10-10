// server/followupReminder.js
// Checks periodically for leads whose next_followup has passed,
// automatically sends customer outreach, alerts the salesperson,
// escalates to managers/super admins if ignored or unassigned,
// and repeats notifications at set intervals.

const cron = require('node-cron');
const pool = require('../db');
const notificationService = require('./notificationService');
const emailService = require('./emailService');
const { recordActivity } = require('./activityService');

// Run every minute to detect overdue follow-ups
const CHECK_INTERVAL = '* * * * *';

// Maximum repeat reminders before stopping
const MAX_REMINDERS = 3;
// Interval between repeated reminders: 2 hours (in ms)
const REPEAT_INTERVAL_HOURS = 2;

// Standardized SQL condition to exclude closed statuses regardless of spaces or underscores
const CLOSED_STATUS_CONDITION = `
    LOWER(REPLACE(l.status::text, ' ', '_')) NOT IN ('won', 'lost', 'unqualified', 'booking_done', 'token_done', 'converted')
    AND LOWER(l.status::text) NOT IN ('won', 'lost', 'unqualified', 'booking done', 'booking_done', 'token done', 'token_done', 'converted')
`;

async function checkFollowupReminders() {
    try {
        // Query active leads where next_followup is past
        // Either initial reminder (count = 0) OR due for repeat reminder (interval passed)
        const overdueQuery = `
            SELECT l.id, l.name, l.email, l.phone, l.company, l.value, l.owner_id, l.company_id, 
                   l.next_followup, l.status, l.followup_reminder_count, l.last_followup_reminder_at,
                   u.name as owner_name, u.email as owner_email, u.manager_id,
                   c.name as company_name
            FROM leads l
            LEFT JOIN users u ON l.owner_id = u.id
            LEFT JOIN companies c ON l.company_id = c.id
            WHERE l.next_followup IS NOT NULL
              AND l.next_followup <= NOW()
              AND (
                  -- 1. Initial reminder
                  COALESCE(l.followup_reminder_count, 0) = 0
                  OR 
                  -- 2. Repeat escalation reminder if ignored for >= 2 hours
                  (
                      COALESCE(l.followup_reminder_count, 0) < ${MAX_REMINDERS}
                      AND l.last_followup_reminder_at <= NOW() - INTERVAL '${REPEAT_INTERVAL_HOURS} hours'
                  )
              )
              AND ${CLOSED_STATUS_CONDITION}
        `;

        const overdueLeads = await pool.query(overdueQuery);

        for (const lead of overdueLeads.rows) {
            const currentCount = lead.followup_reminder_count || 0;
            const newCount = currentCount + 1;
            const formattedTime = new Date(lead.next_followup).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const isInitial = currentCount === 0;

            // 1. Initial outreach to the customer if email is present
            if (isInitial && lead.email) {
                await emailService.sendLeadFollowupMissedEmail({
                    leadEmail: lead.email,
                    leadName: lead.name,
                    companyName: lead.company_name || lead.company,
                    salespersonName: lead.owner_name
                }).catch(err => console.error(`Failed to send missed follow-up email to lead ${lead.id}:`, err.message));

                // Log customer outreach activity
                await recordActivity({
                    leadId: lead.id,
                    companyId: lead.company_id,
                    user: 'System Automation',
                    action: 'customer_outreach',
                    target: lead.name,
                    note: `Automated missed follow-up outreach email sent to customer (${lead.email})`,
                    type: 'email',
                    isCustomerAction: false
                });
            }

            // 2. Handle notification to salesperson (if assigned)
            if (lead.owner_id) {
                const title = isInitial 
                    ? "⏰ Follow-up Overdue" 
                    : `⚠️ Overdue Follow-up Reminder #${newCount}`;
                const message = isInitial
                    ? `Follow-up overdue for "${lead.name}" (Scheduled: ${formattedTime})`
                    : `Follow-up for "${lead.name}" is still pending after ${currentCount * REPEAT_INTERVAL_HOURS} hours without action. Please contact them.`;

                await notificationService.createNotification(
                    lead.owner_id,
                    'followup_due',
                    title,
                    message,
                    `/leads/${lead.id}`,
                    isInitial ? 'high' : 'high',
                    { lead_id: lead.id, lead_name: lead.name, next_followup: lead.next_followup, reminder_count: newCount }
                ).catch(err => console.error("Salesperson follow-up notification error:", err));
            }

            // 3. Manager / Super Admin Escalation:
            // Alert manager if:
            // a) Salesperson ignored previous reminder(s) (newCount > 1), OR
            // b) Lead has NO assigned owner (owner_id IS NULL)
            if (!isInitial && lead.owner_id) {
                // Escalate to salesperson's manager
                let managerNotified = false;
                if (lead.manager_id) {
                    await notificationService.createNotification(
                        lead.manager_id,
                        'followup_due',
                        `🚨 Escalation: Overdue Follow-up Ignored`,
                        `Salesperson ${lead.owner_name || 'assigned'} has not completed scheduled follow-up with "${lead.name}" (Overdue since ${formattedTime}).`,
                        `/leads/${lead.id}`,
                        'high',
                        { lead_id: lead.id, salesperson_id: lead.owner_id, salesperson_name: lead.owner_name }
                    ).then(() => { managerNotified = true; })
                    .catch(err => console.error("Manager escalation notification error:", err));
                }

                // If no specific manager, alert super admins
                if (!managerNotified) {
                    await notificationService.notifySuperAdmins(
                        'followup_due',
                        `🚨 Escalation: Overdue Follow-up Ignored`,
                        `Lead "${lead.name}" follow-up assigned to ${lead.owner_name || 'rep'} is overdue and unattended.`,
                        `/leads/${lead.id}`,
                        'high',
                        { lead_id: lead.id, salesperson_id: lead.owner_id }
                    ).catch(err => console.error("SuperAdmin follow-up escalation error:", err));
                }
            } else if (!lead.owner_id) {
                // Unassigned lead overdue -> Alert Super Admins / Company Admins
                await notificationService.notifySuperAdmins(
                    'followup_due',
                    `⏰ Unassigned Lead Follow-up Overdue`,
                    `Unassigned lead "${lead.name}" had a follow-up scheduled for ${formattedTime}. Please assign an owner.`,
                    `/leads/${lead.id}`,
                    'high',
                    { lead_id: lead.id, lead_name: lead.name }
                ).catch(err => console.error("Unassigned lead follow-up notification error:", err));
            }

            // 4. Update reminder tracking in database
            await pool.query(
                `UPDATE leads 
                 SET followup_notified = true,
                     followup_reminder_count = $1,
                     last_followup_reminder_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $2`,
                [newCount, lead.id]
            ).catch(err => console.error("Followup reminder update error:", err));

            // Log activity in activities table
            await recordActivity({
                leadId: lead.id,
                companyId: lead.company_id,
                user: 'System Automation',
                action: isInitial ? 'followup_overdue_notified' : 'followup_escalated',
                target: lead.name,
                note: isInitial 
                    ? `Overdue follow-up alert dispatched (Assigned: ${lead.owner_name || 'Unassigned'})`
                    : `Escalation reminder #${newCount} sent (Overdue since ${formattedTime})`,
                type: 'system',
                isCustomerAction: false
            });
        }

        if (overdueLeads.rows.length > 0) {
            console.log(`⏰ Processed ${overdueLeads.rows.length} overdue follow-up action(s)`);
        }
        return overdueLeads.rows;
    } catch (error) {
        console.error('Follow-up reminder cron error:', error);
        return [];
    }
}

cron.schedule(CHECK_INTERVAL, checkFollowupReminders);
console.log('⏰ Follow-up reminder cron job started');

module.exports = { checkFollowupReminders };
