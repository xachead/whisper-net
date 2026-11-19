import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  output: 'standalone',
  async rewrites() {
    const rawBackendUrl = process.env.SPRING_BOOT_BACKEND_URL?.trim() || 'http://127.0.0.1:8080';
    const backendUrl = rawBackendUrl.replace(/\/+$/, '');
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
