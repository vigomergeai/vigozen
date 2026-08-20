// server/cronSync.js
// Background job for automatic sync every 15 minutes

const cron = require('node-cron');
const pool = require('../db');
const {
    createPlatformIntegration,
    mapMultipleLeadsToCRM
} = require('./adPlatformIntegrations');

// ============================================================
// CONFIGURATION
// ============================================================
const SYNC_INTERVAL = '*/15 * * * *'; // Every 15 minutes
const LEAD_FETCH_DAYS = 30; // Fetch leads from last 30 days
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// ============================================================
// MAIN SYNC JOB
// ============================================================

/**
 * Scheduled sync job - runs every 15 minutes
 */
cron.schedule(SYNC_INTERVAL, async () => {
    const startTime = Date.now();
    console.log(`🔄 Starting scheduled ad sync at ${new Date().toISOString()}...`);

    try {
        // 1. Fetch all connected platforms with auto_sync enabled
        const connections = await getConnectionsToSync();

        if (connections.length === 0) {
            console.log('📭 No connections to sync');
            return;
        }

        console.log(`📡 Found ${connections.length} connections to sync`);

        // 2. Loop through each connection and sync
        const results = [];
        for (const connection of connections) {
            try {
                const result = await syncConnection(connection);
                results.push({
                    connection_id: connection.id,
                    platform: connection.platform,
                    ...result
                });
            } catch (error) {
                console.error(`❌ Failed to sync ${connection.platform}:`, error);
                results.push({
                    connection_id: connection.id,
                    platform: connection.platform,
                    success: false,
                    error: error.message
                });

                // Log error to database
                await logSyncError(connection.id, error);
            }
        }

        // 3. Log summary
        const successful = results.filter(r => r.success !== false).length;
        const failed = results.length - successful;
        const duration = Date.now() - startTime;

        console.log(`✅ Scheduled sync completed: ${successful} successful, ${failed} failed (${duration}ms)`);

        // 4. Save sync summary to database
        await saveSyncSummary(results);

    } catch (error) {
        console.error('❌ Scheduled sync failed:', error);
    }
}, {
    scheduled: true,
    timezone: "Asia/Kolkata"
});

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Get all connections that need to be synced
 */
async function getConnectionsToSync() {
    const query = `
    SELECT 
      ac.*,
      us.ad_auto_create as auto_create_leads
    FROM ad_connections ac
    INNER JOIN user_settings us ON ac.user_id = us.user_id
    WHERE ac.connected = true 
      AND us.ad_auto_sync = true
      AND (ac.last_sync IS NULL OR ac.last_sync < NOW() - INTERVAL '15 minutes')
    ORDER BY ac.last_sync ASC NULLS FIRST
    LIMIT 50
  `;

    const result = await pool.query(query);
    return result.rows;
}

/**
 * Sync a single connection
 */
async function syncConnection(connection) {
    console.log(`🔄 Syncing ${connection.platform} (${connection.name})...`);

    try {
        // 1. Get platform integration instance
        const credentials = await getCredentialsForPlatform(connection);
        const integration = createPlatformIntegration(connection.platform, credentials);

        // 2. Fetch leads from platform
        const since = connection.last_sync || new Date(Date.now() - LEAD_FETCH_DAYS * 24 * 60 * 60 * 1000).toISOString();
        let rawLeads = [];

        switch (connection.platform) {
            case 'facebook':
                rawLeads = await integration.fetchAllLeads(connection.account_id, since);
                break;
            case 'google':
                rawLeads = await integration.fetchLeads(connection.account_id, since);
                break;
            case 'linkedin':
                rawLeads = await integration.fetchLeads(connection.account_id, since);
                break;
            case 'instagram':
                rawLeads = await integration.fetchLeads(connection.account_id, since);
                break;
            default:
                throw new Error(`Unsupported platform: ${connection.platform}`);
        }

        console.log(`📥 Fetched ${rawLeads.length} leads from ${connection.platform}`);

        // 3. Map leads to CRM format
        const mappedLeads = mapMultipleLeadsToCRM(connection.platform, rawLeads);

        // 4. Import leads if auto_create is enabled
        let importedCount = 0;
        if (connection.auto_create_leads && mappedLeads.length > 0) {
            importedCount = await importLeads(connection.user_id, connection.company_id, mappedLeads, connection);
            console.log(`💾 Imported ${importedCount} leads to CRM`);
        }

        // 5. Update connection stats
        await updateConnectionStats(connection.id, {
            leads_imported: mappedLeads.length,
            leads_created: importedCount,
            last_sync: new Date().toISOString(),
            sync_status: 'success',
            last_sync_error: null
        });

        // 6. Create sync log entry
        await createSyncLog(connection.id, {
            platform: connection.platform,
            leads_fetched: rawLeads.length,
            leads_mapped: mappedLeads.length,
            leads_imported: importedCount,
            status: 'success'
        });

        return {
            success: true,
            leads_fetched: rawLeads.length,
            leads_mapped: mappedLeads.length,
            leads_imported: importedCount,
            platform: connection.platform
        };

    } catch (error) {
        console.error(`❌ Sync failed for ${connection.platform}:`, error);

        // Update connection with error
        await updateConnectionStats(connection.id, {
            sync_status: 'failed',
            last_sync_error: error.message,
            last_sync: new Date().toISOString()
        });

        throw error;
    }
}

