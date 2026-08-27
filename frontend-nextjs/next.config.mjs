import path from 'node:path';

const backendProxyTarget = process.env.BACKEND_PROXY_TARGET || 'http://localhost:8000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel handles output automatically; standalone is only for Docker self-hosting.
  ...(process.env.VERCEL !== '1' ? { output: 'standalone' } : {}),
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  productionBrowserSourceMaps: false,
  webpack(config) {
    config.resolve.alias['react-router-dom'] = path.resolve('./src/router/react-router-dom.tsx');
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: http: wss: ws:; frame-ancestors 'none'" },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendProxyTarget}/api/:path*`,
      },
      {
        source: '/sdk.js',
        destination: `${backendProxyTarget}/sdk.js`,
      },
      {
        source: '/widget-demo',
        destination: `${backendProxyTarget}/widget-demo`,
      },
      {
        source: '/aurelia-logo.png',
        destination: `${backendProxyTarget}/aurelia-logo.png`,
      },
      {
        source: '/health',
        destination: `${backendProxyTarget}/health`,
      }
    ];
  },
};

export default nextConfig;
