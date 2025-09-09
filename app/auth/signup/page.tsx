// @ts-nocheck
// app/auth/signup/page.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SignUpDisabled() {
  return (
    <div className="p-6 space-y-3">
      <h1 className="text-xl font-semibold">Sign up disabled</h1>
      <p className="text-sm text-gray-600">
        This workspace uses admin-provisioned accounts. Please contact an administrator if you need access.
      </p>
      <div className="flex gap-2">
        <Link href="/auth/login" className="rounded-md border px-3 py-1 text-sm">Back to login</Link>
        <Link href="/app/home" className="rounded-md border px-3 py-1 text-sm">Home</Link>
      </div>
    </div>
  );
}