/**
 * Get credentials for a platform connection
 */
async function getCredentialsForPlatform(connection) {
    // In production, decrypt stored tokens
    // For now, return from connection record
    return {
        accessToken: connection.access_token,
        refreshToken: connection.refresh_token,
        clientId: connection.client_id,
        clientSecret: connection.client_secret
    };
}

/**
 * Import mapped leads into CRM
 */
async function importLeads(userId, companyId, leads, connection) {
    let importedCount = 0;

    for (const lead of leads) {
        try {
            // Check if lead already exists (by platform_id)
            const existing = await pool.query(
                'SELECT id FROM leads WHERE platform_id = $1 AND company_id = $2',
                [lead.platform_id, companyId]
            );

            if (existing.rows.length > 0) {
                // Update existing lead
                await pool.query(
                    `UPDATE leads 
           SET 
             name = $1,
             email = $2,
             phone = $3,
             company = $4,
             message = $5,
             updated_at = NOW()
           WHERE platform_id = $6 AND company_id = $7`,
                    [
                        lead.name,
                        lead.email,
                        lead.phone,
                        lead.company,
                        lead.message,
                        lead.platform_id,
                        companyId
                    ]
                );
            } else {
                // Insert new lead
                await pool.query(
                    `INSERT INTO leads (
            id,
            company_id,
            assigned_to,
            name,
            email,
            phone,
            company,
            message,
            source,
            platform,
            platform_id,
            status,
            created_at,
            updated_at
          ) VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            'new',
            NOW(),
            NOW()
          )`,
                    [
                        companyId,
                        userId,
                        lead.name,
                        lead.email,
                        lead.phone || '',
                        lead.company || '',
                        lead.message || '',
                        lead.source || lead.platform,
                        lead.platform,
                        lead.platform_id
                    ]
                );
                importedCount++;
            }
        } catch (error) {
            console.error(`Failed to import lead ${lead.platform_id}:`, error);
            // Continue with next lead
        }
    }

    return importedCount;
}

/**
 * Update connection statistics
 */
