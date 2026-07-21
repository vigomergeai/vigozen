import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../app/lib/api';

export interface LeadSource {
  id: string;
  user_id: string;
  name: string;
  type: string;
  status: 'connected' | 'pending' | 'disconnected';
  leads_count: number;
  config: any;
  created_at: string;
  updated_at: string;
}

export function useLeadSources() {
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeadSources = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token") || "local-dev-bypass-token";
      const data = await api.leadSources.list(token);
      setLeadSources(data || []);
    } catch (error: any) {
      console.error('Error fetching lead sources:', error);
      toast.error('Failed to load lead sources');
    } finally {
      setLoading(false);
    }
  };

  const addLeadSource = async (sourceData: Partial<LeadSource>) => {
    try {
      const token = localStorage.getItem("token") || "local-dev-bypass-token";
      const payload = {
        name: sourceData.name,
        type: sourceData.type,
        status: sourceData.status || 'pending',
        config: sourceData.config || {},
      };
      const data = await api.leadSources.create(payload, token);
      setLeadSources(prev => [data, ...prev]);
      toast.success('Lead source added successfully!');
      return data;
    } catch (error: any) {
      console.error('Error adding lead source:', error);
      toast.error(error.message || 'Failed to add lead source');
      throw error;
    }
  };

  const updateLeadSource = async (id: string, updates: Partial<LeadSource>) => {
    try {
      const token = localStorage.getItem("token") || "local-dev-bypass-token";
      const data = await api.leadSources.update(id, updates, token);
      setLeadSources(prev => prev.map(s => s.id === id ? data : s));
      toast.success('Lead source updated successfully!');
      return data;
    } catch (error: any) {
      console.error('Error updating lead source:', error);
      toast.error(error.message || 'Failed to update lead source');
      throw error;
    }
  };

  useEffect(() => {
    fetchLeadSources();
  }, []);

  return { leadSources, loading, addLeadSource, updateLeadSource, fetchLeadSources };
}