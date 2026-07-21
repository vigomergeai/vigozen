// src/hooks/useSupport.ts
import { useState, useEffect, useCallback } from "react";
import { api } from "../app/lib/api";

export type TicketPriority = "Low" | "Medium" | "High" | "Critical";
export type TicketStatus = "Open" | "In Progress" | "Resolved" | "Closed";

export interface Ticket {
  id: string;
  title: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  description?: string;
  owner_id: string;
  owner_name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  assigned_to?: string;
  assigned_to_name?: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  is_active: boolean;
}

export interface Guide {
  id: string;
  title: string;
  read_time: string;
  icon: string;
  type: "Guide" | "Tutorial" | "Video";
  url?: string;
  sort_order: number;
}

// ============================================================
// useCurrentUser - Get logged-in user info from JWT token
// ============================================================
export function useCurrentUser() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token || token === "local-dev-bypass-token") {
          // Dev bypass: hardcoded admin user
          setUserId("5338b90b-1302-4f34-94cd-b51bca404176");
          setUserEmail("vigomerge@gmail.com");
          setUserName("vigomerge");
          setIsAdmin(true);
          setLoading(false);
          return;
        }

        // Decode JWT payload
        try {
          const payload = JSON.parse(atob(token.split(".")[1]));
          setUserId(payload.id || payload.sub || null);
          setUserEmail(payload.email || null);
          setUserName(payload.name || payload.email || null);
          setIsAdmin(payload.role === "admin");
        } catch {
          // If decode fails, try fetching profile through api client
          const data = await api.auth.profile(token);
          setUserId(data.id || null);
          setUserEmail(data.email || null);
          setUserName(data.name || data.email || null);
          setIsAdmin(data.role === "admin");
        }
      } catch (err) {
        console.error("useCurrentUser error:", err);
      } finally {
        setLoading(false);
      }
    };

    getUser();
  }, []);

  return { userId, userEmail, userName, isAdmin, loading };
}

// ============================================================
// useTickets - Fetch tickets from Express backend
// ============================================================
export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { userId, isAdmin } = useCurrentUser();

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("token") || "local-dev-bypass-token";
      const data = await api.tickets.list(token);
      // Role-based filtering: admin sees all, users see own tickets
      const filtered = isAdmin
        ? (data as Ticket[])
        : (data as Ticket[]).filter((t) => t.owner_id === userId);
      setTickets(filtered);
    } catch (err: any) {
      console.error("Error fetching tickets:", err);
      setError("Failed to fetch tickets");
    } finally {
      setLoading(false);
    }
  }, [userId, isAdmin]);

  useEffect(() => {
    fetchTickets();

    // Poll every 30 seconds instead of Supabase realtime
    const interval = setInterval(fetchTickets, 30000);
    return () => clearInterval(interval);
  }, [fetchTickets]);

  const addTicket = async (ticket: {
    title: string;
    category: string;
    priority: TicketPriority;
    status: TicketStatus;
    description?: string;
  }) => {
    if (!userId) throw new Error("User not authenticated");

    const payload = {
      ...ticket,
      owner_id: userId,
      owner_name: localStorage.getItem("userName") || "User",
      created_by: userId,
    };

    const token = localStorage.getItem("token") || "local-dev-bypass-token";
    const data = await api.tickets.create(payload, token);
    await fetchTickets();
    return data as Ticket;
  };

  const updateTicket = async (
    id: string,
    updates: Partial<
      Pick<
        Ticket,
        | "title"
        | "category"
        | "priority"
        | "status"
        | "description"
        | "assigned_to"
        | "assigned_to_name"
      >
    >
  ) => {
    const token = localStorage.getItem("token") || "local-dev-bypass-token";
    const data = await api.tickets.update(id, updates, token);
    await fetchTickets();
    return data as Ticket;
  };

  const deleteTicket = async (id: string) => {
    const token = localStorage.getItem("token") || "local-dev-bypass-token";
    await api.tickets.delete(id, token);
    await fetchTickets();
  };

  return {
    tickets,
    loading,
    error,
    isAdmin,
    userId,
    fetchTickets,
    addTicket,
    updateTicket,
    deleteTicket,
  };
}

// ============================================================
// useFAQs - Fetch FAQs from Express backend
// ============================================================
export function useFAQs() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFAQs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.faqs.list();
      setFaqs((data as FAQ[]) || []);
    } catch (error) {
      console.error("Error fetching FAQs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFAQs();
  }, [fetchFAQs]);

  return { faqs, loading, fetchFAQs };
}

// ============================================================
// useGuides - Fetch Guides from Express backend
// ============================================================
export function useGuides() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGuides = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token") || "local-dev-bypass-token";
      const data = await api.guides.list(token);
      setGuides((data as Guide[]) || []);
    } catch (error) {
      console.error("Error fetching guides:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGuides();
  }, [fetchGuides]);

  return { guides, loading, fetchGuides };
}