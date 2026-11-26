import { NextResponse } from 'next/server';
import { uploadTenantKnowledgeDoc } from '@aislaves/demo-sandbox';
import type { KnowledgeSlotId } from '@aislaves/shared';

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await context.params;
    const body = (await req.json()) as {
      slotId?: KnowledgeSlotId;
      fileName: string;
      mimeType?: string;
      base64Data?: string;
      plainText?: string;
      departmentScope?: 'all_staff' | 'sales' | 'finance_only';
    };

    const result = await uploadTenantKnowledgeDoc({
      tenantId,
      slotId: body.slotId || 'company_policies',
      fileName: body.fileName || 'uploaded_policy.txt',
      mimeType: body.mimeType,
      base64Data: body.base64Data,
      plainText: body.plainText,
      departmentScope: body.departmentScope,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Knowledge upload failed' },
      { status: 400 }
    );
  }
}
