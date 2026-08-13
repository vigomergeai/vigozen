const pool = require("../db");

// ── REPORTING RULES ──
const REPORTING_RULES = {
    'admin': ['Super Admin', 'super_admin', 'admin'],
    'Sales Manager': ['admin'],
    'sales_manager': ['admin'],
    'Lead Manager': ['admin'],
    'lead_manager': ['admin'],
    'Team Leader': ['Sales Manager', 'sales_manager', 'admin'],
    'team_leader': ['Sales Manager', 'sales_manager', 'admin'],
    'Sales Executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
    'sales_executive': ['Team Leader', 'team_leader', 'Sales Manager', 'sales_manager'],
    'Lead Executive': ['Lead Manager', 'lead_manager'],
    'lead_executive': ['Lead Manager', 'lead_manager'],
    'Telecaller': ['Lead Manager', 'lead_manager'],
    'telecaller': ['Lead Manager', 'lead_manager'],
    'Lead Qualifier': ['Lead Manager', 'lead_manager'],
    'lead_qualifier': ['Lead Manager', 'lead_manager']
};

// ── ROLE CREATION RULES ──
const ROLE_CREATION_RULES = {
    'Super Admin': ['admin'],
    'super_admin': ['admin'],
    'admin': ['admin', 'Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive', 'Lead Executive', 'Telecaller', 'Lead Qualifier'],
    'Sales Manager': ['Team Leader', 'Sales Executive'],
    'sales_manager': ['Team Leader', 'Sales Executive'],
    'Lead Manager': ['Lead Executive', 'Telecaller', 'Lead Qualifier'],
    'lead_manager': ['Lead Executive', 'Telecaller', 'Lead Qualifier'],
    'Team Leader': ['Sales Executive'],
    'team_leader': ['Sales Executive'],
    'Lead Executive': [],
    'lead_executive': [],
    'Telecaller': [],
    'telecaller': [],
    'Lead Qualifier': [],
    'lead_qualifier': [],
    'Sales Executive': [],
    'sales_executive': []
};

// ── NORMALIZE ROLE ──
const normalizeRole = (role) => {
    if (!role) return '';
    return role.toLowerCase().replace(/[\s_]+/g, '_').trim();
};

// ── CHECK IF USER IS ADMIN ──
const isAdminRole = (role) => {
    const norm = normalizeRole(role);
    return norm === 'super_admin' || norm === 'org_admin' || norm === 'admin';
};

