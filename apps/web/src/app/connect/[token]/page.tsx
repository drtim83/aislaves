import { loadPlatformState } from '@aislaves/demo-sandbox';
import { MagicConnectClient } from '@/components/MagicConnectClient';

export const dynamic = 'force-dynamic';

export default async function MagicConnectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await loadPlatformState();
  const link = state.magicLinks[token] ?? null;
  return <MagicConnectClient initialLink={link} token={token} />;
}
