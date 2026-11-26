export const CAPABILITY_IDS = [
  'capability:pos',
  'capability:accounting',
  'capability:spreadsheet',
  'capability:messaging',
  'capability:mail',
  'capability:calendar',
  'capability:crm',
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export const KNOWLEDGE_SLOT_IDS = [
  'pricing_guide',
  'company_policies',
  'bookkeeping_folder',
  'brand_voice',
] as const;

export type KnowledgeSlotId = (typeof KNOWLEDGE_SLOT_IDS)[number];

export type PolicyTier = 'READ' | 'DRAFT' | 'APPROVAL_REQUIRED' | 'BLOCKED';

export interface CapabilityContractDefinition {
  id: CapabilityId;
  label: string;
  standardTools: string[];
  availableCartridges: Array<{
    id: string;
    name: string;
    delivery: 'cloud' | 'edge-runner' | 'sandbox';
  }>;
}

export const CAPABILITY_CATALOG: Record<CapabilityId, CapabilityContractDefinition> = {
  'capability:pos': {
    id: 'capability:pos',
    label: 'POS Systems',
    standardTools: ['get_daily_summary', 'list_shifts', 'get_item_sales', 'list_refunds_voids'],
    availableCartridges: [
      { id: 'mock-pos', name: 'Demo Sandbox POS (StoreHub Mock)', delivery: 'sandbox' },
      { id: 'storehub', name: 'StoreHub Cloud POS', delivery: 'cloud' },
      { id: 'loyverse', name: 'Loyverse POS', delivery: 'cloud' },
      { id: 'qashier', name: 'Qashier POS', delivery: 'cloud' },
      { id: 'feedme', name: 'FeedMe F&B POS', delivery: 'cloud' },
      { id: 'zreport-csv', name: 'Universal Z-Report CSV/XLSX Parser', delivery: 'cloud' },
    ],
  },
  'capability:accounting': {
    id: 'capability:accounting',
    label: 'Accounting & e-Invoice',
    standardTools: ['create_draft_bill', 'list_unpaid_invoices', 'record_payment_match', 'get_coa_accounts', 'validate_einvoice'],
    availableCartridges: [
      { id: 'mock-accounting', name: 'Demo Sandbox Accounting (Bukku/Xero Mock)', delivery: 'sandbox' },
      { id: 'xero', name: 'Xero Accounting', delivery: 'cloud' },
      { id: 'bukku', name: 'Bukku Accounting (Malaysia + MyInvois)', delivery: 'cloud' },
      { id: 'quickbooks', name: 'QuickBooks Online', delivery: 'cloud' },
      { id: 'sql-account', name: 'SQL Account (On-Prem Edge Runner)', delivery: 'edge-runner' },
      { id: 'autocount', name: 'AutoCount (On-Prem Edge Runner)', delivery: 'edge-runner' },
    ],
  },
  'capability:spreadsheet': {
    id: 'capability:spreadsheet',
    label: 'Shared Excel & Sheets',
    standardTools: ['acquire_lock', 'read_sheet_summary', 'append_ledger_row', 'snapshot_backup', 'release_lock'],
    availableCartridges: [
      { id: 'local-exceljs', name: 'Safe Shared Excel Engine (.xlsx + .bak)', delivery: 'cloud' },
      { id: 'gdrive-sheets', name: 'Google Drive / Sheets', delivery: 'cloud' },
      { id: 'onedrive-excel', name: 'Microsoft OneDrive / SharePoint Excel', delivery: 'cloud' },
      { id: 'smb-local-folder', name: 'Client NAS / Windows SMB Folder (Edge Runner)', delivery: 'edge-runner' },
    ],
  },
  'capability:messaging': {
    id: 'capability:messaging',
    label: 'WhatsApp & Team Messaging',
    standardTools: ['send_template_message', 'send_approval_card', 'list_recent_threads', 'download_media'],
    availableCartridges: [
      { id: 'mock-whatsapp', name: 'Interactive WhatsApp Pitch Simulator', delivery: 'sandbox' },
      { id: 'whatsapp-cloud', name: 'Meta WhatsApp Business Cloud API', delivery: 'cloud' },
      { id: 'telegram', name: 'Telegram Bot API', delivery: 'cloud' },
      { id: 'slack', name: 'Slack Workspace', delivery: 'cloud' },
    ],
  },
  'capability:mail': {
    id: 'capability:mail',
    label: 'Outreach & Inbox Mail',
    standardTools: ['send_email', 'create_draft', 'search_threads', 'get_thread', 'watch_replies'],
    availableCartridges: [
      { id: 'mock-mail', name: 'Demo Sandbox Inbox (Gmail/M365 Mock)', delivery: 'sandbox' },
      { id: 'gmail-oauth', name: 'Google Workspace / Gmail OAuth', delivery: 'cloud' },
      { id: 'm365-graph', name: 'Microsoft 365 Graph Mail', delivery: 'cloud' },
      { id: 'smtp-imap', name: 'Custom Company SMTP / IMAP', delivery: 'cloud' },
    ],
  },
  'capability:calendar': {
    id: 'capability:calendar',
    label: 'Calendar Booking',
    standardTools: ['get_free_busy', 'list_slots', 'create_tentative_hold', 'book_event'],
    availableCartridges: [
      { id: 'mock-calendar', name: 'Demo Sandbox Calendar (Google Meet Mock)', delivery: 'sandbox' },
      { id: 'google-calendar', name: 'Google Calendar + Meet', delivery: 'cloud' },
      { id: 'outlook-calendar', name: 'Microsoft Outlook + Teams', delivery: 'cloud' },
      { id: 'cal-com', name: 'Cal.com Scheduling', delivery: 'cloud' },
    ],
  },
  'capability:crm': {
    id: 'capability:crm',
    label: 'Leads & CRM Pipeline',
    standardTools: ['upsert_lead', 'log_activity', 'update_stage', 'list_stale_leads'],
    availableCartridges: [
      { id: 'built-in-crm', name: 'Built-in AISlaves Firestore CRM', delivery: 'cloud' },
      { id: 'hubspot', name: 'HubSpot CRM', delivery: 'cloud' },
      { id: 'pipedrive', name: 'Pipedrive CRM', delivery: 'cloud' },
      { id: 'zoho-crm', name: 'Zoho CRM', delivery: 'cloud' },
    ],
  },
};