async function updateConnectionStats(connectionId, updates) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.leads_imported !== undefined) {
        fields.push(`leads_imported = leads_imported + $${paramIndex}`);
        values.push(updates.leads_imported);
        paramIndex++;
    }

    if (updates.leads_created !== undefined) {
        fields.push(`leads_created = leads_created + $${paramIndex}`);
        values.push(updates.leads_created);
        paramIndex++;
    }

    if (updates.last_sync !== undefined) {
        fields.push(`last_sync = $${paramIndex}`);
        values.push(updates.last_sync);
        paramIndex++;
    }

    if (updates.sync_status !== undefined) {
        fields.push(`sync_status = $${paramIndex}`);
        values.push(updates.sync_status);
        paramIndex++;
    }

    if (updates.last_sync_error !== undefined) {
        fields.push(`last_sync_error = $${paramIndex}`);
        values.push(updates.last_sync_error);
        paramIndex++;
    }

    if (fields.length === 0) return;

    fields.push(`updated_at = NOW()`);
    values.push(connectionId);

    const query = `UPDATE ad_connections SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
    await pool.query(query, values);
}

/**
 * Create sync log entry
 */
async function createSyncLog(connectionId, data) {
    await pool.query(
        `INSERT INTO ad_sync_logs (
      id,
      connection_id,
      platform,
      leads_fetched,
      leads_mapped,
      leads_imported,
      status,
      error_message,
      synced_at
    ) VALUES (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      NOW()
    )`,
        [
            connectionId,
            data.platform,
            data.leads_fetched || 0,
            data.leads_mapped || 0,
            data.leads_imported || 0,
            data.status || 'success',
            data.error || null
        ]
    );
}

/**
 * Log sync error to database
 */
async function logSyncError(connectionId, error) {
    await pool.query(
        `INSERT INTO ad_sync_logs (
      id,
      connection_id,
      platform,
      leads_fetched,
      leads_mapped,
      leads_imported,
      status,
      error_message,
      synced_at
    ) VALUES (
      gen_random_uuid(),
      $1,
      $2,
      0,
      0,
      0,
      'failed',
      $3,
      NOW()
    )`,
        [
            connectionId,
            'unknown',
            error.message || 'Unknown error'
        ]
    );
}

/**
 * Save sync summary to database
 */
async function saveSyncSummary(results) {
    const summary = {
        timestamp: new Date().toISOString(),
        total: results.length,
        successful: results.filter(r => r.success !== false).length,
        failed: results.filter(r => r.success === false).length,
        details: results
    };

    // Store in database for reporting
    try {
        await pool.query(
            `INSERT INTO sync_summaries (
          id,
          summary_data,
          created_at
        ) VALUES (
          gen_random_uuid(),
          $1,
          NOW()
        )`,
            [JSON.stringify(summary)]
        );
    } catch (error) {
        console.error('Failed to save sync summary:', error);
        // Table might not exist, continue without failing
    }
}

// ============================================================
// MANUAL SYNC FUNCTION
// ============================================================

/**
 * Manually sync a specific connection
 * @param {string} connectionId - Connection ID to sync
 * @param {Object} options - Sync options
 */
async function manualSync(connectionId, options = {}) {
    console.log(`🔄 Manual sync requested for connection ${connectionId}`);

    try {
        // Get connection details
        const result = await pool.query(
            'SELECT * FROM ad_connections WHERE id = $1 AND connected = true',
            [connectionId]
        );

        if (result.rows.length === 0) {
            throw new Error('Connection not found or not connected');
        }

        const connection = result.rows[0];

        // Get user settings
        const settingsResult = await pool.query(
            'SELECT ad_auto_create FROM user_settings WHERE user_id = $1',
            [connection.user_id]
        );
        connection.auto_create_leads = settingsResult.rows[0]?.ad_auto_create || false;

        // Force sync regardless of last_sync
        if (options.force) {
            connection.last_sync = null;
        }

        // Perform sync
        const result_data = await syncConnection(connection);

        return {
            success: true,
            connection_id: connectionId,
            ...result_data
        };

    } catch (error) {
        console.error(`Manual sync failed for ${connectionId}:`, error);
        throw error;
    }
}

/**
 * Sync all connections for a user
 * @param {string} userId - User ID
 */
async function syncAllForUser(userId) {
    console.log(`🔄 Syncing all connections for user ${userId}`);

    const result = await pool.query(
        `SELECT * FROM ad_connections 
     WHERE user_id = $1 
     AND connected = true 
     AND status = 'active'`,
        [userId]
    );

    const results = [];
    for (const connection of result.rows) {
        try {
            const syncResult = await manualSync(connection.id, { force: true });
            results.push(syncResult);
        } catch (error) {
            results.push({
                connection_id: connection.id,
                platform: connection.platform,
                success: false,
                error: error.message
            });
        }
    }

    return results;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    syncConnection,
    manualSync,
    syncAllForUser,
    getConnectionsToSync,
    importLeads
};