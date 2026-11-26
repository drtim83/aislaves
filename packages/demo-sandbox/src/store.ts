import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCrewPackById } from '@aislaves/crew-packs';
import {
  decideApprovalOnTenant,
  ensureSeedWorkbook,
  executeBossDailyPulseScenario,
  executeCardToCalendarScenario,
  executeInboundWebhookTrigger,
  executePosClosingScenario,
  executePosZReportUploadScenario,
  executeProspectReplyScenario,
  executeReceiptClaimScenario,
  executeSopQuestionScenario,
  getLocalDataDir,
  ingestDocumentToChunks,
  resetTenantWorkbook,
} from '@aislaves/crew-engine';
import {
  CAPABILITY_CATALOG,
  SME_PRICING_TIERS,
  type CapabilityId,
  type CustomRestApiSpec,
  type KnowledgeSlotId,
  type MagicConnectLink,
  type PlanId,
  type PlatformState,
  type PolicyTier,
  type TenantPolicySettings,
  type TenantWorkspace,
} from '@aislaves/shared';
import { buildSeedPlatformState } from './fixtures';
import { getFirebaseAdminDb } from './firestore-adapter';

const PLATFORM_DOC_PATH = 'aislaves_platform/global_state';

function getStateFilePath(baseDir?: string): string {
  const dir = getLocalDataDir(baseDir);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'state.json');
}

