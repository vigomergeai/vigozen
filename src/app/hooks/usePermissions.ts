import { useApp } from "../context/AppContext";

export const usePermissions = () => {
  const { userProfile } = useApp();
  const role = userProfile?.role || 'Sales Executive';

  const isAdmin = role === 'Super Admin' || role === 'super_admin' || role === 'Org Admin' || role === 'admin';

  const canView = (module: string): boolean => {
    // Super Admin, Org Admin, and admin get full access
    if (isAdmin) {
      return true;
    }

    const accessMap: Record<string, string[]> = {
      'leads': ['Sales Manager', 'Team Leader', 'Sales Executive', 'Lead Manager'],
      'contacts': ['Sales Manager', 'Team Leader', 'Sales Executive', 'Lead Manager'],
      'deals': ['Sales Manager', 'Team Leader', 'Sales Executive'], // Lead Manager has none
      'users': ['Sales Manager', 'Team Leader'], // Excludes Sales Exec and Lead Manager
      'reports': ['Sales Manager', 'Team Leader', 'Sales Executive', 'Lead Manager'],
      'tickets': ['Sales Manager', 'Team Leader', 'Sales Executive', 'Lead Manager'],
      'activities': ['Sales Manager', 'Team Leader', 'Sales Executive', 'Lead Manager'],
      'settings': [], // Only Admins see it
      'billing': [] // Only Admins see it
    };

    return accessMap[module]?.includes(role) || false;
  };

  const canCreate = (targetRole: string): boolean => {
    const rules: Record<string, string[]> = {
      'Super Admin': ['Org Admin', 'admin'],
      'Org Admin': ['Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive'],
      'admin': ['Sales Manager', 'Lead Manager', 'Team Leader', 'Sales Executive'],
      'Sales Manager': ['Team Leader', 'Sales Executive'],
      'Team Leader': ['Sales Executive']
    };
    return rules[role]?.includes(targetRole) || false;
  };

  return { canView, canCreate };
};