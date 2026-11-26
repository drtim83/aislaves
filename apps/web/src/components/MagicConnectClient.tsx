'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileUp, KeyRound, ShieldCheck } from 'lucide-react';
import type { MagicConnectLink } from '@aislaves/shared';

interface Props {
  initialLink: MagicConnectLink | null;
  token: string;
}

export function MagicConnectClient({ initialLink, token }: Props) {
  const [link, setLink] = useState<MagicConnectLink | null>(initialLink);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!link) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center space-y-3">
        <h1 className="text-xl font-bold">Magic Connect Link Not Found</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Token <code>{token}</code> is missing or expired. Ask your AISlaves account operator for a fresh WhatsApp link.
        </p>
        <Link href="/operator" className="text-sm font-semibold text-[var(--accent)] underline">
          Back to Operator Studio
        </Link>
      </div>
    );
  }

  async function bindItem(kind: 'capability' | 'slot', key: string, valueLabel?: string) {
    if (!link) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/operator/magic-links', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: link.token, kind, key, valueLabel }),
      });
      const data = (await res.json()) as { link: MagicConnectLink; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to connect');
      setLink(data.link);
      setMsg(`Connected ${key} cleanly! Operator Studio preflight just flipped Green.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-5">
      <div className="border-b border-[var(--border)] pb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          1-TAP SECURE MAGIC CONNECT ONBOARDING
        </span>
        <h1 className="mt-2 mb-1 text-xl font-bold">Connect Apps &amp; Policies for {link.tenantName}</h1>
        <p className="m-0 text-sm text-[var(--text-muted)]">
          Zero technical setup needed — simply tap the buttons below so your AISlaves operator can activate your AI Crew.
        </p>
      </div>

      {msg ? (
        <div role="status" className="rounded-lg border border-[var(--emerald)] bg-[var(--surface-muted)] p-3 text-xs font-semibold text-[var(--emerald)]">
          {msg}
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="m-0 text-sm font-bold">1. App Authorizations</h2>
        {link.missingCapabilities.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--emerald)] p-3 text-xs font-semibold text-[var(--emerald)]">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            All required apps authorized cleanly.
          </div>
        ) : (
          link.missingCapabilities.map((cap) => (
            <div
              key={cap}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--amber)] bg-[var(--surface-muted)] p-3.5"
            >
              <div>
                <div className="text-sm font-bold">{cap}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  One-tap OAuth authorization (read + approval-gated send scopes)
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => bindItem('capability', cap)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                1-Tap Authorize
              </button>
            </div>
          ))
        )}
      </div>

      <div className="space-y-3">
        <h2 className="m-0 text-sm font-bold">2. Policy &amp; Pricing Document Slots</h2>
        {link.missingSlots.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--emerald)] p-3 text-xs font-semibold text-[var(--emerald)]">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            All required Policy &amp; Pricing PDFs uploaded.
          </div>
        ) : (
          link.missingSlots.map((slot) => (
            <div
              key={slot}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--amber)] bg-[var(--surface-muted)] p-3.5"
            >
              <div>
                <div className="text-sm font-bold">slot:{slot}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  Upload PDF/DOCX handbook so AI replies cite your exact company terms
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => bindItem('slot', slot, `${link.tenantId}_${slot}_2026.pdf`)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--emerald)] px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
              >
                <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                Attach Sample SOP PDF
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-4 text-xs">
        <span>Status: <strong>{link.status.toUpperCase()}</strong></span>
        <Link href="/operator" className="font-semibold text-[var(--accent)] underline">
          Verify Green Preflight in Operator Studio -&gt;
        </Link>
      </div>
    </div>
  );
}
