import {
  estimateStepCogsMyr,
  type ApprovalItem,
  type CrewRun,
  type CrewRunStep,
  type ExcelLedgerRow,
  type LeadRecord,
  type OutreachSequence,
  type TenantWorkspace,
} from '@aislaves/shared';
import { dispatchApprovedOutreachEmail } from './cartridges/email-outreach';
import { parsePosZReportBuffer } from './cartridges/pos-zreport';
import {
  commitApprovedStagingRows,
  stageLedgerRowsSafely,
} from './excel-safe-writer';
import { evaluateToolCallPolicy } from './gatekeeper';
import { retrieveCitedChunks } from './sop-rag';
import {
  draftSopGroundedColdEmail,
  extractBusinessCard,
  extractExpenseReceipt,
} from './vision-ocr';

function cloneTenant(tenant: TenantWorkspace): TenantWorkspace {
  return structuredClone(tenant);
}

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('en-MY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function recordBlockedRun(
  tenant: TenantWorkspace,
  packId: string,
  triggerLabel: string,
  reason: string,
  status: 'blocked_cap' | 'blocked_paused'
): { tenant: TenantWorkspace; run: CrewRun } {
  const run: CrewRun = {
    id: `run-${Date.now()}`,
    tenantId: tenant.id,
    crewPackId: packId,
    triggerLabel,
    status,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    spawnedWorkersCount: 0,
    totalCogsMyr: 0,
    steps: [
      {
        stepNumber: 1,
        agentId: 'policy_gatekeeper',
        agentRole: 'Deterministic Policy Gatekeeper',
        modelTier: 'deterministic',
        toolUsed: 'gatekeeper.preflight',
        policyDecision: 'BLOCKED',
        summary: reason,
        latencyMs: 12,
        cogsMyr: 0,
      },
    ],
  };
  tenant.runs.unshift(run);
  tenant.whatsappFeed.push({
    id: `wa-${Date.now()}`,
    sender: 'ai_employee',
    senderLabel: 'AISlaves Safeguard',
    text: reason,
    timestamp: nowTimeLabel(),
    tag: 'SAFEGUARD',
  });
  return { tenant, run };
}

