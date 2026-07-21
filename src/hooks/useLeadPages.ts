import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../app/lib/api';

export interface LeadPage {
  id: string;
  user_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  status: 'active' | 'draft' | 'paused';
  webhook_url: string | null;
  redirect_url: string | null;
  leads_count: number;
  conversion_rate: number;
  embed_code: string | null;
  created_at: string;
  updated_at: string;
}

export function useLeadPages() {
  const [leadPages, setLeadPages] = useState<LeadPage[]>([]);
  const [loading, setLoading] = useState(true);

  const getHeadersToken = () => {
    return localStorage.getItem("token") || "local-dev-bypass-token";
  };

  const fetchLeadPages = async () => {
    console.log("Fetching lead pages from backend...");
    setLoading(true);
    try {
      const token = getHeadersToken();
      const data = await api.leadPages.list(token);
      console.log("Fetched lead pages:", data?.length || 0);
      setLeadPages(data || []);
    } catch (error: any) {
      console.error('Error fetching lead pages:', error);
      toast.error('Failed to load lead pages');
    } finally {
      setLoading(false);
    }
  };

  const addLeadPage = async (pageData: Partial<LeadPage>) => {
    console.log("addLeadPage called with:", pageData);
    try {
      const token = getHeadersToken();
      const data = await api.leadPages.create(pageData, token);
      console.log("Insert successful:", data);
      setLeadPages(prev => [data, ...prev]);
      toast.success('Lead page created successfully!');
      return data;
    } catch (error: any) {
      console.error('Error adding lead page:', error);
      toast.error(error.message || 'Failed to create lead page');
      throw error;
    }
  };

  const updateLeadPage = async (id: string, updates: Partial<LeadPage>) => {
    try {
      const token = getHeadersToken();
      const data = await api.leadPages.update(id, updates, token);
      setLeadPages(prev => prev.map(p => p.id === id ? data : p));
      toast.success('Lead page updated successfully!');
      return data;
    } catch (error: any) {
      console.error('Error updating lead page:', error);
      toast.error(error.message || 'Failed to update lead page');
      throw error;
    }
  };

  const deleteLeadPage = async (id: string) => {
    try {
      const token = getHeadersToken();
      await api.leadPages.delete(id, token);
      setLeadPages(prev => prev.filter(p => p.id !== id));
      toast.success('Lead page deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting lead page:', error);
      toast.error(error.message || 'Failed to delete lead page');
      throw error;
    }
  };

  const updateLeadStats = async (id: string, leadsCount: number) => {
    try {
      const token = getHeadersToken();
      const data = await api.leadPages.update(id, { leads_count: leadsCount }, token);
      setLeadPages(prev => prev.map(p => p.id === id ? data : p));
    } catch (error) {
      console.error('Error updating lead stats:', error);
    }
  };

  useEffect(() => {
    fetchLeadPages();
  }, []);

  return { 
    leadPages, 
    loading, 
    addLeadPage, 
    updateLeadPage, 
    deleteLeadPage, 
    updateLeadStats,
    fetchLeadPages 
  };
}