export type Branding = {
  app_name: string;
  short_name: string;
  footer_text: string;
  logo_url: string | null;
  currency_symbol: string;
};

export type Preferences = {
  currency_symbol: string;
  currency_decimals: number;
  date_format: string;
  number_grouping: "international" | "lakh";
  session_timeout_minutes: number;
};

export type Me = {
  user: { id: number; name: string; username: string; email: string | null; is_super_admin: boolean };
  organizations: { id: number; name: string; code: string }[];
  organization: { id: number; name: string; code: string; currency_code: string } | null;
  offices: { id: number; code?: string | null; name: string; is_head_office?: boolean }[];
  office_id: number | null;
  roles: string[];
  permissions: string[];
  preferences: Preferences;
  branding: Branding;
};

export type Account = {
  id: number;
  parent_id: number | null;
  office_id?: number | null;
  office?: { id: number; code?: string | null; name: string; is_head_office?: boolean } | null;
  code: string;
  level: number;
  class: number;
  gl_id: string | null;
  old_code: string | null;
  title: string;
  is_posting: boolean;
  normal_side: "D" | "C";
  economic_code: string | null;
  status: "active" | "inactive";
};

export type FiscalYear = {
  id: number;
  code: string;
  label: string;
  start_date: string;
  end_date: string;
  status: "open" | "closed";
  is_current: boolean;
};

export type OfficeType = {
  id: number;
  name: string;
  is_head_office: boolean;
  status: "active" | "inactive";
};

export type Office = {
  id: number;
  office_type_id?: number | null;
  office_type?: OfficeType | null;
  code?: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  is_head_office?: boolean;
  status: "active" | "inactive";
};

export type SettingItem = {
  key: string;
  group: string;
  label: string;
  type: "integer" | "decimal" | "string" | "boolean" | "select" | "account" | "image";
  description: string;
  rules: { min?: number; max?: number; options?: Record<string, string> };
  default: string | number | boolean | null;
  value: string | number | boolean | null;
  source: "organization" | "platform" | "default";
  url: string | null;
};

export type Role = {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
  users_count: number;
};

export type PermissionDef = { key: string; group: string; description: string };

export type OrgUser = {
  id: number;
  name: string;
  username: string;
  email: string | null;
  status: "active" | "inactive";
  last_login_at: string | null;
  locked: boolean;
  role_ids: number[];
  office_ids: number[];
};
