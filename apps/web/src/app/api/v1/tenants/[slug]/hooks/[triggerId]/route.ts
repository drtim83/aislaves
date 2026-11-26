import { NextResponse } from 'next/server';
import { triggerInboundTenantWebhook } from '@aislaves/demo-sandbox';

export async function POST(
  req: Request,
  context: { params: Promise<{ slug: string; triggerId: string }> }
) {
  try {
    const { slug, triggerId } = await context.params;
    let payload: Record<string, unknown> = {};
    try {
      payload = (await req.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    const result = await triggerInboundTenantWebhook({
      tenantSlug: slug,
      triggerId,
      payload,
    });
    return NextResponse.json({
      ok: true,
      tenantId: result.tenantId,
      triggerId,
      leadCount: result.state.tenants[result.tenantId].leads.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook failed' },
      { status: 404 }
    );
  }
}
