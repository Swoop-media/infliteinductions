/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '64mb',
    },
  },
  images: {
    domains: ['localhost', '127.0.0.1'],
  },
  // Allow development origins for cross-origin requests
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
  // Allow cross-origin requests from development domains
  allowedDevOrigins: ['http://127.0.0.1', 'http://localhost:*', 'https://*.sharepoint.com', 'https://*.replit.dev', 'https://dacb1217-61ed-4cb0-a794-a7b3ae30caf4-00-2mqfcku6rv7d6.worf.replit.dev'],
  // Configure webpack to handle SharePoint URLs
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;