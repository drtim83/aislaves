import { CREW_PACKS } from '@aislaves/crew-packs';
import { loadPlatformState } from '@aislaves/demo-sandbox';
import { SME_PRICING_TIERS } from '@aislaves/shared';
import { OperatorDashboardClient } from '@/components/OperatorDashboardClient';

export const dynamic = 'force-dynamic';

export default async function OperatorPage() {
  const initialState = await loadPlatformState();
  return (
    <OperatorDashboardClient
      initialState={initialState}
      crewPacks={CREW_PACKS}
      pricingTiers={Object.values(SME_PRICING_TIERS)}
    />
  );
}
