// src/hooks/useUsers.ts
import { useState, useEffect } from 'react';
import { api } from '../app/lib/api';

export function useUsers() {
  const [users, setUsers] = useState<{ id: string; email: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token") || "local-dev-bypass-token";
      const data = await api.users.list(token);
      // Map to expected shape
      const mappedUsers = data.map((user: any) => ({
        id: user.id,
        email: user.email,
        full_name: user.name || user.full_name || user.email,
      }));
      setUsers(mappedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  return { users, loading, fetchUsers };
}