"use client";

import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setStatus("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    window.location.href = "/";
  };

  const handleSignUp = async () => {
    setIsLoading(true);
    setStatus("");

    const { error } = await supabase.auth.signUp({ email, password });
    setIsLoading(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Account created. If email confirmation is enabled, verify your inbox.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white">
      <form
        onSubmit={handleSignIn}
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-gray-700 bg-gray-900 p-6"
      >
        <h1 className="text-2xl font-semibold">Log in</h1>
        <p className="text-sm text-gray-300">Use your Supabase Auth account.</p>

        <label className="flex flex-col gap-2 text-sm">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
            className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Working..." : "Sign in"}
        </button>

        <button
          type="button"
          onClick={() => void handleSignUp()}
          disabled={isLoading}
          className="rounded-md border border-gray-600 px-4 py-2 font-medium hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Working..." : "Create account"}
        </button>

        {status ? <p className="text-sm text-amber-300">{status}</p> : null}
      </form>
    </main>
  );
}
