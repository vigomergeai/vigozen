const pool = require("../db");
const notificationService = require("./notificationService");

/**
 * Transfer all data from a leaving employee to a target employee
 * @param {string} leavingUserId - The user ID of the employee who is leaving
 * @param {string} targetUserId - The user ID of the employee who will receive the data
 * @param {string} performedBy - The user ID who is performing the transfer
 * @returns {Object} Transfer summary
 */
const transferEmployeeData = async (leavingUserId, targetUserId, performedBy) => {
    const transferSummary = {
        leads: 0,
        deals: 0,
        tasks: 0,
        tickets: 0,
        activities: 0,
        calendar_events: 0,
        comments: 0,
        integrations: 0
    };

    try {
        // Verify both users exist
        const userCheck = await pool.query(
            "SELECT id, name, email FROM users WHERE id = ANY($1::uuid[])",
            [leavingUserId, targetUserId]
        );

        if (userCheck.rows.length !== 2) {
            throw new Error("One or both users not found");
        }

        const leavingUser = userCheck.rows.find(u => u.id === leavingUserId);
        const targetUser = userCheck.rows.find(u => u.id === targetUserId);

        // Get company_id for notifications
        const companyRes = await pool.query(
            "SELECT company_id FROM users WHERE id = $1",
            [leavingUserId]
        );
        const companyId = companyRes.rows[0]?.company_id || null;

        // 1. Transfer Leads
        const leadResult = await pool.query(
            `UPDATE leads 
       SET owner_id = $1, updated_at = NOW() 
       WHERE owner_id = $2 
       RETURNING id`,
            [targetUserId, leavingUserId]
        );
        transferSummary.leads = leadResult.rowCount;

        // 2. Transfer Deals
        const dealResult = await pool.query(
            `UPDATE deals 
       SET owner_id = $1, updated_at = NOW() 
       WHERE owner_id = $2 
       RETURNING id`,
            [targetUserId, leavingUserId]
        );
        transferSummary.deals = dealResult.rowCount;

        // 3. Transfer Tasks (assigned_to)
        const taskResult = await pool.query(
            `UPDATE tasks 
       SET assigned_to = $1, updated_at = NOW() 
       WHERE assigned_to = $2 
       RETURNING id`,
            [targetUserId, leavingUserId]
        );
        transferSummary.tasks = taskResult.rowCount;

        // 4. Transfer Tasks (assigned_by)
        const taskByResult = await pool.query(
            `UPDATE tasks 
       SET assigned_by = $1, updated_at = NOW() 
       WHERE assigned_by = $2 
       RETURNING id`,
            [targetUserId, leavingUserId]
        );
        transferSummary.tasks += taskByResult.rowCount;

        // 5. Transfer Tickets (owner_id)
        const ticketOwnerResult = await pool.query(
            `UPDATE tickets 
       SET owner_id = $1, updated_at = NOW() 
       WHERE owner_id = $2 
       RETURNING id`,
            [targetUserId, leavingUserId]
        );
        transferSummary.tickets = ticketOwnerResult.rowCount;

        // 6. Transfer Tickets (assigned_to)
        const ticketAssignedResult = await pool.query(
            `UPDATE tickets 
       SET assigned_to = $1, updated_at = NOW() 
       WHERE assigned_to = $2 
       RETURNING id`,
            [targetUserId, leavingUserId]
        );
        transferSummary.tickets += ticketAssignedResult.rowCount;

        // 7. Transfer Activities (through deals)
        const activityResult = await pool.query(
            `UPDATE activities a 
       SET deal_id = d2.id, updated_at = NOW()
       FROM deals d1, deals d2
       WHERE a.deal_id = d1.id 
       AND d1.owner_id = $2 
       AND d2.id = d1.id 
       AND d2.owner_id = $1
       RETURNING a.id`,
            [targetUserId, leavingUserId]
        );
        transferSummary.activities = activityResult.rowCount;

        // 8. Transfer Calendar Events
        const calendarResult = await pool.query(
            `UPDATE calendar_events 
       SET created_by = $1, updated_at = NOW() 
       WHERE created_by = $2 
       RETURNING id`,
            [targetUserId, leavingUserId]
        );
        transferSummary.calendar_events = calendarResult.rowCount;

        // 9. Transfer Integrations
        const integrationResult = await pool.query(
            `UPDATE integrations 
       SET user_id = $1, updated_at = NOW() 
       WHERE user_id = $2 
       RETURNING id`,
            [targetUserId, leavingUserId]
        );
        transferSummary.integrations = integrationResult.rowCount;

        // 10. Update lead_comments to preserve user_name but note the transfer
        // (We keep the original user_name for historical accuracy)

        // Log the transfer in audit_logs
        await pool.query(
            `INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, changes, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'TRANSFER', 'user', $3, $4, NOW())`,
            [
                performedBy,
                `System`,
                leavingUserId,
                JSON.stringify({
                    action: 'employee_data_transfer',
                    from_user: leavingUser,
                    to_user: targetUser,
                    transfer_summary: transferSummary
                })
            ]
        );

        // Send notification to target user
        if (companyId && targetUserId) {
            const totalItems = Object.values(transferSummary).reduce((a, b) => a + b, 0);
            if (totalItems > 0) {
                await notificationService.createNotification(
                    targetUserId,
                    'data_transfer',
                    "📦 Data Transfer Completed",
                    `You have received ${totalItems} items from ${leavingUser.name}'s account`,
                    `/users/${leavingUserId}`,
                    'medium',
                    {
                        from_user: leavingUser.name,
                        transfer_summary: transferSummary
                    }
                ).catch(err => console.error("Transfer notification error:", err));
            }
        }

        return {
            success: true,
            message: `Successfully transferred data from ${leavingUser.name} to ${targetUser.name}`,
            from_user: leavingUser,
            to_user: targetUser,
            transfer_summary: transferSummary
        };

    } catch (err) {
        console.error("TRANSFER EMPLOYEE DATA ERROR:", err);
        throw err;
    }
};

