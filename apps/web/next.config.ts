import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@simplestclaw/ui', '@simplestclaw/openclaw-client'],
};

export default nextConfig;
