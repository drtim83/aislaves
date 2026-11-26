'use client';

import { useState } from 'react';
import { CheckCircle2, Clock3, Download, FileText, ShieldCheck, XCircle } from 'lucide-react';
import { calculateRoiSummary, type PlatformState, type TenantWorkspace } from '@aislaves/shared';

interface Props {
  initialState: PlatformState;
}

export function PortalClient({ initialState }: Props) {
  const [state, setState] = useState<PlatformState>(initialState);
  const tenants = Object.values(state.tenants);
  const [selectedId, setSelectedId] = useState<string>(tenants[0]?.id ?? 'demo-kopikita');
  const [busy, setBusy] = useState(false);

  const tenant: TenantWorkspace = state.tenants[selectedId] ?? tenants[0];
  const roi = calculateRoiSummary(
    tenant.subscription.tasksUsed,
    tenant.subscription.monthlyRetainerMyr
  );
  const pendingApprovals = tenant.approvals.filter((a) => a.status === 'pending');

  async function decide(approvalId: string, decision: 'approved' | 'rejected') {
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/${approvalId}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, actor: 'SME Portal Owner' }),
      });
      const data = (await res.json()) as { state?: PlatformState };
      if (data.state) setState(data.state);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div>
          <span className="inline-block rounded-full border border-[var(--emerald)] px-2.5 py-0.5 text-xs font-semibold text-[var(--emerald)]">
            PLANE B — SME CLIENT SUPERVISION PORTAL (ZERO TECHNICAL SETTINGS)
          </span>
          <h1 className="mt-2 mb-1 text-2xl font-bold">{tenant.name}</h1>
          <p className="m-0 text-sm text-[var(--text-muted)]">
            Approve sensitive AI actions in 1 tap, review your team&apos;s hours saved, drop updated SOP files, and track your flat monthly cap.
          </p>
        </div>
        <div>
          <label htmlFor="portal-tenant" className="block text-xs font-semibold text-[var(--text-muted)]">
            Preview As SME Client:
          </label>
          <select
            id="portal-tenant"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-semibold"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
            Hours Saved This Month
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--emerald)]">{roi.hoursSaved} hrs</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            Est. MYR {roi.laborValueSavedMyr.toLocaleString()} clerk labor offset
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
            Predictable Flat Plan
          </div>
          <div className="mt-1 text-2xl font-bold">MYR {tenant.subscription.monthlyRetainerMyr}/mo</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            {tenant.subscription.tasksUsed} / {tenant.subscription.taskAllowance} tasks used (hard cap, zero surprises)
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
            Pending Your Sign-Off
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--amber)]">{pendingApprovals.length}</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            Also sent directly to your WhatsApp
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <h2 className="m-0 text-lg font-bold flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-[var(--amber)]" aria-hidden="true" />
          1-Tap Manager Approval Inbox
        </h2>
        {pendingApprovals.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            All caught up! Trigger any workflow on the Live Sales Demo Stage to see items appear here and in WhatsApp simultaneously.
          </p>
        ) : (
          <div className="space-y-3">
            {pendingApprovals.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4"
              >
                <div className="space-y-1">
                  <div className="font-bold text-sm">{item.title}</div>
                  <div className="text-xs text-[var(--text-muted)]">{item.summary}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decide(item.id, 'approved')}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--emerald)] px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decide(item.id, 'rejected')}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--danger)] px-3.5 py-2 text-xs font-bold text-[var(--danger)] cursor-pointer"
                  >
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            Shared SOPs &amp; Protected Excel Vault
          </h2>
          {tenant.id === 'demo-kopikita' ? (
            <a
              href="/api/workbooks/demo-kopikita/download"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--emerald)] px-3 py-1.5 text-xs font-bold text-[var(--emerald)] no-underline"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download Protected Excel (.xlsx)
            </a>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Object.entries(tenant.knowledgeSlots).map(([slotKey, doc]) => (
            <div
              key={slotKey}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs space-y-1"
            >
              <div className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[var(--emerald)]" aria-hidden="true" />
                {doc.docName}
              </div>
              <div className="text-[var(--text-muted)]">{doc.summary}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
