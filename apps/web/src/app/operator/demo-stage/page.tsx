import { loadPlatformState } from '@aislaves/demo-sandbox';
import { DemoStageClient } from '@/components/DemoStageClient';

export const dynamic = 'force-dynamic';

export default async function DemoStagePage() {
  const initialState = await loadPlatformState();
  return <DemoStageClient initialState={initialState} />;
}
