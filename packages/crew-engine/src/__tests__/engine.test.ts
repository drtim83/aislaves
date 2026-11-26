import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { CREW_PACKS, getCrewPackById } from '@aislaves/crew-packs';
import { evaluatePackPreflight, type TenantWorkspace } from '@aislaves/shared';
import {
  commitApprovedStagingRows,
  decideApprovalOnTenant,
  ensureSeedWorkbook,
  evaluateToolCallPolicy,
  executeCardToCalendarScenario,
  executeInboundWebhookTrigger,
  executeProspectReplyScenario,
  generateIcsInvite,
  ingestDocumentToChunks,
  invokeCustomRestBridge,
  parsePosZReportBuffer,
  parseWhatsAppWebhookPayload,
  retrieveCitedChunks,
  stageLedgerRowsSafely,
  toMcpToolDescriptor,
  verifyWhatsAppWebhook,
} from '../index';

function makeTestTenant(): TenantWorkspace {
  return {
    id: 'test-tenant',
    slug: 'test-tenant',
    name: 'Test SME Sdn Bhd',
    industry: 'B2B Distribution',
    isDemo: true,
    installedPackIds: ['sales-card-to-calendar', 'fnb-pos-bookkeeping'],
    subscription: {
      planId: 'sme_growth',
      monthlyRetainerMyr: 899,
      setupFeeMyr: 1800,
      taskAllowance: 2000,
      tasksUsed: 10,
      hardCapMyr: 899,
      cogsLedgerMyr: 1.5,
      status: 'active',
    },
    cartridges: {
      'capability:messaging': { cartridgeId: 'mock-whatsapp', label: 'Mock WhatsApp', delivery: 'sandbox', connected: true },
      'capability:mail': { cartridgeId: 'mock-mail', label: 'Mock Gmail', delivery: 'sandbox', connected: true },
      'capability:crm': { cartridgeId: 'built-in-crm', label: 'Built-in CRM', delivery: 'cloud', connected: true },
    },
    knowledgeSlots: {
      pricing_guide: {
        docName: 'Pricing_2026.pdf',
        summary: 'Wholesale cartons MYR 1.45/unit (2000 MOQ)',
        citationsCount: 4,
        indexed: true,
        updatedAt: '2026-11-26T00:00:00Z',
        excerptSample: 'Wholesale cartons start at MYR 1.45/unit at 2,000 MOQ.',
      },
    },
    customApis: [],
    leads: [],
    outreachSequences: [],
    approvals: [],
    runs: [],
    whatsappFeed: [],
    workbook: {
      fileName: 'KopiKita_Bookkeeping_2026.xlsx',
      lastUpdatedAt: '2026-11-26T00:00:00Z',
      preservedFormulas: [],
      backups: [],
      committedRows: [],
      stagingRows: [],
    },
    auditLogs: [],
    complianceFlags: [],
  };
}

test('Crew Pack YAML loader validates all 3 bundles and reports Green/Amber preflight gaps', () => {
  assert.equal(CREW_PACKS.length, 3);
  const salesPack = getCrewPackById('sales-card-to-calendar');
  assert.ok(salesPack);

  const tenant = makeTestTenant();
  const report = evaluatePackPreflight(salesPack, tenant);
  assert.equal(report.readyToActivate, false);
  const calendarRow = report.items.find((i) => i.key === 'capability:calendar');
  assert.equal(calendarRow?.status, 'amber');
  const mailRow = report.items.find((i) => i.key === 'capability:mail');
  assert.equal(mailRow?.status, 'green');
});

test('Policy Gatekeeper enforces pause kill-switch, fair-use task cap, and approval pause', () => {
  const tenant = makeTestTenant();
  assert.equal(
    evaluateToolCallPolicy({ tenant, toolName: 'mail.send', policyTier: 'APPROVAL_REQUIRED' }).decision,
    'PAUSE_FOR_APPROVAL'
  );

  tenant.subscription.tasksUsed = tenant.subscription.taskAllowance;
  const blockedCap = evaluateToolCallPolicy({ tenant, toolName: 'mail.send', policyTier: 'READ' });
  assert.equal(blockedCap.decision, 'BLOCKED');
  assert.equal(blockedCap.code, 'TASK_CAP_REACHED');

  tenant.subscription.tasksUsed = 5;
  tenant.subscription.status = 'paused';
  const blockedPause = evaluateToolCallPolicy({ tenant, toolName: 'pos.read', policyTier: 'READ' });
  assert.equal(blockedPause.decision, 'BLOCKED');
  assert.equal(blockedPause.code, 'TENANT_PAUSED');
});

