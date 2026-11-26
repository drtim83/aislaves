import { NextResponse } from 'next/server';
import { uploadTenantPosReport } from '@aislaves/demo-sandbox';

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await context.params;
    const body = (await req.json()) as {
      fileName: string;
      base64Data?: string;
      csvText?: string;
    };
    const state = await uploadTenantPosReport({
      tenantId,
      fileName: body.fileName || 'pos_zreport.csv',
      base64Data: body.base64Data,
      csvText: body.csvText,
    });
    return NextResponse.json({ ok: true, state }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'POS upload failed' },
      { status: 400 }
    );
  }
}