export async function executeCardToCalendarScenario(
  inputTenant: TenantWorkspace,
  opts: {
    mode: 'single_card' | 'batch_fanout';
    imageBase64?: string;
    mimeType?: string;
    geminiApiKey?: string;
  }
): Promise<{ tenant: TenantWorkspace; run: CrewRun }> {
  const tenant = cloneTenant(inputTenant);
  const packId = 'sales-card-to-calendar';
  const triggerLabel =
    opts.mode === 'batch_fanout'
      ? 'WhatsApp Batch: 3 Expo Business Cards Fan-Out'
      : opts.imageBase64
        ? 'WhatsApp Photo: Real Uploaded Business Card (Live Vision OCR)'
        : 'WhatsApp Photo: Trade-Show Business Card (Daniel Tan)';

  const preflight = evaluateToolCallPolicy({
    tenant,
    toolName: 'vision.parseBusinessCard',
    policyTier: 'READ',
  });
  if (preflight.decision === 'BLOCKED') {
    return recordBlockedRun(
      tenant,
      packId,
      triggerLabel,
      preflight.reason,
      preflight.code === 'TENANT_PAUSED' ? 'blocked_paused' : 'blocked_cap'
    );
  }

  const sampleKeys = opts.mode === 'batch_fanout' ? ['batch_1', 'batch_2', 'batch_3'] : ['trade_show_1'];
  const ragPricing = await retrieveCitedChunks({
    chunks: tenant.knowledgeChunks ?? [],
    query: 'wholesale pricing MOQ delivery turnaround discounts',
    allowedScopes: ['all_staff', 'sales'],
    topK: 1,
    geminiApiKey: opts.geminiApiKey,
  });
  const pricingGuide =
    ragPricing[0]?.content ??
    tenant.knowledgeSlots.pricing_guide?.excerptSample ??
    'Standard wholesale packaging starts from MYR 1.45/unit (2,000 MOQ), 7-day Klang Valley SLA.';

  const steps: CrewRunStep[] = [];
  let runCogs = 0;

  if (opts.mode === 'batch_fanout') {
    tenant.whatsappFeed.push({
      id: `wa-staff-${Date.now()}`,
      sender: 'staff',
      senderLabel: 'Kenji (Sales Rep)',
      text: '[Uploaded 3 exhibition business card photos] Please OCR, enrich, and prepare intros before tomorrow morning.',
      timestamp: nowTimeLabel(),
      attachmentName: 'expo_cards_batch_3.zip',
    });
  } else {
    tenant.whatsappFeed.push({
      id: `wa-staff-${Date.now()}`,
      sender: 'staff',
      senderLabel: 'Kenji (Sales Rep)',
      text: opts.imageBase64
        ? '[Uploaded live business card photo] Capture lead and draft outreach.'
        : '[Snapped business card: Daniel Tan — FreshBake Foods Sdn Bhd] Quote him based on our 2026 Catalog SOP.',
      timestamp: nowTimeLabel(),
      attachmentName: opts.imageBase64 ? 'live_card_upload.jpg' : 'freshbake_card.jpg',
    });
  }

  // Respect maxSpawnDepth = 2 bounded fan-out
  for (let i = 0; i < sampleKeys.length; i += 1) {
    const key = sampleKeys[i];
    const extracted = await extractBusinessCard({
      sampleKey: key,
      imageBase64: opts.imageBase64,
      mimeType: opts.mimeType,
      geminiApiKey: opts.geminiApiKey,
    });
    const step1Cost = estimateStepCogsMyr('gemini-flash', false);
    runCogs += step1Cost;
    steps.push({
      stepNumber: steps.length + 1,
      agentId: 'card_scout',
      agentRole: opts.mode === 'batch_fanout' ? `Card Scout Worker #${i + 1} (depth 1/2)` : 'Business Card OCR & Lead Enricher',
      modelTier: 'gemini-flash',
      toolUsed: extracted.mode === 'live_gemini_vision' ? 'gemini-2.5-flash (Live Vision)' : 'mcp-vision-ocr.parseBusinessCard',
      policyDecision: 'ALLOW',
      summary: `Extracted ${extracted.fullName} (${extracted.jobTitle}, ${extracted.company} • ${extracted.email}) at ${Math.round(extracted.confidence * 100)}% confidence & deduped in CRM.`,
      latencyMs: extracted.mode === 'live_gemini_vision' ? 1420 : 210,
      cogsMyr: step1Cost,
    });

    const leadId = `lead-${Date.now()}-${i}`;
    const lead: LeadRecord = {
      id: leadId,
      tenantId: tenant.id,
      fullName: extracted.fullName,
      jobTitle: extracted.jobTitle,
      company: extracted.company,
      email: extracted.email,
      phone: extracted.phone,
      source: opts.mode === 'batch_fanout' ? 'batch_expo_ocr' : 'whatsapp_card_ocr',
      ocrConfidence: extracted.confidence,
      stage: 'awaiting_approval',
      createdAt: new Date().toISOString(),
    };
    tenant.leads.unshift(lead);

    const drafted = await draftSopGroundedColdEmail({
      lead: extracted,
      pricingExcerpt: pricingGuide,
      senderCompany: tenant.name,
      geminiApiKey: opts.geminiApiKey,
    });
    const step2Cost = estimateStepCogsMyr('gemini-pro', false);
    runCogs += step2Cost;
    steps.push({
      stepNumber: steps.length + 1,
      agentId: 'cold_writer',
      agentRole: opts.mode === 'batch_fanout' ? `Cold Writer Worker #${i + 1}` : 'Cold Outreach Copywriter',
      modelTier: 'gemini-pro',
      toolUsed: 'mcp-knowledge-sop.searchPolicies + mcp-email-outreach.createDraft',
      policyDecision: 'ALLOW',
      summary: `Drafted personalized cold email + Day-3 & Day-7 cadence for ${extracted.email}.`,
      citation: drafted.citation,
      latencyMs: 390,
      cogsMyr: step2Cost,
    });

    const approvalId = `appr-${Date.now()}-${i}`;
    const idempotencyKey = `idem-email-${tenant.id}-${extracted.email}-${Date.now()}-${i}`;
    const gate = evaluateToolCallPolicy({
      tenant,
      toolName: 'mcp-email-outreach.sendApprovedEmail',
      policyTier: 'APPROVAL_REQUIRED',
      idempotencyKey,
    });

    const seqId = `seq-${Date.now()}-${i}`;
    const sequence: OutreachSequence = {
      id: seqId,
      tenantId: tenant.id,
      leadId,
      leadEmail: extracted.email,
      leadName: extracted.fullName,
      company: extracted.company,
      subject: drafted.subject,
      body: drafted.body,
      sopCitation: drafted.citation,
      status: 'pending_approval',
      scheduledFollowUps: [
        { stepLabel: 'Day-3 Polite Nudge', dueInDays: 3, status: 'queued' },
        { stepLabel: 'Day-7 Case Study + Pricing Check-In', dueInDays: 7, status: 'queued' },
      ],
    };
    tenant.outreachSequences.unshift(sequence);

    const approval: ApprovalItem = {
      id: approvalId,
      tenantId: tenant.id,
      runId: `run-pending`,
      idempotencyKey,
      actionType: 'outbound_email_send',
      title: `Send Cold Email + Sequence to ${extracted.fullName} (${extracted.company})`,
      summary: `Subject: "${drafted.subject}" — Grounded in ${drafted.citation}`,
      channel: 'whatsapp',
      status: 'pending',
      createdAt: new Date().toISOString(),
      payload: { sequenceId: seqId, leadId, email: extracted.email },
    };
    tenant.approvals.unshift(approval);

    const gateCost = estimateStepCogsMyr('deterministic', true);
    runCogs += gateCost;
    steps.push({
      stepNumber: steps.length + 1,
      agentId: 'policy_gatekeeper',
      agentRole: 'Deterministic Policy Gatekeeper',
      modelTier: 'deterministic',
      toolUsed: 'mcp-email-outreach.sendApprovedEmail',
      policyDecision: gate.decision === 'PAUSE_FOR_APPROVAL' ? 'PAUSE_FOR_APPROVAL' : 'BLOCKED',
      summary: `Paused before external email send; dispatched 1-tap WhatsApp approval card (${idempotencyKey}).`,
      latencyMs: 35,
      cogsMyr: gateCost,
    });

    tenant.whatsappFeed.push({
      id: `wa-ai-${Date.now()}-${i}`,
      sender: 'ai_employee',
      senderLabel: 'Sales Growth Crew (Card-to-Calendar)',
      text: `OCR Complete (${Math.round(extracted.confidence * 100)}%): ${extracted.fullName} — ${extracted.jobTitle} @ ${extracted.company} (${extracted.email}).\n\nDrafted intro + Day-3/7 follow-ups citing ${drafted.citation}. Approve send?`,
      timestamp: nowTimeLabel(),
      tag: 'APPROVAL REQUIRED',
      approvalId,
    });
  }

  const runId = `run-${Date.now()}`;
  for (const appr of tenant.approvals.slice(0, sampleKeys.length)) {
    appr.runId = runId;
  }

  tenant.subscription.tasksUsed += sampleKeys.length;
  tenant.subscription.cogsLedgerMyr = Math.round((tenant.subscription.cogsLedgerMyr + runCogs) * 1000) / 1000;

  const run: CrewRun = {
    id: runId,
    tenantId: tenant.id,
    crewPackId: packId,
    triggerLabel,
    status: 'awaiting_approval',
    startedAt: new Date().toISOString(),
    spawnedWorkersCount: opts.mode === 'batch_fanout' ? 3 : 1,
    totalCogsMyr: Math.round(runCogs * 1000) / 1000,
    steps,
  };
  tenant.runs.unshift(run);
  tenant.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    tenantId: tenant.id,
    actor: 'crew:sales-card-to-calendar',
    event: 'CARD_OCR_DRAFT_PAUSED',
    detail: `Processed ${sampleKeys.length} business card(s); staged approval card(s) without auto-sending.`,
    timestamp: new Date().toISOString(),
  });

  return { tenant, run };
}

