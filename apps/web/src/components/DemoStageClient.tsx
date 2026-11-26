'use client';

import { useState } from 'react';
import {
  CalendarCheck2,
  Camera,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  calculateRoiSummary,
  type PlatformState,
  type TenantWorkspace,
} from '@aislaves/shared';
import { ModalDialog } from './ModalDialog';

interface Props {
  initialState: PlatformState;
}

type InspectorTabId = 'trace' | 'excel' | 'sop' | 'webhooks';

export function DemoStageClient({ initialState }: Props) {
  const [state, setState] = useState<PlatformState>(initialState);
  const [selectedTenantId, setSelectedTenantId] = useState<'demo-kopikita' | 'demo-apex'>('demo-apex');
  const [activeTab, setActiveTab] = useState<InspectorTabId>('trace');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Live Gemini Vision Business Card Upload Modal
  const [liveCardOpen, setLiveCardOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [uploadedCardDataUrl, setUploadedCardDataUrl] = useState<string | null>(null);
  const [uploadedMimeType, setUploadedMimeType] = useState<string>('image/jpeg');

  const tenant: TenantWorkspace =
    state.tenants[selectedTenantId] ?? Object.values(state.tenants)[0];
  const roi = calculateRoiSummary(
    tenant.subscription.tasksUsed,
    tenant.subscription.monthlyRetainerMyr
  );

  async function triggerAction(
    action:
      | 'card_ocr'
      | 'batch_cards_fanout'
      | 'prospect_reply'
      | 'pos_closing'
      | 'receipt_claim'
      | 'sop_query'
      | 'boss_pulse',
    extra?: Record<string, unknown>
  ) {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/operator/demo/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          action,
          geminiApiKey: geminiApiKey || undefined,
          ...extra,
        }),
      });
      const data = (await res.json()) as { state?: PlatformState; error?: string };
      if (!res.ok) throw new Error(data.error || 'Scenario failed');
      if (data.state) setState(data.state);
      if (action === 'pos_closing') setActiveTab('excel');
      else if (action === 'sop_query' || action === 'receipt_claim') setActiveTab('sop');
      else setActiveTab('trace');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Action error');
    } finally {
      setBusy(false);
    }
  }

  async function handleApprovalDecision(approvalId: string, decision: 'approved' | 'rejected') {
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/${approvalId}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision,
          actor: tenant.id === 'demo-kopikita' ? 'Boss (WhatsApp 1-Tap)' : 'Sales Director (WhatsApp 1-Tap)',
        }),
      });
      const data = (await res.json()) as { state?: PlatformState; error?: string };
      if (!res.ok) throw new Error(data.error || 'Decision failed');
      if (data.state) setState(data.state);
      setStatusMsg(
        decision === 'approved'
          ? 'Approved! Downstream action executed safely with idempotency lock.'
          : 'Rejected cleanly. External system left untouched.'
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Approval error');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetSandbox() {
    setBusy(true);
    try {
      const res = await fetch('/api/operator/demo/reset', { method: 'POST' });
      const data = (await res.json()) as { state: PlatformState };
      setState(data.state);
      setStatusMsg('Sandbox reset to clean Day-1 pitch state (< 2s).');
      setActiveTab('trace');
    } finally {
      setBusy(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedCardDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleLiveCardSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSelectedTenantId('demo-apex');
    await triggerAction('card_ocr', {
      imageBase64: uploadedCardDataUrl || undefined,
      mimeType: uploadedMimeType,
    });
    setLiveCardOpen(false);
  }

  const tabs: Array<{ id: InspectorTabId; label: string }> = [
    { id: 'trace', label: 'Crew Trace & Policy Gate' },
    { id: 'excel', label: 'Shared Excel & .bak Backups' },
    { id: 'sop', label: 'SOP Citations & MyInvois' },
    { id: 'webhooks', label: 'Custom Webhook & API Log' },
  ];

  return (
    <div className="space-y-5">
      {/* Pitch Top Control Bar */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedTenantId('demo-apex')}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold cursor-pointer border ${
              selectedTenantId === 'demo-apex'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-primary)]'
            }`}
          >
            Apex Precision Packaging (B2B Sales Crew)
          </button>
          <button
            type="button"
            onClick={() => setSelectedTenantId('demo-kopikita')}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold cursor-pointer border ${
              selectedTenantId === 'demo-kopikita'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-primary)]'
            }`}
          >
            KopiKita 3-Outlet F&amp;B (POS + Excel Crew)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="rounded-lg border border-[var(--emerald)] px-3 py-1.5 text-xs font-semibold text-[var(--emerald)]">
            ROI: {roi.hoursSaved} hrs saved ({roi.netSavingsVsClerkMyr >= 0 ? `saves MYR ${roi.netSavingsVsClerkMyr}/mo` : ''} vs MYR 3,200 clerk)
          </div>
          <button
            type="button"
            onClick={() => setLiveCardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent)] cursor-pointer"
          >
            <Camera className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            Live Card Photo / Gemini Key
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleResetSandbox}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--amber)] px-3 py-1.5 text-xs font-semibold text-[var(--amber)] hover:opacity-90 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            1-Click Reset Demo
          </button>
        </div>
      </section>

      {statusMsg ? (
        <div
          role="status"
          className="rounded-lg border border-[var(--emerald)] bg-[var(--surface)] px-4 py-2 text-sm font-medium"
        >
          {statusMsg}
        </div>
      ) : null}

      {/* Split-Screen Live Sales Demo Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT PANE: What the SME Client Sees (WhatsApp Simulator + Prospect Reply Simulator) */}
        <section className="space-y-4 lg:col-span-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
              <div>
                <h2 className="m-0 text-base font-bold">
                  SME WhatsApp Simulator — {tenant.name}
                </h2>
                <p className="mt-0.5 mb-0 text-xs text-[var(--text-muted)]">
                  What your SME customer &amp; staff actually use daily (zero builders or prompts)
                </p>
              </div>
              <span className="rounded-full bg-[var(--emerald)] px-2.5 py-0.5 text-[11px] font-bold text-white">
                {tenant.subscription.status.toUpperCase()}
              </span>
            </div>

            {/* Scenario Trigger Buttons */}
            <div className="flex flex-wrap gap-2">
              {selectedTenantId === 'demo-apex' ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => triggerAction('card_ocr')}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                  >
                    1. Snap Trade-Show Card (Daniel Tan)
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => triggerAction('batch_cards_fanout')}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent)] cursor-pointer"
                  >
                    2. Fan-Out 3 Expo Cards Parallel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => triggerAction('sop_query')}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent)] cursor-pointer"
                  >
                    Ask Pricing SOP
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => triggerAction('boss_pulse')}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent)] cursor-pointer"
                  >
                    8:30 AM Boss Pulse
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => triggerAction('pos_closing')}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                  >
                    1. Run 3-Outlet StoreHub Close + Excel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => triggerAction('receipt_claim')}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent)] cursor-pointer"
                  >
                    2. Staff Snap RM 45 Receipt vs SOP
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => triggerAction('sop_query')}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent)] cursor-pointer"
                  >
                    3. Ask Claims Policy Q&amp;A
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => triggerAction('boss_pulse')}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent)] cursor-pointer"
                  >
                    8:30 AM Boss Pulse
                  </button>
                </>
              )}
            </div>

            {/* WhatsApp Chat Thread with 1-Tap Approve/Reject Cards */}
            <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
              {tenant.whatsappFeed.map((msg) => {
                const linkedApproval = msg.approvalId
                  ? tenant.approvals.find((a) => a.id === msg.approvalId)
                  : undefined;

                const isOutboundUser = msg.sender === 'staff' || msg.sender === 'boss';
                return (
                  <div
                    key={msg.id}
                    className={`rounded-xl border p-3 text-sm ${
                      isOutboundUser
                        ? 'ml-8 border-[var(--accent)] bg-[var(--surface)]'
                        : 'mr-6 border-[var(--border)] bg-[var(--surface)]'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[var(--accent)]">{msg.senderLabel}</span>
                      <div className="flex items-center gap-1.5">
                        {msg.tag ? (
                          <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-bold">
                            {msg.tag}
                          </span>
                        ) : null}
                        <span className="text-[var(--text-muted)]">{msg.timestamp}</span>
                      </div>
                    </div>
                    <p className="m-0 whitespace-pre-line text-xs leading-relaxed">
                      {msg.text}
                    </p>

                    {linkedApproval ? (
                      <div className="mt-2.5 border-t border-[var(--border)] pt-2.5">
                        {linkedApproval.status === 'pending' ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleApprovalDecision(linkedApproval.id, 'approved')}
                              className="inline-flex items-center gap-1 rounded-md bg-[var(--emerald)] px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              1-Tap Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleApprovalDecision(linkedApproval.id, 'rejected')}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--danger)] px-3 py-1.5 text-xs font-bold text-[var(--danger)] cursor-pointer"
                            >
                              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-bold uppercase ${
                              linkedApproval.status === 'approved'
                                ? 'text-[var(--emerald)]'
                                : 'text-[var(--danger)]'
                            }`}
                          >
                            {linkedApproval.status} by {linkedApproval.decidedBy}
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prospect Email Reply & Calendar Booking Simulator (Card-to-Calendar Proof) */}
          {selectedTenantId === 'demo-apex' ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="m-0 text-base font-bold flex items-center gap-1.5">
                    <MailCheck className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                    Prospect Inbox &amp; Auto-Calendar Closer
                  </h2>
                  <p className="mt-0.5 mb-0 text-xs text-[var(--text-muted)]">
                    Simulate an inbound prospect reply to verify instant follow-up halt + calendar booking
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => triggerAction('prospect_reply')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--emerald)] px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                >
                  <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Simulate Reply: &ldquo;Thu 3pm works!&rdquo;
                </button>
              </div>

              <div className="space-y-2.5">
                {tenant.outreachSequences.slice(0, 3).map((seq) => (
                  <div
                    key={seq.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>
                        {seq.leadName} ({seq.company}) · {seq.leadEmail}
                      </strong>
                      <span className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-bold uppercase">
                        {seq.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-[var(--text-muted)]">Subject: {seq.subject}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {seq.scheduledFollowUps.map((f) => (
                        <span
                          key={f.stepLabel}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold border ${
                            f.status === 'cancelled_on_reply'
                              ? 'border-[var(--amber)] text-[var(--amber)] line-through'
                              : 'border-[var(--border)] text-[var(--text-muted)]'
                          }`}
                        >
                          {f.stepLabel}: {f.status}
                        </span>
                      ))}
                    </div>
                    {seq.bookedSlot ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--emerald)] bg-[var(--surface)] px-2.5 py-1.5 font-semibold text-[var(--emerald)]">
                        <span>
                          Calendar Event Confirmed: {seq.bookedSlot.displayLabel} ·{' '}
                          {seq.bookedSlot.meetLink}
                        </span>
                        <a
                          href={`/api/tenants/${tenant.id}/calendar/${seq.id}/invite.ics`}
                          className="rounded border border-[var(--emerald)] px-2 py-0.5 text-[11px] font-bold text-[var(--emerald)] no-underline"
                        >
                          Download .ics Invite
                        </a>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* RIGHT PANE: Behind-the-Scenes Agent Trace, Excel .bak Diff, SOP RAG & Webhooks */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] lg:col-span-6 overflow-hidden">
          <div role="tablist" aria-label="Demo stage proof inspector" className="tablist-row px-2 pt-2">
            {tabs.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className="tab-btn"
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Panel 1: Crew Trace & Policy Gatekeeper */}
          <div
            role="tabpanel"
            aria-labelledby="tab-trace"
            hidden={activeTab !== 'trace'}
          >
            <div className="tabpanel-inner space-y-3">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>
                  Tenant Usage: <strong>{tenant.subscription.tasksUsed}</strong> /{' '}
                  {tenant.subscription.taskAllowance} tasks
                </span>
                <span>
                  Ledger AI/WA COGS: <strong>MYR {tenant.subscription.cogsLedgerMyr.toFixed(2)}</strong>
                </span>
              </div>

              {tenant.runs.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Click any scenario on the left to watch live multi-agent orchestration &amp; policy gating.
                </p>
              ) : (
                tenant.runs.slice(0, 3).map((run) => (
                  <div
                    key={run.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3.5 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <strong>{run.triggerLabel}</strong>
                      <span className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-bold">
                        {run.status} · Workers: {run.spawnedWorkersCount} · MYR {run.totalCogsMyr}
                      </span>
                    </div>
                    <ol className="m-0 space-y-2 pl-4 text-xs">
                      {run.steps.map((step) => (
                        <li key={step.stepNumber} className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <strong>{step.agentRole}</strong>
                            <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[11px]">
                              {step.toolUsed}
                            </code>
                            <span
                              className={`font-bold ${
                                step.policyDecision === 'ALLOW'
                                  ? 'text-[var(--emerald)]'
                                  : step.policyDecision === 'PAUSE_FOR_APPROVAL'
                                    ? 'text-[var(--amber)]'
                                    : 'text-[var(--danger)]'
                              }`}
                            >
                              [{step.policyDecision}]
                            </span>
                          </div>
                          <div className="text-[var(--text-muted)]">{step.summary}</div>
                          {step.citation ? (
                            <div className="text-[11px] font-medium text-[var(--accent)]">
                              Cited: {step.citation}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tab Panel 2: Safe Shared Excel & .bak Snapshot Viewer */}
          <div
            role="tabpanel"
            aria-labelledby="tab-excel"
            hidden={activeTab !== 'excel'}
          >
            <div className="tabpanel-inner space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="m-0 text-sm font-bold flex items-center gap-1.5">
                    <FileSpreadsheet className="h-4 w-4 text-[var(--emerald)]" aria-hidden="true" />
                    {tenant.workbook.fileName}
                  </h3>
                  <p className="mt-0.5 mb-0 text-xs text-[var(--text-muted)]">
                    Formula Lock Active: {tenant.workbook.preservedFormulas.join(' · ') || 'Formula Guard Ready'}
                  </p>
                </div>
                {tenant.id === 'demo-kopikita' ? (
                  <a
                    href="/api/workbooks/demo-kopikita/download"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--emerald)] px-3 py-1.5 text-xs font-bold text-white no-underline"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Download Real .xlsx
                  </a>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[var(--amber)]">
                  AI_Staging Tab (Pending Boss 1-Tap Approval: {tenant.workbook.stagingRows.length})
                </div>
                {tenant.workbook.stagingRows.length === 0 ? (
                  <p className="m-0 text-xs text-[var(--text-muted)]">
                    No staged rows waiting. Click &ldquo;Run 3-Outlet StoreHub Close + Excel&rdquo; to stage new rows cleanly.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded border border-[var(--border)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--surface-muted)]">
                        <tr>
                          <th className="p-2 text-left">Outlet</th>
                          <th className="p-2 text-right">POS</th>
                          <th className="p-2 text-right">Bank</th>
                          <th className="p-2 text-right">Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenant.workbook.stagingRows.map((row, idx) => (
                          <tr key={`${row.outletOrVendor}-${idx}`} className="border-t border-[var(--border)]">
                            <td className="p-2">{row.outletOrVendor}</td>
                            <td className="p-2 text-right">RM {row.posReportedMyr}</td>
                            <td className="p-2 text-right">RM {row.bankDepositedMyr}</td>
                            <td className="p-2 text-right font-bold text-[var(--amber)]">
                              RM {row.varianceMyr}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[var(--emerald)]">
                  Daily_Sales_Summary Master Rows ({tenant.workbook.committedRows.length})
                </div>
                <div className="max-h-48 overflow-auto rounded border border-[var(--border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--surface-muted)]">
                      <tr>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Outlet / Vendor</th>
                        <th className="p-2 text-right">POS</th>
                        <th className="p-2 text-right">Bank</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenant.workbook.committedRows.map((row, idx) => (
                        <tr key={`${row.date}-${row.outletOrVendor}-${idx}`} className="border-t border-[var(--border)]">
                          <td className="p-2">{row.date}</td>
                          <td className="p-2">{row.outletOrVendor}</td>
                          <td className="p-2 text-right">RM {row.posReportedMyr}</td>
                          <td className="p-2 text-right">RM {row.bankDepositedMyr}</td>
                          <td className="p-2">{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {tenant.workbook.backups.length > 0 ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--emerald)]" aria-hidden="true" />
                    Pre-Write Automatic Backups (.bak.xlsx)
                  </div>
                  {tenant.workbook.backups.map((b) => (
                    <div key={b.backupFileName} className="font-mono text-[11px] text-[var(--text-muted)]">
                      {b.backupFileName} — {b.reason}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Tab Panel 3: SOP Vault Citations & MyInvois */}
          <div
            role="tabpanel"
            aria-labelledby="tab-sop"
            hidden={activeTab !== 'sop'}
          >
            <div className="tabpanel-inner space-y-3 text-xs">
              <div className="font-bold text-sm flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                Tenant Drop-In Knowledge Slots
              </div>
              {Object.entries(tenant.knowledgeSlots).map(([slotId, slot]) => (
                <div
                  key={slotId}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 space-y-1"
                >
                  <div className="font-bold">
                    slot:{slotId} — {slot.docName}
                  </div>
                  <div>{slot.summary}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Indexed excerpt: &ldquo;{slot.excerptSample}&rdquo;
                  </div>
                </div>
              ))}

              {tenant.complianceFlags.map((flag) => (
                <div
                  key={flag.id}
                  className="rounded-lg border border-[var(--amber)] bg-[var(--surface-muted)] p-3 space-y-1"
                >
                  <div className="font-bold text-[var(--amber)]">{flag.title}</div>
                  <div>{flag.detail}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">Source: {flag.sourceDoc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tab Panel 4: Custom API & Audit Log */}
          <div
            role="tabpanel"
            aria-labelledby="tab-webhooks"
            hidden={activeTab !== 'webhooks'}
          >
            <div className="tabpanel-inner space-y-2.5 text-xs">
              <div className="font-bold text-sm">Append-Only Compliance &amp; Webhook Ledger</div>
              {tenant.auditLogs.slice(0, 8).map((log) => (
                <div
                  key={log.id}
                  className="rounded border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2"
                >
                  <div className="flex justify-between font-semibold">
                    <span>{log.event}</span>
                    <span className="text-[var(--text-muted)]">{log.actor}</span>
                  </div>
                  <div className="text-[var(--text-muted)]">{log.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Live Business Card OCR + Gemini Key Modal */}
      <ModalDialog
        open={liveCardOpen}
        onClose={() => setLiveCardOpen(false)}
        title="Live Business Card OCR Hook (In-Person Pitch Mode)"
        subtitle="Snap or upload a real prospect business card image + optional Gemini API Key to run live Gemini 2.5 Flash Vision extraction on stage."
      >
        <form onSubmit={handleLiveCardSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="gemini-key" className="block text-xs font-semibold">
              Optional Gemini API Key (leave empty to use server GEMINI_API_KEY or deterministic demo extraction)
            </label>
            <input
              id="gemini-key"
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="card-upload" className="block text-xs font-semibold">
              Upload Business Card Image (JPG / PNG)
            </label>
            <input
              id="card-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="block w-full text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setLiveCardOpen(false)}
              className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white cursor-pointer"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Run Business Card Crew
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
