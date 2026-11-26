import { NextResponse } from 'next/server';
import { registerCustomRestApi } from '@aislaves/demo-sandbox';
import type { PolicyTier } from '@aislaves/shared';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tenantId: string;
      name: string;
      toolName: string;
      method: 'GET' | 'POST' | 'PUT' | 'PATCH';
      baseUrl: string;
      path: string;
      authType: 'bearer' | 'api_key_header' | 'none';
      policyTier: PolicyTier;
      inboundWebhookTriggerId: string;
      description: string;
    };

    const result = await registerCustomRestApi(body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to register API bridge' },
      { status: 400 }
    );
  }
}