export function executeProspectReplyScenario(
  inputTenant: TenantWorkspace,
  opts?: { leadEmail?: string; replyText?: string }
): { tenant: TenantWorkspace; run: CrewRun } {
  const tenant = cloneTenant(inputTenant);
  const preflight = evaluateToolCallPolicy({
    tenant,
    toolName: 'mail.watch_replies',
    policyTier: 'READ',
  });
  if (preflight.decision === 'BLOCKED') {
    return recordBlockedRun(
      tenant,
      'sales-card-to-calendar',
      'Prospect Reply Webhook',
      preflight.reason,
      preflight.code === 'TENANT_PAUSED' ? 'blocked_paused' : 'blocked_cap'
    );
  }

  const targetSeq =
    tenant.outreachSequences.find(
      (s) =>
        (opts?.leadEmail && s.leadEmail === opts.leadEmail) ||
        s.status === 'active_cadence' ||
        s.status === 'pending_approval'
    ) ?? tenant.outreachSequences[0];

  if (!targetSeq) {
    return recordBlockedRun(
      tenant,
      'sales-card-to-calendar',
      'Prospect Reply Webhook',
      'No active outreach sequence found to match reply. Snap a business card first.',
      'blocked_paused'
    );
  }

  const replyText = opts?.replyText || 'Hi, Thursday 3:00 PM works great for a quick demo! Please send the Meet link.';

  // 1. Atomic Follow-Up Cancellation Guarantee
  targetSeq.status = 'replied_halted';
  targetSeq.replySnippet = replyText;
  let cancelledCount = 0;
  for (const step of targetSeq.scheduledFollowUps) {
    if (step.status === 'queued') {
      step.status = 'cancelled_on_reply';
      cancelledCount += 1;
    }
  }
  const matchingLead = tenant.leads.find((l) => l.id === targetSeq.leadId || l.email === targetSeq.leadEmail);
  if (matchingLead) matchingLead.stage = 'replied_positive';

  const bookedSlot = {
    startIso: '2026-12-03T15:00:00+08:00',
    displayLabel: 'Thu 3 Dec 2026 • 3:00 PM MYT (30 mins)',
    meetLink: 'https://meet.google.com/ais-demo-3pm',
  };

  const approvalId = `appr-cal-${Date.now()}`;
  const idempotencyKey = `idem-cal-${tenant.id}-${targetSeq.id}`;
  const runId = `run-${Date.now()}`;
  const calCost = estimateStepCogsMyr('gemini-pro', true);

  tenant.approvals.unshift({
    id: approvalId,
    tenantId: tenant.id,
    runId,
    idempotencyKey,
    actionType: 'calendar_booking_confirm',
    title: `Book Meet w/ ${targetSeq.leadName} (${targetSeq.company})`,
    summary: `Slot: ${bookedSlot.displayLabel} • Instant stop halted ${cancelledCount} queued follow-ups.`,
    channel: 'whatsapp',
    status: 'pending',
    createdAt: new Date().toISOString(),
    payload: { sequenceId: targetSeq.id, leadId: targetSeq.leadId, bookedSlot },
  });

  tenant.whatsappFeed.push({
    id: `wa-reply-${Date.now()}`,
    sender: 'ai_employee',
    senderLabel: 'Calendar Setter Agent',
    text: `Positive reply from ${targetSeq.leadName} (${targetSeq.company}):\n"${replyText}"\n\nCancelled ${cancelledCount} pending follow-ups automatically. Rep free at Thu 3:00 PM MYT. Confirm Google Meet invite?`,
    timestamp: nowTimeLabel(),
    tag: 'CALENDAR HOLD',
    approvalId,
  });

  const run: CrewRun = {
    id: runId,
    tenantId: tenant.id,
    crewPackId: 'sales-card-to-calendar',
    triggerLabel: `Inbox Reply Detected (${targetSeq.leadEmail})`,
    status: 'awaiting_approval',
    startedAt: new Date().toISOString(),
    spawnedWorkersCount: 1,
    totalCogsMyr: Math.round((calCost + 0.015) * 1000) / 1000,
    steps: [
      {
        stepNumber: 1,
        agentId: 'followup_nurturer',
        agentRole: 'Follow-Up Cadence Guard',
        modelTier: 'deterministic',
        toolUsed: 'mcp-email-outreach.detectRepliesAndStop',
        policyDecision: 'ALLOW',
        summary: `Reply matched thread; atomically halted ${cancelledCount} pending follow-up jobs (zero double-emails).`,
        latencyMs: 28,
        cogsMyr: 0.002,
      },
      {
        stepNumber: 2,
        agentId: 'calendar_closer',
        agentRole: 'Inbox Reply & Calendar Setter',
        modelTier: 'gemini-pro',
        toolUsed: 'mcp-calendar-booking.getFreeBusySlots',
        policyDecision: 'ALLOW',
        summary: `Verified free/busy + 15-min buffer on sales rep calendar: ${bookedSlot.displayLabel} is open.`,
        latencyMs: 240,
        cogsMyr: calCost,
      },
      {
        stepNumber: 3,
        agentId: 'policy_gatekeeper',
        agentRole: 'Deterministic Policy Gatekeeper',
        modelTier: 'deterministic',
        toolUsed: 'mcp-calendar-booking.bookAppointmentWithMeet',
        policyDecision: 'PAUSE_FOR_APPROVAL',
        summary: `Held tentative slot and sent 1-tap WhatsApp confirmation (${idempotencyKey}).`,
        latencyMs: 19,
        cogsMyr: 0.015,
      },
    ],
  };

  tenant.subscription.tasksUsed += 1;
  tenant.subscription.cogsLedgerMyr = Math.round((tenant.subscription.cogsLedgerMyr + run.totalCogsMyr) * 1000) / 1000;
  tenant.runs.unshift(run);
  tenant.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    tenantId: tenant.id,
    actor: 'agent:calendar_closer',
    event: 'REPLY_HALT_AND_CALENDAR_HOLD',
    detail: `Cancelled ${cancelledCount} follow-ups for ${targetSeq.leadEmail}; held Thu 3:00 PM MYT slot.`,
    timestamp: new Date().toISOString(),
  });

  return { tenant, run };
}

