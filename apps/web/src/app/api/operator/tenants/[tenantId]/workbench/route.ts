import { NextResponse } from 'next/server';
import { updateTenantWorkbenchSettings } from '@aislaves/demo-sandbox';
import type { CapabilityId, TenantPolicySettings } from '@aislaves/shared';

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await context.params;
    const body = (await req.json()) as {
      cartridgeUpdates?: Partial<Record<CapabilityId, string>>;
      policySettings?: Partial<TenantPolicySettings>;
    };
    const state = await updateTenantWorkbenchSettings({
      tenantId,
      cartridgeUpdates: body.cartridgeUpdates,
      policySettings: body.policySettings,
    });
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save workbench settings' },
      { status: 400 }
    );
  }
}
