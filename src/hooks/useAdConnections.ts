import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../app/lib/api';

export interface AdConnection {
  id: string;
  user_id: string;
  platform: string;
  platform_name: string;
  connected: boolean;
  access_token: string | null;
  account_id: string | null;
  account_name: string | null;
  leads_imported: number;
  cost_spent: number;
  last_sync: string | null;
  created_at: string;
  updated_at: string;
}

export function useAdConnections() {
  const [adConnections, setAdConnections] = useState<AdConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  const getHeadersToken = () => {
    return localStorage.getItem("token") || "local-dev-bypass-token";
  };

  // Fetch all ad connections for current user
  const fetchAdConnections = async () => {
    setLoading(true);
    try {
      const token = getHeadersToken();
      const data = await api.adConnections.list(token);
      setAdConnections(data || []);
    } catch (error: any) {
      console.error('Error fetching ad connections:', error);
      toast.error('Failed to load ad connections');
    } finally {
      setLoading(false);
    }
  };

  // Connect an ad platform
  const connectAdPlatform = async (
    platform: string,
    platformName: string,
    accountId: string,
    accountName: string
  ) => {
    try {
      const token = getHeadersToken();
      const payload = {
        platform,
        platform_name: platformName,
        account_id: accountId,
        account_name: accountName,
      };
      const data = await api.adConnections.create(payload, token);
      // Upsert in local state
      setAdConnections(prev => {
        const existing = prev.find(c => c.platform === platform);
        if (existing) {
          return prev.map(c => c.platform === platform ? data : c);
        }
        return [...prev, data];
      });
      toast.success(`${platformName} connected successfully!`);
      await fetchAdConnections();
    } catch (error: any) {
      console.error('Error connecting ad platform:', error);
      toast.error(error.message || 'Failed to connect');
      throw error;
    }
  };

  // Disconnect an ad platform
  const disconnectAdPlatform = async (id: string, platformName: string) => {
    try {
      const token = getHeadersToken();
      await api.adConnections.delete(id, token);
      setAdConnections(prev => prev.filter(c => c.id !== id));
      toast.success(`${platformName} disconnected successfully!`);
    } catch (error: any) {
      console.error('Error disconnecting ad platform:', error);
      toast.error(error.message || 'Failed to disconnect');
      throw error;
    }
  };

  // Sync leads from ad platform
  const syncAdLeads = async (id: string) => {
    if (syncing === id) {
      toast.info('Already syncing...');
      return;
    }

    setSyncing(id);
    toast.info('Syncing leads from ad platform...');

    try {
      const token = getHeadersToken();
      const data = await api.adConnections.sync(id, token);
      setAdConnections(prev => prev.map(c => c.id === id ? data : c));
      toast.success(
        `✅ Synced ${(data.leads_imported || 0).toLocaleString()} leads! Cost: ₹${(data.cost_spent || 0).toLocaleString()}`
      );
    } catch (error: any) {
      console.error('Error syncing leads:', error);
      toast.error(error.message || 'Failed to sync leads');
    } finally {
      setSyncing(null);
    }
  };

  // Update leads count manually
  const updateLeadsCount = async (platform: string, leadsCount: number, cost: number) => {
    try {
      const token = getHeadersToken();
      const data = await api.adConnections.updateCount(platform, leadsCount, cost, token);
      setAdConnections(prev => prev.map(c => c.platform === platform ? data : c));
      return data;
    } catch (error) {
      console.error('Error updating leads count:', error);
    }
  };

  // Get total leads from all connected platforms
  const getTotalLeads = () => {
    return adConnections.reduce((total, conn) => total + (conn.leads_imported || 0), 0);
  };

  // Get total cost from all connected platforms
  const getTotalCost = () => {
    return adConnections.reduce((total, conn) => total + (conn.cost_spent || 0), 0);
  };

  useEffect(() => {
    fetchAdConnections();
  }, []);

  return {
    adConnections,
    loading,
    syncing,
    connectAdPlatform,
    disconnectAdPlatform,
    syncAdLeads,
    updateLeadsCount,
    getTotalLeads,
    getTotalCost,
    fetchAdConnections,
  };
}