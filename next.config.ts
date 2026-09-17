import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp'],
  // Memoizes components and values automatically, so hand-written useMemo/useCallback isn't needed.
  experimental: { reactCompiler: true },
  // Fixtures are read from disk at runtime, so they must be bundled with the functions that use them.
  outputFileTracingIncludes: {
    '/': ['./fixtures/**/*'],
    '/api/investigate': ['./fixtures/**/*'],
  },
};

export default nextConfig;
