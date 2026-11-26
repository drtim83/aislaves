import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@aislaves/shared',
    '@aislaves/crew-packs',
    '@aislaves/crew-engine',
    '@aislaves/demo-sandbox',
  ],
  serverExternalPackages: ['exceljs', 'firebase-admin'],
};

export default nextConfig;
