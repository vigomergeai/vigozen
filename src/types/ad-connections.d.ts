export interface AdConnection {
    id: string;
    user_id: string;
    company_id: string;
    platform: string;
    platform_name: string;
    name: string;
    connected: boolean;
    account_id: string;
    account_name: string;
    access_token?: string;
    refresh_token?: string;
    leads_imported: number;
    cost_spent: number;
    last_sync: string | null;
    last_sync_status: 'success' | 'failed' | 'never';
    last_sync_error: string | null;
    created_at: string;
    updated_at: string;
}

export interface AdSyncLog {
    id: string;
    connection_id: string;
    status: 'success' | 'failed' | 'running';
    leads_imported: number;
    errors: string[];
    started_at: string;
    completed_at: string | null;
    created_at: string;
}

export interface AdStats {
    total_platforms: number;
    total_leads_imported: number;
    connected_platforms: number;
    last_sync_time: string | null;
}