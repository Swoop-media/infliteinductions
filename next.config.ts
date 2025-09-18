// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimized configuration for Autoscale deployment
  poweredByHeader: false, // Remove X-Powered-By header for security
  
  experimental: {
    serverActions: {
      // bump the default 1 MB limit so file uploads via Server Actions work
      bodySizeLimit: "128mb", // increased limit for larger file uploads
    },
    // Optimize for deployment
    optimizePackageImports: ['lucide-react', '@radix-ui/react-slot'],
  },

  // Fix cross-origin issues for Replit environment
  ...(process.env.REPLIT_DEPLOYMENT !== 'production' && {
    allowedDevOrigins: process.env.REPLIT_DOMAINS 
      ? process.env.REPLIT_DOMAINS.split(",")
      : ['127.0.0.1'],
  }),

  async redirects() {
    return [
      {
        source: '/app/learn/quiz/:id',
        destination: '/app/learn/quiz/modules/:id',
        permanent: false,
      },
    ];
  },

  // Production optimization
  compress: true,
  
  // Headers for better performance and security
  async headers() {
    return [
      {
        // Only apply no-cache to API routes and dynamic pages, not static assets
        source: '/((?!_next/static|favicon.ico).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
