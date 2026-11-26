import { notFound } from 'next/navigation';
import { loadPlatformState } from '@aislaves/demo-sandbox';
import { TenantWorkbenchClient } from '@/components/TenantWorkbenchClient';

export const dynamic = 'force-dynamic';

export default async function TenantWorkbenchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const state = await loadPlatformState();
  const tenant = state.tenants[id];
  if (!tenant) notFound();

  return <TenantWorkbenchClient initialTenant={tenant} />;
}
