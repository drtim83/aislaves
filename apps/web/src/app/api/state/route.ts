import { NextResponse } from 'next/server';
import { CREW_PACKS, DIGITAL_EMPLOYEE_ROSTER } from '@aislaves/crew-packs';
import { loadPlatformState } from '@aislaves/demo-sandbox';
import { CAPABILITY_CATALOG, SME_PRICING_TIERS } from '@aislaves/shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = await loadPlatformState();
  return NextResponse.json({
    state,
    crewPacks: CREW_PACKS,
    roster: DIGITAL_EMPLOYEE_ROSTER,
    pricingTiers: Object.values(SME_PRICING_TIERS),
    capabilityCatalog: CAPABILITY_CATALOG,
  });
}
