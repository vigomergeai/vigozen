// Mock Data for LeadOps360 CRM

export type Role = "admin" | "user";
export type LeadStatus = "New" | "Contacted" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";
export type LeadSource = "Facebook" | "Website" | "CRM Import" | "LinkedIn" | "Referral" | "Cold Call" | "Email Campaign";
export type Industry = "Technology" | "Healthcare" | "Finance" | "Retail" | "Manufacturing" | "Real Estate" | "Education" | "Others";



export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: LeadStatus;
  source: LeadSource;
  industry: Industry;
  aiScore: number;
  value: number;
  owner: string;
  ownerId: string;
  createdAt: string;
  lastContact: string;
  notes: string;
  tags: string[];
  probability: number;
  converted_to_deal?: boolean;
  deal_id?: string | null;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
  department: string;
  leads: number;
  won: number;
  revenue: number;
  conversionRate: number;
}

export interface Deal {
  id: string;
  title: string;
  company: string;
  value: number;
  stage: LeadStatus;
  owner: string;
  probability: number;
  expectedClose: string;
  daysInStage: number;
  lead_id?: string | null;
  ownerId?: string | null;
  createdAt?: string;
}

export interface Ticket {
  id: string;
  title: string;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  priority: "Low" | "Medium" | "High" | "Critical";
  createdAt: string;
  category: string;
  description?: string;
  ownerId?: string | null;
  ownerName?: string;
  assignedTo?: string | null;
  assignedToName?: string;
}

export interface PriceItem {
  id: string;
  name: string;
  category: string;
  price?: number; 
  billing: "Monthly" | "Annual" | "One-time" | "Custom";
  features: string[];
  isPopular: boolean;
}

export interface Integration {
  id: string;
  name: string;
  type: string;
  status: "Connected" | "Disconnected" | "Pending";
  icon: string;
  description: string;
  leads: number;
  lastSync: string;
}

export const employees: Employee[] = [
  { id: "e1", name: "Arjun Sharma", email: "arjun@leadops360.com", role: "Senior Sales Rep", avatar: "AS", department: "Sales", leads: 87, won: 34, revenue: 425000, conversionRate: 39.1 },
  { id: "e2", name: "Priya Patel", email: "priya@leadops360.com", role: "Sales Manager", avatar: "PP", department: "Sales", leads: 64, won: 29, revenue: 380000, conversionRate: 45.3 },
  { id: "e3", name: "Rahul Verma", email: "rahul@leadops360.com", role: "Sales Rep", avatar: "RV", department: "Sales", leads: 73, won: 21, revenue: 290000, conversionRate: 28.8 },
  { id: "e4", name: "Sneha Gupta", email: "sneha@leadops360.com", role: "Inside Sales", avatar: "SG", department: "Inside Sales", leads: 95, won: 38, revenue: 460000, conversionRate: 40.0 },
  { id: "e5", name: "Karan Mehta", email: "karan@leadops360.com", role: "Business Dev", avatar: "KM", department: "BD", leads: 52, won: 18, revenue: 235000, conversionRate: 34.6 },
  { id: "e6", name: "Divya Singh", email: "divya@leadops360.com", role: "Sales Rep", avatar: "DS", department: "Sales", leads: 68, won: 24, revenue: 312000, conversionRate: 35.3 },
];

export const leads: Lead[] = [];

export const deals: Deal[] = [];

export const revenueData = [];

export const funnelData = [];

export const sourceData = [];

export const weeklyLeadData = [];

export const aiInsights = [];

export const recentActivities = [];

export const tickets: Ticket[] = [];

export const faqs = [
  { q: "How does AI lead scoring work?", a: "Our AI analyzes 50+ data points including engagement behavior, company profile, industry fit, and historical conversion patterns to generate a score from 0-100. Scores above 80 indicate high-priority leads." },
  { q: "Can I import leads from other CRMs?", a: "Yes! LeadOps360 supports direct integration with Salesforce, HubSpot, Zoho, and Pipedrive. You can also import via CSV or our API." },
  { q: "How do I connect Facebook Lead Ads?", a: "Go to Settings > Lead Integrations > Facebook Ads. Click 'Connect' and authorize with your Facebook Business Manager. Leads will sync automatically every 15 minutes." },
  { q: "What reports are available?", a: "We offer Employee-wise, Status-wise, and Sales-wise reports with daily, weekly, and custom date range filters. All reports are AI-enhanced with predictive insights." },
  { q: "How do I set up automated workflows?", a: "Navigate to Sales > Automation. You can create trigger-based workflows using our visual builder. Common automations include auto-assignment, follow-up reminders, and email sequences." },
  { q: "Is there a mobile app available?", a: "Yes, LeadOps360 mobile is available for iOS and Android. It includes all core CRM features plus mobile-specific tools like business card scanning and voice notes." },
];

