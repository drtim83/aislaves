import { NextResponse } from 'next/server';
import { completeMagicConnectItem, createMagicConnectLink } from '@aislaves/demo-sandbox';
import type { CapabilityId, KnowledgeSlotId } from '@aislaves/shared';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tenantId: string;
      missingCapabilities?: CapabilityId[];
      missingSlots?: KnowledgeSlotId[];
    };
    const result = await createMagicConnectLink({
      tenantId: body.tenantId,
      missingCapabilities: body.missingCapabilities ?? [],
      missingSlots: body.missingSlots ?? [],
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create magic link' },
      { status: 400 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as {
      token: string;
      kind: 'capability' | 'slot';
      key: string;
      valueLabel?: string;
    };
    const result = await completeMagicConnectItem(body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to bind slot' },
      { status: 400 }
    );
  }
}
