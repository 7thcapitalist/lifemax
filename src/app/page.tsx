"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorBanner, LiveRegion } from "@/components/Feedback";
import { apiFetch } from "@/lib/api";
import type { BootstrapResponse } from "@/lib/types";

export default function GatePage() {
  const router = useRouter();
  const [message, setMessage] = useState("Opening your morning…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<BootstrapResponse>("/api/v1/bootstrap");
        if (cancelled) return;
        if (!data.authenticated) {
          router.replace(data.hasOwner ? "/sign-in" : "/setup");
          return;
        }
        if (!data.owner.setupCompleted) {
          router.replace("/onboarding");
          return;
        }
        router.replace("/today");
      } catch {
        if (!cancelled) {
          setError("Could not reach the private app.");
          setMessage("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <AppShell>
      <main className="panel stack">
        <div className="hero-quiet">
          <p className="eyebrow">Private morning ritual</p>
          <h1>Lifemaxing</h1>
          <p>A quiet plan for who you are becoming.</p>
        </div>
        <ErrorBanner message={error} />
        <LiveRegion message={message} />
      </main>
    </AppShell>
  );
}