// ── GET ALL SUBORDINATE USER IDS (recursive via manager_id) ──
const getSubordinateUserIds = async (userId, teamId = null) => {
    const params = [userId];

    if (!teamId) {
        try {
            const userRes = await pool.query("SELECT team_id FROM users WHERE id = $1", [userId]);
            if (userRes.rows.length > 0) {
                teamId = userRes.rows[0].team_id;
            }
        } catch (err) {
            console.error("Error fetching team_id:", err);
        }
    }

    let query = `
    WITH RECURSIVE subordinates AS (
       SELECT id FROM users WHERE id = $1
       UNION ALL
       SELECT u.id FROM users u
       INNER JOIN subordinates s ON u.manager_id = s.id
       UNION ALL
       SELECT u.id FROM users u
       WHERE u.team_id = $2 AND u.id != $1
    )
    SELECT DISTINCT id FROM subordinates
  `;

    if (teamId) {
        params.push(teamId);
    } else {
        // If no teamId, only get direct reports via manager_id
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

// ── VALIDATE IF A MANAGER CAN MANAGE A TARGET ROLE ──
const validateReportingManager = (targetRole, managerRole) => {
    const allowed = REPORTING_RULES[targetRole] || [];
    return allowed.includes(managerRole);
};

// ── GET VISIBLE USERS FOR A CURRENT USER ──
const getVisibleUsers = async (currentUser) => {
    const { role, id: userId, company_id, team_id } = currentUser;
    const roleNorm = normalizeRole(role);

    let query = "";
    let params = [];

    if (roleNorm === 'super_admin') {
        // Super Admin sees all users across all organizations
        query = `SELECT id, name, email, role, department, manager_id, team_id, is_active, status, company_id 
             FROM users ORDER BY role, name`;
    } else if (roleNorm === 'org_admin' || roleNorm === 'admin') {
        // Org Admin sees entire own company
        query = `SELECT id, name, email, role, department, manager_id, team_id, is_active, status, company_id 
             FROM users WHERE company_id = $1 ORDER BY role, name`;
        params.push(company_id);
    } else {
        // Managers/Team Leaders: entire hierarchy below them
        const subIds = await getSubordinateUserIds(userId, team_id);
        query = `SELECT id, name, email, role, department, manager_id, team_id, is_active, status, company_id 
             FROM users WHERE id = ANY($1::uuid[]) ORDER BY role, name`;
        params.push(subIds);
    }

    try {
        const result = await pool.query(query, params);
        return result.rows;
    } catch (err) {
        console.error("getVisibleUsers error:", err);
        return [];
    }
};

// ── GET VALID MANAGERS FOR A ROLE WITHIN A COMPANY ──
const getValidManagers = async (targetRole, companyId, excludeUserId = null) => {
    const validManagerRoles = REPORTING_RULES[targetRole] || [];

    if (validManagerRoles.length === 0) {
        return [];
    }

    let query = `
    SELECT id, name, email, role, department, is_active
    FROM users
    WHERE role = ANY($1::text[]) 
      AND is_active = true 
      AND status = 'Active'
  `;

    let params = [validManagerRoles];
    let paramIndex = 2;

    if (companyId) {
        query += ` AND company_id = $${paramIndex}`;
        params.push(companyId);
        paramIndex++;
    }

    if (excludeUserId) {
        query += ` AND id != $${paramIndex}`;
        params.push(excludeUserId);
        paramIndex++;
    }

    query += ` ORDER BY role, name ASC`;

    try {
        const result = await pool.query(query, params);
        return result.rows;
    } catch (err) {
        console.error("getValidManagers error:", err);
        return [];
    }
};

// ── GET TEAM MEMBERS FOR A USER ──
const getTeamMembers = async (userId, teamId = null) => {
    if (!teamId) {
        try {
            const userRes = await pool.query("SELECT team_id FROM users WHERE id = $1", [userId]);
            if (userRes.rows.length > 0) {
                teamId = userRes.rows[0].team_id;
            }
        } catch (err) {
            console.error("Error fetching team_id:", err);
            return [];
        }
    }

    if (!teamId) {
        return [];
    }

    try {
        const result = await pool.query(
            `SELECT id, name, email, role, department, manager_id, is_active, status
       FROM users
       WHERE team_id = $1
       ORDER BY name ASC`,
            [teamId]
        );
        return result.rows;
    } catch (err) {
        console.error("getTeamMembers error:", err);
        return [];
    }
};

// ── CHECK IF USER IS IN THE SAME TEAM ──
const areInSameTeam = async (userId1, userId2) => {
    try {
        const result = await pool.query(
            `SELECT t1.team_id 
       FROM users t1
       JOIN users t2 ON t1.team_id = t2.team_id
       WHERE t1.id = $1 AND t2.id = $2
       AND t1.team_id IS NOT NULL`,
            [userId1, userId2]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error("areInSameTeam error:", err);
        return false;
    }
};

// ── GET HIERARCHY PATH FOR A USER ──
const getHierarchyPath = async (userId) => {
    try {
        const result = await pool.query(`
      WITH RECURSIVE hierarchy AS (
        SELECT id, name, role, manager_id, team_id, 0 as level
        FROM users WHERE id = $1
        UNION ALL
        SELECT u.id, u.name, u.role, u.manager_id, u.team_id, h.level + 1
        FROM users u
        INNER JOIN hierarchy h ON u.id = h.manager_id
      )
      SELECT * FROM hierarchy ORDER BY level ASC
    `, [userId]);
        return result.rows;
    } catch (err) {
        console.error("getHierarchyPath error:", err);
        return [];
    }
};

module.exports = {
    REPORTING_RULES,
    ROLE_CREATION_RULES,
    normalizeRole,
    isAdminRole,
    getSubordinateUserIds,
    validateReportingManager,
    getVisibleUsers,
    getValidManagers,
    getTeamMembers,
    areInSameTeam,
    getHierarchyPath
};