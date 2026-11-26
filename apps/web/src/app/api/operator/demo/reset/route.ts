import { NextResponse } from 'next/server';
import { resetDemoSandbox } from '@aislaves/demo-sandbox';

export async function POST() {
  const state = await resetDemoSandbox();
  return NextResponse.json({ ok: true, state });
}
