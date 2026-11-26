'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Link2,
  PauseCircle,
  PlayCircle,
  Plus,
  ShieldAlert,
  Webhook,
  Zap,
} from 'lucide-react';
import {
  calculateGrossMarginPct,
  evaluatePackPreflight,
  type CrewPackManifest,
  type PlanId,
  type PlatformState,
  type PolicyTier,
  type SmePricingTier,
  type TenantWorkspace,
} from '@aislaves/shared';
import { ModalDialog } from './ModalDialog';
import { CopyButton } from './CopyButton';

interface Props {
  initialState: PlatformState;
  crewPacks: CrewPackManifest[];
  pricingTiers: SmePricingTier[];
}

export function OperatorDashboardClient({ initialState, crewPacks, pricingTiers }: Props) {
  const [state, setState] = useState<PlatformState>(initialState);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [provisionOpen, setProvisionOpen] = useState(false);
  const [apiFactoryOpen, setApiFactoryOpen] = useState(false);

  // Provision form state
  const [newName, setNewName] = useState('');
  const [newIndustry, setNewIndustry] = useState('Food & Beverage / Retail SME');
  const [newPlanId, setNewPlanId] = useState<PlanId>('sme_growth');
  const [selectedPacks, setSelectedPacks] = useState<string[]>(['sales-card-to-calendar']);

  // Custom REST/Webhook API Factory form state
  const tenants = Object.values(state.tenants);
  const [apiTenantId, setApiTenantId] = useState<string>(tenants[0]?.id ?? 'demo-apex');
  const [apiName, setApiName] = useState('Warehouse Inventory Sync');
  const [apiToolName, setApiToolName] = useState('sync_warehouse_stock');
  const [apiMethod, setApiMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH'>('POST');
  const [apiBaseUrl, setApiBaseUrl] = useState('https://demo.aislaves.local/wms');
  const [apiPath, setApiPath] = useState('/v1/stock-sync');
  const [apiPolicyTier, setApiPolicyTier] = useState<PolicyTier>('APPROVAL_REQUIRED');
  const [apiHookId, setApiHookId] = useState('erp-stock-alert');
  const [apiDescription, setApiDescription] = useState(
    'Wraps client legacy ERP stock API as an MCP Cartridge tool and inbound webhook trigger.'
  );

  const totalMrr = tenants.reduce(
    (sum, t) => sum + (t.subscription.status === 'paused' ? 0 : t.subscription.monthlyRetainerMyr),
    0
  );
  const totalEstCogs = tenants.reduce((sum, t) => {
    const tier = pricingTiers.find((p) => p.id === t.subscription.planId);
    return sum + (tier?.estimatedCogsMyr ?? 45);
  }, 0);
  const portfolioMarginPct = calculateGrossMarginPct(totalMrr, totalEstCogs);
  const totalPendingApprovals = tenants.reduce(
    (sum, t) => sum + t.approvals.filter((a) => a.status === 'pending').length,
    0
  );

  async function refreshState() {
    const res = await fetch('/api/state', { cache: 'no-store' });
    const data = (await res.json()) as { state: PlatformState };
    setState(data.state);
  }

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/operator/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'provision',
          name: newName,
          industry: newIndustry,
          planId: newPlanId,
          packIds: selectedPacks,
        }),
      });
      const data = (await res.json()) as { state?: PlatformState; tenant?: TenantWorkspace; error?: string };
      if (!res.ok) throw new Error(data.error || 'Provisioning failed');
      if (data.state) setState(data.state);
      setBanner(`Provisioned ${data.tenant?.name} cleanly. Ready to issue 1-Tap Magic Connect Link.`);
      setNewName('');
      setProvisionOpen(false);
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Provisioning failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleTenantControl(tenantId: string, action: 'toggle_pause' | 'topup_1000_tasks') {
    setBusy(true);
    try {
      const res = await fetch('/api/operator/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'control', tenantId, action }),
      });
      const data = (await res.json()) as { state: PlatformState };
      setState(data.state);
      setBanner(
        action === 'toggle_pause'
          ? `Updated kill-switch status for ${tenantId}.`
          : `Credited +1,000 fair-use tasks to ${tenantId}.`
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateMagicLink(tenant: TenantWorkspace) {
    const reports = tenant.installedPackIds
      .map((id) => crewPacks.find((p) => p.id === id))
      .filter((p): p is CrewPackManifest => Boolean(p))
      .map((p) => evaluatePackPreflight(p, tenant));

    const missingCaps = Array.from(
      new Set(
        reports
          .flatMap((r) => r.items)
          .filter((i) => i.kind === 'capability' && i.status === 'amber')
          .map((i) => i.key)
      )
    );
    const missingSlots = Array.from(
      new Set(
        reports
          .flatMap((r) => r.items)
          .filter((i) => i.kind === 'slot' && i.status === 'amber')
          .map((i) => i.key)
      )
    );

    const res = await fetch('/api/operator/magic-links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId: tenant.id,
        missingCapabilities: missingCaps.length ? missingCaps : ['capability:mail'],
        missingSlots: missingSlots.length ? missingSlots : ['company_policies'],
      }),
    });
    const data = (await res.json()) as { state: PlatformState; link: { token: string } };
    setState(data.state);
    setBanner(`Generated 1-Tap Magic Connect Link /connect/${data.link.token} for ${tenant.name}.`);
  }

  async function handleRegisterCustomApi(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/operator/custom-apis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: apiTenantId,
          name: apiName,
          toolName: apiToolName,
          method: apiMethod,
          baseUrl: apiBaseUrl,
          path: apiPath,
          authType: 'bearer',
          policyTier: apiPolicyTier,
          inboundWebhookTriggerId: apiHookId,
          description: apiDescription,
        }),
      });
      const data = (await res.json()) as { state: PlatformState; spec: { toolName: string } };
      setState(data.state);
      setBanner(`Registered MCP tool custom.${data.spec.toolName} and inbound webhook.`);
      setApiFactoryOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleFireTestWebhook(tenantSlug: string, triggerId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantSlug}/hooks/${triggerId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Farid Rahman',
          company: 'Merdeka Food Industries Sdn Bhd',
          email: 'farid@merdekafood.my',
          title: 'Purchasing Lead',
        }),
      });
      const data = (await res.json()) as { ok: boolean; tenantId: string };
      await refreshState();
      if (data.ok) {
        setBanner(`Inbound webhook POST /api/v1/tenants/${tenantSlug}/hooks/${triggerId} executed cleanly!`);
      }
    } finally {
      setBusy(false);
    }
  }

  const originHint = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const latestMagicLinks = Object.values(state.magicLinks).slice().reverse();

  return (
    <div className="space-y-6">
      {/* Operator Header & Primary Actions */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            PLANE A — INTERNAL OPERATOR STUDIO (ZERO SME SELF-SERVICE)
          </span>
          <h1 className="mt-2 mb-1 text-2xl font-bold tracking-tight">
            Managed SME AI Workforce Fleet
          </h1>
          <p className="m-0 text-sm text-[var(--text-muted)]">
            Provision SME clients, plug &amp; play Crew Packs, wrap client APIs into MCP Cartridges, issue Magic Connect Links, and protect unit margins.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setProvisionOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white hover:opacity-95 cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Provision SME Tenant
          </button>
          <button
            type="button"
            onClick={() => setApiFactoryOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
          >
            <Webhook className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            Custom REST / API Factory
          </button>
          <Link
            href="/operator/demo-stage"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--emerald)] px-3.5 py-2 text-sm font-semibold text-[var(--emerald)] no-underline hover:opacity-90"
          >
            <Zap className="h-4 w-4" aria-hidden="true" />
            Open Live Sales Demo Stage
          </Link>
        </div>
      </section>

      {banner ? (
        <div
          role="status"
          className="rounded-lg border border-[var(--accent)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]"
        >
          {banner}
        </div>
      ) : null}

      {/* Unit Economics & Fleet KPI Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Active Monthly Retainer (MRR)
          </p>
          <p className="mt-1 mb-0 text-2xl font-bold">MYR {totalMrr.toLocaleString()}</p>
          <p className="mt-1 mb-0 text-xs text-[var(--text-muted)]">
            Across {tenants.length} SME workspaces
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Est. Direct COGS (AI + Infra)
          </p>
          <p className="mt-1 mb-0 text-2xl font-bold">MYR {totalEstCogs.toLocaleString()}</p>
          <p className="mt-1 mb-0 text-xs text-[var(--text-muted)]">
            Gemini 2.5 Flash/Pro + WhatsApp Utility
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Portfolio Gross Margin
          </p>
          <p className="mt-1 mb-0 text-2xl font-bold text-[var(--emerald)]">
            {portfolioMarginPct}%
          </p>
          <p className="mt-1 mb-0 text-xs text-[var(--text-muted)]">
            Target SME Agency Margin: 85%–92%
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Pending Manager Approvals
          </p>
          <p className="mt-1 mb-0 text-2xl font-bold text-[var(--amber)]">
            {totalPendingApprovals}
          </p>
          <p className="mt-1 mb-0 text-xs text-[var(--text-muted)]">
            Gated by Deterministic Policy Gatekeeper
          </p>
        </div>
      </section>

      {/* Responsive Client Fleet Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="fleet-caption" className="m-0 text-lg font-bold">
            Managed SME Client Fleet &amp; Plug-and-Play Preflight
          </h2>
          <span className="text-xs text-[var(--text-muted)]">
            {crewPacks.length} Declarative Crew Packs available
          </span>
        </div>

        <div tabIndex={0} role="region" aria-labelledby="fleet-caption" className="table-wrapper">
          <table className="fleet-table">
            <caption className="sr-only">
              Managed SME tenants with pricing plan, task cap, plug-and-play preflight status, and operator controls
            </caption>
            <thead>
              <tr>
                <th scope="col">SME Client &amp; Packs</th>
                <th scope="col">Plan &amp; Margin</th>
                <th scope="col">Fair-Use Task Cap</th>
                <th scope="col">Plug-and-Play Preflight</th>
                <th scope="col">Operator Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const tier = pricingTiers.find((p) => p.id === tenant.subscription.planId);
                const estCogs = tier?.estimatedCogsMyr ?? 50;
                const marginPct = calculateGrossMarginPct(
                  tenant.subscription.monthlyRetainerMyr,
                  estCogs
                );

                const preflights = tenant.installedPackIds
                  .map((id) => crewPacks.find((p) => p.id === id))
                  .filter((p): p is CrewPackManifest => Boolean(p))
                  .map((pack) => evaluatePackPreflight(pack, tenant));

                const greenTotal = preflights.reduce((s, r) => s + r.greenCount, 0);
                const amberTotal = preflights.reduce((s, r) => s + r.amberCount, 0);
                const usagePct = Math.min(
                  100,
                  Math.round((tenant.subscription.tasksUsed / tenant.subscription.taskAllowance) * 100)
                );
                const tenantMagicLink = latestMagicLinks.find((l) => l.tenantId === tenant.id);

                return (
                  <tr key={tenant.id}>
                    <th scope="row">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span>{tenant.name}</span>
                          {tenant.isDemo ? (
                            <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--accent)]">
                              DEMO
                            </span>
                          ) : null}
                        </div>
                        <p className="m-0 text-xs font-normal text-[var(--text-muted)]">
                          {tenant.industry}
                        </p>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {tenant.installedPackIds.map((pid) => (
                            <span
                              key={pid}
                              className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] font-normal text-[var(--text-muted)]"
                            >
                              {pid}
                            </span>
                          ))}
                        </div>
                      </div>
                    </th>
                    <td>
                      <div className="space-y-1">
                        <div className="font-semibold">
                          {tier?.name ?? tenant.subscription.planId} (MYR{' '}
                          {tenant.subscription.monthlyRetainerMyr}/mo)
                        </div>
                        <div className="text-xs text-[var(--emerald)]">
                          ~{marginPct}% gross margin (Est. COGS MYR {estCogs})
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          Status:{' '}
                          <span
                            className={
                              tenant.subscription.status === 'paused'
                                ? 'font-bold text-[var(--danger)]'
                                : 'font-semibold text-[var(--emerald)]'
                            }
                          >
                            {tenant.subscription.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1.5">
                        <div className="text-xs font-medium">
                          {tenant.subscription.tasksUsed.toLocaleString()} /{' '}
                          {tenant.subscription.taskAllowance.toLocaleString()} tasks ({usagePct}%)
                        </div>
                        <progress
                          value={tenant.subscription.tasksUsed}
                          max={tenant.subscription.taskAllowance}
                          className="h-2 w-36"
                        />
                        <div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleTenantControl(tenant.id, 'topup_1000_tasks')}
                            className="rounded border border-[var(--border)] px-2 py-0.5 text-[11px] font-semibold hover:border-[var(--accent)] cursor-pointer"
                          >
                            + Top Up 1k Tasks (MYR 99)
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1">
                        <span className="inline-block rounded-full border border-[var(--emerald)] px-2 py-0.5 text-xs font-semibold text-[var(--emerald)]">
                          {greenTotal} Green Wired
                        </span>{' '}
                        {amberTotal > 0 ? (
                          <span className="inline-block rounded-full border border-[var(--amber)] px-2 py-0.5 text-xs font-semibold text-[var(--amber)]">
                            {amberTotal} Amber Gaps
                          </span>
                        ) : (
                          <span className="inline-block text-xs text-[var(--text-muted)]">
                            All Required Slots Ready
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleTenantControl(tenant.id, 'toggle_pause')}
                            className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-xs font-semibold hover:border-[var(--danger)] cursor-pointer"
                          >
                            {tenant.subscription.status === 'paused' ? (
                              <>
                                <PlayCircle className="h-3.5 w-3.5 text-[var(--emerald)]" aria-hidden="true" />
                                Resume
                              </>
                            ) : (
                              <>
                                <PauseCircle className="h-3.5 w-3.5 text-[var(--amber)]" aria-hidden="true" />
                                Kill-Switch
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleCreateMagicLink(tenant)}
                            className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-xs font-semibold hover:border-[var(--accent)] cursor-pointer"
                          >
                            <Link2 className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                            Magic Link
                          </button>
                        </div>
                        {tenantMagicLink ? (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Link
                              href={`/connect/${tenantMagicLink.token}`}
                              className="font-mono text-[var(--accent)] underline"
                            >
                              /connect/{tenantMagicLink.token}
                            </Link>
                            <CopyButton
                              value={`${originHint}/connect/${tenantMagicLink.token}`}
                              label="Copy URL"
                              ariaLabel={`Copy Magic Connect link for ${tenant.name}`}
                            />
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Custom MCP & Webhook API Factory Live Feed */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="m-0 text-lg font-bold">
              Operator Custom MCP &amp; Tenant Webhook API Factory
            </h2>
            <p className="mt-1 mb-0 text-xs text-[var(--text-muted)]">
              Every custom API wrapper exposes a scoped MCP tool (`custom.*`) plus an inbound webhook trigger URL for client systems.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setApiFactoryOpen(true)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent)] cursor-pointer"
          >
            + Wrap New SME REST API
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {tenants.flatMap((t) =>
            t.customApis.map((api) => {
              const hookUrl = `${originHint}/api/v1/tenants/${t.slug}/hooks/${api.inboundWebhookTriggerId}`;
              const curlCmd = `curl -X POST ${hookUrl} -H "Content-Type: application/json" -d '{"name":"Farid","company":"Merdeka Food","email":"farid@merdekafood.my"}'`;
              return (
                <div
                  key={api.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold">{api.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Tenant: {t.name} · Tool: <code>custom.{api.toolName}</code> · Gate:{' '}
                        <strong>{api.policyTier}</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleFireTestWebhook(t.slug, api.inboundWebhookTriggerId)}
                      className="inline-flex items-center gap-1 rounded bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-white cursor-pointer"
                    >
                      <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                      Fire Webhook
                    </button>
                  </div>
                  <code className="block overflow-x-auto rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px]">
                    {curlCmd}
                  </code>
                  <CopyButton
                    value={curlCmd}
                    label="Copy Webhook cURL"
                    ariaLabel={`Copy webhook cURL snippet for ${api.name}`}
                  />
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Affordable SME Retainer Pricing Table */}
      <section className="space-y-3">
        <div>
          <h2 id="pricing-caption" className="m-0 text-lg font-bold">
            Affordable SME &ldquo;Digital Staff Salary&rdquo; Retainer Schedule
          </h2>
          <p className="mt-1 mb-0 text-xs text-[var(--text-muted)]">
            Anchored against MYR 2,800–4,500/mo junior admin/clerk cost in Malaysia — zero token surprises via hard fair-use task caps.
          </p>
        </div>

        <div tabIndex={0} role="region" aria-labelledby="pricing-caption" className="table-wrapper">
          <table className="pricing-table">
            <caption className="sr-only">
              AISlaves affordable SME monthly retainer tiers, setup fees, task caps, and operator gross margins
            </caption>
            <thead>
              <tr>
                <th scope="col">Plan Tier</th>
                <th scope="col">Monthly Retainer</th>
                <th scope="col">DFY Setup Fee</th>
                <th scope="col">Fair-Use Task Cap</th>
                <th scope="col">Est. COGS &amp; Margin</th>
              </tr>
            </thead>
            <tbody>
              {pricingTiers.map((tier) => {
                const margin = calculateGrossMarginPct(tier.monthlyRetainerMyr, tier.estimatedCogsMyr);
                return (
                  <tr key={tier.id}>
                    <th scope="row">
                      <div>{tier.name}</div>
                      <div className="text-xs font-normal text-[var(--text-muted)]">
                        {tier.tagline}
                      </div>
                    </th>
                    <td>
                      <div className="font-bold">MYR {tier.monthlyRetainerMyr}/mo</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        ~USD {tier.monthlyRetainerUsd}/mo
                      </div>
                    </td>
                    <td>
                      <div>
                        {tier.setupFeeMyr === 0 ? 'Included' : `MYR ${tier.setupFeeMyr}`}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">{tier.setupFeeNote}</div>
                    </td>
                    <td>
                      <div className="font-semibold">{tier.taskAllowance.toLocaleString()} tasks/mo</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Up to {tier.maxCartridges} Cartridges
                      </div>
                    </td>
                    <td>
                      <div className="font-bold text-[var(--emerald)]">{margin}% gross margin</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Est. COGS MYR {tier.estimatedCogsMyr}/mo
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal 1: Provision New SME Tenant */}
      <ModalDialog
        open={provisionOpen}
        onClose={() => setProvisionOpen(false)}
        title="Provision New SME Client Workspace"
        subtitle="Creates an isolated multi-tenant workspace + Crew Pack preflight ready for 1-Tap Magic Connect onboarding."
      >
        <form onSubmit={handleProvision} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="tenant-name" className="block text-xs font-semibold">
              SME Company Name
            </label>
            <input
              id="tenant-name"
              required
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., Restoran Nasi Kandar Maju Sdn Bhd"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="tenant-industry" className="block text-xs font-semibold">
                Industry / Outlets
              </label>
              <input
                id="tenant-industry"
                value={newIndustry}
                onChange={(e) => setNewIndustry(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="tenant-plan" className="block text-xs font-semibold">
                Pricing Plan
              </label>
              <select
                id="tenant-plan"
                value={newPlanId}
                onChange={(e) => setNewPlanId(e.target.value as PlanId)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
              >
                {pricingTiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name} — MYR {tier.monthlyRetainerMyr}/mo ({tier.taskAllowance} tasks)
                  </option>
                ))}
              </select>
            </div>
          </div>
          <fieldset className="space-y-2 rounded-lg border border-[var(--border)] p-3">
            <legend className="px-1 text-xs font-semibold">Select Vertical Crew Packs</legend>
            {crewPacks.map((pack) => {
              const checked = selectedPacks.includes(pack.id);
              return (
                <label key={pack.id} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedPacks((prev) =>
                        checked ? prev.filter((id) => id !== pack.id) : [...prev, pack.id]
                      )
                    }
                    className="mt-1"
                  />
                  <span>
                    <strong className="block">{pack.name}</strong>
                    <span className="text-xs text-[var(--text-muted)]">
                      Requires: {pack.requiredCapabilities.join(', ')}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setProvisionOpen(false)}
              className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white cursor-pointer"
            >
              Create Tenant &amp; Evaluate Preflight
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Modal 2: Custom REST/Webhook API Factory */}
      <ModalDialog
        open={apiFactoryOpen}
        onClose={() => setApiFactoryOpen(false)}
        title="Custom MCP & REST/Webhook API Factory"
        subtitle="Turn any SME backend REST API into an agent-callable MCP tool + inbound webhook endpoint without deploying new servers."
      >
        <form onSubmit={handleRegisterCustomApi} className="space-y-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="api-tenant" className="block text-xs font-semibold">
                Target SME Client
              </label>
              <select
                id="api-tenant"
                value={apiTenantId}
                onChange={(e) => setApiTenantId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="api-name" className="block text-xs font-semibold">
                Bridge Display Name
              </label>
              <input
                id="api-name"
                required
                value={apiName}
                onChange={(e) => setApiName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="api-tool" className="block text-xs font-semibold">
                MCP Tool Name
              </label>
              <input
                id="api-tool"
                required
                value={apiToolName}
                onChange={(e) => setApiToolName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="api-method" className="block text-xs font-semibold">
                HTTP Method
              </label>
              <select
                id="api-method"
                value={apiMethod}
                onChange={(e) => setApiMethod(e.target.value as 'GET' | 'POST' | 'PUT' | 'PATCH')}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="api-tier" className="block text-xs font-semibold">
                Policy Gatekeeper
              </label>
              <select
                id="api-tier"
                value={apiPolicyTier}
                onChange={(e) => setApiPolicyTier(e.target.value as PolicyTier)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
              >
                <option value="APPROVAL_REQUIRED">APPROVAL_REQUIRED</option>
                <option value="READ">READ</option>
                <option value="DRAFT">DRAFT</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="api-base" className="block text-xs font-semibold">
                Base URL
              </label>
              <input
                id="api-base"
                required
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="api-path" className="block text-xs font-semibold">
                Endpoint Path &amp; Webhook Trigger ID
              </label>
              <div className="flex gap-2">
                <input
                  id="api-path"
                  required
                  value={apiPath}
                  onChange={(e) => setApiPath(e.target.value)}
                  className="w-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-mono"
                />
                <input
                  aria-label="Webhook Trigger ID"
                  required
                  value={apiHookId}
                  onChange={(e) => setApiHookId(e.target.value)}
                  className="w-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="api-desc" className="block text-xs font-semibold">
              Description (shown to Planner Agent)
            </label>
            <input
              id="api-desc"
              value={apiDescription}
              onChange={(e) => setApiDescription(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setApiFactoryOpen(false)}
              className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white cursor-pointer"
            >
              Generate MCP Tool &amp; Webhook
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
