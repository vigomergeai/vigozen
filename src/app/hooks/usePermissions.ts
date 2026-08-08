import { useApp } from "../context/AppContext";

export type UserRole = 
  | 'super_admin'
  | 'org_admin'
  | 'admin'
  | 'sales_manager'
  | 'lead_manager'
  | 'team_leader'
  | 'sales_executive'
  | 'lead_executive'
  | 'telecaller'
  | 'lead_qualifier'
  | 'viewer';

export type ModuleName = 
  | 'leads'
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
    'Lead Executive': 'lead_executive',
    'lead_executive': 'lead_executive',
    'Telecaller': 'telecaller',
    'telecaller': 'telecaller',
    'Lead Qualifier': 'lead_qualifier',
    'lead_qualifier': 'lead_qualifier',
    'Viewer': 'viewer',
    'viewer': 'viewer',
    'unknown': 'viewer',
    'viewer_role': 'viewer',
    'user': 'viewer',
    'User': 'viewer',
  };
  return roleMap[role] || 'viewer';
};

const adminRoles: UserRole[] = ['super_admin', 'org_admin', 'admin'];

const moduleAccessMap: Record<UserRole, ModuleName[]> = {
  'super_admin': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities', 'settings', 'billing'],
  'org_admin': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities', 'settings', 'billing'],
  'admin': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities', 'settings', 'billing'],
  'sales_manager': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities'],
  'team_leader': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities'],
  'sales_executive': ['leads', 'deals', 'reports', 'tickets', 'activities'],
  'lead_manager': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities', 'settings'],
  'lead_executive': ['leads', 'deals', 'reports', 'tickets', 'activities'],
  'telecaller': ['leads', 'reports', 'tickets', 'activities'],
  'lead_qualifier': ['leads', 'reports', 'tickets', 'activities'],
  'viewer': ['leads', 'reports'],
};

const roleCreationRules: Record<UserRole, UserRole[]> = {
  'super_admin': ['org_admin'],
  'org_admin': ['sales_manager', 'lead_manager', 'team_leader', 'sales_executive', 'lead_executive', 'telecaller', 'lead_qualifier'],
  'admin': ['sales_manager', 'lead_manager', 'team_leader', 'sales_executive', 'lead_executive', 'telecaller', 'lead_qualifier'],
  'sales_manager': ['team_leader', 'sales_executive'],
  'team_leader': ['sales_executive'],
  'lead_manager': ['lead_executive', 'telecaller', 'lead_qualifier'],
  'sales_executive': [],
  'lead_executive': [],
  'telecaller': [],
  'lead_qualifier': [],
  'viewer': [],
};

export const usePermissions = () => {
  const { userProfile } = useApp();
  const rawRole = userProfile?.role || 'viewer';
  const role = normalizeRole(rawRole);
  const isAdmin = adminRoles.includes(role);
  const canOpenAdminPanel = ['super_admin', 'org_admin', 'admin', 'sales_manager', 'lead_manager', 'team_leader'].includes(role);

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
      return ['leads', 'deals', 'users', 'reports', 'tickets', 'activities', 'settings', 'billing'];
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
    canOpenAdminPanel,
    canView,
    canCreate,
    getAccessibleModules,
    hasRole,
  };
};