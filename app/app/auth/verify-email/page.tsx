'use client';

import Link from 'next/link';

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Check your email
          </h2>
          <div className="mt-6 space-y-4">
            <p className="text-center text-gray-600">
              We've sent you an email with a verification link. 
              Please check your inbox and click the link to verify your account.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> The verification email may take a few minutes to arrive. 
                Please also check your spam folder.
              </p>
            </div>
            <div className="text-center mt-6">
              <Link href="/auth/login" className="font-medium text-blue-600 hover:text-blue-500">
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}