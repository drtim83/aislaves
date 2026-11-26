'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  Printer,
  Save,
  Search,
  Sliders,
} from 'lucide-react';
import {
  CAPABILITY_CATALOG,
  type CapabilityId,
  type KnowledgeSlotId,
  type TenantWorkspace,
} from '@aislaves/shared';

interface Props {
  initialTenant: TenantWorkspace;
}

export function TenantWorkbenchClient({ initialTenant }: Props) {
  const [tenant, setTenant] = useState<TenantWorkspace>(initialTenant);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Hot-swappable cartridge choices
  const [cartridges, setCartridges] = useState<Partial<Record<CapabilityId, string>>>(() => {
    const map: Partial<Record<CapabilityId, string>> = {};
    for (const cap of Object.keys(CAPABILITY_CATALOG) as CapabilityId[]) {
      map[cap] =
        initialTenant.cartridges[cap]?.cartridgeId ||
        CAPABILITY_CATALOG[cap].availableCartridges[0].id;
    }
    return map;
  });

  // Policy threshold settings
  const [mealCap, setMealCap] = useState(initialTenant.policySettings?.mealClaimCapMyr ?? 30);
  const [posCap, setPosCap] = useState(initialTenant.policySettings?.posVarianceCapMyr ?? 20);
  const [emailCap, setEmailCap] = useState(
    initialTenant.policySettings?.dailyEmailWarmupCap ?? 30
  );

  // Real SOP uploader
  const [slotId, setSlotId] = useState<KnowledgeSlotId>('company_policies');
  const [deptScope, setDeptScope] = useState<'all_staff' | 'sales' | 'finance_only'>('all_staff');
  const [sopText, setSopText] = useState('');
  const [sopFileName, setSopFileName] = useState('custom_policy_update.md');
  const [sopBase64, setSopBase64] = useState<string | undefined>(undefined);
  const [sopMime, setSopMime] = useState<string | undefined>(undefined);

  // RAG Cited Test Query
  const [ragQuery, setRagQuery] = useState('What is our staff meal cap or wholesale MOQ?');
  const [ragAnswer, setRagAnswer] = useState<string | null>(null);

  // POS Z-Report CSV/XLSX Uploader
  const [posCsv, setPosCsv] = useState(
    'Date,Outlet,POS Reported,Bank Settled,Category\n2026-11-26,Subang Flagship,4820,4680,POS Daily Close\n2026-11-26,Pavilion Kiosk,3190,3190,POS Daily Close'
  );
  const [posFileName, setPosFileName] = useState('daily_zreport_upload.csv');
  const [posBase64, setPosBase64] = useState<string | undefined>(undefined);

  async function saveWorkbench(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/operator/tenants/${tenant.id}/workbench`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cartridgeUpdates: cartridges,
          policySettings: {
            mealClaimCapMyr: mealCap,
            posVarianceCapMyr: posCap,
            dailyEmailWarmupCap: emailCap,
          },
        }),
      });
      const data = (await res.json()) as {
        state?: { tenants: Record<string, TenantWorkspace> };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Save failed');
      if (data.state?.tenants[tenant.id]) setTenant(data.state.tenants[tenant.id]);
      setMsg('Saved hot-swapped MCP Cartridges and Policy Gatekeeper thresholds cleanly!');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save error');
    } finally {
      setBusy(false);
    }
  }

  function handleSopFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSopFileName(file.name);
    setSopMime(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSopBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSopUpload(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/knowledge/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slotId,
          fileName: sopFileName,
          mimeType: sopMime,
          base64Data: sopBase64,
          plainText: sopBase64 ? undefined : sopText,
          departmentScope: deptScope,
        }),
      });
      const data = (await res.json()) as {
        chunksAdded?: number;
        state?: { tenants: Record<string, TenantWorkspace> };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      if (data.state?.tenants[tenant.id]) setTenant(data.state.tenants[tenant.id]);
      setSopBase64(undefined);
      setSopText('');
      setMsg(`Indexed ${data.chunksAdded} searchable chunk(s) from ${sopFileName} into slot:${slotId}!`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function runSopTestQuery() {
    setBusy(true);
    try {
      const res = await fetch('/api/operator/demo/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          action: 'sop_query',
          question: ragQuery,
        }),
      });
      const data = (await res.json()) as { state?: { tenants: Record<string, TenantWorkspace> } };
      const updated = data.state?.tenants[tenant.id];
      if (updated) {
        setTenant(updated);
        const latestAi = [...updated.whatsappFeed]
          .reverse()
          .find((m) => m.sender === 'ai_employee');
        setRagAnswer(latestAi?.text ?? 'Cited answer generated.');
      }
    } finally {
      setBusy(false);
    }
  }

  function handlePosFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPosFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPosBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handlePosUpload(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/pos/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: posFileName,
          base64Data: posBase64,
          csvText: posBase64 ? undefined : posCsv,
        }),
      });
      const data = (await res.json()) as {
        state?: { tenants: Record<string, TenantWorkspace> };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'POS parse failed');
      if (data.state?.tenants[tenant.id]) setTenant(data.state.tenants[tenant.id]);
      setPosBase64(undefined);
      setMsg(`Parsed ${posFileName}, staged into AI_Staging with backup, and queued Boss 1-tap approval!`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'POS upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/operator"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] no-underline hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Operator Fleet Studio
          </Link>
          <h1 className="mt-1 mb-0 text-2xl font-bold">{tenant.name} — Workbench</h1>
          <p className="mt-1 mb-0 text-sm text-[var(--text-muted)]">
            Hot-swap MCP Cartridges, tune guardrails, upload real SOP PDF/DOCX/XLSX docs, and ingest POS Z-reports.
          </p>
        </div>

        <Link
          href={`/operator/tenants/${tenant.id}/invoice`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] no-underline hover:border-[var(--accent)]"
        >
          <Printer className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
          Monthly Statement &amp; ROI Proof
        </Link>
      </div>

      {msg ? (
        <div role="status" className="rounded-lg border border-[var(--emerald)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium">
          {msg}
        </div>
      ) : null}

      {/* Form 1: Cartridge Swapper + Policy Caps */}
      <form
        onSubmit={saveWorkbench}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
          <h2 className="m-0 text-base font-bold flex items-center gap-2">
            <Sliders className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            Layer 1 Hot-Swappable MCP Cartridges &amp; Safety Thresholds
          </h2>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            Save Workbench Config
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(CAPABILITY_CATALOG) as CapabilityId[]).map((cap) => {
            const def = CAPABILITY_CATALOG[cap];
            return (
              <div key={cap} className="space-y-1">
                <label htmlFor={`cap-${cap}`} className="block text-xs font-semibold">
                  {cap} ({def.label})
                </label>
                <select
                  id={`cap-${cap}`}
                  value={cartridges[cap]}
                  onChange={(e) =>
                    setCartridges((prev) => ({ ...prev, [cap]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2 text-xs"
                >
                  {def.availableCartridges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} [{c.delivery}]
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="meal-cap" className="block text-xs font-semibold">
              Staff Meal Auto-Check Cap (MYR)
            </label>
            <input
              id="meal-cap"
              type="number"
              min={1}
              value={mealCap}
              onChange={(e) => setMealCap(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="pos-cap" className="block text-xs font-semibold">
              POS Cash Variance Alert Cap (MYR)
            </label>
            <input
              id="pos-cap"
              type="number"
              min={0}
              value={posCap}
              onChange={(e) => setPosCap(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="email-cap" className="block text-xs font-semibold">
              Daily Cold Email Warm-Up Cap
            </label>
            <input
              id="email-cap"
              type="number"
              min={1}
              value={emailCap}
              onChange={(e) => setEmailCap(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
            />
          </div>
        </div>
      </form>

      {/* Grid: Real SOP Uploader + Real POS Z-Report Parser */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* SOP Knowledge Uploader */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <h2 className="m-0 text-base font-bold flex items-center gap-2">
            <FileUp className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            Real SOP &amp; Pricing Vault Ingestion (`.pdf`, `.docx`, `.xlsx`, `.md`)
          </h2>

          <form onSubmit={handleSopUpload} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="rag-slot" className="block text-xs font-semibold mb-1">
                  Target Layer-2 Slot
                </label>
                <select
                  id="rag-slot"
                  value={slotId}
                  onChange={(e) => setSlotId(e.target.value as KnowledgeSlotId)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2 text-xs"
                >
                  <option value="company_policies">slot:company_policies</option>
                  <option value="pricing_guide">slot:pricing_guide</option>
                  <option value="bookkeeping_folder">slot:bookkeeping_folder</option>
                  <option value="brand_voice">slot:brand_voice</option>
                </select>
              </div>
              <div>
                <label htmlFor="rag-scope" className="block text-xs font-semibold mb-1">
                  Department RBAC Scope
                </label>
                <select
                  id="rag-scope"
                  value={deptScope}
                  onChange={(e) =>
                    setDeptScope(e.target.value as 'all_staff' | 'sales' | 'finance_only')
                  }
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2 text-xs"
                >
                  <option value="all_staff">all_staff</option>
                  <option value="sales">sales</option>
                  <option value="finance_only">finance_only</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="sop-file" className="block text-xs font-semibold mb-1">
                Upload Real File (PDF / DOCX / XLSX / CSV / MD)
              </label>
              <input
                id="sop-file"
                type="file"
                accept=".pdf,.docx,.xlsx,.csv,.md,.txt"
                onChange={handleSopFilePick}
                className="block w-full text-xs"
              />
            </div>

            <div>
              <label htmlFor="sop-paste" className="block text-xs font-semibold mb-1">
                Or Paste Policy / Pricing Markdown Clause Directly
              </label>
              <textarea
                id="sop-paste"
                rows={3}
                value={sopText}
                onChange={(e) => setSopText(e.target.value)}
                placeholder="# Section 5.1 Overtime Meals&#10;Staff working past 9 PM may claim up to MYR 25 dinner."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={busy || (!sopBase64 && !sopText.trim())}
              className="rounded-lg bg-[var(--emerald)] px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
            >
              Ingest &amp; Chunk into SOP RAG
            </button>
          </form>

          <div className="border-t border-[var(--border)] pt-3 space-y-2">
            <div className="text-xs font-bold flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
              Test Cited Retrieval ({tenant.knowledgeChunks?.length ?? 0} chunks indexed)
            </div>
            <div className="flex gap-2">
              <input
                aria-label="Test SOP query"
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                disabled={busy}
                onClick={runSopTestQuery}
                className="rounded-lg border border-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] cursor-pointer"
              >
                Query
              </button>
            </div>
            {ragAnswer ? (
              <pre className="m-0 whitespace-pre-wrap rounded border border-[var(--emerald)] bg-[var(--surface-muted)] p-2.5 text-xs">
                {ragAnswer}
              </pre>
            ) : null}
          </div>
        </section>

        {/* POS Z-Report CSV/XLSX Uploader */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <h2 className="m-0 text-base font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-[var(--emerald)]" aria-hidden="true" />
            Universal POS Z-Report CSV / Excel Parser
          </h2>

          <form onSubmit={handlePosUpload} className="space-y-3">
            <div>
              <label htmlFor="pos-file" className="block text-xs font-semibold mb-1">
                Upload StoreHub / Loyverse / Qashier Export (`.csv` or `.xlsx`)
              </label>
              <input
                id="pos-file"
                type="file"
                accept=".csv,.xlsx"
                onChange={handlePosFilePick}
                className="block w-full text-xs"
              />
            </div>

            <div>
              <label htmlFor="pos-csv" className="block text-xs font-semibold mb-1">
                Or Edit Sample CSV Export
              </label>
              <textarea
                id="pos-csv"
                rows={4}
                value={posCsv}
                onChange={(e) => setPosCsv(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 font-mono text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
              >
                Parse Z-Report &amp; Stage to Excel
              </button>
              <span className="text-xs text-[var(--text-muted)]">
                Pending staging rows: <strong>{tenant.workbook.stagingRows.length}</strong>
              </span>
            </div>
          </form>

          <div className="border-t border-[var(--border)] pt-3 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-[var(--emerald)]">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Active Knowledge Slots
            </div>
            {Object.entries(tenant.knowledgeSlots).map(([k, v]) => (
              <div key={k} className="text-[var(--text-muted)]">
                <strong>slot:{k}</strong> — {v.docName} ({v.citationsCount} refs)
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