/**
 * Get all subordinates of a manager with their details
 * @param {string} managerId - The manager's user ID
 * @param {string} teamId - Optional team ID
 * @returns {Array} List of subordinates with their details
 */
const getSubordinates = async (managerId, teamId = null) => {
    try {
        const subordinateIds = await getSubordinateUserIds(managerId, teamId);

        // Exclude the manager themselves from the list
        const idsWithoutManager = subordinateIds.filter(id => id !== managerId);

        if (idsWithoutManager.length === 0) {
            return [];
        }

        const result = await pool.query(
            `SELECT 
        id, name, email, role, department, manager_id, team_id, 
        is_active, status, created_at, employee_id, avatar_url,
        trial_start, trial_end, subscription_status, plan_type, payment_status
       FROM users 
       WHERE id = ANY($1::uuid[])
       ORDER BY role DESC, name ASC`,
            [idsWithoutManager]
        );

        return result.rows;
    } catch (err) {
        console.error("GET SUBORDINATES ERROR:", err);
        throw err;
    }
};

/**
 * Get subordinate user IDs (helper function - same as in server.js)
 */
const getSubordinateUserIds = async (userId, teamId) => {
    if (!teamId) {
        try {
            const userRes = await pool.query("SELECT team_id FROM users WHERE id = $1", [userId]);
            if (userRes.rows.length > 0) {
                teamId = userRes.rows[0].team_id;
            }
        } catch (err) {
            console.error("Error fetching user team_id:", err);
        }
    }

    const params = [userId];
    let query = '';
    if (teamId) {
        query = `
      WITH RECURSIVE subordinates AS (
         SELECT id FROM users WHERE id = $1
         UNION
         SELECT id FROM users WHERE team_id = $2
         UNION ALL
         SELECT u.id FROM users u
         INNER JOIN subordinates s ON u.manager_id = s.id
      )
      SELECT DISTINCT id FROM subordinates
    `;
        params.push(teamId);
    } else {
        query = `
      WITH RECURSIVE subordinates AS (
         SELECT id FROM users WHERE id = $1
         UNION ALL
         SELECT u.id FROM users u
         INNER JOIN subordinates s ON u.manager_id = s.id
      )
      SELECT DISTINCT id FROM subordinates
    `;
    }

    try {
        const result = await pool.query(query, params);
        const ids = result.rows.map(r => r.id);
        if (!ids.includes(userId)) {
            ids.push(userId);
        }
        return ids;
    } catch (err) {
        console.error("getSubordinateUserIds error:", err);
        return [userId];
    }
};

/**
 * Get team statistics for a manager
 * @param {string} managerId - The manager's user ID
 * @returns {Object} Team statistics
 */
const getTeamStatistics = async (managerId) => {
    try {
        const subordinateIds = await getSubordinateUserIds(managerId);
        const idsWithoutManager = subordinateIds.filter(id => id !== managerId);

        if (idsWithoutManager.length === 0) {
            return {
                total_members: 0,
                active_members: 0,
                inactive_members: 0,
                by_role: {},
                by_department: {}
            };
        }

        // Get team composition
        const teamResult = await pool.query(
            `SELECT 
        COUNT(*) as total_members,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_members,
        COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_members,
        role,
        department,
        COUNT(*) as count
       FROM users 
       WHERE id = ANY($1::uuid[])
       GROUP BY role, department`,
            [idsWithoutManager]
        );

        const stats = {
            total_members: teamResult.rows[0]?.total_members || 0,
            active_members: teamResult.rows[0]?.active_members || 0,
            inactive_members: teamResult.rows[0]?.inactive_members || 0,
            by_role: {},
            by_department: {}
        };

        teamResult.rows.forEach(row => {
            stats.by_role[row.role] = (stats.by_role[row.role] || 0) + parseInt(row.count);
            stats.by_department[row.department] = (stats.by_department[row.department] || 0) + parseInt(row.count);
        });

        return stats;
    } catch (err) {
        console.error("GET TEAM STATISTICS ERROR:", err);
        throw err;
    }
};

module.exports = {
    transferEmployeeData,
    getSubordinates,
    getTeamStatistics
};