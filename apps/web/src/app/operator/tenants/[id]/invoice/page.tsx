import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { loadPlatformState } from '@aislaves/demo-sandbox';
import { calculateRoiSummary, SME_PRICING_TIERS } from '@aislaves/shared';
import { PrintInvoiceButton } from '@/components/PrintInvoiceButton';

export const dynamic = 'force-dynamic';

export default async function TenantInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const state = await loadPlatformState();
  const tenant = state.tenants[id];
  if (!tenant) notFound();

  const tier = SME_PRICING_TIERS[tenant.subscription.planId];
  const roi = calculateRoiSummary(
    tenant.subscription.tasksUsed,
    tenant.subscription.monthlyRetainerMyr
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="no-print flex items-center justify-between gap-4">
        <Link
          href={`/operator/tenants/${tenant.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] no-underline hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to Workbench
        </Link>
        <PrintInvoiceButton />
      </div>

      <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
          <div>
            <h1 className="m-0 text-2xl font-bold">AISlaves Monthly Statement &amp; ROI Proof</h1>
            <p className="mt-1 mb-0 text-xs text-[var(--text-muted)]">
              Managed AI Workforce Billing Summary (MYR · Malaysia FPX / DuitNow / Card Ready)
            </p>
          </div>
          <div className="text-right text-xs">
            <div className="font-bold">Statement #{tenant.slug.toUpperCase()}-2026-11</div>
            <div className="text-[var(--text-muted)]">Generated: {new Date().toISOString().slice(0, 10)}</div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">Billed To SME Client</div>
            <div className="mt-1 font-bold">{tenant.name}</div>
            <div className="text-xs text-[var(--text-muted)]">{tenant.industry}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">Subscription Plan</div>
            <div className="mt-1 font-bold">
              {tier.name} — {tier.tagline}
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              Fair-Use Cap: {tenant.subscription.tasksUsed} / {tenant.subscription.taskAllowance} completed tasks
            </div>
          </div>
        </section>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-[var(--border)] bg-[var(--surface-muted)]">
              <th className="p-3 text-left">Description</th>
              <th className="p-3 text-right">Amount (MYR)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[var(--border)]">
              <td className="p-3">
                Monthly Managed AI Workforce Retainer ({tenant.installedPackIds.join(', ')})
              </td>
              <td className="p-3 text-right font-semibold">
                MYR {tenant.subscription.monthlyRetainerMyr.toFixed(2)}
              </td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <td className="p-3 text-[var(--text-muted)]">
                Overage Fees (Hard Fair-Use Cap Enforced — Zero Surprise Token Bills)
              </td>
              <td className="p-3 text-right">MYR 0.00</td>
            </tr>
            <tr>
              <td className="p-3 font-bold">Total Due This Period</td>
              <td className="p-3 text-right text-lg font-bold text-[var(--accent)]">
                MYR {tenant.subscription.monthlyRetainerMyr.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>

        <section className="rounded-lg border border-[var(--emerald)] bg-[var(--surface-muted)] p-4 text-xs space-y-1">
          <div className="font-bold text-sm text-[var(--emerald)]">
            Client Value Delivered This Month
          </div>
          <div>
            • Completed <strong>{tenant.subscription.tasksUsed}</strong> automated tasks across WhatsApp, OCR, Excel, and Sales workflows
          </div>
          <div>
            • Estimated manual staff hours reclaimed: <strong>{roi.hoursSaved} hours</strong> (~MYR {roi.laborValueSavedMyr.toLocaleString()} labor equivalent)
          </div>
          <div>
            • Monthly net savings vs hiring 1 full-time junior admin clerk (MYR 3,200/mo):{' '}
            <strong>MYR {roi.netSavingsVsClerkMyr.toLocaleString()}/month saved</strong>
          </div>
        </section>

        <footer className="border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
          Payment methods supported: FPX Online Banking, DuitNow QR, or Corporate Visa/Mastercard via Stripe Subscription Billing.
        </footer>
      </article>
    </div>
  );
}