export async function executePosClosingScenario(
  inputTenant: TenantWorkspace,
  baseDir?: string
): Promise<{ tenant: TenantWorkspace; run: CrewRun }> {
  const tenant = cloneTenant(inputTenant);
  const preflight = evaluateToolCallPolicy({
    tenant,
    toolName: 'mcp-pos-systems.getDailySummary',
    policyTier: 'READ',
  });
  if (preflight.decision === 'BLOCKED') {
    return recordBlockedRun(
      tenant,
      'fnb-pos-bookkeeping',
      'Nightly 3-Outlet POS Z-Report Close',
      preflight.reason,
      preflight.code === 'TENANT_PAUSED' ? 'blocked_paused' : 'blocked_cap'
    );
  }

  const rowsToStage: ExcelLedgerRow[] = [
    {
      date: '2026-11-26',
      outletOrVendor: 'KopiKita Bangsar Utama',
      category: 'POS Daily Close',
      posReportedMyr: 4520,
      bankDepositedMyr: 4520,
      varianceMyr: 0,
      status: 'AI_Staging (Matched)',
    },
    {
      date: '2026-11-26',
      outletOrVendor: 'KopiKita Damansara Uptown',
      category: 'POS Daily Close',
      posReportedMyr: 3890,
      bankDepositedMyr: 3890,
      varianceMyr: 0,
      status: 'AI_Staging (Matched)',
    },
    {
      date: '2026-11-26',
      outletOrVendor: 'KopiKita Subang SS15',
      category: 'POS Daily Close',
      posReportedMyr: 3180,
      bankDepositedMyr: 3038,
      varianceMyr: 142,
      status: 'AI_Staging (VARIANCE +RM142)',
    },
  ];

  const { workbook, backupFileName } = await stageLedgerRowsSafely(
    tenant.id,
    rowsToStage,
    'Nightly POS close pre-commit backup',
    baseDir
  );
  tenant.workbook = workbook;

  const approvalId = `appr-xls-${Date.now()}`;
  const idempotencyKey = `idem-xls-${tenant.id}-2026-11-26-${Date.now()}`;
  const runId = `run-${Date.now()}`;

  tenant.approvals.unshift({
    id: approvalId,
    tenantId: tenant.id,
    runId,
    idempotencyKey,
    actionType: 'excel_commit_update',
    title: 'Commit 3 POS Outlet Rows (Flag: Subang SS15 Cash Variance MYR 142)',
    summary: `Staged into AI_Staging with backup ${backupFileName}. Preserves all SUM formulas; LHDN MyInvois check noted 1 missing Buyer TIN.`,
    channel: 'whatsapp',
    status: 'pending',
    createdAt: new Date().toISOString(),
    payload: { rowsCount: rowsToStage.length, backupFileName },
  });

  tenant.complianceFlags.unshift({
    id: `flag-${Date.now()}`,
    severity: 'warning',
    title: 'Subang SS15 Outlet Cash/DuitNow Variance (+MYR 142.00)',
    detail: 'StoreHub shift #142 reported MYR 3,180 vs MYR 3,038 bank settlement (> MYR 20 SOP variance cap). Staged safely in AI_Staging pending owner approval.',
    sourceDoc: 'KopiKita_Claims_&_Cash_SOP_v3.pdf (Section 2.4 Variance Cap)',
  });

  tenant.whatsappFeed.push({
    id: `wa-pos-${Date.now()}`,
    sender: 'ai_employee',
    senderLabel: 'POS & Bookkeeping Crew',
    text: `Nightly Close Done (3 Branches): Gross MYR 11,590.\n- Bangsar & Damansara: 100% matched.\n- Subang SS15: MYR 142.00 shortfall flagged (> RM 20 SOP threshold).\n- Backup saved: ${backupFileName}\n\nCommit AI_Staging to Master Excel & stage Bukku draft journal?`,
    timestamp: nowTimeLabel(),
    tag: 'VARIANCE + EXCEL COMMIT',
    approvalId,
  });

  const cogs = estimateStepCogsMyr('gemini-flash', true) + estimateStepCogsMyr('gemini-pro', false);
  const run: CrewRun = {
    id: runId,
    tenantId: tenant.id,
    crewPackId: 'fnb-pos-bookkeeping',
    triggerLabel: 'StoreHub Nightly Close (3 Branches)',
    status: 'awaiting_approval',
    startedAt: new Date().toISOString(),
    spawnedWorkersCount: 2,
    totalCogsMyr: Math.round(cogs * 1000) / 1000,
    steps: [
      {
        stepNumber: 1,
        agentId: 'pos_closer',
        agentRole: 'POS Daily Closing & Reconciler',
        modelTier: 'gemini-flash',
        toolUsed: 'mcp-pos-systems.getDailySummary',
        policyDecision: 'ALLOW',
        summary: 'Pulled 3 outlets from StoreHub cartridge; detected MYR 142 variance at Subang SS15.',
        citation: 'KopiKita_Claims_&_Cash_SOP_v3.pdf (Section 2.4)',
        latencyMs: 310,
        cogsMyr: 0.015,
      },
      {
        stepNumber: 2,
        agentId: 'myinvois_validator',
        agentRole: 'LHDN MyInvois & SST Validator',
        modelTier: 'gemini-pro',
        toolUsed: 'mcp-accounting.validate_einvoice',
        policyDecision: 'ALLOW',
        summary: 'Verified 6% SST math; flagged 1 corporate catering invoice missing Buyer TIN for Bukku sync.',
        latencyMs: 340,
        cogsMyr: 0.065,
      },
      {
        stepNumber: 3,
        agentId: 'policy_gatekeeper',
        agentRole: 'Safe Shared Excel Engine + Gatekeeper',
        modelTier: 'deterministic',
        toolUsed: 'mcp-shared-excel.appendStagingRows',
        policyDecision: 'PAUSE_FOR_APPROVAL',
        summary: `Saved ${backupFileName}, wrote 3 rows to AI_Staging (formulas preserved), paused Master commit for Boss tap.`,
        latencyMs: 95,
        cogsMyr: 0.04,
      },
    ],
  };

  tenant.subscription.tasksUsed += 2;
  tenant.subscription.cogsLedgerMyr = Math.round((tenant.subscription.cogsLedgerMyr + run.totalCogsMyr) * 1000) / 1000;
  tenant.runs.unshift(run);
  tenant.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    tenantId: tenant.id,
    actor: 'crew:fnb-pos-bookkeeping',
    event: 'EXCEL_STAGED_WITH_BACKUP',
    detail: `Backed up ${backupFileName} and staged 3 outlet rows; awaiting Boss approval.`,
    timestamp: new Date().toISOString(),
  });

  return { tenant, run };
}

