import Link from "next/link";

export default function Landing() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">INFLITE Induction & Training</h1>
          <p className="text-gray-600">Sign up or log in to continue.</p>
        </div>
        <div className="flex gap-3 justify-center">
          <Link href="/auth/signup" className="rounded-md bg-black px-4 py-2 text-white">
            Sign up
          </Link>
          <Link href="/auth/signin" className="rounded-md border px-4 py-2">
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}
