import { NextResponse } from 'next/server';
import {
  parseWhatsAppWebhookPayload,
  verifyWhatsAppWebhook,
} from '@aislaves/crew-engine';
import { decideTenantApproval, runTenantDemoAction } from '@aislaves/demo-sandbox';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const check = verifyWhatsAppWebhook({
    mode: url.searchParams.get('hub.mode'),
    token: url.searchParams.get('hub.verify_token'),
    challenge: url.searchParams.get('hub.challenge'),
  });
  return new NextResponse(check.body, { status: check.status });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const events = parseWhatsAppWebhookPayload(body);

    const results: Array<{ kind: string; status: string }> = [];
    for (const evt of events) {
      if (evt.kind === 'approval_tap' && evt.approvalId && evt.decision) {
        await decideTenantApproval({
          approvalId: evt.approvalId,
          decision: evt.decision,
          actor: `WhatsApp ${evt.fromPhone}`,
        });
        results.push({ kind: 'approval_tap', status: evt.decision });
      } else if (evt.kind === 'text' && evt.text) {
        await runTenantDemoAction({
          tenantId: 'demo-kopikita',
          action: 'sop_query',
          question: evt.text,
        });
        results.push({ kind: 'text', status: 'sop_answered' });
      } else {
        results.push({ kind: evt.kind, status: 'acknowledged' });
      }
    }

    return NextResponse.json({ ok: true, processed: results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'WhatsApp webhook error' },
      { status: 400 }
    );
  }
}