test('Safe Shared Excel writer creates .bak snapshots and preserves SUM formulas across stage & commit', async () => {
  const tempBase = mkdtempSync(join(tmpdir(), 'aislaves-xlsx-'));
  try {
    await ensureSeedWorkbook('test-kopi', tempBase, true);
    const { backupFileName, workbook: staged } = await stageLedgerRowsSafely(
      'test-kopi',
      [
        {
          date: '2026-11-26',
          outletOrVendor: 'KopiKita Subang SS15',
          category: 'POS Daily Close',
          posReportedMyr: 3180,
          bankDepositedMyr: 3038,
          varianceMyr: 142,
          status: 'AI_Staging',
        },
      ],
      'Unit test stage backup',
      tempBase
    );
    assert.ok(backupFileName.endsWith('.bak.xlsx'));
    assert.equal(staged.stagingRows.length, 1);

    const committed = await commitApprovedStagingRows('test-kopi', 'Unit test commit', tempBase);
    assert.equal(committed.committedCount, 1);
    assert.equal(committed.workbook.stagingRows.length, 0);
    assert.equal(committed.workbook.committedRows.length, 4);

    // Verify real xlsx formula nodes on disk remain untouched
    const xlsxPath = join(tempBase, 'workbooks', 'test-kopi', 'KopiKita_Bookkeeping_2026.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxPath);
    const sheet = wb.getWorksheet('Daily_Sales_Summary');
    assert.ok(sheet);
    const totalFormula = sheet.getRow(2).getCell(4).value as { formula?: string };
    assert.equal(totalFormula.formula, 'SUM(D7:D200)');

    const backupsDir = join(tempBase, 'workbooks', 'test-kopi', '_aislaves_backups');
    const bakFiles = readdirSync(backupsDir).filter((f) => f.endsWith('.bak.xlsx'));
    assert.ok(bakFiles.length >= 2);
  } finally {
    rmSync(tempBase, { recursive: true, force: true });
  }
});

test('Card-to-Calendar pauses before email send, approves idempotently, and halts follow-ups atomically on reply', async () => {
  const start = makeTestTenant();
  const { tenant: afterCard } = await executeCardToCalendarScenario(start, { mode: 'single_card' });
  assert.equal(afterCard.leads.length, 1);
  assert.equal(afterCard.approvals.length, 1);
  assert.equal(afterCard.approvals[0].status, 'pending');
  assert.equal(afterCard.outreachSequences[0].status, 'pending_approval');

  const firstApproval = afterCard.approvals[0];
  const { tenant: afterApprove, duplicate: dup1 } = await decideApprovalOnTenant(afterCard, {
    approvalId: firstApproval.id,
    decision: 'approved',
    actor: 'Boss',
    idempotencyKey: firstApproval.idempotencyKey,
  });
  assert.equal(dup1, false);
  assert.equal(afterApprove.outreachSequences[0].status, 'active_cadence');

  // Replaying same approval ID must be ignored idempotently
  const { duplicate: dup2 } = await decideApprovalOnTenant(afterApprove, {
    approvalId: firstApproval.id,
    decision: 'approved',
    actor: 'Boss',
  });
  assert.equal(dup2, true);

  // Prospect replies -> follow-ups cancel atomically & calendar hold is queued
  const { tenant: afterReply } = executeProspectReplyScenario(afterApprove, {
    replyText: 'Thursday 3pm works great!',
  });
  assert.equal(afterReply.outreachSequences[0].status, 'replied_halted');
  assert.ok(afterReply.outreachSequences[0].scheduledFollowUps.every((s) => s.status === 'cancelled_on_reply'));
  assert.equal(afterReply.approvals[0].actionType, 'calendar_booking_confirm');

  const calApproval = afterReply.approvals[0];
  const { tenant: afterBook } = await decideApprovalOnTenant(afterReply, {
    approvalId: calApproval.id,
    decision: 'approved',
    actor: 'Boss',
  });
  assert.equal(afterBook.outreachSequences[0].status, 'meeting_booked');
  assert.ok(afterBook.outreachSequences[0].bookedSlot?.meetLink.includes('meet.google.com'));
});

test('Operator REST-to-MCP Bridge & Tenant Inbound Webhook create MCP tools and process leads', async () => {
  const spec = {
    id: 'api-1',
    tenantId: 'test-tenant',
    name: 'Legacy WMS Order Sync',
    toolName: 'sync_wms_order',
    method: 'POST' as const,
    baseUrl: 'https://demo.aislaves.local/wms',
    path: '/v1/orders',
    authType: 'bearer' as const,
    policyTier: 'APPROVAL_REQUIRED' as const,
    inboundWebhookTriggerId: 'web-lead',
    description: 'Sync wholesale order into WMS',
    createdAt: new Date().toISOString(),
  };
  const descriptor = toMcpToolDescriptor(spec);
  assert.equal(descriptor.name, 'custom.sync_wms_order');
  assert.equal(descriptor.policyTier, 'APPROVAL_REQUIRED');

  const callRes = await invokeCustomRestBridge(spec, { orderId: 'ORD-991' });
  assert.equal(callRes.ok, true);
  assert.equal(callRes.statusCode, 200);

  const { tenant: updated, run } = executeInboundWebhookTrigger(makeTestTenant(), 'web-lead', {
    name: 'Siti Aminah',
    company: 'Klang Packaging Sdn Bhd',
    email: 'siti@klangpack.my',
  });
  assert.equal(run.status, 'completed');
  assert.equal(updated.leads[0].email, 'siti@klangpack.my');
});

test('Slice 2 SOP RAG ingests pricing documents, enforces RBAC scopes, and cites sections', async () => {
  const pricingChunks = await ingestDocumentToChunks({
    slotId: 'pricing_guide',
    fileName: 'Wholesale_Rates_2026.md',
    plainText: `# Section 1.2 Carton Pricing\n\nCustom kraft cartons cost MYR 1.35 per unit at 3,000 MOQ.\n\n# Section 2.1 Payment Terms\n\nNet 30 credit requires SST registration.`,
    departmentScope: 'sales',
  });
  const financeChunks = await ingestDocumentToChunks({
    slotId: 'company_policies',
    fileName: 'Payroll_Confidential.md',
    plainText: `# Executive Payroll\n\nDirector bonus pool is 12% EBITDA.`,
    departmentScope: 'finance_only',
  });

  const all = [...pricingChunks, ...financeChunks];
  const salesHits = await retrieveCitedChunks({
    chunks: all,
    query: 'What is the carton pricing and MOQ?',
    allowedScopes: ['all_staff', 'sales'],
    topK: 2,
  });
  assert.equal(salesHits.length, 2);
  assert.ok(salesHits[0].citation.includes('Wholesale_Rates_2026.md'));
  assert.ok(salesHits.every((h) => h.departmentScope !== 'finance_only'));
});

test('Slice 2 RFC 5545 Calendar .ics invite generator builds valid calendar request', () => {
  const ics = generateIcsInvite({
    uid: 'ais-test-1',
    title: 'AISlaves Product Walkthrough',
    description: 'Discuss carton supply quote.',
    startIso: '2026-12-03T15:00:00+08:00',
    durationMinutes: 30,
    attendeeEmail: 'daniel.tan@freshbake.com.my',
    meetLink: 'https://meet.google.com/ais-demo-3pm',
  });
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('METHOD:REQUEST'));
  assert.ok(ics.includes('daniel.tan@freshbake.com.my'));
  assert.ok(ics.includes('END:VCALENDAR'));
});

