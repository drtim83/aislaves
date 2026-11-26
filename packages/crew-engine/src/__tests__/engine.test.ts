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
  invokeCustomRestBridge,
  stageLedgerRowsSafely,
  toMcpToolDescriptor,
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