export async function executeReceiptClaimScenario(
  inputTenant: TenantWorkspace,
  opts?: { imageBase64?: string; mimeType?: string; geminiApiKey?: string }
): Promise<{ tenant: TenantWorkspace; run: CrewRun }> {
  const tenant = cloneTenant(inputTenant);
  const preflight = evaluateToolCallPolicy({
    tenant,
    toolName: 'vision.parseExpenseReceipt',
    policyTier: 'READ',
  });
  if (preflight.decision === 'BLOCKED') {
    return recordBlockedRun(
      tenant,
      'sop-claims-pulse',
      'WhatsApp Staff Receipt Claim',
      preflight.reason,
      preflight.code === 'TENANT_PAUSED' ? 'blocked_paused' : 'blocked_cap'
    );
  }

  const receipt = await extractExpenseReceipt(opts ?? {});
  const policyCapMyr = tenant.policySettings?.mealClaimCapMyr ?? 30;
  const excessMyr = Math.max(0, receipt.amountMyr - policyCapMyr);

  tenant.whatsappFeed.push({
    id: `wa-claim-staff-${Date.now()}`,
    sender: 'staff',
    senderLabel: 'Farah (Floor Supervisor)',
    text: `[Uploaded crumpled receipt] Claim RM ${receipt.amountMyr.toFixed(2)} (${receipt.merchant}) — urgent stock pick-up lunch.`,
    timestamp: nowTimeLabel(),
    attachmentName: 'receipt_village_kopi.jpg',
  });

  const approvalId = `appr-claim-${Date.now()}`;
  const idempotencyKey = `idem-claim-${tenant.id}-${Date.now()}`;
  const runId = `run-${Date.now()}`;

  tenant.approvals.unshift({
    id: approvalId,
    tenantId: tenant.id,
    runId,
    idempotencyKey,
    actionType: 'expense_claim_payout',
    title: `Staff Expense Claim RM ${receipt.amountMyr.toFixed(2)} (${receipt.merchant})`,
    summary:
      excessMyr > 0
        ? `Exceeds MYR 30 meal cap by MYR ${excessMyr.toFixed(2)} per Company Policy Section 4.2 — Boss decision needed.`
        : `Within MYR 30 meal policy cap — ready to log.`,
    channel: 'whatsapp',
    status: 'pending',
    createdAt: new Date().toISOString(),
    payload: { receipt, excessMyr, approvedAmountMyr: Math.min(receipt.amountMyr, policyCapMyr) },
  });

  tenant.whatsappFeed.push({
    id: `wa-claim-ai-${Date.now()}`,
    sender: 'ai_employee',
    senderLabel: 'Expense Claims Verifier',
    text: `Receipt OCR (${Math.round(receipt.confidence * 100)}%): ${receipt.merchant} • MYR ${receipt.amountMyr.toFixed(2)}.\nPolicy Check: Exceeds Section 4.2 Staff Meal Cap (MYR 30/day) by MYR ${excessMyr.toFixed(2)}.\n\nApprove full MYR ${receipt.amountMyr.toFixed(2)} exception or reject?`,
    timestamp: nowTimeLabel(),
    tag: 'POLICY EXCEPTION',
    approvalId,
  });

  const cogs = estimateStepCogsMyr('gemini-flash', true);
  const run: CrewRun = {
    id: runId,
    tenantId: tenant.id,
    crewPackId: 'sop-claims-pulse',
    triggerLabel: `WhatsApp Claim Receipt (${receipt.merchant})`,
    status: 'awaiting_approval',
    startedAt: new Date().toISOString(),
    spawnedWorkersCount: 1,
    totalCogsMyr: cogs,
    steps: [
      {
        stepNumber: 1,
        agentId: 'claims_verifier',
        agentRole: 'WhatsApp Staff Expense Verifier',
        modelTier: 'gemini-flash',
        toolUsed: receipt.mode === 'live_gemini_vision' ? 'gemini-2.5-flash (Live Vision)' : 'mcp-vision-ocr.parseExpenseReceipt',
        policyDecision: 'ALLOW',
        summary: `Extracted ${receipt.merchant}, Date ${receipt.date}, Total MYR ${receipt.amountMyr.toFixed(2)}.`,
        latencyMs: 260,
        cogsMyr: 0.015,
      },
      {
        stepNumber: 2,
        agentId: 'policy_gatekeeper',
        agentRole: 'Company SOP RAG + Policy Gate',
        modelTier: 'deterministic',
        toolUsed: 'mcp-knowledge-sop.checkApprovalLimit',
        policyDecision: 'PAUSE_FOR_APPROVAL',
        summary: `Cited Section 4.2 (max MYR 30 meal). Routed MYR ${excessMyr.toFixed(2)} over-cap exception to Boss WhatsApp.`,
        citation: 'KopiKita_Claims_&_Cash_SOP_v3.pdf (Section 4.2)',
        latencyMs: 24,
        cogsMyr: 0.04,
      },
    ],
  };

  tenant.subscription.tasksUsed += 1;
  tenant.subscription.cogsLedgerMyr = Math.round((tenant.subscription.cogsLedgerMyr + cogs) * 1000) / 1000;
  tenant.runs.unshift(run);
  return { tenant, run };
}