export const integrations: Integration[] = [
  { id: "i1", name: "Facebook Lead Ads", type: "Lead Source", status: "Connected", icon: "FB", description: "Automatically import leads from Facebook Lead Ad campaigns", leads: 78, lastSync: "5 mins ago" },
  { id: "i2", name: "LinkedIn Sales Navigator", type: "Lead Source", status: "Connected", icon: "LI", description: "Sync prospects from LinkedIn Sales Navigator", leads: 44, lastSync: "30 mins ago" },
  { id: "i3", name: "Salesforce CRM", type: "CRM Sync", status: "Disconnected", icon: "SF", description: "Bi-directional sync with Salesforce CRM", leads: 0, lastSync: "Never" },
  { id: "i4", name: "HubSpot CRM", type: "CRM Sync", status: "Pending", icon: "HS", description: "Import and sync contacts from HubSpot", leads: 0, lastSync: "Pending" },
  { id: "i5", name: "Website Lead Form", type: "Web Form", status: "Connected", icon: "WF", description: "Capture leads from your website contact forms", leads: 68, lastSync: "1 min ago" },
  { id: "i6", name: "Google Ads", type: "Ad Platform", status: "Connected", icon: "GA", description: "Track and import leads from Google Ad campaigns", leads: 22, lastSync: "15 mins ago" },
  { id: "i7", name: "WhatsApp Business", type: "Messaging", status: "Disconnected", icon: "WA", description: "Convert WhatsApp inquiries into CRM leads", leads: 0, lastSync: "Never" },
  { id: "i8", name: "Zapier", type: "Automation", status: "Connected", icon: "ZP", description: "Connect with 5000+ apps via Zapier", leads: 12, lastSync: "1 hour ago" },
];


  export const priceList: PriceItem[] = [
  { 
    id: "p1", 
    name: "Starter", 
    category: "CRM Plans", 
    price: 599, 
    billing: "Monthly", 
    features: ["Per Users", "15,000 contacts", "AI sales forecasting", "Workflow automation", "All integrations", "Custom dashboards", "Priority support", "SSO & RBAC"], 
    isPopular: false 
  },
  { 
    id: "p2", 
    name: "Professional", 
    category: "CRM Plans", 
    price: 999, 
    billing: "Monthly", 
    features: ["Per Users", "50,000 contacts", "AI sales forecasting", "Workflow automation", "All integrations", "Custom dashboards", "Priority support", "SSO & RBAC"], 
    isPopular: true 
  },
  { 
    id: "p3", 
    name: "Enterprise", 
    category: "CRM Plans", 
    price: undefined, 
    billing: "Custom", 
    features: ["Unlimited users", "Unlimited contacts", "Dedicated infrastructure", "Custom AI models", "On-premise option", "SLA guarantee", "Dedicated CSM", "Custom integrations"], 
    isPopular: false 
  },

  //{ id: "p4", name: "Annual Starter", category: "CRM Plans", price: 9990, billing: "Annual", features: ["All Starter features", "2 months free", "Onboarding support"], isPopular: false },
  //{ id: "p5", name: "Annual Professional", category: "CRM Plans", price: 24990, billing: "Annual", features: ["All Professional features", "2 months free", "Training sessions", "API access"], isPopular: false },
  //{ id: "p6", name: "AI Insights Add-on", category: "Add-ons", price: 799, billing: "Monthly", features: ["Predictive lead scoring", "AI report summaries", "Anomaly detection", "Forecasting"], isPopular: false },
  //{ id: "p7", name: "Extra Users (5-pack)", category: "Add-ons", price: 499, billing: "Monthly", features: ["5 additional user seats", "Full feature access"], isPopular: false },
  //{ id: "p8", name: "Custom Integration", category: "Services", price: 15000, billing: "One-time", features: ["Custom API integration", "30-day support", "Documentation"], isPopular: false },
];

export const empWiseData = [];

export const statusWiseData = [];

export const salesWiseData = [];
