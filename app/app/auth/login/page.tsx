'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExternalLogin, setIsExternalLogin] = useState(false);
  const router = useRouter();
  const supabase = supabaseBrowser;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (data.user) {
        // Redirect to the main app
        router.push('/app');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = () => {
    setLoading(true);
    // Redirect to existing Microsoft OAuth flow
    window.location.href = '/api/auth/microsoft/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
        </div>

        {!isExternalLogin ? (
          // Default view - choice between internal and external login
          <div className="space-y-4">
            <Button
              onClick={handleMicrosoftLogin}
              className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700"
            >
              <svg className="w-4 h-4" viewBox="0 0 23 23" fill="currentColor">
                <path d="M11.03 0H0v11.03h11.03V0z"/>
                <path d="M23 0H11.97v11.03H23V0z"/>
                <path d="M11.03 11.97H0V23h11.03V11.97z"/>
                <path d="M23 11.97H11.97V23H23V11.97z"/>
              </svg>
              Login with Microsoft (Internal Employees)
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 text-gray-500">OR</span>
              </div>
            </div>

            <Button
              onClick={() => setIsExternalLogin(true)}
              variant="outline"
              className="w-full"
            >
              Login with Email (External Users)
            </Button>

            <p className="text-center text-sm text-gray-600 mt-4">
              Don't have an account?{' '}
              <Link href="/app/auth/register" className="font-medium text-blue-600 hover:text-blue-500">
                Register as External User
              </Link>
            </p>
          </div>
        ) : (
          // External user email login form
          <form className="mt-8 space-y-6" onSubmit={handleEmailLogin}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div className="mb-4">
                <Label htmlFor="email-address">Email Address</Label>
                <Input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                />
              </div>
              <div className="mb-4">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="text-sm text-red-800">{error}</div>
              </div>
            )}

            <div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsExternalLogin(false)}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                ← Back to login options
              </button>
              <Link href="/app/auth/register" className="text-sm text-blue-600 hover:text-blue-500">
                Create account
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}