test('Slice 2 Universal POS Z-report CSV parser flags variances exceeding custom threshold', async () => {
  const csv = [
    'Date,Outlet,POS Reported,Bank Settled,Category',
    '2026-11-26,KopiKita Bangsar,4500,4500,POS Close',
    '2026-11-26,KopiKita Subang,3200,3050,POS Close',
  ].join('\n');
  const parsed = await parsePosZReportBuffer({
    fileName: 'storehub_export.csv',
    csvText: csv,
    varianceCapMyr: 25,
  });
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.flaggedRows.length, 1);
  assert.equal(parsed.flaggedRows[0].varianceMyr, 150);
  assert.equal(parsed.grossSalesMyr, 7700);
});

test('Slice 2 Meta WhatsApp Cloud webhook verifies handshake and extracts 1-tap approval clicks', () => {
  const challenge = verifyWhatsAppWebhook({
    mode: 'subscribe',
    token: 'aislaves-verify',
    challenge: '987654',
    expectedToken: 'aislaves-verify',
  });
  assert.equal(challenge.ok, true);
  assert.equal(challenge.body, '987654');

  const events = parseWhatsAppWebhookPayload({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: '60123456789',
                  type: 'interactive',
                  interactive: {
                    type: 'button_reply',
                    button_reply: { id: 'approve:appr-123', title: 'Approve' },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'approval_tap');
  assert.equal(events[0].decision, 'approved');
  assert.equal(events[0].approvalId, 'appr-123');
});
