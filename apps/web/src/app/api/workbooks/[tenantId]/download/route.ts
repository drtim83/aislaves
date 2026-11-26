import { NextResponse } from 'next/server';
import { readWorkbookBuffer } from '@aislaves/crew-engine';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params;
  const buffer = await readWorkbookBuffer(tenantId);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${tenantId === 'demo-kopikita' ? 'KopiKita_Bookkeeping_2026.xlsx' : `${tenantId}_workbook.xlsx`}"`,
    },
  });
}
