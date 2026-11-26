import { NextResponse } from 'next/server';
import { runTenantDemoAction, type DemoActionKind } from '@aislaves/demo-sandbox';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tenantId: string;
      action: DemoActionKind;
      imageBase64?: string;
      mimeType?: string;
      geminiApiKey?: string;
      question?: string;
      replyText?: string;
    };

    const state = await runTenantDemoAction(body);
    return NextResponse.json({ state });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to execute demo action' },
      { status: 400 }
    );
  }
}
