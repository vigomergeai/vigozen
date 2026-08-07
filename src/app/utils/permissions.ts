export const isAdminRole = (role: string | null | undefined): boolean => {
  if (!role) return false;
  const adminRoles = ["admin", "super_admin", "Super Admin", "Org Admin"];
  return adminRoles.includes(role);
};

export const hasModuleAccess = (
  permissionsOrRole: any,
  module: string,
  requiredScope: string[] = ['full', 'dept', 'team', 'own', 'view']
): boolean => {
  if (!permissionsOrRole) return false;

  // Handle legacy/fallback checks with string role
  if (typeof permissionsOrRole === 'string') {
    if (isAdminRole(permissionsOrRole)) return true;
    const accessMap: Record<string, string[]> = {
      'Sales Manager': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities'],
      'Team Leader': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities'],
      'Sales Executive': ['leads', 'deals', 'reports', 'tickets', 'activities'],
      'Lead Manager': ['leads', 'users', 'reports', 'tickets', 'activities'],
    };
    return accessMap[permissionsOrRole]?.includes(module) || false;
  }

  // Handle object-based scope check (backend configuration)
  const scope = permissionsOrRole[module];
  if (!scope || scope === 'none') return false;
  return requiredScope.includes(scope);
};

export const canWrite = (
  permissionsOrRole: any,
  module: string
): boolean => {
  if (!permissionsOrRole) return false;

  if (typeof permissionsOrRole === 'string') {
    if (isAdminRole(permissionsOrRole)) return true;
    return false;
  }

  const scope = permissionsOrRole[module];
  return scope === 'full' || scope === 'dept' || scope === 'team' || scope === 'own';
};

export function getPermissionScope(
  role: string | null | undefined,
  module: string
): string {
  if (!role) return 'none';
  if (isAdminRole(role)) return 'full';
  
  const scopeMap: Record<string, Record<string, string>> = {
    'Sales Manager': { leads: 'dept', deals: 'dept', users: 'team', reports: 'dept', settings: 'none', billing: 'none', tickets: 'dept', activities: 'dept' },
    'Lead Manager': { leads: 'full', deals: 'view', users: 'team', reports: 'own', settings: 'none', billing: 'none', tickets: 'full', activities: 'full' },
    'Team Leader': { leads: 'team', deals: 'team', users: 'team', reports: 'team', settings: 'none', billing: 'none', tickets: 'team', activities: 'team' },
    'Sales Executive': { leads: 'own', deals: 'own', users: 'none', reports: 'own', settings: 'none', billing: 'none', tickets: 'own', activities: 'own' },
  };
  
  return scopeMap[role]?.[module] || 'none';
}