export async function executeSopQuestionScenario(
  inputTenant: TenantWorkspace,
  question?: string,
  geminiApiKey?: string
): Promise<{ tenant: TenantWorkspace; run: CrewRun }> {
  const tenant = cloneTenant(inputTenant);
  const q =
    question ||
    (tenant.id === 'demo-kopikita'
      ? 'Can floor supervisors claim RM 60 Grab mileage or RM 45 meals without manager pre-approval?'
      : 'What is our minimum wholesale carton MOQ and max sales discount allowed without Director sign-off?');

  const hits = await retrieveCitedChunks({
    chunks: tenant.knowledgeChunks ?? [],
    query: q,
    allowedScopes: ['all_staff', 'sales', 'finance_only'],
    topK: 2,
    geminiApiKey,
  });

  const policyCitation =
    hits[0]?.citation ||
    tenant.knowledgeSlots.company_policies?.docName ||
    tenant.knowledgeSlots.pricing_guide?.docName ||
    'Company_Policy_Handbook.pdf';

  const answer =
    hits.length > 0
      ? `Cited ${hits.map((h) => h.citation).join(' & ')}:\n\n${hits.map((h) => `• ${h.content}`).join('\n')}`
      : tenant.id === 'demo-kopikita'
        ? `Per ${policyCitation} (Section 4.2 Staff Claims & Section 4.4 Transport): Staff meals are capped at MYR ${tenant.policySettings?.mealClaimCapMyr ?? 30}/day and Grab/mileage is reimbursed at MYR 0.80/km (or actual e-hailing receipt up to MYR 25/trip).`
        : `Per ${policyCitation} (Section 2.1 MOQ & Section 3.3 Discount Matrix): Wholesale food-grade cartons require 2,000 units MOQ (starting MYR 1.45/unit).`;

  tenant.whatsappFeed.push(
    {
      id: `wa-sop-q-${Date.now()}`,
      sender: 'staff',
      senderLabel: tenant.id === 'demo-kopikita' ? 'Aiman (Outlet Lead)' : 'Kenji (Sales Rep)',
      text: q,
      timestamp: nowTimeLabel(),
    },
    {
      id: `wa-sop-a-${Date.now() + 1}`,
      sender: 'ai_employee',
      senderLabel: 'Cited SOP Helpdesk Agent',
      text: answer,
      timestamp: nowTimeLabel(),
      tag: 'SOP CITED',
    }
  );

  const cogs = estimateStepCogsMyr('gemini-flash', true);
  const run: CrewRun = {
    id: `run-${Date.now()}`,
    tenantId: tenant.id,
    crewPackId: 'sop-claims-pulse',
    triggerLabel: 'WhatsApp Staff Policy Q&A',
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    spawnedWorkersCount: 1,
    totalCogsMyr: cogs,
    steps: [
      {
        stepNumber: 1,
        agentId: 'sop_helpdesk',
        agentRole: 'Company Policy & SOP Helpdesk',
        modelTier: 'gemini-flash',
        toolUsed: 'mcp-knowledge-sop.searchPolicies',
        policyDecision: 'ALLOW',
        summary: `Retrieved exact policy clause with strict department RBAC scope (${policyCitation}).`,
        citation: policyCitation,
        latencyMs: 145,
        cogsMyr: cogs,
      },
    ],
  };
  tenant.subscription.tasksUsed += 1;
  tenant.subscription.cogsLedgerMyr = Math.round((tenant.subscription.cogsLedgerMyr + cogs) * 1000) / 1000;
  tenant.runs.unshift(run);
  return { tenant, run };
}

export function executeBossDailyPulseScenario(inputTenant: TenantWorkspace): { tenant: TenantWorkspace; run: CrewRun } {
  const tenant = cloneTenant(inputTenant);
  const pendingCount = tenant.approvals.filter((a) => a.status === 'pending').length;
  const bookedCalls = tenant.outreachSequences.filter((s) => s.status === 'meeting_booked').length;

  const summaryMsg =
    tenant.id === 'demo-kopikita'
      ? `8:30 AM BOSS DAILY PULSE — KopiKita (3 Outlets)\n• Yesterday Gross POS Sales: MYR 11,590\n• Flagged Variance: Subang SS15 (+MYR 142 cash short)\n• LHDN MyInvois Watch: 1 supplier invoice missing Buyer TIN\n• Pending Your 1-Tap Approval: ${pendingCount} item(s)\n• MTD Hours Saved vs Clerk: ${Math.round((tenant.subscription.tasksUsed * 12) / 60 * 10) / 10} hrs`
      : `8:30 AM BOSS DAILY PULSE — Apex Precision Packaging\n• New Trade-Show Leads Processed: ${tenant.leads.length}\n• Active Cold Email Cadences: ${tenant.outreachSequences.filter((s) => s.status === 'active_cadence').length}\n• Positive Replies / Booked Meetings: ${bookedCalls}\n• Pending Your 1-Tap Approval: ${pendingCount} item(s)`;

  tenant.whatsappFeed.push({
    id: `wa-pulse-${Date.now()}`,
    sender: 'ai_employee',
    senderLabel: 'Boss Daily Pulse Agent (8:30 AM)',
    text: summaryMsg,
    timestamp: '08:30 AM',
    tag: 'DAILY BRIEF',
  });

  const cogs = estimateStepCogsMyr('gemini-pro', true);
  const run: CrewRun = {
    id: `run-${Date.now()}`,
    tenantId: tenant.id,
    crewPackId: 'sop-claims-pulse',
    triggerLabel: '08:30 AM Scheduled Boss Daily Pulse',
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    spawnedWorkersCount: 1,
    totalCogsMyr: cogs,
    steps: [
      {
        stepNumber: 1,
        agentId: 'boss_daily_pulse',
        agentRole: '8:30 AM Boss Daily Pulse Agent',
        modelTier: 'gemini-pro',
        toolUsed: 'mcp-pos-systems.getDailySummary + mcp-whatsapp-business.sendTemplateMessage',
        policyDecision: 'ALLOW',
        summary: 'Aggregated branch metrics, compliance alerts, and pending approvals into executive WhatsApp brief.',
        latencyMs: 280,
        cogsMyr: cogs,
      },
    ],
  };
  tenant.subscription.tasksUsed += 1;
  tenant.subscription.cogsLedgerMyr = Math.round((tenant.subscription.cogsLedgerMyr + cogs) * 1000) / 1000;
  tenant.runs.unshift(run);
  return { tenant, run };
}

