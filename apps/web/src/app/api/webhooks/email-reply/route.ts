import { NextResponse } from 'next/server';
import { runTenantDemoAction } from '@aislaves/demo-sandbox';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tenantId?: string;
      replyText?: string;
    };
    const state = await runTenantDemoAction({
      tenantId: body.tenantId || 'demo-apex',
      action: 'prospect_reply',
      replyText: body.replyText,
    });
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Email reply webhook error' },
      { status: 400 }
    );
  }
}
