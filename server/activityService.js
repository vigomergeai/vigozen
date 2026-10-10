// server/activityService.js
// Central service to record CRM activities into the `activities` table
// and keep `leads.last_activity_date` in sync across all CRM interactions.

const pool = require("../db");

/**
 * Record an activity for a lead or deal and update last_activity_date
 * 
 * @param {Object} params
 * @param {string} [params.leadId] - Lead UUID
 * @param {string} [params.dealId] - Deal UUID
 * @param {string} [params.companyId] - Company UUID
 * @param {string} [params.user] - Name or email of the user/system initiating action
 * @param {string} [params.action] - e.g. 'created', 'updated', 'status_changed', 'followup_scheduled', 'customer_replied', 'outreach_sent'
 * @param {string} [params.target] - Target description, e.g. lead name or deal title
 * @param {string} [params.note] - Human readable note/comment
 * @param {string} [params.type] - 'call' | 'email' | 'meeting' | 'note' | 'status_change' | 'system' | 'message'
 * @param {number} [params.value] - Optional monetary or numeric value
 * @param {string} [params.status] - Activity status, e.g. 'completed', 'pending'
 * @param {Date|string} [params.dueDate] - Optional due date
 * @param {boolean} [params.isCustomerAction] - If true, do not clear customer_waiting flag
 */
async function recordActivity({
    leadId = null,
    dealId = null,
    companyId = null,
    userId = null,
    user_id = null,
    user = 'System',
    action = 'updated',
    target = 'Lead',
    note = '',
    type = 'note',
    value = null,
    status = 'completed',
    dueDate = null,
    isCustomerAction = false
}) {
    try {
        const resolvedUserId = userId || user_id || null;
        const VALID_TYPES = ['call', 'meeting', 'email', 'task', 'note', 'status_change', 'system', 'message', 'outreach', 'whatsapp', 'followup'];
        const normalizedType = VALID_TYPES.includes(type) ? type : 'note';

        // If companyId is not provided, try to look it up from lead or deal
        let resolvedCompanyId = companyId;
        if (!resolvedCompanyId && leadId) {
            const lRes = await pool.query("SELECT company_id FROM leads WHERE id = $1", [leadId]);
            if (lRes.rows.length > 0) resolvedCompanyId = lRes.rows[0].company_id;
        } else if (!resolvedCompanyId && dealId) {
            const dRes = await pool.query("SELECT company_id FROM deals WHERE id = $1", [dealId]);
            if (dRes.rows.length > 0) resolvedCompanyId = dRes.rows[0].company_id;
        }

        const insertQuery = `
            INSERT INTO activities (
                id,
                lead_id,
                deal_id,
                company_id,
                user_id,
                "user",
                action,
                target,
                note,
                type,
                value,
                status,
                due_date,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(),
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
            ) RETURNING *
        `;

        const result = await pool.query(insertQuery, [
            leadId,
            dealId,
            resolvedCompanyId,
            resolvedUserId,
            user,
            action,
            target,
            note,
            normalizedType,
            value,
            status,
            dueDate
        ]);

        // When activity is on a lead:
        if (leadId) {
            if (isCustomerAction) {
                // If it's a customer action, update last_activity_date
                await pool.query(
                    `UPDATE leads 
                     SET last_activity_date = NOW(), updated_at = NOW() 
                     WHERE id = $1`,
                    [leadId]
                );
            } else {
                // If it's a salesperson/team action, update last_activity_date AND clear customer_waiting
                await pool.query(
                    `UPDATE leads 
                     SET last_activity_date = NOW(), 
                         customer_waiting = false,
                         customer_waiting_since = NULL,
                         customer_waiting_escalated = false,
                         updated_at = NOW() 
                     WHERE id = $1`,
                    [leadId]
                );
            }
        }

        return result.rows[0];
    } catch (err) {
        console.error("❌ Failed to record activity:", err.message);
        return null;
    }
}

/**
 * Get activity timeline for a lead
 */
async function getLeadActivities(leadId) {
    try {
        const result = await pool.query(
            `SELECT * FROM activities 
             WHERE lead_id = $1 
             ORDER BY created_at DESC 
             LIMIT 100`,
            [leadId]
        );
        return result.rows;
    } catch (err) {
        console.error("❌ Failed to get lead activities:", err.message);
        return [];
    }
}

module.exports = {
    recordActivity,
    getLeadActivities
};