export async function loadPlatformState(baseDir?: string): Promise<PlatformState> {
  const db = getFirebaseAdminDb();
  if (db) {
    try {
      const snap = await db.doc(PLATFORM_DOC_PATH).get();
      if (snap.exists) {
        const data = snap.data() as PlatformState;
        return data;
      }
      const initial = buildSeedPlatformState();
      initial.tenants['demo-kopikita'].workbook = await ensureSeedWorkbook('demo-kopikita', baseDir, true);
      await savePlatformState(initial, baseDir);
      return initial;
    } catch {
      // Fallback safely to local storage if Firestore call fails transiently
    }
  }

  const statePath = getStateFilePath(baseDir);
  if (!existsSync(statePath)) {
    const initial = buildSeedPlatformState();
    initial.tenants['demo-kopikita'].workbook = await ensureSeedWorkbook('demo-kopikita', baseDir, true);
    writeFileSync(statePath, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }

  return JSON.parse(readFileSync(statePath, 'utf8')) as PlatformState;
}

export async function savePlatformState(state: PlatformState, baseDir?: string): Promise<PlatformState> {
  const next: PlatformState = { ...state, updatedAt: new Date().toISOString() };

  const db = getFirebaseAdminDb();
  if (db) {
    try {
      const batch = db.batch();
      batch.set(db.doc(PLATFORM_DOC_PATH), next);
      for (const tenant of Object.values(next.tenants)) {
        batch.set(
          db.collection('tenants').doc(tenant.id),
          {
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            industry: tenant.industry,
            isDemo: tenant.isDemo,
            installedPackIds: tenant.installedPackIds,
            planId: tenant.subscription.planId,
            status: tenant.subscription.status,
            updatedAt: next.updatedAt,
          },
          { merge: true }
        );
      }
      await batch.commit();
      return next;
    } catch {
      // Fall through to local file fallback
    }
  }

  writeFileSync(getStateFilePath(baseDir), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export async function resetDemoSandbox(baseDir?: string): Promise<PlatformState> {
  const existing = await loadPlatformState(baseDir);
  const freshSeed = buildSeedPlatformState();
  freshSeed.tenants['demo-kopikita'].workbook = await resetTenantWorkbook('demo-kopikita', baseDir);

  for (const [id, tenant] of Object.entries(existing.tenants)) {
    if (!tenant.isDemo && !freshSeed.tenants[id]) {
      freshSeed.tenants[id] = tenant;
    }
  }
  return savePlatformState(freshSeed, baseDir);
}

export async function provisionTenantWorkspace(
  input: {
    name: string;
    industry: string;
    planId: PlanId;
    packIds: string[];
  },
  baseDir?: string
): Promise<{ state: PlatformState; tenant: TenantWorkspace }> {
  const state = await loadPlatformState(baseDir);
  const tier = SME_PRICING_TIERS[input.planId];
  const slugBase =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 28) || 'sme-client';
  const id = `client-${slugBase}-${Date.now().toString(36).slice(-4)}`;
  const now = new Date().toISOString();

  const tenant: TenantWorkspace = {
    id,
    slug: `${slugBase}-${Date.now().toString(36).slice(-3)}`,
    name: input.name.trim(),
    industry: input.industry.trim() || 'SME Operations',
    isDemo: false,
    installedPackIds: input.packIds.filter((pid) => Boolean(getCrewPackById(pid))),
    policySettings: {
      mealClaimCapMyr: 30,
      posVarianceCapMyr: 20,
      dailyEmailWarmupCap: 30,
      emailsSentToday: 0,
    },
    subscription: {
      planId: input.planId,
      monthlyRetainerMyr: tier.monthlyRetainerMyr,
      setupFeeMyr: tier.setupFeeMyr,
      taskAllowance: tier.taskAllowance,
      tasksUsed: 0,
      hardCapMyr: tier.monthlyRetainerMyr,
      cogsLedgerMyr: 0,
      status: 'active',
    },
    cartridges: {
      'capability:messaging': {
        cartridgeId: 'whatsapp-cloud',
        label: 'WhatsApp Business Cloud API',
        delivery: 'cloud',
        connected: true,
        connectedAt: now,
      },
      'capability:crm': {
        cartridgeId: 'built-in-crm',
        label: 'Built-in AISlaves CRM',
        delivery: 'cloud',
        connected: true,
        connectedAt: now,
      },
    },
    knowledgeSlots: {},
    knowledgeChunks: [],
    customApis: [],
    leads: [],
    outreachSequences: [],
    approvals: [],
    runs: [],
    whatsappFeed: [
      {
        id: `wa-welcome-${Date.now()}`,
        sender: 'ai_employee',
        senderLabel: 'AISlaves Onboarding',
        text: `Workspace provisioned for ${input.name} on ${tier.name} (MYR ${tier.monthlyRetainerMyr}/mo). Ready for Magic Connect OAuth.`,
        timestamp: 'Now',
        tag: 'PROVISIONED',
      },
    ],
    workbook: {
      fileName: `${slugBase}_bookkeeping.xlsx`,
      lastUpdatedAt: now,
      preservedFormulas: [],
      backups: [],
      committedRows: [],
      stagingRows: [],
    },
    auditLogs: [
      {
        id: `audit-prov-${Date.now()}`,
        tenantId: id,
        actor: 'operator:studio',
        event: 'TENANT_PROVISIONED',
        detail: `Provisioned ${input.name} on ${tier.name} (${input.packIds.join(', ')})`,
        timestamp: now,
      },
    ],
    complianceFlags: [],
  };

  state.tenants[id] = tenant;
  await savePlatformState(state, baseDir);
  return { state, tenant };
}

export async function updateTenantOperatorControl(
  input: {
    tenantId: string;
    action: 'toggle_pause' | 'topup_1000_tasks';
  },
  baseDir?: string
): Promise<PlatformState> {
  const state = await loadPlatformState(baseDir);
  const tenant = state.tenants[input.tenantId];
  if (!tenant) throw new Error(`Tenant ${input.tenantId} not found`);

  if (input.action === 'toggle_pause') {
    tenant.subscription.status = tenant.subscription.status === 'paused' ? 'active' : 'paused';
  } else if (input.action === 'topup_1000_tasks') {
    tenant.subscription.taskAllowance += 1000;
  }

  tenant.auditLogs.unshift({
    id: `audit-ctrl-${Date.now()}`,
    tenantId: tenant.id,
    actor: 'operator:studio',
    event: input.action.toUpperCase(),
    detail: `Status=${tenant.subscription.status}, Allowance=${tenant.subscription.taskAllowance}`,
    timestamp: new Date().toISOString(),
  });

  return savePlatformState(state, baseDir);
}

export async function updateTenantWorkbenchSettings(
  input: {
    tenantId: string;
    cartridgeUpdates?: Partial<Record<CapabilityId, string>>;
    policySettings?: Partial<TenantPolicySettings>;
  },
  baseDir?: string
): Promise<PlatformState> {
  const state = await loadPlatformState(baseDir);
  const tenant = state.tenants[input.tenantId];
  if (!tenant) throw new Error(`Tenant ${input.tenantId} not found`);

  const now = new Date().toISOString();
  if (input.cartridgeUpdates) {
    for (const [capKey, cartridgeId] of Object.entries(input.cartridgeUpdates)) {
      const cap = capKey as CapabilityId;
      const spec = CAPABILITY_CATALOG[cap]?.availableCartridges.find((c) => c.id === cartridgeId);
      if (spec) {
        tenant.cartridges[cap] = {
          cartridgeId: spec.id,
          label: spec.name,
          delivery: spec.delivery,
          connected: true,
          connectedAt: now,
        };
      }
    }
  }

  if (input.policySettings) {
    tenant.policySettings = {
      mealClaimCapMyr: Number(input.policySettings.mealClaimCapMyr ?? tenant.policySettings?.mealClaimCapMyr ?? 30),
      posVarianceCapMyr: Number(input.policySettings.posVarianceCapMyr ?? tenant.policySettings?.posVarianceCapMyr ?? 20),
      dailyEmailWarmupCap: Number(input.policySettings.dailyEmailWarmupCap ?? tenant.policySettings?.dailyEmailWarmupCap ?? 30),
      emailsSentToday: Number(input.policySettings.emailsSentToday ?? tenant.policySettings?.emailsSentToday ?? 0),
    };
  }

  tenant.auditLogs.unshift({
    id: `audit-wb-${Date.now()}`,
    tenantId: tenant.id,
    actor: 'operator:workbench',
    event: 'WORKBENCH_UPDATED',
    detail: 'Hot-swapped Cartridge bindings or updated Policy Gatekeeper thresholds.',
    timestamp: now,
  });

  return savePlatformState(state, baseDir);
}

export async function uploadTenantKnowledgeDoc(
  input: {
    tenantId: string;
    slotId: KnowledgeSlotId;
    fileName: string;
    mimeType?: string;
    base64Data?: string;
    plainText?: string;
    departmentScope?: 'all_staff' | 'sales' | 'finance_only';
  },
  baseDir?: string
): Promise<{ state: PlatformState; chunksAdded: number }> {
  const state = await loadPlatformState(baseDir);
  const tenant = state.tenants[input.tenantId];
  if (!tenant) throw new Error(`Tenant ${input.tenantId} not found`);

  const buffer = input.base64Data
    ? Buffer.from(input.base64Data.replace(/^data:[^;]+;base64,/, ''), 'base64')
    : undefined;

  const newChunks = await ingestDocumentToChunks({
    slotId: input.slotId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    buffer,
    plainText: input.plainText,
    departmentScope: input.departmentScope ?? 'all_staff',
  });

  if (newChunks.length === 0) {
    throw new Error(`No readable text extracted from ${input.fileName}`);
  }

  const existing = tenant.knowledgeChunks ?? [];
  tenant.knowledgeChunks = [...newChunks, ...existing].slice(0, 60);
  tenant.knowledgeSlots[input.slotId] = {
    docName: input.fileName,
    summary: `Indexed ${newChunks.length} searchable section(s) from ${input.fileName}.`,
    citationsCount: newChunks.length,
    indexed: true,
    updatedAt: new Date().toISOString(),
    excerptSample: newChunks[0].content.slice(0, 180),
  };

  tenant.auditLogs.unshift({
    id: `audit-rag-${Date.now()}`,
    tenantId: tenant.id,
    actor: 'operator:sop_rag',
    event: 'KNOWLEDGE_SLOT_INDEXED',
    detail: `Indexed ${newChunks.length} chunk(s) into slot:${input.slotId} from ${input.fileName}`,
    timestamp: new Date().toISOString(),
  });

  await savePlatformState(state, baseDir);
  return { state, chunksAdded: newChunks.length };
}

export async function uploadTenantPosReport(
  input: {
    tenantId: string;
    fileName: string;
    base64Data?: string;
    csvText?: string;
  },
  baseDir?: string
): Promise<PlatformState> {
  const state = await loadPlatformState(baseDir);
  const tenant = state.tenants[input.tenantId];
  if (!tenant) throw new Error(`Tenant ${input.tenantId} not found`);

  const buffer = input.base64Data
    ? Buffer.from(input.base64Data.replace(/^data:[^;]+;base64,/, ''), 'base64')
    : undefined;

  const { tenant: updated } = await executePosZReportUploadScenario(
    tenant,
    { fileName: input.fileName, buffer, csvText: input.csvText },
    baseDir
  );
  state.tenants[tenant.id] = updated;
  return savePlatformState(state, baseDir);
}

export async function createMagicConnectLink(
  input: {
    tenantId: string;
    missingCapabilities: CapabilityId[];
    missingSlots: KnowledgeSlotId[];
  },
  baseDir?: string
): Promise<{ state: PlatformState; link: MagicConnectLink }> {
  const state = await loadPlatformState(baseDir);
  const tenant = state.tenants[input.tenantId];
  if (!tenant) throw new Error(`Tenant ${input.tenantId} not found`);

  const token = `mc-${tenant.slug.slice(0, 12)}-${Date.now().toString(36).slice(-5)}`;
  const link: MagicConnectLink = {
    token,
    tenantId: tenant.id,
    tenantName: tenant.name,
    missingCapabilities: input.missingCapabilities,
    missingSlots: input.missingSlots,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  };

  state.magicLinks[token] = link;
  await savePlatformState(state, baseDir);
  return { state, link };
}

export async function completeMagicConnectItem(
  input: {
    token: string;
    kind: 'capability' | 'slot';
    key: string;
    valueLabel?: string;
  },
  baseDir?: string
): Promise<{ state: PlatformState; link: MagicConnectLink }> {
  const state = await loadPlatformState(baseDir);
  const link = state.magicLinks[input.token];
  if (!link) throw new Error(`Magic Connect token ${input.token} not found`);
  const tenant = state.tenants[link.tenantId];
  if (!tenant) throw new Error(`Tenant ${link.tenantId} not found`);

  const now = new Date().toISOString();
  if (input.kind === 'capability') {
    const cap = input.key as CapabilityId;
    const defaultIds: Record<CapabilityId, { id: string; label: string }> = {
      'capability:pos': { id: 'storehub', label: 'StoreHub Cloud POS (OAuth)' },
      'capability:accounting': { id: 'bukku', label: 'Bukku Accounting (OAuth)' },
      'capability:spreadsheet': { id: 'gdrive-sheets', label: 'Google Drive Shared Excel' },
      'capability:messaging': { id: 'whatsapp-cloud', label: 'WhatsApp Business API' },
      'capability:mail': { id: 'gmail-oauth', label: 'Google Workspace Gmail OAuth' },
      'capability:calendar': { id: 'google-calendar', label: 'Google Calendar + Meet OAuth' },
      'capability:crm': { id: 'built-in-crm', label: 'Built-in AISlaves CRM' },
    };
    const chosen = defaultIds[cap];
    tenant.cartridges[cap] = {
      cartridgeId: chosen.id,
      label: input.valueLabel || chosen.label,
      delivery: 'cloud',
      connected: true,
      connectedAt: now,
    };
    link.missingCapabilities = link.missingCapabilities.filter((c) => c !== cap);
  } else {
    const slot = input.key as KnowledgeSlotId;
    tenant.knowledgeSlots[slot] = {
      docName: input.valueLabel || `${tenant.slug}_${slot}_2026.pdf`,
      summary: 'Uploaded via 1-Tap Magic Connect Link and indexed cleanly.',
      citationsCount: 6,
      indexed: true,
      updatedAt: now,
      excerptSample: `Indexed ${input.valueLabel || slot} policy document.`,
    };
    link.missingSlots = link.missingSlots.filter((s) => s !== slot);
  }

  if (link.missingCapabilities.length === 0 && link.missingSlots.length === 0) {
    link.status = 'completed';
    link.completedAt = now;
  }

  tenant.auditLogs.unshift({
    id: `audit-mc-${Date.now()}`,
    tenantId: tenant.id,
    actor: 'sme:magic_link',
    event: 'MAGIC_CONNECT_BOUND',
    detail: `Connected ${input.kind} ${input.key} via 1-tap Magic Link (${link.token})`,
    timestamp: now,
  });

  await savePlatformState(state, baseDir);
  return { state, link };
}

export async function registerCustomRestApi(
  input: {
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
  },
  baseDir?: string
): Promise<{ state: PlatformState; spec: CustomRestApiSpec }> {
  const state = await loadPlatformState(baseDir);
  const tenant = state.tenants[input.tenantId];
  if (!tenant) throw new Error(`Tenant ${input.tenantId} not found`);

  const spec: CustomRestApiSpec = {
    id: `api-${Date.now().toString(36)}`,
    tenantId: tenant.id,
    name: input.name,
    toolName: input.toolName.replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
    method: input.method,
    baseUrl: input.baseUrl,
    path: input.path.startsWith('/') ? input.path : `/${input.path}`,
    authType: input.authType,
    policyTier: input.policyTier,
    inboundWebhookTriggerId: input.inboundWebhookTriggerId || 'custom-event',
    description: input.description,
    createdAt: new Date().toISOString(),
  };

  tenant.customApis.unshift(spec);
  tenant.auditLogs.unshift({
    id: `audit-api-${Date.now()}`,
    tenantId: tenant.id,
    actor: 'operator:api_factory',
    event: 'CUSTOM_REST_BRIDGE_CREATED',
    detail: `Registered custom.${spec.toolName} & inbound hook /hooks/${spec.inboundWebhookTriggerId}`,
    timestamp: new Date().toISOString(),
  });

  await savePlatformState(state, baseDir);
  return { state, spec };
}

export type DemoActionKind =
  | 'card_ocr'
  | 'batch_cards_fanout'
  | 'prospect_reply'
  | 'pos_closing'
  | 'receipt_claim'
  | 'sop_query'
  | 'boss_pulse';

export async function runTenantDemoAction(
  input: {
    tenantId: string;
    action: DemoActionKind;
    imageBase64?: string;
    mimeType?: string;
    geminiApiKey?: string;
    question?: string;
    replyText?: string;
  },
  baseDir?: string
): Promise<PlatformState> {
  const state = await loadPlatformState(baseDir);
  const tenant = state.tenants[input.tenantId];
  if (!tenant) throw new Error(`Tenant ${input.tenantId} not found`);

  let updatedTenant = tenant;
  switch (input.action) {
    case 'card_ocr':
      updatedTenant = (
        await executeCardToCalendarScenario(tenant, {
          mode: 'single_card',
          imageBase64: input.imageBase64,
          mimeType: input.mimeType,
          geminiApiKey: input.geminiApiKey,
        })
      ).tenant;
      break;
    case 'batch_cards_fanout':
      updatedTenant = (
        await executeCardToCalendarScenario(tenant, {
          mode: 'batch_fanout',
          geminiApiKey: input.geminiApiKey,
        })
      ).tenant;
      break;
    case 'prospect_reply':
      updatedTenant = executeProspectReplyScenario(tenant, { replyText: input.replyText }).tenant;
      break;
    case 'pos_closing':
      updatedTenant = (await executePosClosingScenario(tenant, baseDir)).tenant;
      break;
    case 'receipt_claim':
      updatedTenant = (
        await executeReceiptClaimScenario(tenant, {
          imageBase64: input.imageBase64,
          mimeType: input.mimeType,
          geminiApiKey: input.geminiApiKey,
        })
      ).tenant;
      break;
    case 'sop_query':
      updatedTenant = (await executeSopQuestionScenario(tenant, input.question, input.geminiApiKey)).tenant;
      break;
    case 'boss_pulse':
      updatedTenant = executeBossDailyPulseScenario(tenant).tenant;
      break;
  }

  state.tenants[tenant.id] = updatedTenant;
  return savePlatformState(state, baseDir);
}

export async function decideTenantApproval(
  input: {
    approvalId: string;
    decision: 'approved' | 'rejected';
    actor: string;
    idempotencyKey?: string;
  },
  baseDir?: string
): Promise<{ state: PlatformState; tenantId: string; duplicate: boolean }> {
  const state = await loadPlatformState(baseDir);
  const ownerTenant = Object.values(state.tenants).find((t) =>
    t.approvals.some((a) => a.id === input.approvalId)
  );
  if (!ownerTenant) {
    throw new Error(`Approval ${input.approvalId} not found`);
  }

  const res = await decideApprovalOnTenant(ownerTenant, input, baseDir);
  state.tenants[ownerTenant.id] = res.tenant;
  await savePlatformState(state, baseDir);
  return { state, tenantId: ownerTenant.id, duplicate: res.duplicate };
}

export async function triggerInboundTenantWebhook(
  input: {
    tenantSlug: string;
    triggerId: string;
    payload: Record<string, unknown>;
  },
  baseDir?: string
): Promise<{ state: PlatformState; tenantId: string }> {
  const state = await loadPlatformState(baseDir);
  const target = Object.values(state.tenants).find(
    (t) => t.slug === input.tenantSlug || t.id === input.tenantSlug
  );
  if (!target) {
    throw new Error(`Tenant slug ${input.tenantSlug} not found`);
  }
  const { tenant } = executeInboundWebhookTrigger(target, input.triggerId, input.payload);
  state.tenants[target.id] = tenant;
  await savePlatformState(state, baseDir);
  return { state, tenantId: target.id };
}
