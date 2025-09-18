import LandingClient from './landing-client';

export default function Landing() {
  // Simple, fast-loading server component that renders the client component
  // This ensures the root route responds quickly for health checks
  return <LandingClient />;
}
