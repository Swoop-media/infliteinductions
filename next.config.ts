// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig & { allowedDevOrigins?: string[] } = {
  experimental: {
    serverActions: {
      // bump the default 1 MB limit so file uploads via Server Actions work
      bodySizeLimit: "64mb", // adjust as needed: '10mb' | '64mb' | '200mb' ...
      // allowedOrigins: ['http://localhost:3000'], // only if posting from other origins
    },
  },

  async redirects() {
    return [
      {
        source: '/app/learn/quiz/:id',
        destination: '/app/learn/quiz/modules/:id',
        permanent: false,
      },
    ];
  },

  // keep your existing custom key (if your app reads it)
  allowedDevOrigins: process.env.REPLIT_DOMAINS
    ? process.env.REPLIT_DOMAINS.split(",").slice(0, 1)
    : [],
};

export default nextConfig;
