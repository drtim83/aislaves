import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, Building2, Link2, PlaySquare } from 'lucide-react';
import './globals.css';

export const metadata: Metadata = {
  title: 'AISlaves — Operator Studio & Live SME AI Workforce Sandbox',
  description:
    'Managed multi-agent AI employee platform for SMEs with plug-and-play MCP cartridges, safe shared Excel, and live pitch demo.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body>
        <header className="border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
            <Link href="/operator" className="flex items-center gap-2.5 no-underline text-[var(--text-primary)]">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
                <Bot className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-bold tracking-tight">AISlaves Platform</span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Done-For-You SME AI Workforce · Plug &amp; Play MCP Hub
                </span>
              </span>
            </Link>

            <nav aria-label="Primary surfaces" className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <Link
                href="/operator"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-[var(--text-primary)] no-underline hover:border-[var(--accent)]"
              >
                <Building2 className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                Operator Studio
              </Link>
              <Link
                href="/operator/demo-stage"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-white no-underline hover:opacity-95"
              >
                <PlaySquare className="h-4 w-4" aria-hidden="true" />
                Live Sales Demo Stage
              </Link>
              <Link
                href="/portal"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--text-primary)] no-underline hover:border-[var(--accent)]"
              >
                SME Client Portal
              </Link>
              <Link
                href="/connect/demo-sinar-connect"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)]"
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                Magic Link Preview
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
