export const normalizeRole = (role: string | null | undefined): string => {
  if (!role) return '';
  return role.toLowerCase().replace(/[\s_]+/g, '_').trim();
};

export const isAdminRole = (role: string | null | undefined): boolean => {
  if (!role) return false;
  const norm = normalizeRole(role);
  return ["super_admin", "org_admin"].includes(norm);
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
    const norm = normalizeRole(permissionsOrRole);
    const accessMap: Record<string, string[]> = {
      'sales_manager': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities'],
      'team_leader': ['leads', 'deals', 'users', 'reports', 'tickets', 'activities'],
      'sales_executive': ['leads', 'deals', 'reports', 'tickets', 'activities'],
      'lead_manager': ['leads', 'users', 'reports', 'tickets', 'activities'],
    };
    return accessMap[norm]?.includes(module) || false;
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
  
  const norm = normalizeRole(role);
  const scopeMap: Record<string, Record<string, string>> = {
    'sales_manager': { leads: 'dept', deals: 'dept', users: 'team', reports: 'dept', settings: 'none', billing: 'none', tickets: 'dept', activities: 'dept' },
    'lead_manager': { leads: 'dept', deals: 'dept', users: 'team', reports: 'dept', settings: 'none', billing: 'none', tickets: 'dept', activities: 'dept' },
    'team_leader': { leads: 'team', deals: 'team', users: 'team', reports: 'team', settings: 'none', billing: 'none', tickets: 'team', activities: 'team' },
    'sales_executive': { leads: 'own', deals: 'own', users: 'none', reports: 'own', settings: 'none', billing: 'none', tickets: 'own', activities: 'own' },
  };
  
  return scopeMap[norm]?.[module] || 'none';
}

// ── CHECK IF USER CAN EDIT ──
export function canEdit(
  permissions: Record<string, string> | null | undefined,
  module: string
): boolean {
  if (!permissions) return false;
  const scope = permissions[module];
  return scope === 'full' || scope === 'dept';
}

// ── CHECK IF USER CAN DELETE ──
export function canDelete(
  permissions: Record<string, string> | null | undefined,
  module: string
): boolean {
  if (!permissions) return false;
  const scope = permissions[module];
  return scope === 'full';
}

// ── CHECK IF USER CAN EXPORT ──
export function canExport(
  permissions: Record<string, string> | null | undefined,
  module: string,
  role?: string
): boolean {
  if (!permissions) return false;
  const scope = permissions[module];
  const roleNorm = role ? role.toLowerCase().replace(/_/g, ' ') : '';
  if (roleNorm === 'lead manager' || roleNorm === 'team leader') {
    return false;
  }
  return scope === 'full' || scope === 'dept';
}
