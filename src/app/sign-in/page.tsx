"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorBanner } from "@/components/Feedback";
import { ApiError, apiFetch } from "@/lib/api";
import type { BootstrapResponse } from "@/lib/types";

export default function SignInPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<BootstrapResponse>("/api/v1/bootstrap");
        if (!data.authenticated && !data.hasOwner) {
          router.replace("/setup");
          return;
        }
        if (data.authenticated) {
          router.replace(data.owner.setupCompleted ? "/today" : "/onboarding");
        }
      } catch {
        /* stay on sign-in */
      }
    })();
  }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/v1/auth/session", {
        method: "POST",
        csrf: false,
        body: JSON.stringify({ password }),
      });
      const boot = await apiFetch<BootstrapResponse>("/api/v1/bootstrap");
      if (!boot.authenticated) {
        setError("Sign-in did not establish a session.");
        return;
      }
      router.replace(boot.owner.setupCompleted ? "/today" : "/onboarding");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell subtitle="Sign in">
      <main className="panel stack">
        <div className="hero-quiet">
          <p className="eyebrow">Welcome back</p>
          <h1>Unlock your morning</h1>
          <p>Password only. Your session stays private on this device.</p>
        </div>
        <ErrorBanner message={error} />
        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="btn-row">
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </main>
    </AppShell>
  );
}
