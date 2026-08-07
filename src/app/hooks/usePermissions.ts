import { useApp } from "../context/AppContext";

export type UserRole = 
  | 'super_admin'
  | 'org_admin'
  | 'admin'
  | 'sales_manager'
  | 'team_leader'
  | 'sales_executive'
  | 'lead_manager'
  | 'viewer';

export type ModuleName = 
  | 'leads'
  | 'contacts'
  | 'deals'
  | 'users'
  | 'reports'
  | 'tickets'
  | 'activities'
  | 'settings'
  | 'billing';

const normalizeRole = (role: string): UserRole => {
  const roleMap: Record<string, UserRole> = {
    'Super Admin': 'super_admin',
    'super_admin': 'super_admin',
    'Org Admin': 'org_admin',
    'org_admin': 'org_admin',
    'admin': 'admin',
    'Admin': 'admin',
    'Sales Manager': 'sales_manager',
    'sales_manager': 'sales_manager',
    'Team Leader': 'team_leader',
    'team_leader': 'team_leader',
    'Sales Executive': 'sales_executive',
    'sales_executive': 'sales_executive',
    'Lead Manager': 'lead_manager',
    'lead_manager': 'lead_manager',
    'Viewer': 'viewer',
    'viewer': 'viewer',
  };
  return roleMap[role] || 'viewer';
};

const adminRoles: UserRole[] = ['super_admin', 'org_admin', 'admin'];

const moduleAccessMap: Record<UserRole, ModuleName[]> = {
  'super_admin': ['leads', 'contacts', 'deals', 'users', 'reports', 'tickets', 'activities', 'settings', 'billing'],
  'org_admin': ['leads', 'contacts', 'deals', 'users', 'reports', 'tickets', 'activities', 'settings', 'billing'],
  'admin': ['leads', 'contacts', 'deals', 'users', 'reports', 'tickets', 'activities', 'settings', 'billing'],
  'sales_manager': ['leads', 'contacts', 'deals', 'users', 'reports', 'tickets', 'activities'],
  'team_leader': ['leads', 'contacts', 'deals', 'users', 'reports', 'tickets', 'activities'],
  'sales_executive': ['leads', 'contacts', 'deals', 'reports', 'tickets', 'activities'],
  'lead_manager': ['leads', 'contacts', 'reports', 'tickets', 'activities'],
  'viewer': ['leads', 'contacts', 'reports'],
};

const roleCreationRules: Record<UserRole, UserRole[]> = {
  'super_admin': ['org_admin', 'admin', 'sales_manager', 'lead_manager', 'team_leader', 'sales_executive', 'viewer'],
  'org_admin': ['sales_manager', 'lead_manager', 'team_leader', 'sales_executive', 'viewer'],
  'admin': ['sales_manager', 'lead_manager', 'team_leader', 'sales_executive', 'viewer'],
  'sales_manager': ['team_leader', 'sales_executive', 'viewer'],
  'team_leader': ['sales_executive', 'viewer'],
  'sales_executive': [],
  'lead_manager': [],
  'viewer': [],
};

export const usePermissions = () => {
  const { userProfile } = useApp();
  const rawRole = userProfile?.role || 'viewer';
  const role = normalizeRole(rawRole);
  const isAdmin = adminRoles.includes(role);

  /**
   * Check if current user can view a specific module
   * @param module - The module name to check
   * @returns boolean - True if user has access
   */
  const canView = (module: ModuleName): boolean => {
    if (isAdmin) return true;
    return moduleAccessMap[role]?.includes(module) || false;
  };

  /**
   * Check if current user can create a user with a specific role
   * @param targetRole - The role to check if user can create
   * @returns boolean - True if user can create this role
   */
  const canCreate = (targetRole: UserRole): boolean => {
    return roleCreationRules[role]?.includes(targetRole) || false;
  };

  /**
   * Get all modules accessible to current user
   * @returns Array of module names
   */
  const getAccessibleModules = (): ModuleName[] => {
    if (isAdmin) {
      return ['leads', 'contacts', 'deals', 'users', 'reports', 'tickets', 'activities', 'settings', 'billing'];
    }
    return moduleAccessMap[role] || [];
  };

  /**
   * Check if current user has any of the specified roles
   * @param roles - Array of roles to check
   * @returns boolean - True if user has at least one of the roles
   */
  const hasRole = (roles: UserRole[]): boolean => {
    return roles.includes(role);
  };

  return {
    role,
    isAdmin,
    canView,
    canCreate,
    getAccessibleModules,
    hasRole,
  };
};
