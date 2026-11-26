import { NextResponse } from 'next/server';
import { readWorkbookBuffer, syncWorkbookFromTenantState } from '@aislaves/crew-engine';
import { loadPlatformState } from '@aislaves/demo-sandbox';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params;
  const state = await loadPlatformState();
  const tenant = state.tenants[tenantId];
  const buffer = tenant
    ? await syncWorkbookFromTenantState(tenant)
    : await readWorkbookBuffer(tenantId);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${tenantId === 'demo-kopikita' ? 'KopiKita_Bookkeeping_2026.xlsx' : `${tenantId}_workbook.xlsx`}"`,
    },
  });
}
