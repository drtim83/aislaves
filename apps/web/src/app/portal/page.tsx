import { loadPlatformState } from '@aislaves/demo-sandbox';
import { PortalClient } from '@/components/PortalClient';

export const dynamic = 'force-dynamic';

export default async function PortalPage() {
  const initialState = await loadPlatformState();
  return <PortalClient initialState={initialState} />;
}
