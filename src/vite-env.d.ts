/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface Session {
  access_token: string;
  user: {
    id: string;
    email?: string;
  };
}

interface EmployeeRecord {
  id: string;
  name: string;
  email?: string;
  role?: string;
  department?: string;
  employeeId?: string | null;
  status?: string;
  emp_link?: string | null;
}

declare const supabase: any;
declare const publicAnonKey: string;
declare function validUUID(value?: string | null): boolean;

