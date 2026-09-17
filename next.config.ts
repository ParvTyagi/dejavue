import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp'],
  // Fixtures are read from disk at runtime, so they must be bundled with the functions that use them.
  outputFileTracingIncludes: {
    '/': ['./fixtures/**/*'],
    '/api/investigate': ['./fixtures/**/*'],
  },
};

export default nextConfig;
