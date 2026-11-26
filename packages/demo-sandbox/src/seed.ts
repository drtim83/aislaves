import { resetDemoSandbox } from './store';

async function main() {
  const state = await resetDemoSandbox();
  const names = Object.values(state.tenants).map((t) => `${t.id} (${t.name})`);
  console.log('Seeded AISlaves demo sandbox tenants cleanly:', names.join(', '));
}

main().catch((err) => {
  console.error('Failed to seed demo sandbox:', err);
  process.exit(1);
});
