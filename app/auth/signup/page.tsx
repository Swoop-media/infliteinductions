"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SignUp() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const { error } = await supabaseBrowser.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) setErr(error.message);
    else window.location.href = "/app/home";
  };

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-md border bg-white p-6">
        <h1 className="text-lg font-semibold">Create account</h1>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <input
          className="w-full rounded-md border p-2"
          placeholder="Full name"
          value={fullName}
          onChange={(e)=>setFullName(e.target.value)}
          required
        />
        <input
          className="w-full rounded-md border p-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded-md border p-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
          required
        />
        <button className="w-full rounded-md bg-black py-2 text-white">Sign up</button>
      </form>
    </main>
  );
}
