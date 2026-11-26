import { NextResponse } from 'next/server';
import { provisionTenantWorkspace, updateTenantOperatorControl } from '@aislaves/demo-sandbox';
import type { PlanId } from '@aislaves/shared';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      mode?: 'provision' | 'control';
      name?: string;
      industry?: string;
      planId?: PlanId;
      packIds?: string[];
      tenantId?: string;
      action?: 'toggle_pause' | 'topup_1000_tasks';
    };

    if (body.mode === 'control' && body.tenantId && body.action) {
      const state = await updateTenantOperatorControl({
        tenantId: body.tenantId,
        action: body.action,
      });
      return NextResponse.json({ state });
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Tenant business name is required.' }, { status: 400 });
    }

    const result = await provisionTenantWorkspace({
      name: body.name,
      industry: body.industry || 'Malaysian SME',
      planId: body.planId || 'sme_growth',
      packIds: body.packIds?.length ? body.packIds : ['sales-card-to-calendar'],
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update tenant' },
      { status: 500 }
    );
  }
}