export async function decideApprovalOnTenant(
  inputTenant: TenantWorkspace,
  opts: {
    approvalId: string;
    decision: 'approved' | 'rejected';
    actor: string;
    idempotencyKey?: string;
  },
  baseDir?: string
): Promise<{
  tenant: TenantWorkspace;
  approval: ApprovalItem;
  duplicate: boolean;
}> {
  const tenant = cloneTenant(inputTenant);
  const approval = tenant.approvals.find((a) => a.id === opts.approvalId);
  if (!approval) {
    throw new Error(`Approval ${opts.approvalId} not found in tenant ${tenant.id}`);
  }

  if (opts.idempotencyKey && approval.idempotencyKey !== opts.idempotencyKey) {
    throw new Error('Idempotency key mismatch for approval decision.');
  }

  // Idempotency check: prevent duplicate side effects on double-tap
  if (approval.status !== 'pending') {
    return { tenant, approval, duplicate: true };
  }

  approval.status = opts.decision;
  approval.decidedAt = new Date().toISOString();
  approval.decidedBy = opts.actor;

  if (opts.decision === 'approved') {
    if (approval.actionType === 'outbound_email_send') {
      const seqId = String(approval.payload.sequenceId || '');
      const seq = tenant.outreachSequences.find((s) => s.id === seqId);
      let dispatchNote = 'Initial email sent & Day-3/Day-7 follow-ups armed.';
      if (seq) {
        const dispatch = await dispatchApprovedOutreachEmail({
          tenant,
          to: seq.leadEmail,
          subject: seq.subject,
          body: seq.body,
        });
        dispatchNote = dispatch.note;
        seq.status = 'active_cadence';
        if (tenant.policySettings) {
          tenant.policySettings.emailsSentToday += 1;
        }
        const lead = tenant.leads.find((l) => l.id === seq.leadId);
        if (lead) lead.stage = 'outreach_active';
      }
      tenant.whatsappFeed.push({
        id: `wa-decided-${Date.now()}`,
        sender: 'boss',
        senderLabel: `${opts.actor} [Tapped Approve]`,
        text: `Approved email outreach: ${approval.title}. ${dispatchNote}`,
        timestamp: nowTimeLabel(),
        tag: 'SENT',
      });
    } else if (approval.actionType === 'calendar_booking_confirm') {
      const seqId = String(approval.payload.sequenceId || '');
      const seq = tenant.outreachSequences.find((s) => s.id === seqId);
      if (seq) {
        seq.status = 'meeting_booked';
        seq.bookedSlot = approval.payload.bookedSlot as OutreachSequence['bookedSlot'];
        const lead = tenant.leads.find((l) => l.id === seq.leadId);
        if (lead) lead.stage = 'meeting_booked';
      }
      tenant.whatsappFeed.push({
        id: `wa-decided-${Date.now()}`,
        sender: 'boss',
        senderLabel: `${opts.actor} [Tapped Approve]`,
        text: `Confirmed meeting booking! Google Calendar invite + Meet link sent to prospect.`,
        timestamp: nowTimeLabel(),
        tag: 'BOOKED',
      });
    } else if (approval.actionType === 'excel_commit_update') {
      const committed = await commitApprovedStagingRows(
        tenant.id,
        `Approved by ${opts.actor} (${approval.idempotencyKey})`,
        baseDir
      );
      tenant.workbook = committed.workbook;
      tenant.whatsappFeed.push({
        id: `wa-decided-${Date.now()}`,
        sender: 'boss',
        senderLabel: `${opts.actor} [Tapped Approve]`,
        text: `Committed ${committed.committedCount} staged rows into Daily_Sales_Summary with backup ${committed.backupFileName}. All SUM formulas preserved.`,
        timestamp: nowTimeLabel(),
        tag: 'EXCEL COMMITTED',
      });
    } else if (approval.actionType === 'expense_claim_payout') {
      const receipt = approval.payload.receipt as { merchant?: string; date?: string; amountMyr?: number };
      const claimRow: ExcelLedgerRow = {
        date: receipt?.date || '2026-11-26',
        outletOrVendor: receipt?.merchant || 'Staff Receipt',
        category: 'Staff Claim (Boss Approved)',
        posReportedMyr: Number(receipt?.amountMyr ?? 45),
        bankDepositedMyr: Number(receipt?.amountMyr ?? 45),
        varianceMyr: 0,
        status: 'AI_Staging (Claim Approved)',
      };
      const staged = await stageLedgerRowsSafely(tenant.id, [claimRow], 'Staff claim approval staging', baseDir);
      const committed = await commitApprovedStagingRows(tenant.id, 'Staff claim approved payout', baseDir);
      tenant.workbook = committed.workbook;
      tenant.whatsappFeed.push({
        id: `wa-decided-${Date.now()}`,
        sender: 'boss',
        senderLabel: `${opts.actor} [Tapped Approve]`,
        text: `Approved MYR ${Number(receipt?.amountMyr ?? 45).toFixed(2)} staff claim exception & committed safely to Excel (${staged.backupFileName}).`,
        timestamp: nowTimeLabel(),
        tag: 'CLAIM APPROVED',
      });
    }
  } else {
    if (approval.actionType === 'outbound_email_send') {
      const seqId = String(approval.payload.sequenceId || '');
      const seq = tenant.outreachSequences.find((s) => s.id === seqId);
      if (seq) seq.status = 'rejected';
    }
    tenant.whatsappFeed.push({
      id: `wa-decided-${Date.now()}`,
      sender: 'boss',
      senderLabel: `${opts.actor} [Tapped Reject]`,
      text: `Rejected action: ${approval.title}. No external write executed.`,
      timestamp: nowTimeLabel(),
      tag: 'REJECTED',
    });
  }

  tenant.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    tenantId: tenant.id,
    actor: opts.actor,
    event: `APPROVAL_${opts.decision.toUpperCase()}`,
    detail: `${approval.actionType} (${approval.idempotencyKey}) -> ${opts.decision}`,
    timestamp: new Date().toISOString(),
  });

  return { tenant, approval, duplicate: false };
}

