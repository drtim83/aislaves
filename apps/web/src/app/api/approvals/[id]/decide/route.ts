import { NextResponse } from 'next/server';
import { decideTenantApproval } from '@aislaves/demo-sandbox';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as {
      decision: 'approved' | 'rejected';
      actor?: string;
      idempotencyKey?: string;
    };

    const result = await decideTenantApproval({
      approvalId: id,
      decision: body.decision,
      actor: body.actor || 'SME Director',
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Approval action failed' },
      { status: 400 }
    );
  }
}
