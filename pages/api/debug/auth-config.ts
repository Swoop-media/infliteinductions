import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const config = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    MICROSOFT_APP_ID: process.env.MICROSOFT_APP_ID,
    MICROSOFT_APP_TENANT_ID: process.env.MICROSOFT_APP_TENANT_ID,
    calculatedRedirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    currentHost: req.headers.host,
    protocol: req.headers['x-forwarded-proto'] || 'http',
    fullUrl: `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`,
    // Debug the URL construction issue
    nodeEnv: process.env.NODE_ENV,
    allEnvVars: {
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      VERCEL_URL: process.env.VERCEL_URL,
      REPL_SLUG: process.env.REPL_SLUG,
      REPL_OWNER: process.env.REPL_OWNER,
    }
  };

  return res.status(200).json(config);
}