export function executeInboundWebhookTrigger(
  inputTenant: TenantWorkspace,
  triggerId: string,
  payload: Record<string, unknown>
): { tenant: TenantWorkspace; run: CrewRun } {
  const tenant = cloneTenant(inputTenant);
  const preflight = evaluateToolCallPolicy({
    tenant,
    toolName: `webhook.${triggerId}`,
    policyTier: 'READ',
  });
  if (preflight.decision === 'BLOCKED') {
    return recordBlockedRun(
      tenant,
      'custom-webhook',
      `Webhook POST /hooks/${triggerId}`,
      preflight.reason,
      preflight.code === 'TENANT_PAUSED' ? 'blocked_paused' : 'blocked_cap'
    );
  }

  const name = String(payload.name || payload.fullName || 'Website Inquiry Lead');
  const email = String(payload.email || 'lead@sme-prospect.my');
  const company = String(payload.company || 'Inbound Web Lead Sdn Bhd');

  tenant.leads.unshift({
    id: `lead-hook-${Date.now()}`,
    tenantId: tenant.id,
    fullName: name,
    jobTitle: String(payload.title || 'Director'),
    company,
    email,
    phone: String(payload.phone || '+60 12-000 0000'),
    source: 'inbound_webhook',
    ocrConfidence: 1,
    stage: 'new_lead',
    createdAt: new Date().toISOString(),
  });

  const cogs = estimateStepCogsMyr('gemini-flash', false);
  const run: CrewRun = {
    id: `run-${Date.now()}`,
    tenantId: tenant.id,
    crewPackId: tenant.installedPackIds[0] || 'custom-webhook',
    triggerLabel: `Inbound Webhook POST /hooks/${triggerId}`,
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    spawnedWorkersCount: 1,
    totalCogsMyr: cogs,
    steps: [
      {
        stepNumber: 1,
        agentId: 'custom_webhook_router',
        agentRole: 'Operator API Factory Router',
        modelTier: 'deterministic',
        toolUsed: `api.webhook(${triggerId}) -> crm.upsertLead`,
        policyDecision: 'ALLOW',
        summary: `Accepted webhook JSON for ${name} (${company}, ${email}) and logged lead into ${tenant.name}.`,
        latencyMs: 31,
        cogsMyr: cogs,
      },
    ],
  };

  tenant.subscription.tasksUsed += 1;
  tenant.subscription.cogsLedgerMyr = Math.round((tenant.subscription.cogsLedgerMyr + cogs) * 1000) / 1000;
  tenant.runs.unshift(run);
  tenant.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    tenantId: tenant.id,
    actor: `webhook:${triggerId}`,
    event: 'INBOUND_WEBHOOK_PROCESSED',
    detail: `Ingested payload for ${company} (${email})`,
    timestamp: new Date().toISOString(),
  });

  return { tenant, run };
}

export async function executePosZReportUploadScenario(
  inputTenant: TenantWorkspace,
  opts: {
    fileName: string;
    buffer?: Buffer;
    csvText?: string;
  },
  baseDir?: string
): Promise<{ tenant: TenantWorkspace; run: CrewRun }> {
  const tenant = cloneTenant(inputTenant);
  const preflight = evaluateToolCallPolicy({
    tenant,
    toolName: 'mcp-pos-systems.parseZReportFile',
    policyTier: 'READ',
  });
  if (preflight.decision === 'BLOCKED') {
    return recordBlockedRun(
      tenant,
      'fnb-pos-bookkeeping',
      `POS File Upload (${opts.fileName})`,
      preflight.reason,
      preflight.code === 'TENANT_PAUSED' ? 'blocked_paused' : 'blocked_cap'
    );
  }

  const cap = tenant.policySettings?.posVarianceCapMyr ?? 20;
  const parsed = await parsePosZReportBuffer({
    fileName: opts.fileName,
    buffer: opts.buffer,
    csvText: opts.csvText,
    varianceCapMyr: cap,
  });

  if (parsed.rows.length === 0) {
    throw new Error(`No valid POS rows parsed from ${opts.fileName}`);
  }

  const { workbook, backupFileName } = await stageLedgerRowsSafely(
    tenant.id,
    parsed.rows,
    `POS file ${opts.fileName} pre-commit backup`,
    baseDir
  );
  tenant.workbook = workbook;

  const approvalId = `appr-zrep-${Date.now()}`;
  const idempotencyKey = `idem-zrep-${tenant.id}-${Date.now()}`;
  const runId = `run-${Date.now()}`;

  tenant.approvals.unshift({
    id: approvalId,
    tenantId: tenant.id,
    runId,
    idempotencyKey,
    actionType: 'excel_commit_update',
    title: `Commit ${parsed.rows.length} Uploaded POS Rows (${parsed.flaggedRows.length} Variance Flagged)`,
    summary: `Parsed ${opts.fileName}: Gross MYR ${parsed.grossSalesMyr.toFixed(2)}, Variance MYR ${parsed.varianceTotalMyr.toFixed(2)} (threshold MYR ${cap}). Backup ${backupFileName} saved.`,
    channel: 'whatsapp',
    status: 'pending',
    createdAt: new Date().toISOString(),
    payload: { fileName: opts.fileName, rowsCount: parsed.rows.length, backupFileName },
  });

  tenant.whatsappFeed.push({
    id: `wa-zrep-${Date.now()}`,
    sender: 'ai_employee',
    senderLabel: 'Universal POS Z-Report Parser',
    text: `Parsed ${opts.fileName} (${parsed.rows.length} rows, Gross MYR ${parsed.grossSalesMyr.toFixed(2)}).\nFlagged ${parsed.flaggedRows.length} row(s) above MYR ${cap} threshold.\n\nStaged in AI_Staging with backup ${backupFileName}. Commit to Master Excel?`,
    timestamp: nowTimeLabel(),
    tag: 'Z-REPORT STAGED',
    approvalId,
  });

  const cogs = estimateStepCogsMyr('gemini-flash', true);
  const run: CrewRun = {
    id: runId,
    tenantId: tenant.id,
    crewPackId: 'fnb-pos-bookkeeping',
    triggerLabel: `Uploaded POS Z-Report (${opts.fileName})`,
    status: 'awaiting_approval',
    startedAt: new Date().toISOString(),
    spawnedWorkersCount: 1,
    totalCogsMyr: cogs,
    steps: [
      {
        stepNumber: 1,
        agentId: 'pos_closer',
        agentRole: 'Universal Z-Report Cartridge',
        modelTier: 'deterministic',
        toolUsed: `mcp-pos-systems.parseZReportFile (${opts.fileName})`,
        policyDecision: 'ALLOW',
        summary: `Normalized ${parsed.rows.length} outlet rows; flagged ${parsed.flaggedRows.length} variance exception(s).`,
        latencyMs: 65,
        cogsMyr: 0.015,
      },
      {
        stepNumber: 2,
        agentId: 'policy_gatekeeper',
        agentRole: 'Safe Shared Excel Engine',
        modelTier: 'deterministic',
        toolUsed: 'mcp-shared-excel.appendStagingRows',
        policyDecision: 'PAUSE_FOR_APPROVAL',
        summary: `Backed up ${backupFileName} and staged ${parsed.rows.length} rows into AI_Staging.`,
        latencyMs: 55,
        cogsMyr: 0.04,
      },
    ],
  };

  tenant.subscription.tasksUsed += 1;
  tenant.subscription.cogsLedgerMyr = Math.round((tenant.subscription.cogsLedgerMyr + cogs) * 1000) / 1000;
  tenant.runs.unshift(run);
  return { tenant, run };
}
