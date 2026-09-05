"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorBanner, StatusBanner } from "@/components/Feedback";
import { ApiError, apiFetch } from "@/lib/api";
import type { BootstrapResponse } from "@/lib/types";

export default function SetupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [password, setPassword] = useState("");
  const [setupMode, setSetupMode] = useState<"disabled" | "local" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const guessed = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setTimezone(guessed);
    void (async () => {
      try {
        const data = await apiFetch<BootstrapResponse>("/api/v1/bootstrap");
        if (data.authenticated) {
          router.replace(data.owner.setupCompleted ? "/today" : "/onboarding");
          return;
        }
        if (data.hasOwner) {
          router.replace("/sign-in");
          return;
        }
        setSetupMode(data.setupMode);
      } catch {
        setError("Could not check setup availability.");
      }
    })();
  }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/v1/setup/owner", {
        method: "POST",
        csrf: false,
        body: JSON.stringify({ displayName, timezone, password }),
      });
      await apiFetch("/api/v1/auth/session", {
        method: "POST",
        csrf: false,
        body: JSON.stringify({ password }),
      });
      router.replace("/onboarding");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Owner setup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell subtitle="First-run setup">
      <main className="panel stack">
        <div className="hero-quiet">
          <p className="eyebrow">One owner</p>
          <h1>Create your private space</h1>
          <p>
            Setup stays closed unless you open a local provisioning window.
            After this, only your password unlocks the ritual.
          </p>
        </div>
        {setupMode === "disabled" ? (
          <StatusBanner tone="warn">
            Setup is closed. Start the app with SETUP_MODE=local on loopback,
            create the owner, then return SETUP_MODE to disabled.
          </StatusBanner>
        ) : null}
        <ErrorBanner message={error} />
        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              name="displayName"
              autoComplete="nickname"
              required
              maxLength={100}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="timezone">Timezone</label>
            <input
              id="timezone"
              name="timezone"
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
            <p className="hint">
              IANA timezone, for example America/Sao_Paulo.
            </p>
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="hint">
              At least 12 characters. Never stored in plain text.
            </p>
          </div>
          <div className="btn-row">
            <button
              className="btn-primary"
              type="submit"
              disabled={busy || setupMode !== "local"}
            >
              {busy ? "Creating…" : "Create owner"}
            </button>
          </div>
        </form>
      </main>
    </AppShell>
  );
}
