export * from './contracts';
export * from './pricing';
export * from './manifest';

import type { CapabilityId, KnowledgeSlotId, PolicyTier } from './contracts';
import type { PlanId } from './pricing';

export interface CartridgeBinding {
  cartridgeId: string;
  label: string;
  delivery: 'cloud' | 'edge-runner' | 'sandbox';
  connected: boolean;
  connectedAt?: string;
}

export interface KnowledgeSlotBinding {
  docName: string;
  summary: string;
  citationsCount: number;
  indexed: boolean;
  updatedAt: string;
  excerptSample: string;
}

export interface CustomRestApiSpec {
  id: string;
  tenantId: string;
  name: string;
  toolName: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  baseUrl: string;
  path: string;
  authType: 'bearer' | 'api_key_header' | 'none';
  policyTier: PolicyTier;
  inboundWebhookTriggerId: string;
  description: string;
  createdAt: string;
  lastCalledAt?: string;
  lastResponsePreview?: string;
}

export interface MagicConnectLink {
  token: string;
  tenantId: string;
  tenantName: string;
  missingCapabilities: CapabilityId[];
  missingSlots: KnowledgeSlotId[];
  status: 'pending' | 'completed' | 'expired';
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
}

export interface TenantSubscription {
  planId: PlanId;
  monthlyRetainerMyr: number;
  setupFeeMyr: number;
  taskAllowance: number;
  tasksUsed: number;
  hardCapMyr: number;
  cogsLedgerMyr: number;
  status: 'active' | 'paused' | 'trial';
}

export interface LeadRecord {
  id: string;
  tenantId: string;
  fullName: string;
  jobTitle: string;
  company: string;
  email: string;
  phone: string;
  source: 'whatsapp_card_ocr' | 'batch_expo_ocr' | 'inbound_webhook';
  ocrConfidence: number;
  stage: 'new_lead' | 'awaiting_approval' | 'outreach_active' | 'replied_positive' | 'meeting_booked';
  createdAt: string;
}

export interface OutreachSequence {
  id: string;
  tenantId: string;
  leadId: string;
  leadEmail: string;
  leadName: string;
  company: string;
  subject: string;
  body: string;
  sopCitation: string;
  status: 'pending_approval' | 'active_cadence' | 'replied_halted' | 'meeting_booked' | 'rejected';
  scheduledFollowUps: Array<{
    stepLabel: string;
    dueInDays: number;
    status: 'queued' | 'cancelled_on_reply' | 'sent';
  }>;
  replySnippet?: string;
  bookedSlot?: {
    startIso: string;
    displayLabel: string;
    meetLink: string;
  };
}

export interface ApprovalItem {
  id: string;
  tenantId: string;
  runId: string;
  idempotencyKey: string;
  actionType: 'outbound_email_send' | 'calendar_booking_confirm' | 'excel_commit_update' | 'expense_claim_payout';
  title: string;
  summary: string;
  channel: 'whatsapp' | 'portal';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  payload: Record<string, unknown>;
}

export interface CrewRunStep {
  stepNumber: number;
  agentId: string;
  agentRole: string;
  modelTier: 'gemini-flash' | 'gemini-pro' | 'local-ollama' | 'deterministic';
  toolUsed: string;
  policyDecision: 'ALLOW' | 'PAUSE_FOR_APPROVAL' | 'BLOCKED';
  summary: string;
  citation?: string;
  latencyMs: number;
  cogsMyr: number;
}

export interface CrewRun {
  id: string;
  tenantId: string;
  crewPackId: string;
  triggerLabel: string;
  status: 'completed' | 'awaiting_approval' | 'blocked_cap' | 'blocked_paused';
  startedAt: string;
  completedAt?: string;
  spawnedWorkersCount: number;
  totalCogsMyr: number;
  steps: CrewRunStep[];
}

export interface WhatsAppSimMessage {
  id: string;
  sender: 'staff' | 'boss' | 'ai_employee';
  senderLabel: string;
  text: string;
  timestamp: string;
  tag?: string;
  approvalId?: string;
  attachmentName?: string;
}

export interface ExcelLedgerRow {
  date: string;
  outletOrVendor: string;
  category: string;
  posReportedMyr: number;
  bankDepositedMyr: number;
  varianceMyr: number;
  status: string;
}

export interface WorkbookPreviewState {
  fileName: string;
  lastUpdatedAt: string;
  preservedFormulas: string[];
  backups: Array<{
    backupFileName: string;
    createdAt: string;
    reason: string;
  }>;
  committedRows: ExcelLedgerRow[];
  stagingRows: ExcelLedgerRow[];
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actor: string;
  event: string;
  detail: string;
  timestamp: string;
}

export interface TenantWorkspace {
  id: string;
  slug: string;
  name: string;
  industry: string;
  isDemo: boolean;
  installedPackIds: string[];
  subscription: TenantSubscription;
  cartridges: Partial<Record<CapabilityId, CartridgeBinding>>;
  knowledgeSlots: Partial<Record<KnowledgeSlotId, KnowledgeSlotBinding>>;
  customApis: CustomRestApiSpec[];
  leads: LeadRecord[];
  outreachSequences: OutreachSequence[];
  approvals: ApprovalItem[];
  runs: CrewRun[];
  whatsappFeed: WhatsAppSimMessage[];
  workbook: WorkbookPreviewState;
  auditLogs: AuditLogEntry[];
  complianceFlags: Array<{
    id: string;
    severity: 'warning' | 'info' | 'resolved';
    title: string;
    detail: string;
    sourceDoc: string;
  }>;
}

export interface PlatformState {
  updatedAt: string;
  tenants: Record<string, TenantWorkspace>;
  magicLinks: Record<string, MagicConnectLink>;
}
